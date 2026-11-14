"""Strictly causal 7-regime market classifier and conditional attribution (Audit §8.3).

Every regime label assigned to bar `t` is determined exclusively from observations up
to and including bar `t - 1` (`0 .. t - 1`) plus post-onset calendar aftermath windows
strictly after a known exchange halt / stablecoin depeg has already begun (`onset + 1`).
Mutating prices, returns, basis, or volumes from bar `t` onward cannot alter any regime
label on `[0 .. t]`.
"""

from __future__ import annotations

import math
from datetime import date, timezone, datetime

import numpy as np
import polars as pl

from .core import sharpe_ratio

PERIODS_PER_YEAR = 365

REGIME_ORDER: tuple[str, ...] = (
    "bull_uptrend",
    "bear_downtrend",
    "sideways_choppy",
    "low_vol_compression",
    "high_vol_expansion",
    "liquidity_crisis_cascading_liq",
    "exchange_disruption_depeg",
)


def _epoch_day(y: int, m: int, d: int) -> int:
    dt = datetime(y, m, d, tzinfo=timezone.utc)
    return int(dt.timestamp() // 86_400)


# Post-onset aftermath windows (`onset_day + 1 .. recovery_day`) for documented
# exchange disruptions and stablecoin depegs. Starting at `onset + 1` ensures the
# classifier never anticipates the initial shock bar before it has occurred.
KNOWN_DISRUPTION_WINDOWS: tuple[tuple[str, int, int], ...] = (
    ("terra_ust_depeg_2022_05", _epoch_day(2022, 5, 10), _epoch_day(2022, 5, 24)),
    ("celsius_3ac_freeze_2022_06", _epoch_day(2022, 6, 14), _epoch_day(2022, 6, 21)),
    ("ftx_halt_bankruptcy_2022_11", _epoch_day(2022, 11, 9), _epoch_day(2022, 11, 23)),
    ("svb_usdc_depeg_2023_03", _epoch_day(2023, 3, 11), _epoch_day(2023, 3, 20)),
    ("oct_2025_perp_cascade_2025_10", _epoch_day(2025, 10, 11), _epoch_day(2025, 10, 17)),
)


def _in_known_disruption_window(day_int: int) -> bool:
    for _label, lo, hi in KNOWN_DISRUPTION_WINDOWS:
        if lo <= day_int <= hi:
            return True
    return False


def _unit_max_drawdown(net: np.ndarray) -> float:
    x = np.nan_to_num(np.asarray(net, dtype=float), nan=0.0)
    if x.size == 0:
        return 0.0
    eq = 1.0 + np.cumsum(x)
    pk = np.maximum.accumulate(np.concatenate([[1.0], eq]))[1:]
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(pk > 0.0, (pk - eq) / pk, 0.0)
    return float(np.nanmax(dd)) if dd.size else 0.0


def classify_regimes(
    perp_close: pl.DataFrame,
    perp_returns: pl.DataFrame,
    basis: pl.DataFrame | None = None,
    *,
    perp_volume_usd: pl.DataFrame | None = None,
    vol_window: int = 20,
    trend_window: int = 60,
    vol_pct_lookback: int = 252,
    basis_dislocation_abs: float = 0.0025,
) -> list[str]:
    """Assign each row `t` in `perp_close` one of the 7 Audit §8.3 regimes causally (`<= t-1`)."""
    days = perp_close["day"].to_numpy()
    symbols = [c for c in perp_close.columns if c != "day"]
    t_len = len(days)

    if "BTCUSDT" in perp_close.columns and "BTCUSDT" in perp_returns.columns:
        bench_px = perp_close["BTCUSDT"].cast(pl.Float64).to_numpy()
        bench_ret = perp_returns["BTCUSDT"].cast(pl.Float64).to_numpy()
    else:
        r_mat = perp_returns.select(symbols).cast(pl.Float64).to_numpy()
        cnt = np.sum(np.isfinite(r_mat), axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            bench_ret = np.where(cnt > 0, np.nansum(r_mat, axis=1) / np.maximum(cnt, 1), np.nan)
        bench_px = 100.0 * np.cumprod(1.0 + np.nan_to_num(bench_ret, nan=0.0))

    med_abs_basis = np.full(t_len, np.nan)
    if basis is not None:
        b_syms = [c for c in basis.columns if c != "day"]
        if b_syms:
            aligned_b = pl.DataFrame({"day": perp_close["day"]}).join(basis, on="day", how="left").sort("day")
            b_mat = np.abs(aligned_b.select(b_syms).cast(pl.Float64).to_numpy())
            for s in range(t_len):
                fin = b_mat[s][np.isfinite(b_mat[s])]
                if fin.size > 0:
                    med_abs_basis[s] = float(np.median(fin))

    vol_surge = np.ones(t_len, dtype=float)
    if perp_volume_usd is not None:
        v_syms = [c for c in perp_volume_usd.columns if c != "day"]
        if v_syms:
            aligned_v = (
                pl.DataFrame({"day": perp_close["day"]})
                .join(perp_volume_usd, on="day", how="left")
                .sort("day")
            )
            tot_v = np.nansum(aligned_v.select(v_syms).cast(pl.Float64).to_numpy(), axis=1)
            for s in range(5, t_len):
                hist_v = tot_v[max(0, s - 30) : s]
                pos_v = hist_v[hist_v > 0.0]
                if pos_v.size >= 5:
                    med_v = float(np.median(pos_v))
                    if med_v > 0.0:
                        vol_surge[s] = float(tot_v[s] / med_v)

    # Causal realised volatility `rv[t]` uses `bench_ret[t - vol_window : t]` (strictly <= t-1).
    ann = math.sqrt(PERIODS_PER_YEAR)
    rv = np.full(t_len, np.nan)
    for t in range(vol_window, t_len):
        seg = bench_ret[t - vol_window : t]
        fin = seg[np.isfinite(seg)]
        if fin.size >= max(5, vol_window // 2):
            rv[t] = float(np.std(fin, ddof=1)) * ann

    labels: list[str] = []
    for t in range(t_len):
        d_int = int(days[t])
        if t == 0:
            labels.append("sideways_choppy")
            continue

        # 1. Exchange disruption / depeg (causal post-onset window OR prior-bar basis dislocation).
        prev_basis = med_abs_basis[t - 1]
        if _in_known_disruption_window(d_int) or (
            np.isfinite(prev_basis) and prev_basis >= basis_dislocation_abs
        ):
            labels.append("exchange_disruption_depeg")
            continue

        # 2. Liquidity crisis / cascading liquidation (strictly prior-bar crash + surge/tail).
        r_prev = bench_ret[t - 1]
        recent_3 = bench_ret[max(0, t - 3) : t]
        fin_3 = recent_3[np.isfinite(recent_3)]
        min_3 = float(np.min(fin_3)) if fin_3.size > 0 else 0.0
        rv_t = rv[t]
        if (
            np.isfinite(r_prev)
            and r_prev <= -0.06
            and (vol_surge[t - 1] >= 1.4 or (np.isfinite(rv_t) and rv_t >= 0.70))
        ) or min_3 <= -0.085:
            labels.append("liquidity_crisis_cascading_liq")
            continue

        # 3 & 4. High-vol expansion / Low-vol compression from causal trailing distribution.
        if np.isfinite(rv_t):
            hist = rv[max(vol_window, t - vol_pct_lookback) : t]
            hist_fin = hist[np.isfinite(hist)]
            if hist_fin.size >= 20:
                q80 = float(np.quantile(hist_fin, 0.80))
                q20 = float(np.quantile(hist_fin, 0.20))
                if rv_t > q80 and rv_t >= 0.50:
                    labels.append("high_vol_expansion")
                    continue
                if rv_t < q20 or rv_t <= 0.28:
                    labels.append("low_vol_compression")
                    continue
            elif rv_t >= 0.85:
                labels.append("high_vol_expansion")
                continue
            elif rv_t <= 0.25:
                labels.append("low_vol_compression")
                continue

        # 5, 6, 7. Directional trend vs sideways choppy using `bench_px[t - 1]` vs `bench_px[t - 1 - trend_window]`.
        if t > trend_window:
            p_now = bench_px[t - 1]
            p_old = bench_px[t - 1 - trend_window]
            if np.isfinite(p_now) and np.isfinite(p_old) and p_old > 0.0:
                mom = p_now / p_old - 1.0
                if mom > 0.10:
                    labels.append("bull_uptrend")
                    continue
                if mom < -0.10:
                    labels.append("bear_downtrend")
                    continue

        labels.append("sideways_choppy")

    return labels


def attribute_by_regime(
    regimes: list[str] | np.ndarray,
    net: np.ndarray,
    turnover: np.ndarray,
) -> dict[str, dict]:
    """Compute conditional performance & turnover across all 7 mandatory regimes."""
    reg_arr = np.asarray(regimes, dtype=object)
    net_arr = np.nan_to_num(np.asarray(net, dtype=float), nan=0.0)
    turn_arr = np.nan_to_num(np.asarray(turnover, dtype=float), nan=0.0)
    if not (reg_arr.size == net_arr.size == turn_arr.size):
        raise ValueError(
            f"regime attribution length mismatch: regimes={reg_arr.size}, "
            f"net={net_arr.size}, turnover={turn_arr.size}"
        )

    out: dict[str, dict] = {}
    for reg in REGIME_ORDER:
        mask = reg_arr == reg
        n_days = int(np.sum(mask))
        if n_days == 0:
            out[reg] = {
                "days": 0,
                "active_days": 0,
                "cum_net": 0.0,
                "ann_return": None,
                "sharpe": None,
                "max_drawdown": 0.0,
                "mean_turnover": None,
                "win_rate": None,
            }
            continue
        r_sub = net_arr[mask]
        t_sub = turn_arr[mask]
        active = r_sub[np.abs(r_sub) >= 1e-12]
        sr = sharpe_ratio(r_sub, PERIODS_PER_YEAR) if n_days >= 5 else float("nan")
        win_base = active if active.size > 0 else r_sub
        out[reg] = {
            "days": n_days,
            "active_days": int(active.size),
            "cum_net": round(float(np.sum(r_sub)), 6),
            "ann_return": round(float(np.mean(r_sub) * PERIODS_PER_YEAR), 4),
            "sharpe": round(sr, 4) if math.isfinite(sr) else None,
            "max_drawdown": round(_unit_max_drawdown(r_sub), 6),
            "mean_turnover": round(float(np.mean(t_sub)), 4),
            "win_rate": round(float(np.mean(win_base > 0.0)), 4) if win_base.size > 0 else None,
        }
    return out
