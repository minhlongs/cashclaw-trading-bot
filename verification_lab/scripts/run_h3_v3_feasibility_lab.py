#!/usr/bin/env python3
"""Reproducible offline runner for H3_CASH_FUNDED_BASIS_CARRY_V3 feasibility lab.

Reads ONLY offline venue specs (anchored to archived read-only public probes) and
optional read-only local normalized parquets. Zero network calls, zero order capability,
zero credentials, zero modification of V2 artifacts or G13/G15.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from typing import Any

from verification_lab.v3 import (
    AllocationPolicy,
    CashFundedEconomicsEngine,
    EconomicEvent,
    EventType,
    IndependentDoubleEntryOracle,
    VenueRoute,
    build_default_route_specs,
    build_five_tier_capital_matrix,
    run_execution_stress_suite,
    run_scientific_falsification,
)


def _json_default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return str(obj)
    if hasattr(obj, "value"):
        return obj.value
    raise TypeError(f"Not JSON serializable: {type(obj)}")


def _load_daily_series_from_parquet(parquet_dir: Path) -> dict[str, Any]:
    """Load BTC daily funding and spot returns read-only from normalized parquets if present."""
    spot_p = parquet_dir / "spot_1d.parquet"
    fund_p = parquet_dir / "funding.parquet"
    hl_fund_p = parquet_dir / "hyperliquid_funding_1h.parquet"
    if not (spot_p.exists() and fund_p.exists()):
        return {"available": False, "reason": "LOCAL_NORMALIZED_PARQUETS_NOT_PRESENT"}

    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    spot_t = pq.read_table(spot_p)
    spot_btc = spot_t.filter(pc.equal(spot_t["symbol"], "BTCUSDT")).sort_by("ts_ms")
    closes = [float(x) for x in spot_btc["close"].to_pylist()]
    ts_days = [int(x) // 86_400_000 for x in spot_btc["ts_ms"].to_pylist()]
    btc_ret_by_day: dict[int, float] = {}
    for i in range(1, len(closes)):
        if closes[i - 1] > 0:
            btc_ret_by_day[ts_days[i]] = (closes[i] - closes[i - 1]) / closes[i - 1]

    fund_t = pq.read_table(fund_p)
    fund_btc = fund_t.filter(pc.equal(fund_t["symbol"], "BTCUSDT"))
    bn_fund_by_day: dict[int, float] = {}
    for ts_ms, fr in zip(fund_btc["ts_ms"].to_pylist(), fund_btc["funding_rate"].to_pylist(), strict=True):
        if fr is not None:
            d = int(ts_ms) // 86_400_000
            bn_fund_by_day[d] = bn_fund_by_day.get(d, 0.0) + float(fr)

    common_bn = sorted(set(btc_ret_by_day.keys()) & set(bn_fund_by_day.keys()))
    bn_funding_series = [bn_fund_by_day[d] for d in common_bn]
    bn_btc_ret_series = [btc_ret_by_day[d] for d in common_bn]

    hl_funding_series: list[float] = []
    hl_btc_ret_series: list[float] = []
    if hl_fund_p.exists():
        hl_t = pq.read_table(hl_fund_p)
        hl_btc = hl_t.filter(pc.equal(hl_t["coin"], "BTC"))
        hl_by_day: dict[int, float] = {}
        for ts_ms, fr in zip(hl_btc["ts_ms"].to_pylist(), hl_btc["funding_rate"].to_pylist(), strict=True):
            if fr is not None:
                d = int(ts_ms) // 86_400_000
                hl_by_day[d] = hl_by_day.get(d, 0.0) + float(fr)
        common_hl = sorted(set(btc_ret_by_day.keys()) & set(hl_by_day.keys()))
        hl_funding_series = [hl_by_day[d] for d in common_hl]
        hl_btc_ret_series = [btc_ret_by_day[d] for d in common_hl]

    return {
        "available": True,
        "provenance": "HASH_RECORDED_UNVERIFIED",
        "binance_days": len(common_bn),
        "binance_funding_series": bn_funding_series,
        "binance_btc_ret_series": bn_btc_ret_series,
        "hyperliquid_days": len(hl_funding_series),
        "hyperliquid_funding_series": hl_funding_series,
        "hyperliquid_btc_ret_series": hl_btc_ret_series,
    }


def run_lab(parquet_dir: Path | None = None, output_json: Path | None = None) -> dict[str, Any]:
    specs = build_default_route_specs()
    policy = AllocationPolicy()
    matrix = build_five_tier_capital_matrix(specs, policy=policy, holding_days=90, cash_benchmark_annual_bps=Decimal("400"))

    # Stress suite at $1,000 and $5,000 across all 3 routes
    stress_by_route = {
        route.value: [asdict(s) for s in run_execution_stress_suite(spec, capital_usd=Decimal("5000"), holding_days=90)]
        for route, spec in specs.items()
    }

    # Independent double-entry reconciliation on a canonical 90-day $5,000 Hyperliquid trade lifecycle
    engine = CashFundedEconomicsEngine()
    oracle = IndependentDoubleEntryOracle()
    hl = specs[VenueRoute.HYPERLIQUID_SAME_VENUE]
    qty = Decimal("0.04884")  # ~$3,000 spot notional at $61,416
    init_eq = Decimal("5000")
    events = [
        EconomicEvent(seq=0, timestamp_utc="2026-11-23T00:00:00Z", event_type=EventType.INIT_EQUITY, is_observed=False),
        EconomicEvent(
            seq=1, timestamp_utc="2026-11-23T00:01:00Z", event_type=EventType.SPOT_BUY, is_observed=True,
            qty_btc=qty, price_usd=hl.spot_ask_usd,
            fee_usd=(qty * hl.spot_ask_usd * hl.spot_taker_fee_bps / Decimal("10000")),
            spread_slippage_usd=Decimal("0"),  # L1 ask price already embeds half-spread (no double-counting)
        ),
        EconomicEvent(
            seq=2, timestamp_utc="2026-11-23T00:01:01Z", event_type=EventType.PERP_SHORT_OPEN, is_observed=True,
            qty_btc=qty, price_usd=hl.perp_bid_usd,
            margin_transfer_usd=Decimal("750"),
            fee_usd=(qty * hl.perp_bid_usd * hl.perp_taker_fee_bps / Decimal("10000")),
            spread_slippage_usd=Decimal("0"),  # L1 bid price already embeds half-spread (no double-counting)
        ),
        EconomicEvent(
            seq=3, timestamp_utc="2027-02-21T00:00:00Z", event_type=EventType.FUNDING_SETTLEMENT, is_observed=False,
            funding_cashflow_usd=(qty * hl.perp_price_usd * hl.historical_mean_funding_bps / Decimal("10000") * Decimal("90") / Decimal("365")),
            note="90-day modeled funding at historical Hyperliquid mean 1018.8 bps APR",
        ),
        EconomicEvent(
            seq=4, timestamp_utc="2027-02-21T00:00:01Z", event_type=EventType.OPPORTUNITY_COST_ACCRUAL, is_observed=False,
            opportunity_cost_usd=(init_eq * Decimal("0.04") * Decimal("90") / Decimal("365")),
            note="90-day 4.00% cash opportunity cost on full $5,000 initial equity",
        ),
        EconomicEvent(
            seq=5, timestamp_utc="2027-02-21T00:01:00Z", event_type=EventType.SPOT_SELL, is_observed=False,
            qty_btc=qty, price_usd=hl.spot_bid_usd,
            fee_usd=(qty * hl.spot_bid_usd * hl.spot_taker_fee_bps / Decimal("10000")),
            spread_slippage_usd=Decimal("0"),  # L1 bid price already embeds half-spread (no double-counting)
        ),
        EconomicEvent(
            seq=6, timestamp_utc="2027-02-21T00:01:01Z", event_type=EventType.PERP_SHORT_CLOSE, is_observed=False,
            qty_btc=qty, price_usd=hl.perp_ask_usd,
            fee_usd=(qty * hl.perp_ask_usd * hl.perp_taker_fee_bps / Decimal("10000")),
            spread_slippage_usd=Decimal("0"),  # L1 ask price already embeds half-spread (no double-counting)
        ),
    ]
    econ = engine.run(init_eq, events)
    oracle_audit = oracle.verify(init_eq, events, econ)

    falsification: dict[str, Any] = {}
    if parquet_dir is not None:
        loaded = _load_daily_series_from_parquet(parquet_dir)
        if loaded.get("available"):
            fals_bn = run_scientific_falsification(
                loaded["binance_funding_series"],
                loaded["binance_btc_ret_series"],
                dataset_provenance="HASH_RECORDED_UNVERIFIED",
                prior_family_trials=186,
                new_v3_trials=15,
            )
            falsification["binance_historical_btc"] = asdict(fals_bn)
            if len(loaded["hyperliquid_funding_series"]) >= 30:
                fals_hl = run_scientific_falsification(
                    loaded["hyperliquid_funding_series"],
                    loaded["hyperliquid_btc_ret_series"],
                    dataset_provenance="HASH_RECORDED_UNVERIFIED",
                    prior_family_trials=186,
                    new_v3_trials=15,
                )
                falsification["hyperliquid_historical_btc"] = asdict(fals_hl)
        else:
            falsification["status"] = loaded["reason"]

    payload = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "hypothesis_id": "H3_CASH_FUNDED_BASIS_CARRY_V3",
        "allocation_policy": asdict(policy),
        "routes": {r.value: asdict(s) for r, s in specs.items()},
        "capital_matrix": {r.value: [asdict(c) for c in cells] for r, cells in matrix.items()},
        "execution_stress_5000_usd": stress_by_route,
        "double_entry_reference_run_5000_usd": {
            "breakdown": {k: v for k, v in asdict(econ).items() if k != "checkpoints"},
            "checkpoint_count": len(econ.checkpoints),
            "oracle_audit": oracle_audit,
        },
        "scientific_falsification": falsification,
    }
    raw_bytes = json.dumps(payload, indent=2, sort_keys=True, default=_json_default).encode("utf-8")
    payload["manifest_sha256"] = hashlib.sha256(raw_bytes).hexdigest()

    if output_json is not None:
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(json.dumps(payload, indent=2, sort_keys=True, default=_json_default) + "\n", encoding="utf-8")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Run offline H3_CASH_FUNDED_BASIS_CARRY_V3 feasibility lab")
    parser.add_argument("--parquet-dir", type=Path, default=None, help="Optional read-only normalized parquet dir")
    parser.add_argument("--output-json", type=Path, default=None, help="Optional output JSON manifest path")
    args = parser.parse_args()
    result = run_lab(parquet_dir=args.parquet_dir, output_json=args.output_json)
    print(json.dumps({"hypothesis_id": result["hypothesis_id"], "manifest_sha256": result["manifest_sha256"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
