"""Negative and immutability tests for H3_BASIS_CARRY_V2 OOS registration."""

from __future__ import annotations

import copy
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO / "verification_lab" / "scripts" / "register_h3_v2_prospective_oos.py"

_spec = importlib.util.spec_from_file_location("register_h3_v2_prospective_oos", SCRIPT_PATH)
assert _spec is not None and _spec.loader is not None
reg_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(reg_mod)


def test_existing_registration_is_verified_without_modifying_any_byte() -> None:
    before_bytes = reg_mod.OUT_PATH.read_bytes()
    result = reg_mod.verify_existing_registration(reg_mod.OUT_PATH)
    after_bytes = reg_mod.OUT_PATH.read_bytes()

    assert before_bytes == after_bytes
    assert result["verified"] is True
    assert result["artifact_sha256"] == reg_mod.ORIGINAL_REGISTRATION_SHA256
    assert result["spec_sha256"] == reg_mod.ORIGINAL_FROZEN_SPEC_SHA256
    assert result["prior_family_trial_count"] == 185
    assert result["v2_trial_seq"] == 1
    assert result["cumulative_family_trials"] == 186


def test_write_once_rejects_overwrite_of_existing_file(tmp_path: Path) -> None:
    target = tmp_path / "registration.json"
    now_pre = datetime(2026, 11, 22, 12, 0, 0, tzinfo=timezone.utc)
    reg_mod.write_once_registration(target, reg_mod.FROZEN_V2_SPEC, now_utc=now_pre)
    original_bytes = target.read_bytes()

    with pytest.raises(reg_mod.RegistrationOverwriteError):
        reg_mod.write_once_registration(target, reg_mod.FROZEN_V2_SPEC, now_utc=now_pre)

    assert target.read_bytes() == original_bytes


def test_parameter_tampering_rejected_against_published_spec_hash(tmp_path: Path) -> None:
    tampered = copy.deepcopy(reg_mod.FROZEN_V2_SPEC)
    tampered["signal_parameters_frozen"]["entry_annual_bps"] = 500.0
    now_pre = datetime(2026, 11, 22, 12, 0, 0, tzinfo=timezone.utc)

    with pytest.raises(reg_mod.SpecHashMismatchError):
        reg_mod.write_once_registration(
            tmp_path / "tampered.json",
            tampered,
            now_utc=now_pre,
            expected_spec_sha256=reg_mod.ORIGINAL_FROZEN_SPEC_SHA256,
        )


def test_post_window_registration_rejected(tmp_path: Path) -> None:
    post_window_now = datetime(2026, 11, 23, 0, 0, 1, tzinfo=timezone.utc)
    with pytest.raises(reg_mod.PostWindowRegistrationError):
        reg_mod.write_once_registration(
            tmp_path / "post_window.json",
            reg_mod.FROZEN_V2_SPEC,
            now_utc=post_window_now,
        )


def test_backdating_registration_date_rejected(tmp_path: Path) -> None:
    backdated = copy.deepcopy(reg_mod.FROZEN_V2_SPEC)
    backdated["prospective_oos_window"]["registration_date_utc"] = "2026-11-20T00:00:00Z"
    now_later = datetime(2026, 11, 22, 10, 0, 0, tzinfo=timezone.utc)

    with pytest.raises(reg_mod.RegistrationBackdateError):
        reg_mod.write_once_registration(
            tmp_path / "backdated.json",
            backdated,
            now_utc=now_later,
            expected_spec_sha256=None,
        )


def test_mismatched_artifact_hash_rejected(tmp_path: Path) -> None:
    mutated_path = tmp_path / "mutated_reg.json"
    data = json.loads(reg_mod.OUT_PATH.read_text(encoding="utf-8"))
    data["generated_at_utc"] = "2026-11-22T23:59:59+00:00"
    mutated_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    with pytest.raises(reg_mod.ArtifactIntegrityError):
        reg_mod.verify_existing_registration(mutated_path)
