"""Regression & live-execution test suite for Supreme Command #19 independent G2-G6 audits."""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "verification_lab" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import audit_g2_data_provenance as g2_mod  # noqa: E402
import audit_g3_determinism as g3_mod  # noqa: E402
import audit_g4_leakage as g4_mod  # noqa: E402
import audit_g5_statistical_reproduction as g5_mod  # noqa: E402
import audit_g6_execution_economics as g6_mod  # noqa: E402

ARTIFACTS = REPO_ROOT / "artifacts"


def _load(name: str) -> dict:
    path = ARTIFACTS / name
    assert path.exists(), f"Missing audit artifact: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def test_g2_data_provenance_live_and_artifact() -> None:
    # Live execution of G2 validators
    cases = g2_mod.run_synthetic_edge_case_suite()
    assert len(cases) == 9
    assert all(c["passed"] for c in cases)
    assert all(c["data_origin"] == "SYNTHETIC_SOFTWARE_TEST_FIXTURE" for c in cases)
    assert all(c["details"]["clean_control_zero_false_positives"] is True for c in cases)

    # Sub-step irregular forward gap detection (expected_step_ms < diff < 2 * expected_step_ms)
    day_ms = 86_400_000
    base = 1_704_067_200_000
    sub_gaps = g2_mod.detect_missing_candles([base, base + day_ms, base + 2 * day_ms + 43_200_000], day_ms)
    assert len(sub_gaps) == 1
    assert sub_gaps[0]["missing_bars"] == 0
    assert sub_gaps[0]["irregular_step_ms"] == day_ms + 43_200_000
    assert g2_mod.detect_missing_candles([base + i * day_ms for i in range(4)], day_ms) == []

    # Artifact invariants
    g2 = _load("g2_data_provenance.json")
    pq = g2["committed_provenance_parquet"]
    assert pq["row_count"] == 7808
    assert pq["column_count"] == 17
    assert len(pq["sha256"]) == 64
    assert pq["symbol_coverage"]["binance_symbol_count"] == 23
    assert pq["symbol_coverage"]["delisted_symbol_count"] == 4
    assert set(pq["symbol_coverage"]["delisted_symbols"]) == {
        "EOSUSDT",
        "FTMUSDT",
        "MATICUSDT",
        "MKRUSDT",
    }
    assert g2["local_gitignored_datasets"]["local_data_status"] == "BLOCKED_MISSING_DATA"
    assert g2["local_gitignored_datasets"]["affected_pytest_count"] == 5


def test_g3_dual_env_determinism_live_and_artifact() -> None:
    # Live execution twice in-process
    r1 = g3_mod.run_deterministic_replay()
    r2 = g3_mod.run_deterministic_replay()
    assert r1["output_sha256"] == r2["output_sha256"]
    assert r1["production_h3_positions_sha256"] == r2["production_h3_positions_sha256"]
    assert r1["signed_strategy_spec_verified"] is True
    assert r1["production_h3_nonzero_position_days"] > 0

    # Artifact invariants (20 subprocesses across 2 virtualenvs)
    g3 = _load("g3_signal_determinism.json")
    assert g3["data_origin"] == "SYNTHETIC_SOFTWARE_TEST_FIXTURE"
    assert g3["llm_in_path"] is False
    assert g3["runs_per_env"] == 10
    assert g3["total_runs"] == 20
    assert g3["unique_output_hash_count"] == 1
    assert g3["identical_across_all_runs"] is True
    assert g3["signed_strategy_spec_verified"] is True
    assert g3["verdict"] == "PASS_100_PCT_IDENTICAL"
    assert len(g3["canonical_output_sha256"]) == 64
    assert len(g3["production_h3_positions_sha256"]) == 64
    assert len({r["pid"] for r in g3["runs"]}) == 20


