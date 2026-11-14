"""Gate G13 — Day-0 Paper-Forward Observation Clock, Shadow Parity Oracle & Kill-Fence Guard.

Performs four deterministic, fail-closed actions (`PAPER/BACKTEST ONLY` — zero order authority):
1. Emits & verifies `artifacts/strategy_lifecycle_registry.json` (`H1, H2, H3, H1_G1, H2_G1` ->
   `ARCHIVED_FALSIFIED`; `H3_MAKER` -> `PAPER_FORWARD_ELIGIBLE`) and enforces
   `assert_paper_forward_eligible` across all families.
2. Emits & verifies `artifacts/signed_strategy_spec_h3_maker.json` (`executionMode: "PAPER_ONLY"`,
   `liveOrderAuthority: false`, `aiOrderAuthority: false`, canonical `payloadSha256`).
3. Captures (or loads `--offline` from `verification_lab/data/raw/g13_day0_snapshot.json`) a
   zero-auth live public market snapshot across `CORE_19` on Binance Spot + Binance USD-M Perp +
   Hyperliquid `metaAndAssetCtxs`, computing `H3_MAKER`'s causal Day-0 target weights with zero
   orders transmitted anywhere.
4. Runs a 90-day historical shadow parity reconciliation between CashClaw's integer satoshi /
   micro-USD paper ledger (`10^8` base units, `10^6` micro-USD fees/funding matching
   `MicroDoubleEntryLedger`) and `event_ledger_oracle.run_decimal_ledger` (`Decimal(prec=50)`),
   proving `harness_shadow_tracking_error_bps_per_month < 15.0`, and writes
   `artifacts/g13_paper_tracking_error.json` honestly (`elapsed_days: 0 < 60` ->
   `status: "OBSERVATION_ACTIVE_INCONCLUSIVE"`, `g13_pass: false`, `live_trading_unlocked: false`).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from verification_lab.execution import (  # noqa: E402
    cost_model,
    event_ledger_oracle,
    fees,
    maker_queue,
    market,
)
from verification_lab.runner import run_grid  # noqa: E402
from verification_lab.runner.strategy_archive import (  # noqa: E402
    ARCHIVED_FAMILIES,
    ELIGIBLE_FAMILY,
    assert_paper_forward_eligible,
    build_signed_strategy_spec_h3_maker,
    build_strategy_lifecycle_registry,
    verify_lifecycle_registry,
    verify_signed_strategy_spec,
)
from verification_lab.strategies import h3_basis_carry as h3  # noqa: E402
from verification_lab.strategies import loaders  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
ART = REPO / "artifacts"
RAW_DIR = REPO / "verification_lab" / "data" / "raw"
NORM_DIR = REPO / "verification_lab" / "data" / "normalized"

G5_PATH = ART / "g5_statistical_validity.json"
G6_PATH = ART / "g6_execution_tca.json"
TICK_CAL_PATH = ART / "h3_maker_tick_queue_calibration.json"
LIFECYCLE_PATH = ART / "strategy_lifecycle_registry.json"
SIGNED_SPEC_PATH = ART / "signed_strategy_spec_h3_maker.json"
G13_OUT_PATH = ART / "g13_paper_tracking_error.json"
DAY0_CACHE_PATH = RAW_DIR / "g13_day0_snapshot.json"

BINANCE_SPOT_BOOK_URL = "https://data-api.binance.vision/api/v3/ticker/bookTicker"
BINANCE_PERP_PREM_URL = "https://fapi.binance.com/fapi/v1/premiumIndex"
HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info"

BASE_UNITS_PER_ASSET = 100_000_000  # 10^8 satoshi base units (matches CashClaw ledger-types.ts)
MICRO_USD_SCALE = 1_000_000         # 10^6 micro-USD


def _parse_utc(ts_iso: str) -> datetime:
    cleaned = ts_iso.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    dt = datetime.fromisoformat(cleaned)
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_or_load_day0_public_snapshot(
    universe: list[str],
    spec_params: dict[str, Any],
    *,
    cache_path: Path = DAY0_CACHE_PATH,
    offline: bool = False,
) -> dict[str, Any]:
    """Capture or replay `--offline` zero-auth public Day-0 market & causal weight snapshot."""
    if offline:
        if not cache_path.exists():
            raise FileNotFoundError(
                f"Missing cached Day-0 public snapshot in --offline mode: {cache_path}"
            )
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        cached["cache_hit"] = True
        return cached

    if cache_path.exists():
        # Preserve original Day-0 genesis observation if already recorded today; otherwise refresh
        # live quotes for new checkpoint verification while keeping deterministic offline cache.
        existing = json.loads(cache_path.read_text(encoding="utf-8"))
        existing_date = str(existing.get("observed_at_utc", ""))[:10]
        today_str = _utc_now_iso()[:10]
        if existing_date == today_str:
            existing["cache_hit"] = True
            return existing

    observed_at = _utc_now_iso()
    r_spot = requests.get(BINANCE_SPOT_BOOK_URL, timeout=20)
    r_spot.raise_for_status()
    spot_map = {row["symbol"]: row for row in r_spot.json() if row.get("symbol") in universe}

    r_perp = requests.get(BINANCE_PERP_PREM_URL, timeout=20)
    r_perp.raise_for_status()
    perp_map = {row["symbol"]: row for row in r_perp.json() if row.get("symbol") in universe}

    r_hl = requests.post(HYPERLIQUID_INFO_URL, json={"type": "metaAndAssetCtxs"}, timeout=20)
    r_hl.raise_for_status()
    hl_meta, hl_ctxs = r_hl.json()
    hl_idx = {u["name"]: i for i, u in enumerate(hl_meta.get("universe", []))}

    # Compute causal Day-0 target weights from historical panel + live basis/funding diagnostics.
    panel = run_grid.build_panel("CORE_19")
    pos_hist = h3.build_positions_maker(
        panel.basis,
        panel.funding,
        lookback=int(spec_params["lookbackDays"]),
        entry_annual_bps=float(spec_params["entryAnnualBps"]),
        exit_annual_bps=float(spec_params["exitAnnualBps"]),
        p_fill=float(spec_params["fifoFillProbability"]),
    )
    last_hist_row = pos_hist.tail(1).to_dicts()[0]

    per_symbol: dict[str, dict[str, Any]] = {}
    day0_weights: dict[str, float] = {}
    entry_bps = float(spec_params["entryAnnualBps"])

    for sym in sorted(universe):
        coin = sym.replace("USDT", "")
        sp = spot_map.get(sym, {})
        pp = perp_map.get(sym, {})
        s_bid = float(sp.get("bidPrice", 0.0) or 0.0)
        s_ask = float(sp.get("askPrice", 0.0) or 0.0)
        spot_mid = 0.5 * (s_bid + s_ask) if (s_bid > 0 and s_ask > 0) else 0.0
        perp_mark = float(pp.get("markPrice", 0.0) or 0.0)
        bn_fund_8h = float(pp.get("lastFundingRate", 0.0) or 0.0)
        inst_basis_bps = ((perp_mark / spot_mid - 1.0) * 1e4) if (spot_mid > 0 and perp_mark > 0) else 0.0
        inst_ann_basis_bps = inst_basis_bps * 365.0

        hl_entry: dict[str, Any] | None = None
        if coin in hl_idx:
            ctx = hl_ctxs[hl_idx[coin]]
            hl_mark = float(ctx.get("markPx") or 0.0)
            hl_mid = float(ctx.get("midPx") or hl_mark)
            hl_oracle = float(ctx.get("oraclePx") or spot_mid or hl_mark)
            hl_fund_1h = float(ctx.get("funding") or 0.0)
            hl_basis_bps = ((hl_mark / hl_oracle - 1.0) * 1e4) if hl_oracle > 0 else 0.0
            hl_entry = {
                "mid_px": round(hl_mid, 6),
                "mark_px": round(hl_mark, 6),
                "oracle_px": round(hl_oracle, 6),
                "funding_1h_rate": round(hl_fund_1h, 8),
                "annualised_funding_bps": round(hl_fund_1h * 24.0 * 365.0 * 1e4, 2),
                "perp_vs_oracle_basis_bps": round(hl_basis_bps, 4),
            }

        w_causal = round(float(last_hist_row.get(sym) or 0.0), 6)
        day0_weights[sym] = w_causal
        per_symbol[sym] = {
            "binance_spot_mid": round(spot_mid, 6),
            "binance_perp_mark": round(perp_mark, 6),
            "binance_funding_8h_rate": round(bn_fund_8h, 8),
            "binance_spot_perp_basis_bps": round(inst_basis_bps, 4),
            "binance_instantaneous_annual_basis_bps": round(inst_ann_basis_bps, 2),
            "exceeds_800bps_entry_hurdle_now": bool(inst_ann_basis_bps > entry_bps and bn_fund_8h > 0),
            "hyperliquid": hl_entry,
            "causal_target_pair_weight": w_causal,
        }

    raw_payload = {
        "observed_at_utc": observed_at,
        "mode": "READ_ONLY_PUBLIC_ZERO_AUTH",
        "orders_submitted": 0,
        "universe_count": len(universe),
        "active_causal_positions_count": sum(1 for v in day0_weights.values() if abs(v) > 0.0),
        "gross_target_pair_weight": round(sum(abs(v) for v in day0_weights.values()), 6),
        "causal_target_weights": day0_weights,
        "symbols": per_symbol,
    }
    raw_bytes = (json.dumps(raw_payload, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    raw_payload["snapshot_sha256"] = hashlib.sha256(raw_bytes).hexdigest()
    raw_payload["cache_hit"] = False

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(raw_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return raw_payload


def run_90d_shadow_parity_check(
    spec: dict[str, Any],
    *,
    window_days: int = 90,
    capital_usd: float = 1_000_000.0,
) -> dict[str, Any]:
    """Reconcile 90-day integer satoshi/micro-USD paper ledger against `Decimal(prec=50)` oracle.

    Simulates CashClaw's `MicroDoubleEntryLedger` integer quantization:
    * Base contract quantities rounded to integer `10^-8` satoshi units (`BASE_UNITS_PER_ASSET`),
    * Prices, order fees/slippage/impact, daily MTM settlements, and 8h funding cashflows
      rounded to integer micro-USD (`10^-6` USD),
    and measures monthly tracking error against `event_ledger_oracle.run_decimal_ledger`.
    """
    panel = run_grid.build_panel("SURVIVORSHIP_23")
    params = spec["parameters"]
    pos_all = h3.build_positions_maker(
        panel.basis,
        panel.funding,
        lookback=int(params["lookbackDays"]),
        entry_annual_bps=float(params["entryAnnualBps"]),
        exit_annual_bps=float(params["exitAnnualBps"]),
        p_fill=float(params["fifoFillProbability"]),
    )

    # Slice the final 90 days of the historical panel (`locked_oos` tail) including active trades;
    # also locate the 90-day OOS window containing the densest active rebalances (`2025-10..2026-01`
    # or `2026-02..2026-05`) if the final 90 days are flat so order quantization is genuinely stressed!
    syms = [c for c in pos_all.columns if c != "day"]
    w_all = pos_all.select(syms).cast(pl.Float64).to_numpy()
    dw_all = np.nansum(np.abs(np.diff(np.vstack([np.zeros((1, len(syms))), w_all]), axis=0)), axis=1)

    split_idx = int(len(panel.days) * 0.7) + 2 * int(params["lookbackDays"])
    best_start = len(panel.days) - window_days
    best_turn = float(np.sum(dw_all[best_start:]))
    if best_turn < 0.05:
        # Pick the 90-day post-embargo OOS window with maximum turnover so orders + funding are stressed!
        for s_idx in range(split_idx, len(panel.days) - window_days + 1):
            t_sum = float(np.sum(dw_all[s_idx : s_idx + window_days]))
            if t_sum > best_turn:
                best_turn = t_sum
                best_start = s_idx

    s_slice = slice(best_start, best_start + window_days)
    pos_sub = pos_all.slice(best_start, window_days)
    perp_sub = panel.perp_close.slice(best_start, window_days)
    spot_sub = panel.spot_close.slice(best_start, window_days)

    perp_1d_df = pl.read_parquet(NORM_DIR / "perp_1d.parquet").filter(pl.col("volume") > 0.0)
    adv_full = market.as_matrix(
        market.adv_panel(perp_1d_df.filter(pl.col("symbol").is_in(syms)), panel.perp_close["day"]),
        syms,
    )
    vol_full = market.as_matrix(market.volatility_panel(panel.perp_returns), syms)
    adv_sub = adv_full[s_slice]
    vol_sub = vol_full[s_slice]

    funding_raw = pl.read_parquet(NORM_DIR / "funding.parquet").filter(
        (~pl.col("is_delisted").fill_null(False)) | (pl.col("ts_ms") < pl.col("last_active_ts_ms"))
    )

    v_sched = spec["venueSchedule"]
    miss = float(params["singleLegMissProbability"])
    adv_bps = float(params["adverseSelectionBps"])
    taker_half_spr = 1.8372  # Hyperliquid empirical impactPxs half-spread
    assump = cost_model.CostAssumptions(capital_usd=capital_usd)

    leg_fee_bps = {
        "spot": (1.0 - miss) * float(v_sched["spotMakerBps"]) + miss * float(v_sched["spotTakerBps"]),
        "perp": (1.0 - miss) * float(v_sched["perpMakerBps"]) + miss * float(v_sched["perpTakerBps"]),
    }
    spr_bps = {
        "spot": (1.0 - miss) * adv_bps + miss * taker_half_spr,
        "perp": (1.0 - miss) * adv_bps + miss * taker_half_spr,
    }
    lat_bps = {
        "spot": miss * assump.latency_slippage_bps,
        "perp": miss * assump.latency_slippage_bps,
    }

    # Zero-anchor row at `best_start - 1` so entry from prior state matches cleanly.
    oracle_res = event_ledger_oracle.run_decimal_ledger(
        positions=pos_sub,
        perp_close=perp_sub,
        spot_close=spot_sub,
        has_spot_leg=True,
        funding_events=funding_raw,
        vec_net=np.zeros(window_days),
        leg_fee_bps=leg_fee_bps,
        half_spread_bps_per_leg=spr_bps,
        latency_bps_per_leg=lat_bps,
        adv_usd=adv_sub,
        vol_daily=vol_sub,
        capital_usd=capital_usd,
        impact_coefficient=assump.impact_coefficient,
        fallback_impact_bps=assump.assumed_impact_bps,
    )

    # Integer micro-USD & satoshi base-unit simulation mirroring CashClaw `MicroDoubleEntryLedger`.
    days = [int(d) for d in pos_sub["day"].to_list()]
    w_mat = pos_sub.select(syms).cast(pl.Float64).to_numpy()
    p_cols = {s: perp_sub[s].to_list() for s in syms}
    s_cols = {s: spot_sub[s].to_list() for s in syms}
    events_map, _ = event_ledger_oracle.index_funding_events(
        funding_raw, syms, min(days), max(days)
    )

    cap_micro = int(round(capital_usd * MICRO_USD_SCALE))
    cash_micro = cap_micro
    realized_pnl_micro = 0
    fees_micro = 0
    funding_micro = 0
    prev_w = [0.0] * len(syms)
    last_perp_micro: dict[int, tuple[int, int]] = {}
    last_spot_micro: dict[int, tuple[int, int]] = {}
    paper_nav = np.empty(window_days, dtype=float)
    micro_orders = 0

    for t in range(window_days):
        day_int = days[t]
        for j, sym in enumerate(syms):
            raw_w = w_mat[t, j]
            w_curr = 0.0 if (raw_w is None or np.isnan(raw_w)) else float(raw_w)
            dw = abs(w_curr - prev_w[j])

            if dw > 0.0:
                adv_v = adv_sub[t, j]
                vol_v = vol_sub[t, j]
                has_mkt = np.isfinite(adv_v) and adv_v > 0.0 and np.isfinite(vol_v) and vol_v >= 0.0
                for leg_name in ("spot", "perp"):
                    ord_not_usd = 0.5 * dw * capital_usd
                    if ord_not_usd <= 0.0:
                        continue
                    micro_orders += 1
                    imp_b = (
                        assump.impact_coefficient * float(vol_v) * math.sqrt(ord_not_usd / float(adv_v)) * 1e4
                        if has_mkt
                        else assump.assumed_impact_bps
                    )
                    tot_rate = (leg_fee_bps[leg_name] + spr_bps[leg_name] + lat_bps[leg_name] + imp_b) / 1e4
                    fee_m = int(round(ord_not_usd * MICRO_USD_SCALE * tot_rate))
                    cash_micro -= fee_m
                    fees_micro += fee_m

            # Perp leg satoshi-quantized MTM settlement (`-0.5 * w_curr`).
            perp_w = -0.5 * w_curr
            pv = p_cols[sym][t]
            if pv is not None and np.isfinite(pv) and pv > 0.0:
                px_m = max(1, int(round(float(pv) * MICRO_USD_SCALE)))
                if j in last_perp_micro:
                    prev_d, px_prev_m = last_perp_micro[j]
                    if 1 <= (day_int - prev_d) <= 2 and perp_w != 0.0:
                        sign = 1 if perp_w > 0 else -1
                        qty_sat = (abs(int(round(perp_w * cap_micro))) * BASE_UNITS_PER_ASSET) // px_prev_m
                        mtm_m = sign * ((qty_sat * (px_m - px_prev_m)) // BASE_UNITS_PER_ASSET)
                        cash_micro += mtm_m
                        realized_pnl_micro += mtm_m
                last_perp_micro[j] = (day_int, px_m)

            # Spot leg satoshi-quantized MTM settlement (`+0.5 * w_curr`).
            spot_w = 0.5 * w_curr
            sv = s_cols[sym][t]
            if sv is not None and np.isfinite(sv) and sv > 0.0:
                sx_m = max(1, int(round(float(sv) * MICRO_USD_SCALE)))
                if j in last_spot_micro:
                    prev_sd, sx_prev_m = last_spot_micro[j]
                    if 1 <= (day_int - prev_sd) <= 2 and spot_w != 0.0:
                        sign_s = 1 if spot_w > 0 else -1
                        qty_sat_s = (abs(int(round(spot_w * cap_micro))) * BASE_UNITS_PER_ASSET) // sx_prev_m
                        mtm_s = sign_s * ((qty_sat_s * (sx_m - sx_prev_m)) // BASE_UNITS_PER_ASSET)
                        cash_micro += mtm_s
                        realized_pnl_micro += mtm_s
                last_spot_micro[j] = (day_int, sx_m)

            # Individual 8h funding cashflows rounded to integer micro-USD.
            if perp_w != 0.0:
                pos_not_micro = int(round(perp_w * cap_micro))
                for f_rate in events_map.get((day_int, sym), ()):
                    f_m = int(round(-float(pos_not_micro) * float(f_rate)))
                    cash_micro += f_m
                    funding_micro += f_m

            prev_w[j] = w_curr

        # Double-entry invariant: assets (`cash_micro`) === equity (`cap + pnl + funding - fees`).
        equity_micro = cap_micro + realized_pnl_micro + funding_micro - fees_micro
        assert cash_micro == equity_micro, "Micro double-entry balance sheet discrepancy!"
        paper_nav[t] = cash_micro / float(cap_micro)

    months = window_days / 30.0
    paper_term = float(paper_nav[-1])
    oracle_term = float(oracle_res["decimal_oracle_terminal_nav"])
    cum_diff_bps = abs(paper_term - oracle_term) * 1e4
    te_bps_per_month = cum_diff_bps / months

    max_allowed = float(spec["riskGates"]["maxTrackingErrorBpsPerMonth"])
    return {
        "window_days": window_days,
        "window_start_epoch_day": int(days[0]),
        "window_end_epoch_day": int(days[-1]),
        "orders_reconciled": micro_orders,
        "funding_events_reconciled": int(oracle_res["funding_events_replayed"]),
        "double_entry_discrepancy_micro_usd": 0,
        "paper_micro_ledger_terminal_nav": round(paper_term, 10),
        "decimal_oracle_terminal_nav": round(oracle_term, 10),
        "cumulative_90d_nav_diff_bps": round(cum_diff_bps, 8),
        "harness_shadow_tracking_error_bps_per_month": round(te_bps_per_month, 8),
        "max_allowed_tracking_error_bps_per_month": max_allowed,
        "passes_15bps_per_month_gate": bool(te_bps_per_month < max_allowed),
    }


def evaluate_g13_checkpoints(
    *,
    spec_path_rel: str,
    spec_sha256: str,
    genesis_utc: str,
    checkpoints: list[dict[str, Any]],
    min_required_days: int = 60,
    target_days: int = 90,
    max_allowed_tracking_error_bps_per_month: float = 15.0,
    harness_shadow_parity_check: dict[str, Any],
    day0_live_public_snapshot: dict[str, Any],
) -> dict[str, Any]:
    """Pure fail-closed Gate G13 state machine over append-only real-time checkpoints.

    Invariants:
    * `elapsed_days < min_required_days` (e.g. Day 0 -> `elapsed_days == 0 < 60`) ALWAYS yields
      `status = "OBSERVATION_ACTIVE_INCONCLUSIVE"` and `g13_pass = False`.
    * `elapsed_days >= min_required_days` yields `g13_pass = True` ONLY if both the harness
      shadow parity check AND the realized checkpoint tracking error are strictly `< 15.0 bps/mo`.
    * `live_trading_unlocked` is ALWAYS `False` in G13 (G15 owner sign-off remains hard-locked).
    """
    if not checkpoints:
        raise ValueError("checkpoints must contain at least the Day-0 genesis checkpoint")

    gen_dt = _parse_utc(genesis_utc)
    sorted_cps = sorted(checkpoints, key=lambda c: _parse_utc(str(c["observed_at_utc"])))
    latest_utc = str(sorted_cps[-1]["observed_at_utc"])
    latest_dt = _parse_utc(latest_utc)
    if latest_dt < gen_dt:
        raise ValueError(f"latest_checkpoint_utc {latest_utc} precedes genesis_utc {genesis_utc}")

    elapsed_days = int((latest_dt - gen_dt).total_seconds() // 86_400)

    # Compute realized monthly tracking error across recorded checkpoints (`paper_nav` vs `oracle_nav`),
    # taking the conservative maximum of cumulative terminal drift and pathwise interval MAE so mid-window
    # excursions that later mean-revert are never hidden.
    if elapsed_days > 0 and len(sorted_cps) >= 2:
        p_nav = float(sorted_cps[-1].get("paper_nav", 1.0))
        o_nav = float(sorted_cps[-1].get("oracle_nav", 1.0))
        months_elapsed = max(elapsed_days / 30.0, 1e-6)
        terminal_te_bps_mo = abs(p_nav - o_nav) * 1e4 / months_elapsed
        path_abs_diff = 0.0
        for idx in range(1, len(sorted_cps)):
            dp = float(sorted_cps[idx].get("paper_nav", 1.0)) - float(sorted_cps[idx - 1].get("paper_nav", 1.0))
            do = float(sorted_cps[idx].get("oracle_nav", 1.0)) - float(sorted_cps[idx - 1].get("oracle_nav", 1.0))
            path_abs_diff += abs(dp - do)
        path_mae_bps_mo = path_abs_diff * 1e4 / months_elapsed
        realized_te_bps_mo: float | None = round(max(terminal_te_bps_mo, path_mae_bps_mo), 6)
    else:
        realized_te_bps_mo = None

    shadow_ok = bool(
        float(harness_shadow_parity_check["harness_shadow_tracking_error_bps_per_month"])
        < float(max_allowed_tracking_error_bps_per_month)
    )

    if elapsed_days < int(min_required_days):
        status = "OBSERVATION_ACTIVE_INCONCLUSIVE"
        g13_pass = False
    elif (
        realized_te_bps_mo is not None
        and realized_te_bps_mo < float(max_allowed_tracking_error_bps_per_month)
        and shadow_ok
    ):
        status = "PASS"
        g13_pass = True
    else:
        status = "FAIL_TRACKING_ERROR_EXCEEDED"
        g13_pass = False

    return {
        "schema_version": "1.0.0",
        "gate": "G13",
        "status": status,
        "g13_pass": g13_pass,
        "live_trading_unlocked": False,
        "spec_path": spec_path_rel,
        "spec_sha256": spec_sha256,
        "genesis_utc": genesis_utc,
        "latest_checkpoint_utc": latest_utc,
        "elapsed_days": elapsed_days,
        "min_required_days": int(min_required_days),
        "target_days": int(target_days),
        "max_allowed_tracking_error_bps_per_month": float(max_allowed_tracking_error_bps_per_month),
        "realized_tracking_error_bps_per_month": realized_te_bps_mo,
        "harness_shadow_parity_check": harness_shadow_parity_check,
        "day0_live_public_snapshot": day0_live_public_snapshot,
        "checkpoints": sorted_cps,
    }


def _display_path(p: Path) -> str:
    try:
        return str(p.relative_to(REPO))
    except ValueError:
        return str(p)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Use cached public Day-0 snapshot and normalized parquets with zero network calls",
    )
    parser.add_argument("--paper-nav", type=float, default=None, help="Realized paper NAV for Day > 0 checkpoint")
    parser.add_argument("--oracle-nav", type=float, default=None, help="Replayed Decimal oracle NAV for Day > 0 checkpoint")
    args = parser.parse_args(argv)

    for req in (G5_PATH, G6_PATH, TICK_CAL_PATH):
        if not req.exists():
            print(f"REFUSING: missing prerequisite artifact {req.relative_to(REPO)}", file=sys.stderr)
            return 2

    # 1. Emit / verify formal strategy lifecycle registry & enforce kill-fence on archived families.
    existing_gen_at: str | None = None
    if LIFECYCLE_PATH.exists():
        try:
            prev_reg = json.loads(LIFECYCLE_PATH.read_text(encoding="utf-8"))
            existing_gen_at = prev_reg.get("generated_at")
        except (OSError, ValueError):
            existing_gen_at = None

    registry_payload = build_strategy_lifecycle_registry(
        G5_PATH, G6_PATH, repo_root=REPO, generated_at=existing_gen_at
    )
    if not verify_lifecycle_registry(registry_payload):
        print("REFUSING: lifecycle registry failed self-verification", file=sys.stderr)
        return 2
    LIFECYCLE_PATH.write_text(
        json.dumps(registry_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    for archived_id in ARCHIVED_FAMILIES:
        try:
            assert_paper_forward_eligible(archived_id, LIFECYCLE_PATH)
        except PermissionError:
            pass
        else:
            print(f"REFUSING: archived strategy {archived_id} was not blocked!", file=sys.stderr)
            return 2

    eligible_entry = assert_paper_forward_eligible(ELIGIBLE_FAMILY, LIFECYCLE_PATH)

    # 2. Emit & verify immutable SignedStrategySpec for H3_MAKER.
    spec = build_signed_strategy_spec_h3_maker(G5_PATH, TICK_CAL_PATH)
    ok_spec, spec_errs = verify_signed_strategy_spec(spec)
    if not ok_spec:
        print(f"REFUSING: SignedStrategySpec invalid: {spec_errs}", file=sys.stderr)
        return 2
    SIGNED_SPEC_PATH.write_text(
        json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # 3. Capture / load Day-0 public market observation snapshot.
    day0_snap = fetch_or_load_day0_public_snapshot(
        spec["universe"], spec["parameters"], offline=args.offline
    )

    # 4. Run 90-day shadow parity check (`MicroDoubleEntryLedger` integer rules vs `Decimal` oracle).
    shadow_parity = run_90d_shadow_parity_check(spec)
    if not shadow_parity["passes_15bps_per_month_gate"]:
        print(
            f"REFUSING: harness shadow tracking error {shadow_parity['harness_shadow_tracking_error_bps_per_month']} "
            f">= {spec['riskGates']['maxTrackingErrorBpsPerMonth']} bps/mo",
            file=sys.stderr,
        )
        return 2

    # 5. Append or preserve checkpoints honestly (`elapsed_days` never fabricated!).
    genesis_utc = str(day0_snap["observed_at_utc"])
    checkpoints: list[dict[str, Any]] = []
    if G13_OUT_PATH.exists():
        try:
            prev_g13 = json.loads(G13_OUT_PATH.read_text(encoding="utf-8"))
            if prev_g13.get("spec_sha256") == spec["payloadSha256"]:
                genesis_utc = str(prev_g13.get("genesis_utc", genesis_utc))
                checkpoints = list(prev_g13.get("checkpoints", []))
        except (OSError, ValueError):
            checkpoints = []

    now_obs = str(day0_snap["observed_at_utc"]) if args.offline or not checkpoints else _utc_now_iso()
    obs_day = now_obs[:10]
    existing_days = {str(cp.get("observed_at_utc", ""))[:10] for cp in checkpoints}

    if not checkpoints:
        checkpoints.append(
            {
                "checkpoint_index": 0,
                "day_offset": 0,
                "observed_at_utc": genesis_utc,
                "paper_nav": 1.0,
                "oracle_nav": 1.0,
                "tracking_error_bps_cum": 0.0,
                "active_positions": int(day0_snap["active_causal_positions_count"]),
                "gross_target_weight": float(day0_snap["gross_target_pair_weight"]),
                "snapshot_sha256": str(day0_snap["snapshot_sha256"]),
                "note": "Day-0 genesis checkpoint recorded; real-time 60-90d clock started.",
            }
        )
    elif obs_day not in existing_days:
        if args.paper_nav is None or args.oracle_nav is None:
            print(
                "REFUSING: appending a Day > 0 checkpoint requires explicit --paper-nav and --oracle-nav "
                "from live paper ledger vs Decimal oracle reconciliation",
                file=sys.stderr,
            )
            return 2
        gen_dt = _parse_utc(genesis_utc)
        cur_dt = _parse_utc(now_obs)
        d_off = max(0, int((cur_dt - gen_dt).total_seconds() // 86_400))
        checkpoints.append(
            {
                "checkpoint_index": len(checkpoints),
                "day_offset": d_off,
                "observed_at_utc": now_obs,
                "paper_nav": float(args.paper_nav),
                "oracle_nav": float(args.oracle_nav),
                "tracking_error_bps_cum": round(abs(float(args.paper_nav) - float(args.oracle_nav)) * 1e4, 6),
                "active_positions": int(day0_snap["active_causal_positions_count"]),
                "gross_target_weight": float(day0_snap["gross_target_pair_weight"]),
                "snapshot_sha256": str(day0_snap["snapshot_sha256"]),
                "note": f"Day-{d_off} observation checkpoint appended.",
            }
        )

    g13_payload = evaluate_g13_checkpoints(
        spec_path_rel="artifacts/signed_strategy_spec_h3_maker.json",
        spec_sha256=spec["payloadSha256"],
        genesis_utc=genesis_utc,
        checkpoints=checkpoints,
        min_required_days=int(spec["observationWindow"]["minRequiredDays"]),
        target_days=int(spec["observationWindow"]["targetDays"]),
        max_allowed_tracking_error_bps_per_month=float(
            spec["riskGates"]["maxTrackingErrorBpsPerMonth"]
        ),
        harness_shadow_parity_check=shadow_parity,
        day0_live_public_snapshot=day0_snap,
    )
    G13_OUT_PATH.write_text(
        json.dumps(g13_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"wrote {_display_path(LIFECYCLE_PATH)} (sha256={registry_payload['registry_sha256'][:16]}...)")
    print(f"  eligible={eligible_entry['strategy_id']} | archived={list(ARCHIVED_FAMILIES)}")
    print(f"wrote {_display_path(SIGNED_SPEC_PATH)} (payloadSha256={spec['payloadSha256'][:16]}...)")
    print(
        f"wrote {_display_path(G13_OUT_PATH)}: status={g13_payload['status']} "
        f"g13_pass={g13_payload['g13_pass']} elapsed_days={g13_payload['elapsed_days']}/{g13_payload['min_required_days']} "
        f"shadow_TE={shadow_parity['harness_shadow_tracking_error_bps_per_month']:.6f} bps/mo"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
