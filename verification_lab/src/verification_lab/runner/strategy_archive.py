"""Formal strategy lifecycle / kill-freeze registry & signed immutable strategy spec helpers.

Enforces the Issue `#63` scientific governance invariants:
1. Hypotheses falsified by G5 (`DSR < 0.95` at `N=185`) and G6 (`locked_oos BE < 2.0x` plus
   negative Hyperliquid 1h carry cross-check) — specifically `H1`, `H2`, `H3` (taker), `H1_G1`,
   and `H2_G1` — are formally transitioned to `ARCHIVED_FALSIFIED` (`paper_forward_allowed: false`).
2. `assert_paper_forward_eligible(strategy_id, registry_path)` fails closed with `PermissionError`
   if any caller attempts to run paper-forward or live evaluation on a falsified, unknown, or
   tampered strategy entry, or if `live_trading_locked` is not `True`.
3. `SignedStrategySpec` canonical sorted-key JSON SHA-256 (`payloadSha256`) normalises integer-valued
   numbers (`800.0 -> 800`, `1.0 -> 1`) so Python `json.dumps(..., sort_keys=True, separators=(',', ':'))`
   and TypeScript `JSON.stringify` / `canonicalize()` produce bit-identical 64-character hex digests.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..execution import fees
from ..strategies import loaders

ARCHIVED_FAMILIES: tuple[str, ...] = ("H1", "H2", "H3", "H1_G1", "H2_G1")
ELIGIBLE_FAMILY = "H3_MAKER"


def canonical_json_value(value: Any) -> Any:
    """Recursively normalise JSON values so Python & ECMAScript `JSON.stringify` match byte-for-byte."""
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return value
    if isinstance(value, dict):
        return {str(k): canonical_json_value(v) for k, v in sorted(value.items(), key=lambda kv: str(kv[0]))}
    if isinstance(value, (list, tuple)):
        return [canonical_json_value(v) for v in value]
    return value


def canonical_json_dumps(payload: dict[str, Any]) -> str:
    """Serialize `payload` to canonical sorted-key compact JSON matching TypeScript `canonicalize()`."""
    normalised = canonical_json_value(payload)
    return json.dumps(normalised, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_canonical_sha256(payload: dict[str, Any], *, exclude_key: str) -> str:
    """Compute RFC-6234 SHA-256 lowercase hex over canonical JSON of `payload` minus `exclude_key`."""
    body = {k: v for k, v in payload.items() if k != exclude_key}
    canonical_str = canonical_json_dumps(body)
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()


def _git_commit(repo_root: Path) -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def _format_archive_reason(
    strategy_id: str,
    g5_entry: dict[str, Any],
    g6_entry: dict[str, Any],
    hl_cross: dict[str, Any],
) -> str:
    dsr_val = float(g5_entry["deflated_sharpe"]["dsr"])
    sr_obs = float(g5_entry["deflated_sharpe"]["observed_sharpe"])
    sr_bench = float(g5_entry["deflated_sharpe"]["expected_max_sharpe_under_null"])
    n_tot = int(g5_entry["n_trials_full_recorded"])
    pbo_val = round(float(g5_entry["pbo"]["pbo"]), 4)
    oos_be_fl = g6_entry["locked_oos"]["at_floor"]["break_even_multiple"]
    oos_be_ce = g6_entry["locked_oos"]["at_ceiling"]["break_even_multiple"]

    hl_rep = (
        hl_cross.get("empirical_l1_and_impact_quotes", {})
        .get("hypotheses_repriced_at_hl_vip0_and_empirical_impact_spread", {})
        .get(strategy_id, {})
    )
    hl_oos_be = hl_rep.get("locked_oos_break_even_multiple")
    hl_1h_h1 = (
        hl_cross.get("historical_1h_funding_carry_cross_check", {})
        .get("h1_carry_on_10coin_overlap", {})
        .get("hyperliquid_1h", {})
    )

    parts = [
        f"DSR {dsr_val:.4f} < 0.95 at N={n_tot} (train SR {sr_obs:.4f} < SR0 {sr_bench:.4f})",
        f"PBO={pbo_val:.4f}",
        f"G6 OOS BE {oos_be_fl}x..{oos_be_ce}x < 2.0x",
    ]
    if hl_oos_be is not None:
        parts.append(f"Hyperliquid VIP-0 impactPxs OOS BE {hl_oos_be}x < 2.0x")
    if strategy_id in ("H1", "H1_G1") and hl_1h_h1:
        parts.append(
            f"negative Hyperliquid 1h carry cross-check (OOS SR {hl_1h_h1.get('locked_oos_sharpe')}, "
            f"cum_net {hl_1h_h1.get('locked_oos_cum_net')})"
        )
    return "; ".join(parts)


def build_strategy_lifecycle_registry(
    g5_path: Path,
    g6_path: Path,
    *,
    repo_root: Path,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Deterministically build `strategy_lifecycle_registry.json` from G5 and G6 artifacts."""
    g5 = json.loads(g5_path.read_text(encoding="utf-8"))
    g6 = json.loads(g6_path.read_text(encoding="utf-8"))

    g5_by_id = {row["hypothesis"]: row for row in g5["hypotheses"]}
    g6_by_id = {row["hypothesis"]: row for row in g6["hypotheses"]}
    hl_cross = g6.get("hyperliquid_cross_check", {})

    ordered_ids = (*ARCHIVED_FAMILIES, ELIGIBLE_FAMILY)
    strategies: list[dict[str, Any]] = []

    for sid in ordered_ids:
        if sid not in g5_by_id or sid not in g6_by_id:
            raise KeyError(f"Strategy {sid!r} missing from G5 or G6 artifact")
        h5 = g5_by_id[sid]
        h6 = g6_by_id[sid]
        g5_verdict = str(h5["verdict"])
        dsr_val = round(float(h5["deflated_sharpe"]["dsr"]), 6)
        pbo_val = round(float(h5["pbo"]["pbo"]), 4)
        oos_sr = round(float(h5["locked_oos"]["sharpe"]), 4)

        hl_rep = (
            hl_cross.get("empirical_l1_and_impact_quotes", {})
            .get("hypotheses_repriced_at_hl_vip0_and_empirical_impact_spread", {})
            .get(sid, {})
        )
        tick_hl_ok = (
            bool(
                g6.get("tick_calibrated_h3_maker", {})
                .get("by_venue", {})
                .get("hyperliquid", {})
                .get("clears_2x_on_both_train_bounds_and_oos_ticks", False)
            )
            if sid == ELIGIBLE_FAMILY
            else False
        )
        eligible = (
            sid == ELIGIBLE_FAMILY
            and g5_verdict == "PASS"
            and dsr_val >= 0.95
            and pbo_val < 0.1523
            and (bool(hl_rep.get("locked_oos_2x_positive")) or tick_hl_ok)
        )

        if eligible:
            status = "PAPER_FORWARD_ELIGIBLE"
            reason = None
            allowed = True
        else:
            status = "ARCHIVED_FALSIFIED"
            reason = _format_archive_reason(sid, h5, h6, hl_cross)
            allowed = False

        strategies.append(
            canonical_json_value(
                {
                    "strategy_id": sid,
                    "status": status,
                    "archive_reason": reason,
                    "g5_verdict": g5_verdict,
                    "dsr_at_n185": dsr_val,
                    "pbo": pbo_val,
                    "locked_oos_sharpe": oos_sr,
                    "paper_forward_allowed": allowed,
                }
            )
        )

    payload: dict[str, Any] = canonical_json_value(
        {
            "schema_version": "1.0.0",
            "generated_at": generated_at or datetime.now(timezone.utc).isoformat(),
            "commit": _git_commit(repo_root),
            "live_trading_locked": True,
            "strategies": strategies,
        }
    )
    payload["registry_sha256"] = compute_canonical_sha256(payload, exclude_key="registry_sha256")
    return payload


