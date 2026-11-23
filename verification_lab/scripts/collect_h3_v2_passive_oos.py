#!/usr/bin/env python3
"""Manual-invocation CLI for the H3_BASIS_CARRY_V2 passive prospective OOS pipeline.

Strictly manual, single-shot, read-only public market-data collection and offline verification.
Does NOT schedule recurring jobs, does NOT run a daemon loop, and has ZERO order authority.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from verification_lab.oos.adapters import (
    BinanceReadOnlyAdapter,
    HyperliquidReadOnlyAdapter,
    PublicReadOnlyHttpClient,
)
from verification_lab.oos.evidence_store import AppendOnlyEvidenceStore
from verification_lab.oos.frozen_evaluator import load_verified_frozen_v2_spec
from verification_lab.oos.offline_replay import run_independent_offline_replay
from verification_lab.oos.pipeline import (
    BORROW_SOURCE_INVALID,
    BORROW_SOURCE_MANUAL_ASSUMPTION,
    BORROW_SOURCE_VENUE_OBSERVED,
    BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    build_g6_diagnostics_from_store,
    evaluate_store_prospective_clock,
    record_passive_observation,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REGISTRATION = REPO_ROOT / "artifacts" / "h3_basis_carry_v2_prospective_oos_registration.json"
DEFAULT_STORE_DIR = REPO_ROOT / "verification_lab" / "data" / "prospective" / "h3_basis_carry_v2"
ACTIVE_SIGNAL_STATES = frozenset(
    {
        "THEORETICAL_ENTRY_LONG_SPOT_SHORT_PERP",
        "THEORETICAL_HOLD_LONG_SPOT_SHORT_PERP",
    }
)


def _parse_non_negative_decimal_arg(raw: str) -> Decimal:
    try:
        val = Decimal(raw.strip())
    except InvalidOperation as exc:
        raise argparse.ArgumentTypeError(f"invalid decimal value: {raw!r}") from exc
    if not val.is_finite() or val < Decimal("0"):
        raise argparse.ArgumentTypeError(f"borrow-apr-bps must be finite and non-negative: {raw!r}")
    return val


def _cmd_capture_once(args: argparse.Namespace) -> int:
    params = load_verified_frozen_v2_spec(Path(args.registration))
    store = AppendOnlyEvidenceStore(Path(args.store_dir))
    store.recover_if_needed()

    live_clock = lambda: datetime.now(timezone.utc)
    client = PublicReadOnlyHttpClient(clock_fn=live_clock)
    borrow_dec: Decimal | None = args.borrow_apr_bps
    borrow_source = (
        BORROW_SOURCE_MANUAL_ASSUMPTION if borrow_dec is not None else BORROW_SOURCE_VENUE_OBSERVED
    )

    if args.venue == "binance":
        adapter = BinanceReadOnlyAdapter(client, clock_fn=live_clock)
        obs, envelopes = adapter.capture_daily_observation(
            instrument=args.instrument,
            spot_symbol=f"{args.instrument.upper()}USDT",
            perp_symbol=f"{args.instrument.upper()}USDT",
            borrow_apr_bps=borrow_dec,
        )
    elif args.venue == "hyperliquid":
        adapter_hl = HyperliquidReadOnlyAdapter(client, clock_fn=live_clock)
        req_now = live_clock()
        start_ms = int((req_now - timedelta(hours=24)).timestamp() * 1000)
        end_ms = int(req_now.timestamp() * 1000)
        obs, envelopes = adapter_hl.capture_market_observation(
            coin=args.instrument,
            funding_start_time_ms=start_ms,
            funding_end_time_ms=end_ms,
            borrow_apr_bps=borrow_dec,
            fetch_public_borrow_rate=(borrow_dec is None),
        )
        if borrow_dec is None:
            borrow_ev = obs.public_liquidity_metadata.get("borrow_rate_evidence") or {}
            if borrow_ev.get("eligible_for_borrow_input") is True:
                borrow_source = BORROW_SOURCE_VENUE_OBSERVED_PUBLIC
            else:
                borrow_source = BORROW_SOURCE_INVALID
    else:
        raise ValueError(f"Unsupported venue: {args.venue}")

    eval_now = live_clock()
    is_synthetic = bool(args.synthetic_fixture)

    # Build day-deduplicated funding history and prior theoretical position state strictly from
    # matching (venue, instrument, synthetic_fixture) stream without contaminating real history
    # with rejected or synthetic records.
    prior_by_day: dict[str, str] = {}
    prior_in_pos = False
    for existing_rec in store.list_records():
        if existing_rec.get("venue") != obs.venue or existing_rec.get("instrument") != obs.instrument:
            continue
        if bool(existing_rec.get("synthetic_fixture", False)) != is_synthetic:
            continue
        if not is_synthetic and existing_rec.get("eligibility_status") != "ELIGIBLE":
            continue
        day_key = str(existing_rec.get("observation_day_utc", ""))
        norm = existing_rec.get("normalized_observation", {})
        ann_val = norm.get("market_observation", {}).get("annualized_funding_bps")
        if day_key and ann_val is not None:
            prior_by_day[day_key] = str(ann_val)
        sig_out = norm.get("signal_output", {})
        if sig_out.get("evaluable"):
            prior_in_pos = sig_out.get("signal_state") in ACTIVE_SIGNAL_STATES

    prior_by_day[obs.observation_day_utc] = obs.annualized_funding_bps
    ordered_day_history = sorted(prior_by_day.items(), key=lambda kv: kv[0])
    prior_history = [val for _, val in ordered_day_history]

    rec = record_passive_observation(
        store=store,
        params=params,
        observation=obs,
        annualized_funding_bps_history=prior_history,
        annualized_funding_bps_by_day=ordered_day_history,
        raw_envelopes=envelopes,
        evaluation_time_utc=eval_now,
        prior_theoretical_in_position=prior_in_pos,
        synthetic_fixture=is_synthetic,
        borrow_apr_source=borrow_source,
    )
    print(json.dumps(rec.to_dict(), indent=2, sort_keys=True))
    return 0


def _cmd_verify(args: argparse.Namespace) -> int:
    store = AppendOnlyEvidenceStore(Path(args.store_dir))
    report = store.verify_chain()
    print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    return 0 if report.intact else 2


def _cmd_replay(args: argparse.Namespace) -> int:
    params = load_verified_frozen_v2_spec(Path(args.registration))
    store = AppendOnlyEvidenceStore(Path(args.store_dir))
    report = run_independent_offline_replay(store=store, params=params)
    print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    return 0 if report.passive_data_replay_verified else 2


def _cmd_status(args: argparse.Namespace) -> int:
    params = load_verified_frozen_v2_spec(Path(args.registration))
    store = AppendOnlyEvidenceStore(Path(args.store_dir))
    summary = evaluate_store_prospective_clock(
        store=store,
        params=params,
        as_of_utc=datetime.now(timezone.utc),
    )
    print(json.dumps(summary.to_dict(), indent=2, sort_keys=True))
    return 0


def _cmd_diagnostics(args: argparse.Namespace) -> int:
    store = AppendOnlyEvidenceStore(Path(args.store_dir))
    report = build_g6_diagnostics_from_store(store, include_synthetic=bool(args.include_synthetic))
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Manual single-shot passive prospective OOS collector & verifier for H3_BASIS_CARRY_V2"
    )
    parser.add_argument("--registration", default=str(DEFAULT_REGISTRATION))
    parser.add_argument("--store-dir", default=str(DEFAULT_STORE_DIR))
    sub = parser.add_subparsers(dest="command", required=True)

    cap = sub.add_parser("capture-once", help="Run one read-only public capture and append to evidence ledger")
    cap.add_argument("--venue", choices=["binance", "hyperliquid"], required=True)
    cap.add_argument("--instrument", default="BTC")
    cap.add_argument("--borrow-apr-bps", type=_parse_non_negative_decimal_arg, default=None)
    cap.add_argument("--synthetic-fixture", action="store_true")
    cap.set_defaults(func=_cmd_capture_once)

    ver = sub.add_parser("verify", help="Verify local append-only hash chain and raw bytes (verify-only)")
    ver.set_defaults(func=_cmd_verify)

    rep = sub.add_parser("replay", help="Run independent second-path offline replay from raw evidence")
    rep.set_defaults(func=_cmd_replay)

    st = sub.add_parser("status", help="Show fail-closed 90-day prospective clock metrics")
    st.set_defaults(func=_cmd_status)

    diag = sub.add_parser("diagnostics", help="Run separate G6 microstructure diagnostics")
    diag.add_argument("--include-synthetic", action="store_true")
    diag.set_defaults(func=_cmd_diagnostics)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