def test_g4_leakage_live_production_h3_and_adversarial() -> None:
    # Live prefix-invariance on real production h3_basis_carry.build_positions_maker
    panel = g4_mod.generate_synthetic_panel(seed=7, n_bars=80)
    ok_prod, fail_t = g4_mod.check_prefix_invariance(
        panel, g4_mod.compute_production_h3_maker_positions, [15, 30, 45, 60]
    )
    assert ok_prod is True and fail_t is None

    # Live monotonic timestamp ingestion guard (G4-LV-10)
    with pytest.raises(ValueError, match="NON_MONOTONIC_TIMESTAMPS"):
        g4_mod.compute_clean_causal_signal(list(reversed(panel)))

    # Live adversarial suite (all 10 vectors caught)
    adv_live = g4_mod.run_adversarial_leakage_suite(panel)
    assert len(adv_live) == 10
    assert all(v["leakage_detected"] for v in adv_live)

    # Artifact invariants
    g4 = _load("g4_independent_leakage_audit.json")
    assert g4["data_origin"] == "SYNTHETIC_SOFTWARE_TEST_FIXTURE"
    assert g4["verdict"] == "PASS"
    assert g4["clean_causal_prefix_invariance"]["passed_seeds"] == 50
    assert g4["production_h3_maker_prefix_invariance"]["passed_seeds"] == 50
    assert g4["adversarial_leakage_detection"]["detected_vectors"] == 10
    assert g4["purged_embargoed_split_verification"]["valid"] is True


def test_g5_statistical_live_registry_tamper_and_dsr(tmp_path: Path) -> None:
    # Live verification of real trial_registry.jsonl
    reg_live = g5_mod.verify_trial_registry(g5_mod.REGISTRY_PATH)
    assert reg_live["total_trials"] == 185
    assert reg_live["hash_chain_verified"] is True
    assert reg_live["zero_invisible_deletions_confirmed"] is True

    # Tamper test: mutate a single trial Sharpe in a temp copy -> must fail closed
    raw_lines = g5_mod.REGISTRY_PATH.read_text(encoding="utf-8").splitlines()
    tampered_entry = json.loads(raw_lines[10])
    tampered_entry["sharpe"] = float(tampered_entry["sharpe"]) + 0.01
    raw_lines[10] = json.dumps(tampered_entry, sort_keys=True, separators=(",", ":"))
    tampered_path = tmp_path / "tampered_trial_registry.jsonl"
    tampered_path.write_text("\n".join(raw_lines) + "\n", encoding="utf-8")
    tampered_res = g5_mod.verify_trial_registry(tampered_path)
    assert tampered_res["hash_chain_verified"] is False
    assert tampered_res["first_bad_seq"] == 11
    assert tampered_res["zero_invisible_deletions_confirmed"] is False

    # Live DSR & independent registry variance recomputation
    reg_var = g5_mod.compute_registry_sr_variance(g5_mod.REGISTRY_PATH, periods_per_year=365)
    assert reg_var["n_trials"] == 185
    assert reg_var["trial_sr_variance_per_period_ddof1"] > 0
    dsr_live = g5_mod.recompute_dsr_bailey_ldp(
        observed_sr_ann=2.3476,
        sr_se_ann=0.25,
        trial_sr_var_per_period=reg_var["trial_sr_variance_per_period_ddof1"],
        n_trials=185,
        periods_per_year=365,
    )
    assert 0.0 <= dsr_live["dsr_recomputed"] <= 1.0

    # Artifact invariants
    g5 = _load("g5_independent_statistical_audit.json")
    assert g5["verdict"]["empirical_randomized_entry_status"] == "BLOCKED_MISSING_DATA"
    assert g5["randomized_entry_controls"]["h3_maker_regime_randomized_entry"]["data_origin"] == "SYNTHETIC_SOFTWARE_TEST_FIXTURE"
    assert g5["h3_maker_statistical_verification"]["dsr_verified"] is True
    assert "independent_registry_variance_recomputation" in g5["h3_maker_statistical_verification"]
    assert g5["holdout_quarantine_and_prospective_registration"]["prospective_oos_status"] == "PENDING_FRESH_OOS"