def verify_lifecycle_registry(payload: dict[str, Any]) -> bool:
    """Verify `registry_sha256` and governance invariants on `strategy_lifecycle_registry.json`."""
    expected = payload.get("registry_sha256")
    if not isinstance(expected, str) or len(expected) != 64:
        return False
    if payload.get("live_trading_locked") is not True:
        return False
    actual = compute_canonical_sha256(payload, exclude_key="registry_sha256")
    return actual == expected


def assert_paper_forward_eligible(strategy_id: str, registry_path: Path) -> dict[str, Any]:
    """Fail-closed kill-fence guard: raises `PermissionError` on archived, unknown, or tampered entries."""
    if not registry_path.exists():
        raise PermissionError(f"Lifecycle registry missing at {registry_path}")
    payload = json.loads(registry_path.read_text(encoding="utf-8"))
    if not verify_lifecycle_registry(payload):
        raise PermissionError(
            f"Lifecycle registry integrity or live_trading_locked check failed: {registry_path}"
        )

    entries = {row["strategy_id"]: row for row in payload.get("strategies", [])}
    if strategy_id not in entries:
        raise PermissionError(f"Unknown strategy_id {strategy_id!r} denied by kill-freeze fence")

    entry = entries[strategy_id]
    if entry.get("status") != "PAPER_FORWARD_ELIGIBLE" or entry.get("paper_forward_allowed") is not True:
        raise PermissionError(
            f"Strategy {strategy_id!r} is {entry.get('status')} and forbidden from paper-forward execution: "
            f"{entry.get('archive_reason')}"
        )
    return entry


