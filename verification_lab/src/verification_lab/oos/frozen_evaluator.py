"""Strictly read-only signal evaluator for the frozen H3_BASIS_CARRY_V2 specification.

Authority and safety invariants:
- Loads the immutable OOS registration artifact in verify-only mode.
- Verifies exact registration SHA-256 and canonical frozen_v2_spec SHA-256.
- Enforces paper_forward_allowed == False and live_order_authority == False.
- Never creates exchange orders or active paper order intents.
- Missing required variables produce SIGNAL_NOT_EVALUABLE_MISSING_DATA (no invented defaults).
- Every theoretical exposure is labeled THEORETICAL_ONLY_NOT_EXECUTED.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Mapping, Sequence

EXPECTED_REGISTRATION_SHA256 = "c089527416420ac11dfea01a2ad7ca0b18a167ad13bb775575af5b1ef70d0012"
EXPECTED_FROZEN_SPEC_SHA256 = "187e1974069bc1d70950b475804b670a8510a413411652c2c71b1e370b22ee53"

SIGNAL_NOT_EVALUABLE = "SIGNAL_NOT_EVALUABLE_MISSING_DATA"
EXPOSURE_LABEL_THEORETICAL_ONLY = "THEORETICAL_ONLY_NOT_EXECUTED"


class FrozenSpecVerificationError(RuntimeError):
    """Raised when the frozen V2 specification or registration anchor fails verification."""


@dataclass(frozen=True)
class FrozenV2Parameters:
    strategy_id: str
    lookback_days: int
    entry_annual_bps: Decimal
    exit_annual_bps: Decimal
    fifo_fill_probability: Decimal
    require_net_funding_above_borrow_apr: bool
    min_funding_minus_borrow_spread_bps: Decimal
    max_gross_leverage: Decimal
    frozen_spec_sha256: str
    registration_sha256: str


@dataclass(frozen=True)
class FrozenSignalOutput:
    strategy_id: str
    frozen_spec_sha256: str
    signal_state: str
    exposure_label: str
    evaluable: bool
    missing_variables: list[str]
    rolling_mean_annual_funding_bps: str | None
    basis_bps: str | None
    carry_spread_annual_bps: str | None
    borrow_apr_bps: str | None
    funding_minus_borrow_bps: str | None
    entry_condition_met: bool | None
    exit_condition_met: bool | None
    theoretical_two_leg_exposure: dict[str, Any]
    hypothetical_hedge_requirement: dict[str, Any]
    risk_flags: list[str]
    order_intent_created: bool
    simulated_fills_represented_as_real: bool
    output_sha256: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _canonical_json_sha256(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def load_verified_frozen_v2_spec(
    registration_path: Path,
    *,
    expected_registration_sha256: str = EXPECTED_REGISTRATION_SHA256,
    expected_frozen_spec_sha256: str = EXPECTED_FROZEN_SPEC_SHA256,
) -> FrozenV2Parameters:
    """Load the immutable registration artifact in verify-only mode and validate all anchors."""
    if not registration_path.exists():
        raise FrozenSpecVerificationError(f"registration_artifact_missing ({registration_path})")

    raw_bytes = registration_path.read_bytes()
    actual_reg_sha = hashlib.sha256(raw_bytes).hexdigest()
    if actual_reg_sha != expected_registration_sha256:
        raise FrozenSpecVerificationError(
            f"registration_sha256_mismatch (expected={expected_registration_sha256}, actual={actual_reg_sha})"
        )

    doc = json.loads(raw_bytes.decode("utf-8"))
    frozen_spec = doc.get("frozen_v2_spec")
    if not isinstance(frozen_spec, dict):
        raise FrozenSpecVerificationError("missing_frozen_v2_spec_object")

    actual_spec_sha = _canonical_json_sha256(frozen_spec)
    if actual_spec_sha != expected_frozen_spec_sha256 or doc.get("spec_sha256") != expected_frozen_spec_sha256:
        raise FrozenSpecVerificationError(
            f"frozen_spec_sha256_mismatch (expected={expected_frozen_spec_sha256}, actual={actual_spec_sha})"
        )

    safety = frozen_spec.get("safety_invariants", {})
    if safety.get("paper_forward_allowed") is not False or safety.get("live_order_authority") is not False:
        raise FrozenSpecVerificationError("safety_invariants_violation_execution_must_remain_disabled")

    params = frozen_spec["signal_parameters_frozen"]
    econ = frozen_spec["economic_structure"]
    return FrozenV2Parameters(
        strategy_id=str(frozen_spec["strategy_id"]),
        lookback_days=int(params["lookback_days"]),
        entry_annual_bps=Decimal(str(params["entry_annual_bps"])),
        exit_annual_bps=Decimal(str(params["exit_annual_bps"])),
        fifo_fill_probability=Decimal(str(params["fifo_fill_probability"])),
        require_net_funding_above_borrow_apr=bool(params["require_net_funding_above_borrow_apr"]),
        min_funding_minus_borrow_spread_bps=Decimal(str(params["min_funding_minus_borrow_spread_bps"])),
        max_gross_leverage=Decimal(str(econ["max_gross_leverage"])),
        frozen_spec_sha256=actual_spec_sha,
        registration_sha256=actual_reg_sha,
    )


def _parse_optional_decimal(val: Any) -> Decimal | None:
    if val is None or isinstance(val, bool):
        return None
    try:
        dec = Decimal(str(val))
    except (InvalidOperation, ValueError):
        return None
    return dec if dec.is_finite() else None


def evaluate_frozen_v2_signal(
    *,
    params: FrozenV2Parameters,
    spot_price: Any,
    perp_price: Any,
    annualized_funding_bps_history: Sequence[Any],
    borrow_apr_bps: Any,
    prior_theoretical_in_position: bool = False,
    notional_usd: Decimal = Decimal("10000"),
) -> FrozenSignalOutput:
    """Strictly read-only evaluation of the frozen V2 basis-carry specification."""
    missing: list[str] = []
    spot_dec = _parse_optional_decimal(spot_price)
    perp_dec = _parse_optional_decimal(perp_price)
    borrow_dec = _parse_optional_decimal(borrow_apr_bps)

    if spot_dec is None or spot_dec <= 0:
        missing.append("spot_price")
    if perp_dec is None or perp_dec <= 0:
        missing.append("perp_price")
    if borrow_dec is None or borrow_dec < 0:
        missing.append("borrow_apr_bps")

    funding_series: list[Decimal] = []
    for item in annualized_funding_bps_history:
        parsed = _parse_optional_decimal(item)
        if parsed is None:
            missing.append("annualized_funding_bps_malformed_entry")
            break
        funding_series.append(parsed)

    if len(funding_series) < params.lookback_days:
        missing.append(f"lookback_funding_history_lt_{params.lookback_days}_days (have={len(funding_series)})")

    if missing:
        exposure = {
            "exposure_label": EXPOSURE_LABEL_THEORETICAL_ONLY,
            "spot_leg_target_notional_usd": "0.00",
            "perp_leg_target_notional_usd": "0.00",
            "gross_leverage": "0.00",
            "fifo_fill_probability_assumption": str(params.fifo_fill_probability),
            "executed": False,
        }
        hedge = {
            "exposure_label": EXPOSURE_LABEL_THEORETICAL_ONLY,
            "required_spot_qty": None,
            "required_perp_short_qty": None,
            "hedge_ratio": None,
        }
        base_payload = {
            "strategy_id": params.strategy_id,
            "frozen_spec_sha256": params.frozen_spec_sha256,
            "signal_state": SIGNAL_NOT_EVALUABLE,
            "exposure_label": EXPOSURE_LABEL_THEORETICAL_ONLY,
            "evaluable": False,
            "missing_variables": missing,
            "rolling_mean_annual_funding_bps": None,
            "basis_bps": None,
            "carry_spread_annual_bps": None,
            "borrow_apr_bps": f"{borrow_dec:.6f}" if borrow_dec is not None else None,
            "funding_minus_borrow_bps": None,
            "entry_condition_met": None,
            "exit_condition_met": None,
            "theoretical_two_leg_exposure": exposure,
            "hypothetical_hedge_requirement": hedge,
            "risk_flags": ["SIGNAL_NOT_EVALUABLE_MISSING_DATA"],
            "order_intent_created": False,
            "simulated_fills_represented_as_real": False,
        }
        return FrozenSignalOutput(**base_payload, output_sha256=_canonical_json_sha256(base_payload))

    assert spot_dec is not None and perp_dec is not None and borrow_dec is not None
    window = funding_series[-params.lookback_days :]
    rolling_mean_funding = sum(window, Decimal("0")) / Decimal(params.lookback_days)
    basis_bps = ((perp_dec - spot_dec) / spot_dec) * Decimal("10000")
    funding_minus_borrow = rolling_mean_funding - borrow_dec
    carry_spread_annual_bps = funding_minus_borrow + basis_bps

    funding_above_borrow_ok = (
        funding_minus_borrow >= params.min_funding_minus_borrow_spread_bps
        if params.require_net_funding_above_borrow_apr
        else True
    )
    entry_met = (rolling_mean_funding >= params.entry_annual_bps) and funding_above_borrow_ok
    exit_met = (rolling_mean_funding <= params.exit_annual_bps) or (not funding_above_borrow_ok)

    if prior_theoretical_in_position:
        signal_state = "THEORETICAL_EXIT" if exit_met else "THEORETICAL_HOLD_LONG_SPOT_SHORT_PERP"
        active = not exit_met
    else:
        signal_state = "THEORETICAL_ENTRY_LONG_SPOT_SHORT_PERP" if entry_met else "THEORETICAL_FLAT"
        active = entry_met

    leg_notional = (notional_usd / Decimal("2")) if active else Decimal("0")
    gross_lev = params.max_gross_leverage if active else Decimal("0")
    spot_qty = (leg_notional / spot_dec) if active else Decimal("0")
    perp_qty = (leg_notional / perp_dec) if active else Decimal("0")

    risk_flags: list[str] = []
    if not funding_above_borrow_ok:
        risk_flags.append("FUNDING_BELOW_BORROW_SPREAD_FLOOR")
    if borrow_dec >= Decimal("1000"):
        risk_flags.append("HIGH_BORROW_APR_STRESS_GE_10PCT")
    if basis_bps < Decimal("0"):
        risk_flags.append("NEGATIVE_BASIS_BACKWARDATION")

    exposure = {
        "exposure_label": EXPOSURE_LABEL_THEORETICAL_ONLY,
        "spot_leg_target_notional_usd": f"{leg_notional:.2f}",
        "perp_leg_target_notional_usd": f"{-leg_notional:.2f}" if active else "0.00",
        "gross_leverage": f"{gross_lev:.2f}",
        "fifo_fill_probability_assumption": str(params.fifo_fill_probability),
        "executed": False,
    }
    hedge = {
        "exposure_label": EXPOSURE_LABEL_THEORETICAL_ONLY,
        "required_spot_qty": f"{spot_qty:.8f}",
        "required_perp_short_qty": f"{perp_qty:.8f}",
        "hedge_ratio": "1.000000" if active else "0.000000",
    }

    base_payload = {
        "strategy_id": params.strategy_id,
        "frozen_spec_sha256": params.frozen_spec_sha256,
        "signal_state": signal_state,
        "exposure_label": EXPOSURE_LABEL_THEORETICAL_ONLY,
        "evaluable": True,
        "missing_variables": [],
        "rolling_mean_annual_funding_bps": f"{rolling_mean_funding:.6f}",
        "basis_bps": f"{basis_bps:.6f}",
        "carry_spread_annual_bps": f"{carry_spread_annual_bps:.6f}",
        "borrow_apr_bps": f"{borrow_dec:.6f}",
        "funding_minus_borrow_bps": f"{funding_minus_borrow:.6f}",
        "entry_condition_met": entry_met,
        "exit_condition_met": exit_met,
        "theoretical_two_leg_exposure": exposure,
        "hypothetical_hedge_requirement": hedge,
        "risk_flags": risk_flags,
        "order_intent_created": False,
        "simulated_fills_represented_as_real": False,
    }
    return FrozenSignalOutput(**base_payload, output_sha256=_canonical_json_sha256(base_payload))


def validate_theoretical_exposure_shape(exposure: Mapping[str, Any]) -> list[str]:
    """Fail-closed validation of theoretical exposure dictionary structure and non-execution label."""
    errors: list[str] = []
    if not isinstance(exposure, Mapping):
        return ["theoretical_exposure_not_mapping"]
    if exposure.get("exposure_label") != EXPOSURE_LABEL_THEORETICAL_ONLY:
        errors.append("missing_or_invalid_theoretical_only_exposure_label")
    if exposure.get("executed") is not False:
        errors.append("theoretical_exposure_cannot_mark_executed_true")
    for required_key in ("spot_leg_target_notional_usd", "perp_leg_target_notional_usd", "gross_leverage"):
        if required_key not in exposure or _parse_optional_decimal(exposure[required_key]) is None:
            errors.append(f"malformed_theoretical_exposure_field ({required_key})")
    return errors