def test_g6_decimal_oracle_live_invariants_and_artifact() -> None:
    t0 = 1_704_067_200_000
    day_ms = 86_400_000
    qty = Decimal("0.25000000")
    p0 = Decimal("40000.00000000")

    # 1. Maker zero-half-spread / zero-slippage rule enforced
    with pytest.raises(ValueError, match="MAKER_FILL_CANNOT_CHARGE_HALF_SPREAD_OR_SLIPPAGE"):
        g6_mod.LegFill(
            "BAD-MAKER", t0, "hyperliquid", "spot", "BUY", "maker",
            qty, p0, p0, Decimal("4.0"), Decimal("1.0"), Decimal("0"), Decimal("1.5"),
        )

    # 2. Unclosed position mismatch rejected when require_closed=True
    with pytest.raises(ValueError, match="UNCLOSED_POSITION_MISMATCH"):
        g6_mod.reconcile_two_leg_cycle(
            scenario_id="TEST-MISMATCH",
            name="mismatched_exit_qty",
            spot_entry=g6_mod.LegFill("SE", t0, "hyperliquid", "spot", "BUY", "maker", qty, p0, p0, Decimal("4.0"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            perp_entry=None,
            spot_exit=g6_mod.LegFill("SX", t0 + day_ms, "hyperliquid", "spot", "SELL", "maker", Decimal("0.20000000"), p0, p0, Decimal("4.0"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            perp_exit=None,
            funding_cash_flow_usd=Decimal("0"),
            borrow_apr=Decimal("0"),
        )

    # 3. Live borrow sensitivity calibrated to G6 median venue funding
    borrow_live = g6_mod.run_borrow_rate_sensitivity(g6_mod.G6_ARTIFACT_PATH)
    hl_by_apr = {r["borrow_apr_pct"]: r for r in borrow_live["hyperliquid"]}
    bn_by_apr = {r["borrow_apr_pct"]: r for r in borrow_live["binance"]}
    assert hl_by_apr[0]["net_positive"] is True
    assert hl_by_apr[10]["net_positive"] is False  # ~9.84% HL funding turns negative at 10% borrow
    assert bn_by_apr[5]["net_positive"] is False   # ~4.43% Binance funding turns negative at 5% borrow

    # 4. Artifact invariants
    g6 = _load("g6_independent_execution_audit.json")
    tca = g6["committed_tca_verification"]
    assert tca["decimal_recomputation_parity_ok"] is True
    assert tca["venues"]["hyperliquid"]["scopes"]["full_sample"]["at_floor"]["n_trades"] == 9
    assert tca["venues"]["hyperliquid"]["scopes"]["locked_oos"]["at_floor"]["n_trades"] == 3
    assert tca["key_invariants"]["binance_oos_2x_negative"] is True
    assert tca["key_invariants"]["hyperliquid_oos_2x_positive_thin_at_ceiling"] is True
    assert tca["key_invariants"]["hyperliquid_oos_3x_negative"] is True

    oracle = g6["decimal_two_leg_oracle"]
    assert oracle["failure_modes_reconciled_zero_residual"] == 10
    assert oracle["all_reconciled_zero_residual"] is True
    for fm in oracle["failure_modes"]:
        assert Decimal(fm["pnl_components"]["reconciliation_residual_usd"]) == Decimal("0.00000000")
        assert Decimal(fm["ledger_state"]["spot_position_qty"]) == Decimal("0")
        assert Decimal(fm["ledger_state"]["perp_position_qty"]) == Decimal("0")
        assert Decimal(fm["ledger_state"]["net_delta_qty"]) == Decimal("0")
    assert g6["external_engine_parity"]["NautilusTrader"] == "NOT_VERIFIED"
    assert g6["external_engine_parity"]["HftBacktest"] == "NOT_VERIFIED"