def build_signed_strategy_spec_h3_maker(
    g5_path: Path,
    tick_calibration_path: Path,
) -> dict[str, Any]:
    """Build deterministic `SignedStrategySpec` for `H3_MAKER` with canonical `payloadSha256`."""
    g5 = json.loads(g5_path.read_text(encoding="utf-8"))
    cal = json.loads(tick_calibration_path.read_text(encoding="utf-8"))

    h3m = next(row for row in g5["hypotheses"] if row["hypothesis"] == "H3_MAKER")
    winner = h3m["winner_params"]
    train_floor = cal["train_calibrated_bounds_for_g6"]["floor"]
    hl_fees = fees.venue("hyperliquid")

    body: dict[str, Any] = canonical_json_value(
        {
            "specVersion": "1.0.0",
            "strategyId": "H3_MAKER",
            "executionMode": "PAPER_ONLY",
            "liveOrderAuthority": False,
            "aiOrderAuthority": False,
            "universe": list(loaders.CORE_19),
            "parameters": {
                "lookbackDays": int(winner["lookback"]),
                "entryAnnualBps": int(round(float(winner["entry_annual_bps"]))),
                "exitAnnualBps": int(round(float(winner["exit_annual_bps"]))),
                "fifoFillProbability": float(winner["p_fill"]),
                "adverseSelectionBps": round(float(train_floor["adverse_selection_bps"]), 4),
                "singleLegMissProbability": round(float(train_floor["p_leg_miss"]), 4),
                "maxGrossLeverage": 1,
            },
            "venueSchedule": {
                "primaryVenue": "hyperliquid",
                "benchmarkVenue": "binance",
                "spotMakerBps": round(hl_fees.maker_bps("spot"), 4),
                "perpMakerBps": round(hl_fees.maker_bps("perp"), 4),
                "spotTakerBps": round(hl_fees.taker_bps("spot"), 4),
                "perpTakerBps": round(hl_fees.taker_bps("perp"), 4),
            },
            "riskGates": {
                "maxDrawdownSoftPct": 8,
                "maxDrawdownHardPct": 12,
                "maxDailyLossPct": 2.5,
                "staleDataCutoffMs": 15000,
                "maxTrackingErrorBpsPerMonth": 15,
            },
            "observationWindow": {
                "minRequiredDays": 60,
                "targetDays": 90,
            },
        }
    )
    body["payloadSha256"] = compute_canonical_sha256(body, exclude_key="payloadSha256")
    return body


def verify_signed_strategy_spec(spec: dict[str, Any]) -> tuple[bool, list[str]]:
    """Fail-closed verifier for `SignedStrategySpec.json` authority flags and `payloadSha256`."""
    errors: list[str] = []
    expected_sha = spec.get("payloadSha256")
    if not isinstance(expected_sha, str) or len(expected_sha) != 64:
        errors.append("payloadSha256 must be a 64-char hex string")
    else:
        actual_sha = compute_canonical_sha256(spec, exclude_key="payloadSha256")
        if actual_sha != expected_sha:
            errors.append(f"payloadSha256 mismatch: computed {actual_sha} != declared {expected_sha}")

    if spec.get("executionMode") != "PAPER_ONLY":
        errors.append(f"executionMode must be 'PAPER_ONLY', got {spec.get('executionMode')!r}")
    if spec.get("liveOrderAuthority") is not False:
        errors.append("liveOrderAuthority must be strictly False")
    if spec.get("aiOrderAuthority") is not False:
        errors.append("aiOrderAuthority must be strictly False")
    obs = spec.get("observationWindow") or {}
    if int(obs.get("minRequiredDays", 0)) < 60:
        errors.append("observationWindow.minRequiredDays must be >= 60")
    return (len(errors) == 0), errors
