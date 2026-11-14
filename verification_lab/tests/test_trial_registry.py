"""The trial registry is evidence, so its guarantees must be testable.

Every statistic in G5 is conditioned on N, and N comes from this ledger. If a
record could be removed, reordered, or edited without detection, the deflation
would be self-reported: an analyst could delete the trials that disappointed and
report a smaller, flattering N. These tests attack the ledger from the directions
that would matter.
"""

from __future__ import annotations

import json

import pytest

from verification_lab.runner.trial_registry import GENESIS, TrialRecord, TrialRegistry


def _trial(seq: int, *, hypothesis: str = "H1", sharpe: float = 0.5) -> TrialRecord:
    return TrialRecord(
        seq=seq,
        recorded_at="2026-10-31T00:00:00+00:00",
        hypothesis=hypothesis,
        params={"lookback": 7, "entry_band": 0.6},
        window="train",
        sharpe=sharpe,
        cum_net=0.1,
        cum_gross=0.2,
        cum_cost=0.1,
        break_even_multiple=2.0,
        mean_turnover=0.05,
        days=100,
        status="completed",
    )


def test_empty_registry_starts_at_genesis(tmp_path):
    reg = TrialRegistry(tmp_path / "trials.jsonl")
    assert reg.count == 0
    assert reg.head == GENESIS
    assert reg.verify() is True


def test_recording_advances_count_and_head(tmp_path):
    reg = TrialRegistry(tmp_path / "trials.jsonl")
    first = reg.record(_trial(1))
    assert reg.count == 1
    assert reg.head == first != GENESIS
    second = reg.record(_trial(2))
    assert reg.count == 2
    assert reg.head == second != first


def test_reopening_replays_the_same_chain(tmp_path):
    """A registry reloaded from disk must report the same count and head."""
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    for i in range(1, 4):
        reg.record(_trial(i))
    count, head = reg.count, reg.head

    reopened = TrialRegistry(path)
    assert reopened.count == count
    assert reopened.head == head
    assert reopened.verify() is True


def test_failures_are_recorded_like_any_other_trial(tmp_path):
    """A failed run is still a trial; dropping it would understate N."""
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    reg.record(_trial(1))
    failed = _trial(2)
    failed = TrialRecord(**{**failed.__dict__, "status": "failed", "note": "ValueError"})
    reg.record(failed)

    reopened = TrialRegistry(path)
    assert reopened.count == 2
    statuses = [r["status"] for r in reopened.records()]
    assert statuses == ["completed", "failed"]


def test_per_hypothesis_filter_does_not_change_the_total(tmp_path):
    reg = TrialRegistry(tmp_path / "trials.jsonl")
    reg.record(_trial(1, hypothesis="H1"))
    reg.record(_trial(2, hypothesis="H2"))
    reg.record(_trial(3, hypothesis="H1"))
    assert reg.count == 3
    assert len(reg.for_hypothesis("H1")) == 2
    assert len(reg.for_hypothesis("H2")) == 1


def test_editing_a_record_breaks_verification(tmp_path):
    """Flattering a Sharpe after the fact must be detectable."""
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    reg.record(_trial(1, sharpe=0.1))
    reg.record(_trial(2, sharpe=0.2))

    lines = path.read_text().splitlines()
    entry = json.loads(lines[0])
    entry["sharpe"] = 9.99
    lines[0] = json.dumps(entry, sort_keys=True, separators=(",", ":"))
    path.write_text("\n".join(lines) + "\n")

    assert TrialRegistry(path).verify() is False


def test_removing_a_record_is_refused_at_open(tmp_path):
    """Deleting the disappointing middle trial must not go unnoticed.

    The ledger is caught at load time, not only by an explicit verify(): a
    register that silently replayed a denuded history would let a subsequent
    count be trusted when it should not be.
    """
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    for i in range(1, 4):
        reg.record(_trial(i))

    lines = path.read_text().splitlines()
    path.write_text("\n".join([lines[0], lines[2]]) + "\n")

    with pytest.raises(RuntimeError, match="chain broken"):
        TrialRegistry(path)


def test_reordering_records_is_refused_at_open(tmp_path):
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    for i in range(1, 4):
        reg.record(_trial(i))

    lines = path.read_text().splitlines()
    path.write_text("\n".join([lines[1], lines[0], lines[2]]) + "\n")

    with pytest.raises(RuntimeError, match="chain broken"):
        TrialRegistry(path)


def test_appending_a_forged_record_is_refused_at_open(tmp_path):
    """A hand-written line that skips the chain must be caught, with a clear reason."""
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    reg.record(_trial(1))
    head = reg.head

    forged = _trial(2)
    payload = dict(forged.__dict__)
    payload["prev_hash"] = head
    forged_line = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    with path.open("a") as handle:
        handle.write(forged_line + "\n")

    with pytest.raises(RuntimeError, match="carries no hash"):
        TrialRegistry(path)


def test_verify_rejects_a_record_missing_its_digest(tmp_path):
    """verify() must answer False rather than raising on a malformed line."""
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    reg.record(_trial(1))

    entry = json.loads(path.read_text().splitlines()[0])
    entry.pop("hash")
    path.write_text(json.dumps(entry, sort_keys=True, separators=(",", ":")) + "\n")

    # Reopening raises; verification over the same bytes must return False.
    probe = TrialRegistry.__new__(TrialRegistry)
    probe.path = path
    assert probe.verify() is False


def test_a_broken_chain_refuses_to_open(tmp_path):
    """Replay must fail loudly rather than silently starting a new ledger."""
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    reg.record(_trial(1))
    reg.record(_trial(2))

    lines = path.read_text().splitlines()
    entry = json.loads(lines[1])
    entry["prev_hash"] = GENESIS
    lines[1] = json.dumps(entry, sort_keys=True, separators=(",", ":"))
    path.write_text("\n".join(lines) + "\n")

    with pytest.raises(RuntimeError, match="chain broken"):
        TrialRegistry(path)


def test_each_record_carries_its_predecessor_hash(tmp_path):
    """The chain link must actually be the previous digest, not a constant."""
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    first = reg.record(_trial(1))
    reg.record(_trial(2))

    records = reg.records()
    assert records[0]["prev_hash"] == GENESIS
    assert records[1]["prev_hash"] == first


def test_blank_lines_do_not_break_the_chain(tmp_path):
    """A trailing newline or an interrupted write must not invalidate history."""
    path = tmp_path / "trials.jsonl"
    reg = TrialRegistry(path)
    reg.record(_trial(1))
    with path.open("a") as handle:
        handle.write("\n\n")
    reg.record(_trial(2))

    assert TrialRegistry(path).verify() is True
    assert TrialRegistry(path).count == 2
