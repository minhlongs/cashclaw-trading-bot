"""Independent second-path offline replay verifier for H3_BASIS_CARRY_V2.

Recomputes spot/perp prices, basis, funding normalization, causal availability
cutoffs, strategy thresholds, theoretical exposure, and output hashes directly
from raw preserved evidence bytes (including verbatim venue HTTP responses when
present) without trusting previously recorded signals as expected truth.

Explicitly distinguishes:
- PASSIVE_DATA_REPLAY_VERIFIED (bool)
- EXECUTION_PARITY_VERIFIED (always False under passive observation authority)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Sequence

from verification_lab.oos.evidence_store import AppendOnlyEvidenceStore, canonical_json_bytes, sha256_bytes
from verification_lab.oos.frozen_evaluator import (
    EXPOSURE_LABEL_THEORETICAL_ONLY,
    SIGNAL_NOT_EVALUABLE,
    FrozenV2Parameters,
)

NUMERIC_TOLERANCE = Decimal("0.000001")
BINANCE_ANNUAL_FUNDING_MULT = Decimal("1095") * Decimal("10000")
HYPERLIQUID_ANNUAL_FUNDING_MULT = Decimal("8760") * Decimal("10000")


@dataclass(frozen=True)
class ReplayRecordComparison:
    record_id: str
    observation_day_utc: str
    matched: bool
    mismatch_reasons: list[str]
    numeric_differences: dict[str, str]
    eligibility_consequence: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class OfflineReplayReport:
    passive_data_replay_verified: bool
    execution_parity_verified: bool
    reconciliation_status: str
    total_records: int
    matched_records: int
    mismatched_records: int
    first_mismatch: dict[str, Any] | None
    missing_evidence: list[str]
    comparisons: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _independent_parse_iso_utc(ts: str) -> datetime:
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError(f"naive_timestamp ({ts})")
    return dt.astimezone(timezone.utc)


def _safe_parse_finite_decimal(
    val: Any,
    field: str,
    mismatches: list[str],
    *,
    allow_none: bool = True,
) -> Decimal | None:
    if val is None:
        if not allow_none:
            mismatches.append(f"invalid_decimal_in_replay ({field})")
        return None
    if isinstance(val, bool):
        mismatches.append(f"invalid_decimal_in_replay ({field})")
        return None
    try:
        dec = Decimal(str(val))
    except (InvalidOperation, ValueError):
        mismatches.append(f"invalid_decimal_in_replay ({field})")
        return None
    if not dec.is_finite():
        mismatches.append(f"non_finite_decimal_in_replay ({field})")
        return None
    return dec


def _independently_reparse_raw_venue_files(
    *,
    store: AppendOnlyEvidenceStore,
    venue: str,
    instrument: str,
    avail_dt: datetime,
    cap_dt: datetime,
    raw_venue_files: Sequence[dict[str, Any]],
) -> tuple[dict[str, Decimal] | None, list[str]]:
    """Independently parse preserved verbatim venue HTTP JSON bytes to recompute market primitives."""
    errors: list[str] = []
    if not raw_venue_files:
        return None, errors

    parsed_by_url: list[tuple[str, Any]] = []
    for entry in raw_venue_files:
        rel = str(entry.get("relpath", ""))
        expected_sha = str(entry.get("sha256", ""))
        url = str(entry.get("endpoint_url", ""))
        resolved = store._resolve_contained_raw_path(rel)
        if resolved is None or not resolved.exists():
            errors.append(f"missing_or_escaped_raw_venue_file ({rel})")
            continue
        content = resolved.read_bytes()
        if sha256_bytes(content) != expected_sha:
            errors.append(f"raw_venue_file_sha256_mismatch ({rel})")
            continue
        try:
            parsed_by_url.append((url, json.loads(content.decode("utf-8"))))
        except (UnicodeDecodeError, json.JSONDecodeError):
            errors.append(f"malformed_raw_venue_json ({rel})")

    if errors:
        return None, errors

    avail_ms = int(avail_dt.timestamp() * 1000)
    cap_ms = int(cap_dt.timestamp() * 1000)

    if venue == "binance":
        spot_klines = next((p for u, p in parsed_by_url if "/api/v3/klines" in u), None)
        perp_klines = next((p for u, p in parsed_by_url if "/fapi/v1/klines" in u), None)
        funding_rows = next((p for u, p in parsed_by_url if "/fapi/v1/fundingRate" in u), None)
        if not (isinstance(spot_klines, list) and isinstance(perp_klines, list) and isinstance(funding_rows, list)):
            return None, ["incomplete_raw_binance_venue_envelopes"]

        finalized_spot = [k for k in spot_klines if isinstance(k, list) and len(k) >= 7 and int(k[6]) + 1 <= cap_ms]
        finalized_perp = [k for k in perp_klines if isinstance(k, list) and len(k) >= 7 and int(k[6]) + 1 <= cap_ms]
        if not finalized_spot or not finalized_perp:
            return None, ["no_finalized_candle_in_raw_binance_klines"]

        spot_c = finalized_spot[-1]
        perp_c = finalized_perp[-1]
        spot_px = Decimal(str(spot_c[4]))
        perp_px = Decimal(str(perp_c[4]))

        causal_funding = [r for r in funding_rows if isinstance(r, dict) and int(r.get("fundingTime", 0)) <= avail_ms]
        if not causal_funding:
            return None, ["no_causal_funding_in_raw_binance_funding_bytes"]
        latest_fr = Decimal(str(causal_funding[-1]["fundingRate"]))
        ann_funding_bps = latest_fr * BINANCE_ANNUAL_FUNDING_MULT
        basis_bps = ((perp_px - spot_px) * Decimal("10000")) / spot_px
        return {
            "spot_price": spot_px,
            "perp_price": perp_px,
            "basis_bps": basis_bps,
            "annualized_funding_bps": ann_funding_bps,
        }, []

    if venue == "hyperliquid":
        meta_ctxs = next((p for u, p in parsed_by_url if "/info" in u and isinstance(p, list) and len(p) == 2 and isinstance(p[0], dict) and "universe" in p[0]), None)
        funding_rows = next((p for u, p in parsed_by_url if "/info" in u and isinstance(p, list) and p and isinstance(p[0], dict) and "fundingRate" in p[0]), None)
        if meta_ctxs is None or funding_rows is None:
            return None, ["incomplete_raw_hyperliquid_venue_envelopes"]

        universe = meta_ctxs[0].get("universe", [])
        ctxs = meta_ctxs[1]
        idx = next((i for i, item in enumerate(universe) if isinstance(item, dict) and item.get("name") == instrument.upper()), None)
        if idx is None or idx >= len(ctxs):
            return None, [f"instrument_missing_in_raw_hyperliquid_meta ({instrument})"]
        oracle_px = Decimal(str(ctxs[idx]["oraclePx"]))
        mark_px = Decimal(str(ctxs[idx]["markPx"]))

        causal_funding = [r for r in funding_rows if isinstance(r, dict) and int(r.get("time", 0)) <= cap_ms]
        if not causal_funding:
            return None, ["no_causal_funding_in_raw_hyperliquid_funding_bytes"]
        latest_fr = Decimal(str(causal_funding[-1]["fundingRate"]))
        ann_funding_bps = latest_fr * HYPERLIQUID_ANNUAL_FUNDING_MULT
        basis_bps = ((mark_px - oracle_px) * Decimal("10000")) / oracle_px
        result: dict[str, Decimal] = {
            "spot_price": oracle_px,
            "perp_price": mark_px,
            "basis_bps": basis_bps,
            "annualized_funding_bps": ann_funding_bps,
        }

        # Independently re-parse Hyperliquid spotMeta + allBorrowLendReserveStates when present.
        spot_meta = next(
            (p for u, p in parsed_by_url if "/info" in u and isinstance(p, dict) and isinstance(p.get("tokens"), list)),
            None,
        )
        reserves = next(
            (
                p
                for u, p in parsed_by_url
                if "/info" in u
                and isinstance(p, list)
                and p
                and isinstance(p[0], list)
                and len(p[0]) == 2
                and isinstance(p[0][1], dict)
                and "borrowYearlyRate" in p[0][1]
            ),
            None,
        )
        if spot_meta is not None or reserves is not None:
            if spot_meta is None or reserves is None:
                return None, ["incomplete_raw_hyperliquid_borrow_envelopes"]

            borrow_errors: list[str] = []
            seen_meta_indices: set[int] = set()
            usdc_matches: list[dict[str, Any]] = []
            for tok in spot_meta["tokens"]:
                if not isinstance(tok, dict):
                    continue
                idx_val = tok.get("index")
                if isinstance(idx_val, bool) or not isinstance(idx_val, int):
                    borrow_errors.append("invalid_token_index_in_raw_spot_meta")
                    continue
                if idx_val in seen_meta_indices:
                    borrow_errors.append("duplicate_token_index_in_raw_spot_meta")
                seen_meta_indices.add(idx_val)
                if tok.get("name") == "USDC":
                    usdc_matches.append(tok)

            usdc_idx: int | None = None
            if len(usdc_matches) != 1:
                borrow_errors.append("invalid_or_ambiguous_usdc_in_raw_spot_meta")
            else:
                if usdc_matches[0].get("isCanonical") is False:
                    borrow_errors.append("non_canonical_usdc_in_raw_spot_meta")
                idx_cand = usdc_matches[0].get("index")
                if isinstance(idx_cand, bool) or not isinstance(idx_cand, int):
                    borrow_errors.append("invalid_usdc_index_in_raw_spot_meta")
                else:
                    usdc_idx = idx_cand

            seen_res_ids: set[int] = set()
            usdc_reserves: list[dict[str, Any]] = []
            for entry in reserves:
                if not isinstance(entry, list) or len(entry) != 2 or not isinstance(entry[1], dict):
                    borrow_errors.append("malformed_entry_in_raw_reserves")
                    continue
                tid = entry[0]
                if isinstance(tid, bool) or not isinstance(tid, int):
                    borrow_errors.append("invalid_token_id_in_raw_reserves")
                    continue
                if tid in seen_res_ids:
                    borrow_errors.append("duplicate_token_id_in_raw_reserves")
                seen_res_ids.add(tid)
                if usdc_idx is not None and tid == usdc_idx:
                    usdc_reserves.append(entry[1])

            if usdc_idx is not None and len(usdc_reserves) != 1:
                borrow_errors.append("missing_or_duplicate_usdc_in_raw_reserves")

            reparsed_borrow_bps: Decimal | None = None
            if not borrow_errors and len(usdc_reserves) == 1:
                st = usdc_reserves[0]
                req_fields = (
                    "borrowYearlyRate",
                    "utilization",
                    "totalSupplied",
                    "totalBorrowed",
                    "balance",
                    "oraclePx",
                    "ltv",
                )
                parsed_st: dict[str, Decimal] = {}
                for fname in req_fields:
                    raw_v = st.get(fname)
                    if isinstance(raw_v, (bool, float)) or raw_v is None:
                        borrow_errors.append(f"invalid_or_float_raw_reserve_field ({fname})")
                        break
                    try:
                        dv = Decimal(str(raw_v).strip())
                    except (InvalidOperation, ValueError):
                        borrow_errors.append(f"non_decimal_raw_reserve_field ({fname})")
                        break
                    if not dv.is_finite():
                        borrow_errors.append(f"non_finite_raw_reserve_field ({fname})")
                        break
                    parsed_st[fname] = dv

                if not borrow_errors:
                    rate = parsed_st["borrowYearlyRate"]
                    util = parsed_st["utilization"]
                    tot_sup = parsed_st["totalSupplied"]
                    tot_bor = parsed_st["totalBorrowed"]
                    bal = parsed_st["balance"]
                    opx = parsed_st["oraclePx"]
                    ltv = parsed_st["ltv"]

                    if rate < Decimal("0") or rate > Decimal("100"):
                        borrow_errors.append("out_of_range_borrow_yearly_rate")
                    if util < Decimal("0") or util > Decimal("1"):
                        borrow_errors.append("out_of_range_utilization")
                    if tot_sup <= Decimal("0") or tot_bor < Decimal("0") or tot_bor > tot_sup:
                        borrow_errors.append("invalid_reserve_supply_borrow_bounds")
                    if bal < Decimal("0") or opx <= Decimal("0") or ltv < Decimal("0") or ltv > Decimal("1"):
                        borrow_errors.append("invalid_reserve_balance_oracle_or_ltv")

                    if not borrow_errors:
                        excess_u = max(Decimal("0"), util - Decimal("0.8"))
                        formula_rate = Decimal("0.05") + Decimal("4.75") * excess_u
                        if abs(rate - formula_rate) > Decimal("0.0005"):
                            borrow_errors.append("raw_reserve_formula_rate_mismatch")
                        computed_u = tot_bor / tot_sup
                        if abs(util - computed_u) > Decimal("0.001"):
                            borrow_errors.append("raw_reserve_utilization_mismatch")
                        bal_rel_diff = abs(bal - (tot_sup - tot_bor)) / tot_sup
                        if bal_rel_diff > Decimal("0.01"):
                            borrow_errors.append("raw_reserve_balance_mismatch")

                    if not borrow_errors:
                        reparsed_borrow_bps = (Decimal("1") + rate).ln() * Decimal("10000")

            result["borrow_present"] = True
            result["borrow_valid"] = len(borrow_errors) == 0 and reparsed_borrow_bps is not None
            result["borrow_apr_bps"] = reparsed_borrow_bps
            result["borrow_errors"] = borrow_errors

        return result, []

    return None, [f"unsupported_venue_for_raw_reparse ({venue})"]


def _independent_recompute_signal(
    *,
    spot_d: Decimal | None,
    perp_d: Decimal | None,
    borrow_d: Decimal | None,
    params: FrozenV2Parameters,
    funding_history_bps: Sequence[Decimal],
    prior_in_position: bool,
    notional_usd: Decimal = Decimal("10000"),
) -> dict[str, Any]:
    """Independent reference calculation from raw preserved fields (no calls into frozen_evaluator)."""
    missing: list[str] = []
    if spot_d is None or spot_d <= 0:
        missing.append("spot_price")
    if perp_d is None or perp_d <= 0:
        missing.append("perp_price")
    if borrow_d is None or borrow_d < 0:
        missing.append("borrow_apr_bps")
    if len(funding_history_bps) < params.lookback_days:
        missing.append(f"lookback_funding_history_lt_{params.lookback_days}_days")

    if missing:
        return {
            "evaluable": False,
            "signal_state": SIGNAL_NOT_EVALUABLE,
            "exposure_label": EXPOSURE_LABEL_THEORETICAL_ONLY,
            "rolling_mean_annual_funding_bps": None,
            "basis_bps": None,
            "funding_minus_borrow_bps": None,
            "carry_spread_annual_bps": None,
            "spot_leg_target_notional_usd": Decimal("0"),
            "perp_leg_target_notional_usd": Decimal("0"),
            "active": False,
        }

    assert spot_d is not None and perp_d is not None and borrow_d is not None
    basis_bps = ((perp_d - spot_d) * Decimal("10000")) / spot_d
    window = list(funding_history_bps)[-params.lookback_days :]
    mean_funding = sum(window, Decimal("0")) / Decimal(len(window))
    f_minus_b = mean_funding - borrow_d
    carry_spread = f_minus_b + basis_bps

    borrow_gate = (
        f_minus_b >= params.min_funding_minus_borrow_spread_bps
        if params.require_net_funding_above_borrow_apr
        else True
    )
    entry_ok = (mean_funding >= params.entry_annual_bps) and borrow_gate
    exit_ok = (mean_funding <= params.exit_annual_bps) or (not borrow_gate)

    if prior_in_position:
        state = "THEORETICAL_EXIT" if exit_ok else "THEORETICAL_HOLD_LONG_SPOT_SHORT_PERP"
        active = not exit_ok
    else:
        state = "THEORETICAL_ENTRY_LONG_SPOT_SHORT_PERP" if entry_ok else "THEORETICAL_FLAT"
        active = entry_ok

    half_notional = notional_usd / Decimal("2")
    return {
        "evaluable": True,
        "signal_state": state,
        "exposure_label": EXPOSURE_LABEL_THEORETICAL_ONLY,
        "rolling_mean_annual_funding_bps": mean_funding,
        "basis_bps": basis_bps,
        "funding_minus_borrow_bps": f_minus_b,
        "carry_spread_annual_bps": carry_spread,
        "spot_leg_target_notional_usd": half_notional if active else Decimal("0"),
        "perp_leg_target_notional_usd": -half_notional if active else Decimal("0"),
        "active": active,
    }


def run_independent_offline_replay(
    *,
    store: AppendOnlyEvidenceStore,
    params: FrozenV2Parameters,
) -> OfflineReplayReport:
    """Replay every stored ledger record from its raw preserved bytes and compare independently."""
    chain_report = store.verify_chain()
    records = store.list_records() if chain_report.intact else []
    missing_evidence: list[str] = []
    if not chain_report.intact:
        missing_evidence.extend(chain_report.errors)

    comparisons: list[ReplayRecordComparison] = []
    # Scope monotonic event order and theoretical position state strictly per (venue, instrument, synthetic_fixture)
    prior_event_dt_by_stream: dict[tuple[str, str, bool], datetime] = {}
    prior_active_by_stream: dict[tuple[str, str, bool], bool] = {}

    for rec in records:
        rec_id = str(rec.get("record_id", ""))
        obs_day = str(rec.get("observation_day_utc", ""))
        venue = str(rec.get("venue", ""))
        instrument = str(rec.get("instrument", ""))
        is_synthetic = bool(rec.get("synthetic_fixture", False))
        stream_key = (venue, instrument, is_synthetic)
        mismatches: list[str] = []
        num_diffs: dict[str, str] = {}

        # 1. Verify frozen strategy identity
        if rec.get("frozen_spec_sha256") != params.frozen_spec_sha256:
            mismatches.append("frozen_spec_sha256_mismatch")

        # 2. Verify raw bundle bytes exist, are contained in raw_dir, and match raw_sha256
        raw_rel = str(rec.get("raw_relpath", ""))
        raw_path = store._resolve_contained_raw_path(raw_rel)
        if raw_path is None or not raw_path.exists():
            mismatches.append("missing_raw_evidence_file")
            missing_evidence.append(f"{rec_id}:missing_raw_file")
            comparisons.append(
                ReplayRecordComparison(
                    record_id=rec_id,
                    observation_day_utc=obs_day,
                    matched=False,
                    mismatch_reasons=mismatches,
                    numeric_differences=num_diffs,
                    eligibility_consequence="INELIGIBLE_REPLAY_FAILED",
                )
            )
            continue

        raw_bytes = raw_path.read_bytes()
        if sha256_bytes(raw_bytes) != rec.get("raw_sha256"):
            mismatches.append("raw_sha256_mismatch")

        try:
            raw_bundle = json.loads(raw_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            mismatches.append("malformed_raw_json_bytes")
            comparisons.append(
                ReplayRecordComparison(
                    record_id=rec_id,
                    observation_day_utc=obs_day,
                    matched=False,
                    mismatch_reasons=mismatches,
                    numeric_differences=num_diffs,
                    eligibility_consequence="INELIGIBLE_REPLAY_FAILED",
                )
            )
            continue

        # 3. Verify causal availability cutoff and per-stream monotonic event ordering
        avail_dt: datetime | None = None
        cap_dt: datetime | None = None
        try:
            avail_dt = _independent_parse_iso_utc(str(rec.get("available_at_utc", "")))
            cap_dt = _independent_parse_iso_utc(str(rec.get("captured_at_utc", "")))
            if cap_dt < avail_dt:
                mismatches.append("causal_availability_cutoff_violated")
            prev_dt = prior_event_dt_by_stream.get(stream_key)
            if prev_dt is not None and avail_dt < prev_dt:
                mismatches.append("input_event_order_non_monotonic")
            prior_event_dt_by_stream[stream_key] = avail_dt
        except ValueError as exc:
            mismatches.append(f"invalid_timestamp_in_replay ({exc})")

        # 4. Independently re-parse verbatim raw venue HTTP response bytes when present
        spot_d = _safe_parse_finite_decimal(raw_bundle.get("spot_price"), "spot_price", mismatches)
        perp_d = _safe_parse_finite_decimal(raw_bundle.get("perp_price"), "perp_price", mismatches)
        borrow_d = _safe_parse_finite_decimal(raw_bundle.get("borrow_apr_bps"), "borrow_apr_bps", mismatches)

        raw_venue_files = rec.get("raw_venue_files") or []
        borrow_reparsed = False
        if raw_venue_files and avail_dt is not None and cap_dt is not None:
            reparsed, venue_errors = _independently_reparse_raw_venue_files(
                store=store,
                venue=venue,
                instrument=instrument,
                avail_dt=avail_dt,
                cap_dt=cap_dt,
                raw_venue_files=raw_venue_files,
            )
            mismatches.extend(venue_errors)
            if reparsed is not None:
                # Cross-check raw venue HTTP parse against normalized/bundle fields
                for prim_key in ("spot_price", "perp_price", "basis_bps", "annualized_funding_bps"):
                    bundle_val = raw_bundle.get(prim_key)
                    if bundle_val is None:
                        mismatches.append(f"missing_bundle_primitive ({prim_key})")
                        continue
                    bundle_dec = _safe_parse_finite_decimal(bundle_val, f"bundle.{prim_key}", mismatches)
                    if bundle_dec is None:
                        continue
                    diff = abs(bundle_dec - reparsed[prim_key])
                    if diff > Decimal("0.0001"):
                        mismatches.append(f"raw_venue_normalization_mismatch ({prim_key})")
                        num_diffs[f"raw_venue_{prim_key}"] = f"{diff:.8f}"
                # Drive signal recomputation from raw-venue-reparsed prices rather than pre-normalized bundle
                spot_d = reparsed["spot_price"]
                perp_d = reparsed["perp_price"]
                if reparsed.get("borrow_present"):
                    borrow_reparsed = True
                    bundle_borrow = raw_bundle.get("borrow_apr_bps")
                    rec_market_obs = rec.get("normalized_observation", {}).get("market_observation", {})
                    rec_borrow_ev = (rec_market_obs.get("public_liquidity_metadata") or {}).get("borrow_rate_evidence")
                    convention_ok = False
                    if isinstance(rec_borrow_ev, dict):
                        rec_conv = rec_borrow_ev.get("rate_conversion")
                        if (
                            isinstance(rec_conv, dict)
                            and rec_conv.get("annualization_convention")
                            == "HYPERLIQUID_PORTFOLIO_MARGIN_CONTINUOUS_APY"
                        ):
                            convention_ok = True

                    if reparsed.get("borrow_valid") and convention_ok:
                        if bundle_borrow is None:
                            if rec.get("eligibility_status") == "ELIGIBLE":
                                mismatches.append("raw_borrow_valid_but_bundle_borrow_missing")
                            borrow_d = None
                        else:
                            bundle_borrow_dec = _safe_parse_finite_decimal(
                                bundle_borrow, "bundle.borrow_apr_bps", mismatches
                            )
                            if bundle_borrow_dec is not None:
                                borrow_diff = abs(bundle_borrow_dec - reparsed["borrow_apr_bps"])
                                if borrow_diff > Decimal("0.001"):
                                    mismatches.append("raw_venue_normalization_mismatch (borrow_apr_bps)")
                                    num_diffs["raw_venue_borrow_apr_bps"] = f"{borrow_diff:.8f}"
                            borrow_d = reparsed["borrow_apr_bps"]
                    else:
                        borrow_d = None
                        if bundle_borrow is not None or rec.get("eligibility_status") == "ELIGIBLE":
                            mismatches.append(
                                f"raw_borrow_invalid_but_recorded_populated_or_eligible "
                                f"({'; '.join(reparsed.get('borrow_errors') or ['unverified_convention'])})"
                            )

        if (
            not borrow_reparsed
            and raw_bundle.get("borrow_apr_source") == "VENUE_OBSERVED_PUBLIC_READ_ONLY"
            and not rec.get("synthetic_fixture", False)
            and rec.get("eligibility_status") == "ELIGIBLE"
        ):
            mismatches.append("missing_raw_borrow_venue_files_for_public_read_only_source")

        # 5. Independently verify distinct lookback days when day-keyed history is present
        day_keyed_hist = raw_bundle.get("annualized_funding_bps_by_day")
        if isinstance(day_keyed_hist, list) and day_keyed_hist:
            days = [str(entry[0]) for entry in day_keyed_hist if isinstance(entry, list) and len(entry) == 2]
            if len(days) != len(set(days)):
                mismatches.append("duplicate_utc_days_in_lookback_history")

        # 6. Independently recompute signal and theoretical exposure
        norm = rec.get("normalized_observation", {})
        recorded_signal = norm.get("signal_output", {})
        recorded_exposure = recorded_signal.get("theoretical_two_leg_exposure", {})
        raw_history = raw_bundle.get("annualized_funding_bps_history", [])
        funding_hist_dec: list[Decimal] = []
        if isinstance(raw_history, list):
            for idx_h, item_h in enumerate(raw_history):
                parsed_h = _safe_parse_finite_decimal(
                    item_h,
                    f"annualized_funding_bps_history[{idx_h}]",
                    mismatches,
                    allow_none=False,
                )
                if parsed_h is not None:
                    funding_hist_dec.append(parsed_h)
        else:
            mismatches.append("invalid_funding_history_type")

        stream_prior_active = prior_active_by_stream.get(stream_key, False)
        recomputed = _independent_recompute_signal(
            spot_d=spot_d,
            perp_d=perp_d,
            borrow_d=borrow_d,
            params=params,
            funding_history_bps=funding_hist_dec,
            prior_in_position=stream_prior_active,
        )

        if recorded_signal.get("signal_state") != recomputed["signal_state"]:
            mismatches.append(
                f"signal_state_mismatch (recorded={recorded_signal.get('signal_state')}, "
                f"replayed={recomputed['signal_state']})"
            )

        if recorded_exposure.get("exposure_label") != EXPOSURE_LABEL_THEORETICAL_ONLY:
            mismatches.append("exposure_label_not_theoretical_only")
        if recorded_exposure.get("executed") is not False:
            mismatches.append("recorded_exposure_marked_executed")

        if recomputed["evaluable"]:
            for field in (
                "rolling_mean_annual_funding_bps",
                "basis_bps",
                "funding_minus_borrow_bps",
                "carry_spread_annual_bps",
            ):
                rec_val_raw = recorded_signal.get(field)
                if rec_val_raw is None:
                    mismatches.append(f"missing_recorded_field ({field})")
                    continue
                diff = abs(Decimal(str(rec_val_raw)) - recomputed[field])
                if diff > NUMERIC_TOLERANCE:
                    mismatches.append(f"numeric_mismatch ({field})")
                    num_diffs[field] = f"{diff:.8f}"

            for exp_field in ("spot_leg_target_notional_usd", "perp_leg_target_notional_usd"):
                rec_exp_raw = recorded_exposure.get(exp_field)
                if rec_exp_raw is None:
                    mismatches.append(f"missing_recorded_exposure_field ({exp_field})")
                    continue
                diff = abs(Decimal(str(rec_exp_raw)) - recomputed[exp_field])
                if diff > Decimal("0.01"):
                    mismatches.append(f"exposure_numeric_mismatch ({exp_field})")
                    num_diffs[exp_field] = f"{diff:.4f}"

        # 7. Independently verify output_sha256 over recorded_signal body
        sig_body = {k: v for k, v in recorded_signal.items() if k != "output_sha256"}
        expected_sig_hash = hashlib.sha256(canonical_json_bytes(sig_body)).hexdigest()
        if recorded_signal.get("output_sha256") != expected_sig_hash:
            mismatches.append("signal_output_sha256_mismatch")

        matched = len(mismatches) == 0
        # Advance stream position state only for matched evaluable records that are eligible (or synthetic sequence)
        if matched and recomputed["evaluable"] and (is_synthetic or rec.get("eligibility_status") == "ELIGIBLE"):
            prior_active_by_stream[stream_key] = bool(recomputed["active"])

        comparisons.append(
            ReplayRecordComparison(
                record_id=rec_id,
                observation_day_utc=obs_day,
                matched=matched,
                mismatch_reasons=mismatches,
                numeric_differences=num_diffs,
                eligibility_consequence="REPLAY_MATCHED" if matched else "INELIGIBLE_REPLAY_MISMATCH",
            )
        )

    matched_count = sum(1 for c in comparisons if c.matched)
    mismatched_count = len(comparisons) - matched_count
    first_mismatch = next((c.to_dict() for c in comparisons if not c.matched), None)
    replay_verified = chain_report.intact and len(comparisons) > 0 and mismatched_count == 0

    return OfflineReplayReport(
        passive_data_replay_verified=replay_verified,
        execution_parity_verified=False,  # Always False under passive observation authority
        reconciliation_status=(
            "PASSIVE_DATA_REPLAY_VERIFIED" if replay_verified else "PASSIVE_DATA_REPLAY_FAILED"
        ),
        total_records=len(comparisons),
        matched_records=matched_count,
        mismatched_records=mismatched_count,
        first_mismatch=first_mismatch,
        missing_evidence=missing_evidence,
        comparisons=[c.to_dict() for c in comparisons],
    )
