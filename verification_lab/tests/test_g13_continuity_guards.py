"""Continuity and early auto-kill invariant guards for paper-forward checkpoint evaluation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load_paper_forward_script():
    spec = importlib.util.spec_from_file_location(
        "g13_paper_forward", SCRIPTS / "g13_paper_forward.py"
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules["g13_paper_forward"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_evaluate_checkpoints_refuses_non_contiguous_day_jump_to_day61():
    mod = _load_paper_forward_script()
    shadow_ok = {
        "harness_shadow_tracking_error_bps_per_month": 0.05,
        "passes_15bps_per_month_gate": True,
    }
    snap_stub = {"observed_at_utc": "2026-11-14T00:00:00Z", "orders_submitted": 0}

    sparse_jump_checkpoints = [
        {
            "checkpoint_index": 0,
            "day_offset": 0,
            "observed_at_utc": "2026-11-14T00:00:00Z",
            "paper_nav": 1.0,
            "oracle_nav": 1.0,
        },
        {
            "checkpoint_index": 1,
            "day_offset": 61,
            "observed_at_utc": "2027-01-14T00:00:00Z",
            "paper_nav": 1.0121,
            "oracle_nav": 1.0120,
        },
    ]

    result = mod.evaluate_g13_checkpoints(
        spec_path_rel="artifacts/signed_strategy_spec_h3_maker.json",
        spec_sha256="a" * 64,
        genesis_utc="2026-11-14T00:00:00Z",
        checkpoints=sparse_jump_checkpoints,
        harness_shadow_parity_check=shadow_ok,
        day0_live_public_snapshot=snap_stub,
    )
    assert result["g13_pass"] is False
    assert result["status"] != "PASS"
    assert "FAIL" in result["status"]


def test_evaluate_checkpoints_triggers_early_auto_kill_when_tracking_error_reaches_25bps_before_day60():
    mod = _load_paper_forward_script()
    shadow_ok = {
        "harness_shadow_tracking_error_bps_per_month": 0.05,
        "passes_15bps_per_month_gate": True,
    }
    genesis = datetime(2026, 11, 14, 0, 0, 0, tzinfo=timezone.utc)
    snap_stub = {"observed_at_utc": "2026-11-14T00:00:00Z", "orders_submitted": 0}

    # 10 contiguous daily checkpoints (Day 0..Day 10 = 1/3 month) with 10 bps cumulative drift -> 30.0 bps/month (>= 25.0)
    contiguous_cps = []
    for day in range(11):
        obs_iso = (genesis + timedelta(days=day)).isoformat().replace("+00:00", "Z")
        contiguous_cps.append(
            {
                "checkpoint_index": day,
                "day_offset": day,
                "observed_at_utc": obs_iso,
                "paper_nav": round(1.0 + 0.0001 * day, 8),
                "oracle_nav": 1.0,
            }
        )

    result = mod.evaluate_g13_checkpoints(
        spec_path_rel="artifacts/signed_strategy_spec_h3_maker.json",
        spec_sha256="a" * 64,
        genesis_utc="2026-11-14T00:00:00Z",
        checkpoints=contiguous_cps,
        harness_shadow_parity_check=shadow_ok,
        day0_live_public_snapshot=snap_stub,
    )
    assert result["elapsed_days"] == 10
    assert result["realized_tracking_error_bps_per_month"] == pytest.approx(30.0, abs=1e-4)
    assert result["g13_pass"] is False
    assert result.get("auto_kill_triggered") is True
    assert "FAIL" in result["status"] and "AUTO_KILL" in result["status"]
