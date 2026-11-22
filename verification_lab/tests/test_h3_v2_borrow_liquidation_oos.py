"""Tests for H3_BASIS_CARRY_V2 borrow/liquidation model & prospective OOS registration."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from verification_lab.execution.borrow_liquidation_model import (
    BINANCE_V2_SCHEDULE,
    HYPERLIQUID_V2_SCHEDULE,
    CarryCycleInput,
    simulate_v2_carry_cycle,
)

REPO = Path(__file__).resolve().parents[2]
REG_PATH = REPO / "artifacts" / "h3_basis_carry_v2_prospective_oos_registration.json"


def test_borrow_model_reconciles_to_zero_and_turns_binance_negative_at_5pct() -> None:
    res = simulate_v2_carry_cycle(
        BINANCE_V2_SCHEDULE,
        CarryCycleInput(
            cycle_id="T-BIN",
            notional_usd=Decimal("100000"),
            hold_days=Decimal("30"),
            funding_apr=Decimal("0.044275"),
            basis_entry_bps=Decimal("10"),
            basis_exit_bps=Decimal("2"),
            cost_multiplier=Decimal("2.0"),
            borrow_apr_override=Decimal("0.0500"),
        ),
    )
    assert res.double_entry_residual == Decimal("0.00000000")
    assert res.borrow_financing_cost > Decimal("0")
    assert res.net_pnl < Decimal("0")
    assert not res.liquidation_triggered


def test_delayed_hedge_triggers_maintenance_margin_liquidation() -> None:
    res = simulate_v2_carry_cycle(
        HYPERLIQUID_V2_SCHEDULE,
        CarryCycleInput(
            cycle_id="T-LIQ",
            notional_usd=Decimal("100000"),
            hold_days=Decimal("1"),
            funding_apr=Decimal("0.098435"),
            basis_entry_bps=Decimal("0"),
            basis_exit_bps=Decimal("0"),
            cost_multiplier=Decimal("2.0"),
            hedge_delay_adverse_move_pct=Decimal("0.195"),
            initial_margin_ratio=Decimal("0.20"),
            unhedged_leg_only=True,
        ),
    )
    assert res.liquidation_triggered is True
    assert res.liquidation_penalty_cost > Decimal("0")
    assert res.net_pnl < Decimal("-10000")
    assert res.double_entry_residual == Decimal("0.00000000")


def test_borrow_model_rejects_invalid_inputs() -> None:
    with pytest.raises(ValueError, match="notional_usd"):
        simulate_v2_carry_cycle(
            BINANCE_V2_SCHEDULE,
            CarryCycleInput("BAD", Decimal("0"), Decimal("1"), Decimal("0.05"), Decimal("0"), Decimal("0")),
        )
    with pytest.raises(ValueError, match="borrow_apr"):
        simulate_v2_carry_cycle(
            BINANCE_V2_SCHEDULE,
            CarryCycleInput(
                "BAD-B", Decimal("10000"), Decimal("1"), Decimal("0.05"), Decimal("0"), Decimal("0"),
                borrow_apr_override=Decimal("-0.01"),
            ),
        )


def test_prospective_oos_registration_artifact_invariants() -> None:
    data = json.loads(REG_PATH.read_text(encoding="utf-8"))
    spec = data["frozen_v2_spec"]
    assert spec["strategy_id"] == "H3_BASIS_CARRY_V2"
    assert spec["safety_invariants"]["research_status"] == "PENDING_FRESH_OOS"
    assert spec["safety_invariants"]["paper_forward_allowed"] is False
    assert spec["safety_invariants"]["live_order_authority"] is False
    assert spec["safety_invariants"]["h3_maker_bot_runtime_quarantined"] is True
    assert spec["safety_invariants"]["h3_maker_bot_runtime_applicability"] == "NOT_VERIFIED"
    assert spec["prospective_oos_window"]["window_start_utc"] > spec["prospective_oos_window"]["registration_date_utc"]
    assert data["v2_borrow_and_liquidation_stress"]["all_residuals_zero"] is True
    assert data["v2_borrow_and_liquidation_stress"]["liquidation_breach_detected"] is True
    assert data["restored_g2_parquet_verification"]["status"] == "RESTORED_AND_VERIFIED"
    assert data["restored_g2_parquet_verification"]["verified_file_count"] == 7
    assert data["g5_empirical_randomized_entry_audit"]["status"] == "EMPIRICAL_VERIFIED"
    assert data["g5_empirical_randomized_entry_audit"]["n_controls"] == 1000
