"""Independent Decimal event-driven order-and-funding accounting oracle (Audit §13 & §18).

Verifies the vectorised close-price backtest & G6 TCA engine without sharing any pricing
or PnL code:
* Tracks `decimal.Decimal` cash balance (`$1,000,000` mandate) and base-asset contract
  quantities `units = target_notional / entry_px` at 50-digit decimal precision.
* Debits explicit per-order fees, half-spread (or maker adverse-selection + `p_leg_miss`
  emergency taker spread), latency slippage, and `Decimal.sqrt()` participation impact.
* Replays individual chronological 8h (Binance) or 1h (Hyperliquid) funding settlement
  events (`cash += -position_notional * funding_rate`) directly from the normalised
  event table rather than pre-summed daily float matrices.
* Asserts terminal and pathwise NAV parity `< 1.0 bps` (`< 0.01%`) against the vectorised
  engine.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, localcontext
from typing import Any

import numpy as np
import polars as pl

DAY_MS = 86_400_000


def _d(val: float | int | str) -> Decimal:
    return Decimal(str(val))


def index_funding_events(
    funding_events: pl.DataFrame,
    symbols: list[str],
    min_day: int,
    max_day: int,
) -> tuple[dict[tuple[int, str], list[Decimal]], int]:
    """Group individual 8h/1h funding prints by `(day, symbol)` in timestamp order."""
    sub = (
        funding_events.filter(pl.col("symbol").is_in(symbols))
        .with_columns((pl.col("ts_ms") // DAY_MS).alias("day"))
        .filter((pl.col("day") >= min_day) & (pl.col("day") <= max_day))
        .sort(["day", "symbol", "ts_ms"])
    )
    grouped: dict[tuple[int, str], list[Decimal]] = defaultdict(list)
    n_events = 0
    for sym, day_v, rate_v in zip(
        sub["symbol"].to_list(),
        sub["day"].to_list(),
        sub["funding_rate"].to_list(),
    ):
        if rate_v is not None and np.isfinite(rate_v):
            grouped[(int(day_v), str(sym))].append(_d(rate_v))
            n_events += 1
    return grouped, n_events


def run_decimal_ledger(
    *,
    positions: pl.DataFrame,
    perp_close: pl.DataFrame,
    funding_events: pl.DataFrame,
    vec_net: np.ndarray,
    spot_close: pl.DataFrame | None = None,
    has_spot_leg: bool = False,
    leg_fee_bps: dict[str, float],
    half_spread_bps_per_leg: dict[str, float],
    latency_bps_per_leg: dict[str, float],
    adv_usd: np.ndarray,
    vol_daily: np.ndarray,
    capital_usd: float = 1_000_000.0,
    impact_coefficient: float = 1.0,
    fallback_impact_bps: float = 2.0,
    max_stale_days: int = 2,
) -> dict[str, Any]:
    """Replay orders, mark-to-market unit settlements, and 8h/1h funding events in Decimal."""
    symbols = [c for c in positions.columns if c != "day"]
    days = [int(d) for d in positions["day"].to_list()]
    t_len = len(days)
    n_sym = len(symbols)

    pos_aligned = positions.sort("day")
    perp_aligned = pl.DataFrame({"day": pos_aligned["day"]}).join(
        perp_close.select(["day", *[s for s in symbols if s in perp_close.columns]]),
        on="day",
        how="left",
    ).sort("day")
    spot_aligned = None
    if has_spot_leg and spot_close is not None:
        spot_aligned = pl.DataFrame({"day": pos_aligned["day"]}).join(
            spot_close.select(["day", *[s for s in symbols if s in spot_close.columns]]),
            on="day",
            how="left",
        ).sort("day")

    w_mat = pos_aligned.select(symbols).cast(pl.Float64).to_numpy()
    p_cols = {
        s: perp_aligned[s].to_list() if s in perp_aligned.columns else [None] * t_len
        for s in symbols
    }
    s_cols = (
        {
            s: spot_aligned[s].to_list() if s in spot_aligned.columns else [None] * t_len
            for s in symbols
        }
        if spot_aligned is not None
        else {}
    )

    events_map, total_funding_events = index_funding_events(
        funding_events, symbols, min(days), max(days)
    )

    with localcontext() as ctx:
        ctx.prec = 50
        c0 = _d(capital_usd)
        ten_k = Decimal("10000")
        half = Decimal("0.5")
        zero = Decimal("0")
        impact_k = _d(impact_coefficient)
        fb_imp = _d(fallback_impact_bps)

        fee_d = {k: _d(v) / ten_k for k, v in leg_fee_bps.items()}
        spr_d = {k: _d(v) / ten_k for k, v in half_spread_bps_per_leg.items()}
        lat_d = {k: _d(v) / ten_k for k, v in latency_bps_per_leg.items()}

        cash_usd = c0
        drift_cash_usd = c0
        cum_fee_usd = zero
        cum_funding_usd = zero
        cum_mtm_usd = zero
        cum_drift_mtm_usd = zero
        order_count = 0

        prev_w = [zero] * n_sym
        held_units_perp = [zero] * n_sym
        held_units_spot = [zero] * n_sym
        last_perp: dict[int, tuple[int, Decimal]] = {}
        last_spot: dict[int, tuple[int, Decimal]] = {}
        oracle_nav = np.empty(t_len, dtype=float)
        drift_nav = np.empty(t_len, dtype=float)

        legs = (("spot", half), ("perp", half)) if has_spot_leg else (("perp", Decimal("1")),)

        for t in range(t_len):
            day_int = days[t]
            for j, sym in enumerate(symbols):
                raw_w = w_mat[t, j]
                w_curr = zero if (raw_w is None or np.isnan(raw_w)) else _d(float(raw_w))
                dw = abs(w_curr - prev_w[j])

                # 1. Explicit per-leg order execution debits.
                if dw > zero:
                    adv_val = adv_usd[t, j]
                    vol_val = vol_daily[t, j]
                    has_mkt = (
                        np.isfinite(adv_val)
                        and adv_val > 0.0
                        and np.isfinite(vol_val)
                        and vol_val >= 0.0
                    )
                    adv_dec = _d(float(adv_val)) if has_mkt else zero
                    vol_dec = _d(float(vol_val)) if has_mkt else zero

                    for leg_name, scale_dec in legs:
                        order_notional = dw * scale_dec * c0
                        if order_notional <= zero:
                            continue
                        order_count += 1
                        if has_mkt:
                            part_dec = order_notional / adv_dec
                            imp_frac = impact_k * vol_dec * part_dec.sqrt()
                        else:
                            imp_frac = fb_imp / ten_k

                        order_debit = order_notional * (
                            fee_d[leg_name] + spr_d[leg_name] + lat_d[leg_name] + imp_frac
                        )
                        cash_usd -= order_debit
                        drift_cash_usd -= order_debit
                        cum_fee_usd += order_debit

                # 2. Perp unit sizing & mark-to-market price settlement:
                #    (a) daily constant-notional mandate (`units_perp = perp_signed_w * c0 / px_prev`), AND
                #    (b) persistent base-unit contract inventory (`held_units_perp[j]` updated ONLY when
                #        an order executes `dw > 0`, measuring un-rebalanced unit-drift across `dw == 0` bars).
                perp_signed_w = (-half * w_curr) if has_spot_leg else w_curr
                p_val = p_cols[sym][t]
                if p_val is not None and np.isfinite(p_val) and p_val > 0.0:
                    px_now = _d(float(p_val))
                    if j in last_perp:
                        prev_day, px_prev = last_perp[j]
                        if perp_signed_w == zero:
                            held_units_perp[j] = zero
                        elif dw > zero or held_units_perp[j] == zero:
                            held_units_perp[j] = (perp_signed_w * c0) / px_prev
                        if 1 <= (day_int - prev_day) <= max_stale_days and perp_signed_w != zero:
                            units_perp = (perp_signed_w * c0) / px_prev
                            mtm_perp = units_perp * (px_now - px_prev)
                            cash_usd += mtm_perp
                            cum_mtm_usd += mtm_perp
                            drift_mtm_p = held_units_perp[j] * (px_now - px_prev)
                            drift_cash_usd += drift_mtm_p
                            cum_drift_mtm_usd += drift_mtm_p
                    elif perp_signed_w == zero:
                        held_units_perp[j] = zero
                    last_perp[j] = (day_int, px_now)
                elif perp_signed_w == zero:
                    held_units_perp[j] = zero

                # 3. Spot unit sizing & mark-to-market settlement (H3 / H3_MAKER).
                if has_spot_leg:
                    spot_signed_w = half * w_curr
                    s_val = s_cols[sym][t]
                    if s_val is not None and np.isfinite(s_val) and s_val > 0.0:
                        s_now = _d(float(s_val))
                        if j in last_spot:
                            prev_s_day, s_prev = last_spot[j]
                            if spot_signed_w == zero:
                                held_units_spot[j] = zero
                            elif dw > zero or held_units_spot[j] == zero:
                                held_units_spot[j] = (spot_signed_w * c0) / s_prev
                            if (
                                1 <= (day_int - prev_s_day) <= max_stale_days
                                and spot_signed_w != zero
                            ):
                                units_spot = (spot_signed_w * c0) / s_prev
                                mtm_spot = units_spot * (s_now - s_prev)
                                cash_usd += mtm_spot
                                cum_mtm_usd += mtm_spot
                                drift_mtm_s = held_units_spot[j] * (s_now - s_prev)
                                drift_cash_usd += drift_mtm_s
                                cum_drift_mtm_usd += drift_mtm_s
                        elif spot_signed_w == zero:
                            held_units_spot[j] = zero
                        last_spot[j] = (day_int, s_now)
                    elif spot_signed_w == zero:
                        held_units_spot[j] = zero

                # 4. Individual 8h / 1h funding settlement events (`-notional * funding_rate`).
                if perp_signed_w != zero:
                    pos_notional = perp_signed_w * c0
                    drift_pos_notional = (
                        held_units_perp[j] * _d(float(p_val))
                        if (
                            held_units_perp[j] != zero
                            and p_val is not None
                            and np.isfinite(p_val)
                            and p_val > 0.0
                        )
                        else pos_notional
                    )
                    for f_rate in events_map.get((day_int, sym), ()):
                        f_cf = -pos_notional * f_rate
                        cash_usd += f_cf
                        cum_funding_usd += f_cf
                        drift_cash_usd += -drift_pos_notional * f_rate

                prev_w[j] = w_curr

            oracle_nav[t] = float(cash_usd / c0)
            drift_nav[t] = float(drift_cash_usd / c0)

    vec_clean = np.nan_to_num(np.asarray(vec_net, dtype=float), nan=0.0)
    vec_nav = 1.0 + np.cumsum(vec_clean)
    terminal_oracle = float(oracle_nav[-1]) if t_len else 1.0
    terminal_drift = float(drift_nav[-1]) if t_len else 1.0
    terminal_vec = float(vec_nav[-1]) if t_len else 1.0
    term_diff_bps = abs(terminal_oracle - terminal_vec) * 1e4
    max_path_diff_bps = float(np.max(np.abs(oracle_nav - vec_nav)) * 1e4) if t_len else 0.0
    unit_drift_bps = abs(terminal_drift - terminal_vec) * 1e4

    return {
        "capital_usd": float(capital_usd),
        "days": t_len,
        "orders_executed": order_count,
        "funding_events_replayed": total_funding_events,
        "vectorized_terminal_nav": round(terminal_vec, 10),
        "decimal_oracle_terminal_nav": round(terminal_oracle, 10),
        "persistent_unit_inventory_terminal_nav": round(terminal_drift, 10),
        "terminal_nav_discrepancy_bps": round(term_diff_bps, 8),
        "max_daily_nav_discrepancy_bps": round(max_path_diff_bps, 8),
        "unrebalanced_unit_drift_bps": round(unit_drift_bps, 4),
        "oracle_cum_mtm_frac": round(float(cum_mtm_usd / _d(capital_usd)), 8),
        "persistent_unit_cum_mtm_frac": round(float(cum_drift_mtm_usd / _d(capital_usd)), 8),
        "oracle_cum_funding_frac": round(float(cum_funding_usd / _d(capital_usd)), 8),
        "oracle_cum_execution_cost_frac": round(float(cum_fee_usd / _d(capital_usd)), 8),
        "tolerance_bps": 1.0,
        "passes_1bps_gate": bool(term_diff_bps < 1.0 and max_path_diff_bps < 1.0),
    }
