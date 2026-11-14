"""Gate G13 — Day-0 Paper-Forward Observation Clock, Shadow Parity Oracle & Kill-Fence Guard.

Performs deterministic, fail-closed actions (`PAPER/BACKTEST ONLY` — zero order authority):
1. Emits & verifies `artifacts/strategy_lifecycle_registry.json` (`H1, H2, H3, H1_G1, H2_G1` ->
   `ARCHIVED_FALSIFIED`; `H3_MAKER` -> `PAPER_FORWARD_ELIGIBLE`) and enforces
   `assert_paper_forward_eligible` across all families.
2. Emits & verifies `artifacts/signed_strategy_spec_h3_maker.json` (`executionMode: "PAPER_ONLY"`,
   `liveOrderAuthority: false`, `aiOrderAuthority: false`, canonical `payloadSha256`).
3. Captures (or loads `--offline` from `verification_lab/data/raw/g13_day0_snapshot.json`) a
   geo-resilient zero-auth live public market snapshot across `CORE_19` on Binance Spot Vision +
   Binance USD-M Perp (with automatic US CI geo-block fallback to `www.binance.com/fapi` or
   Hyperliquid `metaAndAssetCtxs`), computing `H3_MAKER`'s causal target weights with zero
   orders transmitted anywhere.
4. Runs a 90-day historical shadow parity reconciliation between CashClaw's integer satoshi /
   micro-USD paper ledger (`10^8` base units, `10^6` micro-USD fees/funding matching
   `MicroDoubleEntryLedger`) and `event_ledger_oracle.run_decimal_ledger` (`Decimal(prec=50)`),
   plus optional `--ts-reconciliation-json` independent `Decimal(prec=50)` replay of TypeScript
   `PaperForwardRunner` checkpoints, proving tracking error `< 15.0 bps/month` while keeping
   `live_trading_unlocked: false` (Gate G15 HARD-LOCKED).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from decimal import Decimal, localcontext
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
BINANCE_PERP_FALLBACK_URL = "https://www.binance.com/fapi/v1/premiumIndex"
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


def compute_snapshot_sha256(snapshot: dict[str, Any]) -> str:
    core = {k: v for k, v in snapshot.items() if k not in ("snapshot_sha256", "cache_hit")}
    raw_bytes = (json.dumps(core, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    return hashlib.sha256(raw_bytes).hexdigest()


def _has_normalized_parquets() -> bool:
    return (
        (NORM_DIR / "perp_1d.parquet").exists()
        and (NORM_DIR / "spot_1d.parquet").exists()
        and (NORM_DIR / "funding.parquet").exists()
    )


def _fetch_perp_map_with_fallback(
    universe: list[str],
) -> tuple[dict[str, dict[str, Any]], str]:
    universe_set = set(universe)
    for url, source_name in (
        (BINANCE_PERP_PREM_URL, "binance_fapi_premium_index"),
        (BINANCE_PERP_FALLBACK_URL, "binance_www_premium_index"),
    ):
        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code in (451, 403, 418, 429) or resp.status_code >= 500:
                continue
            resp.raise_for_status()
            payload = resp.json()
            if isinstance(payload, list):
                mapped = {
                    str(row["symbol"]): row
                    for row in payload
                    if isinstance(row, dict) and row.get("symbol") in universe_set
                }
                if mapped:
                    return mapped, source_name
        except (requests.RequestException, ValueError):
            continue
    return {}, "hyperliquid_meta_and_asset_ctxs_fallback"


def _fetch_public_venue_quotes(
    universe: list[str],
) -> tuple[
    dict[str, dict[str, Any]],
    dict[str, dict[str, Any]],
    dict[str, int],
    list[dict[str, Any]],
    str,
]:
    universe_set = set(universe)
    spot_map: dict[str, dict[str, Any]] = {}
    try:
        r_spot = requests.get(BINANCE_SPOT_BOOK_URL, timeout=20)
        r_spot.raise_for_status()
        spot_json = r_spot.json()
        if isinstance(spot_json, list):
            spot_map = {
                str(row["symbol"]): row
                for row in spot_json
                if isinstance(row, dict) and row.get("symbol") in universe_set
            }
    except (requests.RequestException, ValueError):
        spot_map = {}

    perp_map, perp_source = _fetch_perp_map_with_fallback(universe)

    hl_idx: dict[str, int] = {}
    hl_ctxs: list[dict[str, Any]] = []
    try:
        r_hl = requests.post(HYPERLIQUID_INFO_URL, json={"type": "metaAndAssetCtxs"}, timeout=20)
        r_hl.raise_for_status()
        hl_payload = r_hl.json()
        if isinstance(hl_payload, list) and len(hl_payload) == 2:
            hl_meta, raw_ctxs = hl_payload
            if isinstance(hl_meta, dict) and isinstance(raw_ctxs, list):
                hl_ctxs = raw_ctxs
                hl_idx = {
                    str(u["name"]): i
                    for i, u in enumerate(hl_meta.get("universe", []))
                    if isinstance(u, dict) and "name" in u
                }
    except (requests.RequestException, ValueError):
        hl_idx = {}
        hl_ctxs = []

    has_spot_source = bool(spot_map) or bool(hl_idx)
    has_perp_source = bool(perp_map) or bool(hl_idx)
    if not has_spot_source or not has_perp_source:
        raise RuntimeError(
            "REFUSING: no reachable zero-auth public quote/funding source (Binance & Hyperliquid unreachable)"
        )
    return spot_map, perp_map, hl_idx, hl_ctxs, perp_source


def _derive_causal_weights_from_prior_snapshot(
    universe: list[str],
    spec_params: dict[str, Any],
    per_symbol_quotes: dict[str, tuple[float, float, float]],
    state_file: Path | None = None,
) -> dict[str, float]:
    prev_weights: dict[str, float] = {}
    if state_file is not None and state_file.exists():
        try:
            st_doc = json.loads(state_file.read_text(encoding="utf-8"))
            for pos in st_doc.get("positions", []):
                sym = str(pos.get("symbol", ""))
                qty = int(pos.get("signedQtyBase", "0") or "0")
                if sym.endswith(":SPOT") and qty > 0:
                    prev_weights[sym.split(":")[0]] = 1.0
        except (OSError, ValueError, TypeError):
            prev_weights = {}
    elif G13_OUT_PATH.exists():
        try:
            prev_doc = json.loads(G13_OUT_PATH.read_text(encoding="utf-8"))
            prev_snap = prev_doc.get("day0_live_public_snapshot", {})
            raw_w = prev_snap.get("causal_target_weights", {})
            if isinstance(raw_w, dict):
                prev_weights = {str(k): float(v or 0.0) for k, v in raw_w.items()}
        except (OSError, ValueError, TypeError):
            prev_weights = {}

    entry_bps = float(spec_params["entryAnnualBps"])
    exit_bps = float(spec_params["exitAnnualBps"])
    p_fill = float(spec_params["fifoFillProbability"])
    active_raw: dict[str, float] = {}
    for sym in sorted(universe):
        spot_mid, perp_mark, fund_8h = per_symbol_quotes.get(sym, (0.0, 0.0, 0.0))
        if spot_mid <= 0.0 or perp_mark <= 0.0:
            active_raw[sym] = 0.0
            continue
        ann_basis_bps = (perp_mark / spot_mid - 1.0) * 1e4 * 365.0
        was_holding = prev_weights.get(sym, 0.0) > 0.0
        if was_holding and ann_basis_bps > exit_bps:
            active_raw[sym] = 1.0
        elif (not was_holding) and ann_basis_bps > entry_bps and fund_8h > 0.0:
            active_raw[sym] = p_fill
        else:
            active_raw[sym] = 0.0

    gross = sum(active_raw.values())
    if gross <= 0.0:
        return {sym: 0.0 for sym in sorted(universe)}
    scale = min(1.0, 1.0 / gross)
    return {sym: round(active_raw[sym] * scale, 6) for sym in sorted(universe)}


def fetch_or_load_day0_public_snapshot(
    universe: list[str],
    spec_params: dict[str, Any],
    *,
    cache_path: Path = DAY0_CACHE_PATH,
    offline: bool = False,
    state_file: Path | None = None,
) -> dict[str, Any]:
    """Capture or replay `--offline` zero-auth public market & causal weight snapshot."""
    if offline:
        if cache_path.exists():
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            if compute_snapshot_sha256(cached) != cached.get("snapshot_sha256"):
                raise ValueError(f"Cached snapshot SHA-256 mismatch at {cache_path}")
            cached["cache_hit"] = True
            return cached
        if cache_path == DAY0_CACHE_PATH and G13_OUT_PATH.exists():
            prev_g13 = json.loads(G13_OUT_PATH.read_text(encoding="utf-8"))
            embedded = prev_g13.get("day0_live_public_snapshot")
            if isinstance(embedded, dict) and compute_snapshot_sha256(embedded) == embedded.get(
                "snapshot_sha256"
            ):
                cloned = dict(embedded)
                cloned["cache_hit"] = True
                return cloned
        raise FileNotFoundError(
            f"Missing cached Day-0 public snapshot in --offline mode: {cache_path}"
        )

    today_str = _utc_now_iso()[:10]
    if cache_path.exists():
        existing = json.loads(cache_path.read_text(encoding="utf-8"))
        existing_date = str(existing.get("observed_at_utc", ""))[:10]
        if existing_date == today_str:
            existing["cache_hit"] = True
            return existing

    daily_cache_path = RAW_DIR / f"g13_snapshot_{today_str}.json"
    if cache_path == DAY0_CACHE_PATH and daily_cache_path.exists():
        daily_cached = json.loads(daily_cache_path.read_text(encoding="utf-8"))
        if compute_snapshot_sha256(daily_cached) == daily_cached.get("snapshot_sha256"):
            daily_cached["cache_hit"] = True
            return daily_cached

    observed_at = _utc_now_iso()
    spot_map, perp_map, hl_idx, hl_ctxs, perp_source = _fetch_public_venue_quotes(universe)

    per_symbol_quotes: dict[str, tuple[float, float, float]] = {}
    hl_entries: dict[str, dict[str, Any] | None] = {}
    valid_symbols = 0

    for sym in sorted(universe):
        coin = sym.replace("USDT", "")
        sp = spot_map.get(sym, {})
        pp = perp_map.get(sym, {})
        s_bid = float(sp.get("bidPrice", 0.0) or 0.0)
        s_ask = float(sp.get("askPrice", 0.0) or 0.0)
        spot_mid = 0.5 * (s_bid + s_ask) if (s_bid > 0 and s_ask > 0) else 0.0

        hl_entry: dict[str, Any] | None = None
        hl_mark = 0.0
        hl_oracle = 0.0
        hl_fund_1h = 0.0
        if coin in hl_idx and hl_idx[coin] < len(hl_ctxs):
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

        if spot_mid <= 0.0 and hl_oracle > 0.0:
            spot_mid = hl_oracle

        if pp:
            perp_mark = float(pp.get("markPrice", 0.0) or 0.0)
            bn_fund_8h = float(pp.get("lastFundingRate", 0.0) or 0.0)
        else:
            perp_mark = hl_mark
            bn_fund_8h = hl_fund_1h * 8.0

        if spot_mid > 0.0 and perp_mark > 0.0:
            valid_symbols += 1
        per_symbol_quotes[sym] = (spot_mid, perp_mark, bn_fund_8h)
        hl_entries[sym] = hl_entry

    if valid_symbols == 0:
        raise RuntimeError("REFUSING: zero valid CORE_19 symbol quotes from public venues")

    if _has_normalized_parquets():
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
    else:
        last_hist_row = _derive_causal_weights_from_prior_snapshot(
            universe, spec_params, per_symbol_quotes, state_file=state_file
        )

    per_symbol: dict[str, dict[str, Any]] = {}
    day0_weights: dict[str, float] = {}
    entry_bps = float(spec_params["entryAnnualBps"])

    for sym in sorted(universe):
        spot_mid, perp_mark, bn_fund_8h = per_symbol_quotes[sym]
        inst_basis_bps = (
            ((perp_mark / spot_mid - 1.0) * 1e4) if (spot_mid > 0 and perp_mark > 0) else 0.0
        )
        inst_ann_basis_bps = inst_basis_bps * 365.0
        w_causal = round(float(last_hist_row.get(sym) or 0.0), 6)
        day0_weights[sym] = w_causal
        per_symbol[sym] = {
            "binance_spot_mid": round(spot_mid, 6),
            "binance_perp_mark": round(perp_mark, 6),
            "binance_funding_8h_rate": round(bn_fund_8h, 8),
            "binance_spot_perp_basis_bps": round(inst_basis_bps, 4),
            "binance_instantaneous_annual_basis_bps": round(inst_ann_basis_bps, 2),
            "exceeds_800bps_entry_hurdle_now": bool(
                inst_ann_basis_bps > entry_bps and bn_fund_8h > 0
            ),
            "hyperliquid": hl_entries[sym],
            "causal_target_pair_weight": w_causal,
        }

    raw_payload: dict[str, Any] = {
        "observed_at_utc": observed_at,
        "mode": "READ_ONLY_PUBLIC_ZERO_AUTH",
        "perp_source": perp_source,
        "orders_submitted": 0,
        "universe_count": len(universe),
        "active_causal_positions_count": sum(1 for v in day0_weights.values() if abs(v) > 0.0),
        "gross_target_pair_weight": round(sum(abs(v) for v in day0_weights.values()), 6),
        "causal_target_weights": day0_weights,
        "symbols": per_symbol,
    }
    raw_payload["snapshot_sha256"] = compute_snapshot_sha256(raw_payload)
    raw_payload["cache_hit"] = False

    target_write_path = cache_path if not cache_path.exists() else daily_cache_path
    try:
        target_write_path.parent.mkdir(parents=True, exist_ok=True)
        target_write_path.write_text(
            json.dumps(raw_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    except OSError:
        pass
    return raw_payload


def _run_synthetic_oracle_self_check(spec: dict[str, Any], capital_usd: float) -> None:
    """Verify `event_ledger_oracle.run_decimal_ledger` in CI environments without local parquets."""
    days = [20_000, 20_001, 20_002]
    positions = pl.DataFrame({"day": days, "BNBUSDT": [0.0, 0.55, 0.55]})
    perp_close = pl.DataFrame({"day": days, "BNBUSDT": [600.0, 602.0, 601.0]})
    spot_close = pl.DataFrame({"day": days, "BNBUSDT": [599.0, 601.0, 600.5]})
    funding_events = pl.DataFrame(
        {
            "symbol": ["BNBUSDT", "BNBUSDT"],
            "ts_ms": [20_001 * 86_400_000 + 1_000, 20_002 * 86_400_000 + 1_000],
            "funding_rate": [0.0001, 0.0001],
        }
    )
    v_sched = spec["venueSchedule"]
    res = event_ledger_oracle.run_decimal_ledger(
        positions=positions,
        perp_close=perp_close,
        spot_close=spot_close,
        has_spot_leg=True,
        funding_events=funding_events,
        vec_net=np.zeros(len(days)),
        leg_fee_bps={"spot": float(v_sched["spotMakerBps"]), "perp": float(v_sched["perpMakerBps"])},
        half_spread_bps_per_leg={"spot": 1.5, "perp": 1.5},
        latency_bps_per_leg={"spot": 0.5, "perp": 0.5},
        adv_usd=np.full((len(days), 1), 50_000_000.0),
        vol_daily=np.full((len(days), 1), 0.02),
        capital_usd=capital_usd,
    )
    if not math.isfinite(float(res["decimal_oracle_terminal_nav"])):
        raise RuntimeError("Decimal event ledger oracle self-check failed")


def run_90d_shadow_parity_check(
    spec: dict[str, Any],
    *,
    window_days: int = 90,
    capital_usd: float = 1_000_000.0,
) -> dict[str, Any]:
    """Reconcile 90-day integer satoshi/micro-USD paper ledger against `Decimal(prec=50)` oracle."""
    if not _has_normalized_parquets():
        _run_synthetic_oracle_self_check(spec, capital_usd)
        if G13_OUT_PATH.exists():
            prev_g13 = json.loads(G13_OUT_PATH.read_text(encoding="utf-8"))
            prev_shadow = prev_g13.get("harness_shadow_parity_check")
            if (
                prev_g13.get("spec_sha256") == spec["payloadSha256"]
                and isinstance(prev_shadow, dict)
                and "harness_shadow_tracking_error_bps_per_month" in prev_shadow
            ):
                return dict(prev_shadow)
        raise FileNotFoundError(
            f"Normalized parquets missing at {NORM_DIR} and no verified baseline in {G13_OUT_PATH}"
        )

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

    syms = [c for c in pos_all.columns if c != "day"]
    w_all = pos_all.select(syms).cast(pl.Float64).to_numpy()
    dw_all = np.nansum(np.abs(np.diff(np.vstack([np.zeros((1, len(syms))), w_all]), axis=0)), axis=1)

    split_idx = int(len(panel.days) * 0.7) + 2 * int(params["lookbackDays"])
    best_start = len(panel.days) - window_days
    best_turn = float(np.sum(dw_all[best_start:]))
    if best_turn < 0.05:
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
    taker_half_spr = 1.8372
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

            if perp_w != 0.0:
                pos_not_micro = int(round(perp_w * cap_micro))
                for f_rate in events_map.get((day_int, sym), ()):
                    f_m = int(round(-float(pos_not_micro) * float(f_rate)))
                    cash_micro += f_m
                    funding_micro += f_m

            prev_w[j] = w_curr

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


def _verify_fill_schedule_and_marks(
    fill: dict[str, Any],
    day_marks: dict[str, dict[str, Any]],
    spec: dict[str, Any],
    universe_set: set[str],
) -> tuple[str, str]:
    leg_sym = str(fill.get("symbol", ""))
    if ":" not in leg_sym:
        raise ValueError(f"Invalid leg symbol in fill: {leg_sym!r}")
    base_sym, leg_kind = leg_sym.split(":", 1)
    if base_sym not in universe_set or leg_kind not in ("SPOT", "PERP"):
        raise ValueError(f"Fill symbol {leg_sym!r} outside signed universe")

    v_sched = spec["venueSchedule"]
    cid = str(fill.get("clientOrderId", ""))
    fee_bps = float(fill.get("feeBps", -1.0))
    slip_bps = float(fill.get("slipBps", -1.0))
    min_half_adv = float(spec["parameters"]["adverseSelectionBps"]) / 2.0

    if leg_kind == "SPOT":
        exp_fee = (
            float(v_sched["spotTakerBps"])
            if cid.endswith("_emerg_unwind")
            else float(v_sched["spotMakerBps"])
        )
        exp_mid = float(day_marks[base_sym]["spotMidUsd"])
    else:
        exp_fee = (
            float(v_sched["perpTakerBps"])
            if cid.endswith("_emerg_taker")
            else float(v_sched["perpMakerBps"])
        )
        exp_mid = float(day_marks[base_sym]["perpMidUsd"])

    if abs(fee_bps - exp_fee) > 1e-6:
        raise ValueError(f"Fill {cid} feeBps={fee_bps} violates signed schedule ({exp_fee})")
    if slip_bps + 1e-6 < min_half_adv:
        raise ValueError(f"Fill {cid} slipBps={slip_bps} below calibrated half-adverse ({min_half_adv})")

    ref_mid = float(fill.get("referenceMidUsd", 0.0))
    if exp_mid <= 0.0 or abs(ref_mid - exp_mid) / exp_mid > 1e-6:
        raise ValueError(f"Fill {cid} referenceMidUsd={ref_mid} mismatches day mark {exp_mid}")
    return base_sym, leg_kind


def reconcile_ts_bridge_with_decimal_oracle(
    ts_report: dict[str, Any],
    spec: dict[str, Any],
    current_snapshot: dict[str, Any],
    genesis_utc: str,
) -> dict[str, Any]:
    """Validate TypeScript runner JSON and independently compute `Decimal(prec=50)` `oracle_nav`."""
    if ts_report.get("strategyId") != ELIGIBLE_FAMILY:
        raise ValueError(f"Forbidden strategyId in TS bridge report: {ts_report.get('strategyId')!r}")
    if ts_report.get("specSha256") != spec["payloadSha256"]:
        raise ValueError(
            f"TS specSha256 mismatch: {ts_report.get('specSha256')} != {spec['payloadSha256']}"
        )
    if ts_report.get("liveTradingUnlocked") is not False:
        raise ValueError("TS bridge report violated Gate G15: liveTradingUnlocked must be False")
    if ts_report.get("doubleEntryBalanced") is not True:
        raise ValueError("TS MicroDoubleEntryLedger is unbalanced (doubleEntryBalanced != True)")
    if str(ts_report.get("discrepancyMicroUsd", "")) != "0":
        raise ValueError(
            f"TS MicroDoubleEntryLedger non-zero discrepancyMicroUsd={ts_report.get('discrepancyMicroUsd')}"
        )
    if int(ts_report.get("ledgerBreachCount", 0)) != 0:
        raise ValueError("TS PaperForwardRunner reported non-zero ledgerBreachCount")
    if int(ts_report.get("protectionViolations", 0)) != 0:
        raise ValueError("TS PaperForwardRunner reported non-zero protectionViolations")
    if ts_report.get("snapshotSha256") != current_snapshot.get("snapshot_sha256"):
        raise ValueError(
            f"TS snapshotSha256 {ts_report.get('snapshotSha256')} != {current_snapshot.get('snapshot_sha256')}"
        )

    initial_cap_usd = float(ts_report.get("initialCapitalUsd", 0.0))
    paper_nav = float(ts_report.get("paperNav", 0.0))
    if not (math.isfinite(initial_cap_usd) and initial_cap_usd > 0.0):
        raise ValueError("initialCapitalUsd must be finite and > 0")
    if not (math.isfinite(paper_nav) and paper_nav > 0.0):
        raise ValueError("paperNav must be finite and > 0")

    days_list = ts_report.get("days", [])
    fills_list = ts_report.get("fills", [])
    reported_positions = ts_report.get("positions", [])
    if not isinstance(days_list, list) or not isinstance(fills_list, list) or not isinstance(reported_positions, list):
        raise ValueError("TS bridge days, fills, and positions must be JSON arrays")

    universe_set = set(spec["universe"])

    if not days_list:
        if fills_list or reported_positions:
            raise ValueError("Day-0 empty days list cannot carry executed fills or open positions")
        oracle_nav = 1.0
    else:
        # Cross-check latest day's marks against verified current_snapshot symbols!
        snap_syms = current_snapshot.get("symbols", {})
        latest_day = days_list[-1]
        if latest_day.get("snapshotSha256") != current_snapshot.get("snapshot_sha256"):
            raise ValueError("Latest day snapshotSha256 does not match current_snapshot")
        latest_marks = latest_day.get("marks", {})
        for sym, mark_obj in latest_marks.items():
            if sym not in snap_syms:
                raise ValueError(f"Unknown mark symbol {sym!r} in TS report")
            s_exp = float(snap_syms[sym]["binance_spot_mid"])
            p_exp = float(snap_syms[sym]["binance_perp_mark"])
            s_got = float(mark_obj["spotMidUsd"])
            p_got = float(mark_obj["perpMidUsd"])
            if (s_exp > 0 and abs(s_got - s_exp) / s_exp > 1e-5) or (
                p_exp > 0 and abs(p_got - p_exp) / p_exp > 1e-5
            ):
                raise ValueError(f"TS marks for {sym} diverge from verified public snapshot")

        fills_by_day: dict[int, list[dict[str, Any]]] = {}
        for fill in fills_list:
            d_idx = int(fill["dayIndex"])
            fills_by_day.setdefault(d_idx, []).append(fill)

        with localcontext() as ctx:
            ctx.prec = 50
            c0 = Decimal(str(initial_cap_usd))
            ten_k = Decimal("10000")
            base_scale = Decimal("100000000")
            zero = Decimal("0")

            realized_pnl = zero
            funding_net = zero
            fees_expense = zero
            positions_dec: dict[str, tuple[Decimal, Decimal]] = {}

            prev_d_idx = 0
            for day_entry in days_list:
                d_idx = int(day_entry["dayIndex"])
                if d_idx <= prev_d_idx:
                    raise ValueError(f"Non-monotonic dayIndex={d_idx} in TS bridge days")
                prev_d_idx = d_idx
                day_marks = day_entry.get("marks", {})
                fund_by_sym = day_entry.get("fundingIntervalsBpsBySymbol", {})

                # 1. Settle 8h funding intervals on short perp inventory entering day d_idx.
                for sym in sorted(fund_by_sym):
                    perp_leg = f"{sym}:PERP"
                    p_qty, _ = positions_dec.get(perp_leg, (zero, zero))
                    rates = fund_by_sym[sym]
                    if p_qty < zero and rates:
                        perp_mid = Decimal(str(day_marks[sym]["perpMidUsd"]))
                        short_notional = (-p_qty) * perp_mid
                        for rate_bps in rates:
                            funding_net += short_notional * (Decimal(str(rate_bps)) / ten_k)

                # 2. Replay order fills in 50-digit Decimal precision.
                for fill in fills_by_day.get(d_idx, []):
                    _verify_fill_schedule_and_marks(fill, day_marks, spec, universe_set)
                    leg_sym = str(fill["symbol"])
                    side = str(fill["side"])
                    if side not in ("buy", "sell"):
                        raise ValueError(f"Invalid fill side: {side!r}")
                    raw_qty = int(str(fill["filledQtyBase"]))
                    if raw_qty <= 0:
                        raise ValueError("filledQtyBase must be > 0")
                    qty_dec = Decimal(raw_qty) / base_scale
                    mid_dec = Decimal(str(fill["referenceMidUsd"]))
                    shift_dec = Decimal(str(fill["slipBps"])) / ten_k
                    exec_px = (
                        mid_dec * (Decimal("1") + shift_dec)
                        if side == "buy"
                        else mid_dec * max(Decimal("0.0001"), Decimal("1") - shift_dec)
                    )
                    fee_dec = (qty_dec * exec_px) * (Decimal(str(fill["feeBps"])) / ten_k)
                    fees_expense += fee_dec

                    cur_qty, cur_basis = positions_dec.get(leg_sym, (zero, zero))
                    signed_delta = qty_dec if side == "buy" else -qty_dec
                    opposite = (cur_qty > zero and signed_delta < zero) or (
                        cur_qty < zero and signed_delta > zero
                    )
                    abs_existing = abs(cur_qty)
                    close_qty = min(qty_dec, abs_existing) if opposite else zero
                    open_qty = qty_dec - close_qty

                    if close_qty > zero:
                        closed_basis = (
                            cur_basis
                            if close_qty == abs_existing
                            else (cur_basis * close_qty) / abs_existing
                        )
                        exit_notional = close_qty * exec_px
                        realized_pnl += (
                            (exit_notional - closed_basis)
                            if cur_qty > zero
                            else (closed_basis - exit_notional)
                        )
                    else:
                        closed_basis = zero

                    added_basis = open_qty * exec_px
                    next_qty = cur_qty + signed_delta
                    next_basis = zero if next_qty == zero else (cur_basis - closed_basis + added_basis)
                    positions_dec[leg_sym] = (next_qty, next_basis)

            # 3. Verify open position base quantities match TS MicroDoubleEntryLedger!
            ts_pos_map = {
                str(p["symbol"]): Decimal(int(str(p["signedQtyBase"]))) / base_scale
                for p in reported_positions
                if int(str(p.get("signedQtyBase", "0"))) != 0
            }
            dec_pos_map = {k: q for k, (q, _) in positions_dec.items() if q != zero}
            if ts_pos_map != dec_pos_map:
                raise ValueError(
                    f"Position inventory mismatch between TS ledger and Decimal oracle: {ts_pos_map} != {dec_pos_map}"
                )

            # 4. Mark open positions at verified latest snapshot marks in 50-digit Decimal.
            unrealized = zero
            term_marks = days_list[-1]["marks"]
            for leg_sym, (p_qty, p_basis) in positions_dec.items():
                if p_qty == zero:
                    continue
                base_sym, leg_kind = leg_sym.split(":", 1)
                mark_key = "spotMidUsd" if leg_kind == "SPOT" else "perpMidUsd"
                mark_px = Decimal(str(term_marks[base_sym][mark_key]))
                mark_notional = abs(p_qty) * mark_px
                unrealized += (mark_notional - p_basis) if p_qty > zero else (p_basis - mark_notional)

            oracle_equity = c0 + realized_pnl + funding_net - fees_expense + unrealized
            oracle_nav = float(oracle_equity / c0)

    gen_dt = _parse_utc(genesis_utc)
    obs_dt = _parse_utc(str(current_snapshot["observed_at_utc"]))
    elapsed_days_float = max(0.0, (obs_dt - gen_dt).total_seconds() / 86_400.0)
    eff_months = max(elapsed_days_float / 30.0, 1.0 / 30.0)
    cum_diff_bps = abs(paper_nav - oracle_nav) * 1e4
    step_te_bps_mo = cum_diff_bps / eff_months
    max_allowed = float(spec["riskGates"]["maxTrackingErrorBpsPerMonth"])
    if step_te_bps_mo >= max_allowed:
        raise ValueError(
            f"TS vs Decimal(prec=50) tracking error {step_te_bps_mo:.6f} bps/mo >= {max_allowed} bps/mo"
        )

    return {
        "paper_nav": round(paper_nav, 10),
        "oracle_nav": round(oracle_nav, 10),
        "tracking_error_bps_cum": round(cum_diff_bps, 6),
        "step_tracking_error_bps_per_month": round(step_te_bps_mo, 6),
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
    """Pure fail-closed Gate G13 state machine over append-only real-time checkpoints."""
    if not checkpoints:
        raise ValueError("checkpoints must contain at least the Day-0 genesis checkpoint")

    gen_dt = _parse_utc(genesis_utc)
    sorted_cps = sorted(checkpoints, key=lambda c: _parse_utc(str(c["observed_at_utc"])))
    latest_utc = str(sorted_cps[-1]["observed_at_utc"])
    latest_dt = _parse_utc(latest_utc)
    if latest_dt < gen_dt:
        raise ValueError(f"latest_checkpoint_utc {latest_utc} precedes genesis_utc {genesis_utc}")

    elapsed_days = int((latest_dt - gen_dt).total_seconds() // 86_400)

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


def _load_or_emit_governance_artifacts(
    preserve_existing_files: bool,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if preserve_existing_files and LIFECYCLE_PATH.exists():
        registry_payload = json.loads(LIFECYCLE_PATH.read_text(encoding="utf-8"))
        if not verify_lifecycle_registry(registry_payload):
            raise PermissionError("Existing lifecycle registry failed integrity verification")
    else:
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
            raise PermissionError("Lifecycle registry failed self-verification")
        LIFECYCLE_PATH.write_text(
            json.dumps(registry_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    for archived_id in ARCHIVED_FAMILIES:
        try:
            assert_paper_forward_eligible(archived_id, LIFECYCLE_PATH)
        except PermissionError:
            pass
        else:
            raise PermissionError(f"Archived strategy {archived_id} was not blocked!")

    eligible_entry = assert_paper_forward_eligible(ELIGIBLE_FAMILY, LIFECYCLE_PATH)

    spec = build_signed_strategy_spec_h3_maker(G5_PATH, TICK_CAL_PATH)
    ok_spec, spec_errs = verify_signed_strategy_spec(spec)
    if not ok_spec:
        raise ValueError(f"SignedStrategySpec invalid: {spec_errs}")

    if preserve_existing_files and SIGNED_SPEC_PATH.exists():
        disk_spec = json.loads(SIGNED_SPEC_PATH.read_text(encoding="utf-8"))
        ok_disk, disk_errs = verify_signed_strategy_spec(disk_spec)
        if not ok_disk or disk_spec.get("payloadSha256") != spec["payloadSha256"]:
            raise ValueError(f"On-disk SignedStrategySpec tampered or stale: {disk_errs}")
    else:
        SIGNED_SPEC_PATH.write_text(
            json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    return registry_payload, eligible_entry, spec


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Use cached public Day-0 snapshot and normalized parquets with zero network calls",
    )
    parser.add_argument("--paper-nav", type=float, default=None, help="Realized paper NAV for Day > 0 checkpoint")
    parser.add_argument("--oracle-nav", type=float, default=None, help="Replayed Decimal oracle NAV for Day > 0 checkpoint")
    parser.add_argument("--emit-snapshot-json", type=str, default=None, help="Emit verified public market snapshot JSON to path and exit")
    parser.add_argument("--snapshot-json", type=str, default=None, help="Read pre-captured public market snapshot JSON from path")
    parser.add_argument("--ts-reconciliation-json", type=str, default=None, help="Path to TypeScript PaperForwardRunner reconciliation JSON")
    parser.add_argument("--out-g13", type=str, default=None, help="Output path for Gate G13 tracking error JSON artifact")
    parser.add_argument("--state-file", type=str, default=None, help="Optional runner state JSON path to stamp with Decimal oracle verification")
    args = parser.parse_args(argv)

    for req in (G5_PATH, G6_PATH, TICK_CAL_PATH):
        if not req.exists():
            print(f"REFUSING: missing prerequisite artifact {_display_path(req)}", file=sys.stderr)
            return 2

    bridge_mode = bool(
        args.emit_snapshot_json or args.ts_reconciliation_json or args.out_g13 or args.snapshot_json
    )
    try:
        registry_payload, eligible_entry, spec = _load_or_emit_governance_artifacts(
            preserve_existing_files=bridge_mode
        )
    except (PermissionError, ValueError) as exc:
        print(f"REFUSING: {exc}", file=sys.stderr)
        return 2

    # 3. Capture / load public market observation snapshot.
    try:
        if args.snapshot_json:
            snap_path = Path(args.snapshot_json)
            if not snap_path.exists():
                print(f"REFUSING: --snapshot-json not found at {snap_path}", file=sys.stderr)
                return 2
            current_snap = json.loads(snap_path.read_text(encoding="utf-8"))
            if compute_snapshot_sha256(current_snap) != current_snap.get("snapshot_sha256"):
                print("REFUSING: --snapshot-json failed SHA-256 verification", file=sys.stderr)
                return 2
        else:
            current_snap = fetch_or_load_day0_public_snapshot(
                spec["universe"],
                spec["parameters"],
                offline=args.offline,
                state_file=Path(args.state_file) if args.state_file else None,
            )
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"REFUSING: snapshot acquisition failed: {exc}", file=sys.stderr)
        return 2

    if args.emit_snapshot_json:
        emit_path = Path(args.emit_snapshot_json)
        emit_path.parent.mkdir(parents=True, exist_ok=True)
        emit_path.write_text(
            json.dumps(current_snap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return 0

    # 4. Run 90-day shadow parity check (`MicroDoubleEntryLedger` integer rules vs `Decimal` oracle).
    try:
        shadow_parity = run_90d_shadow_parity_check(spec)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"REFUSING: shadow parity check failed: {exc}", file=sys.stderr)
        return 2
    if not shadow_parity["passes_15bps_per_month_gate"]:
        print(
            f"REFUSING: harness shadow tracking error {shadow_parity['harness_shadow_tracking_error_bps_per_month']} "
            f">= {spec['riskGates']['maxTrackingErrorBpsPerMonth']} bps/mo",
            file=sys.stderr,
        )
        return 2

    # 5. Append or preserve checkpoints honestly (`elapsed_days` & `genesis_utc` never fabricated!).
    out_path = Path(args.out_g13) if args.out_g13 else G13_OUT_PATH
    seed_source = out_path if out_path.exists() else (G13_OUT_PATH if G13_OUT_PATH.exists() else None)
    genesis_utc = str(current_snap["observed_at_utc"])
    checkpoints: list[dict[str, Any]] = []
    day0_reference_snap = current_snap

    if seed_source is not None:
        try:
            prev_g13 = json.loads(seed_source.read_text(encoding="utf-8"))
            if prev_g13.get("spec_sha256") == spec["payloadSha256"]:
                genesis_utc = str(prev_g13.get("genesis_utc", genesis_utc))
                checkpoints = list(prev_g13.get("checkpoints", []))
                if isinstance(prev_g13.get("day0_live_public_snapshot"), dict):
                    day0_reference_snap = prev_g13["day0_live_public_snapshot"]
        except (OSError, ValueError):
            checkpoints = []

    oracle_bridge_res: dict[str, Any] | None = None
    if args.ts_reconciliation_json:
        recon_path = Path(args.ts_reconciliation_json)
        if not recon_path.exists():
            print(f"REFUSING: --ts-reconciliation-json missing at {recon_path}", file=sys.stderr)
            return 2
        try:
            ts_report = json.loads(recon_path.read_text(encoding="utf-8"))
            oracle_bridge_res = reconcile_ts_bridge_with_decimal_oracle(
                ts_report, spec, current_snap, genesis_utc
            )
        except (OSError, ValueError, KeyError, TypeError) as exc:
            print(f"REFUSING: TS reconciliation check failed: {exc}", file=sys.stderr)
            return 2

    if args.ts_reconciliation_json or args.snapshot_json or args.offline or not checkpoints:
        now_obs = str(current_snap["observed_at_utc"])
    else:
        now_obs = _utc_now_iso()

    obs_day = now_obs[:10]
    existing_days = {str(cp.get("observed_at_utc", ""))[:10] for cp in checkpoints}

    if not checkpoints:
        p_nav_0 = oracle_bridge_res["paper_nav"] if oracle_bridge_res else 1.0
        o_nav_0 = oracle_bridge_res["oracle_nav"] if oracle_bridge_res else 1.0
        checkpoints.append(
            {
                "checkpoint_index": 0,
                "day_offset": 0,
                "observed_at_utc": genesis_utc,
                "paper_nav": p_nav_0,
                "oracle_nav": o_nav_0,
                "tracking_error_bps_cum": round(abs(p_nav_0 - o_nav_0) * 1e4, 6),
                "active_positions": int(current_snap["active_causal_positions_count"]),
                "gross_target_weight": float(current_snap["gross_target_pair_weight"]),
                "snapshot_sha256": str(current_snap["snapshot_sha256"]),
                "note": "Day-0 genesis checkpoint recorded; real-time 60-90d clock started.",
            }
        )
    elif obs_day not in existing_days:
        if oracle_bridge_res is not None:
            p_nav_k = float(oracle_bridge_res["paper_nav"])
            o_nav_k = float(oracle_bridge_res["oracle_nav"])
        elif args.paper_nav is not None and args.oracle_nav is not None:
            p_nav_k = float(args.paper_nav)
            o_nav_k = float(args.oracle_nav)
        else:
            print(
                "REFUSING: appending a Day > 0 checkpoint requires --ts-reconciliation-json or "
                "explicit --paper-nav and --oracle-nav from live paper ledger vs Decimal oracle reconciliation",
                file=sys.stderr,
            )
            return 2
        gen_dt = _parse_utc(genesis_utc)
        cur_dt = _parse_utc(now_obs)
        if cur_dt < gen_dt:
            print(f"REFUSING: observation {now_obs} precedes genesis_utc {genesis_utc}", file=sys.stderr)
            return 2
        d_off = max(0, int((cur_dt - gen_dt).total_seconds() // 86_400))
        cp_entry: dict[str, Any] = {
            "checkpoint_index": len(checkpoints),
            "day_offset": d_off,
            "observed_at_utc": now_obs,
            "paper_nav": p_nav_k,
            "oracle_nav": o_nav_k,
            "tracking_error_bps_cum": round(abs(p_nav_k - o_nav_k) * 1e4, 6),
            "active_positions": int(current_snap["active_causal_positions_count"]),
            "gross_target_weight": float(current_snap["gross_target_pair_weight"]),
            "snapshot_sha256": str(current_snap["snapshot_sha256"]),
            "note": f"Day-{d_off} observation checkpoint appended.",
        }
        if "perp_source" in current_snap:
            cp_entry["perp_source"] = str(current_snap["perp_source"])
        checkpoints.append(cp_entry)

    max_allowed_te = float(spec["riskGates"]["maxTrackingErrorBpsPerMonth"])
    g13_payload = evaluate_g13_checkpoints(
        spec_path_rel="artifacts/signed_strategy_spec_h3_maker.json",
        spec_sha256=spec["payloadSha256"],
        genesis_utc=genesis_utc,
        checkpoints=checkpoints,
        min_required_days=int(spec["observationWindow"]["minRequiredDays"]),
        target_days=int(spec["observationWindow"]["targetDays"]),
        max_allowed_tracking_error_bps_per_month=max_allowed_te,
        harness_shadow_parity_check=shadow_parity,
        day0_live_public_snapshot=day0_reference_snap,
    )

    realized_te = g13_payload.get("realized_tracking_error_bps_per_month")
    if oracle_bridge_res is not None and realized_te is not None and float(realized_te) >= max_allowed_te:
        print(
            f"REFUSING: realized pathwise tracking error {realized_te} bps/mo >= {max_allowed_te} bps/mo",
            file=sys.stderr,
        )
        return 2

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(g13_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    if args.state_file and oracle_bridge_res is not None:
        st_path = Path(args.state_file)
        if st_path.exists():
            try:
                st_doc = json.loads(st_path.read_text(encoding="utf-8"))
                st_doc["lastOracleVerification"] = {
                    "verifiedAtUtc": now_obs,
                    "oracleNav": oracle_bridge_res["oracle_nav"],
                    "paperNav": oracle_bridge_res["paper_nav"],
                    "stepTrackingErrorBpsPerMonth": oracle_bridge_res["step_tracking_error_bps_per_month"],
                }
                st_path.write_text(
                    json.dumps(st_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
                )
            except (OSError, ValueError):
                pass

    if not bridge_mode:
        print(f"wrote {_display_path(LIFECYCLE_PATH)} (sha256={registry_payload['registry_sha256'][:16]}...)")
        print(f"  eligible={eligible_entry['strategy_id']} | archived={list(ARCHIVED_FAMILIES)}")
        print(f"wrote {_display_path(SIGNED_SPEC_PATH)} (payloadSha256={spec['payloadSha256'][:16]}...)")
    print(
        f"wrote {_display_path(out_path)}: status={g13_payload['status']} "
        f"g13_pass={g13_payload['g13_pass']} elapsed_days={g13_payload['elapsed_days']}/{g13_payload['min_required_days']} "
        f"shadow_TE={shadow_parity['harness_shadow_tracking_error_bps_per_month']:.6f} bps/mo"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
