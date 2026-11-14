"""Append-only trial registry.

The audit's central statistical objection is that a Sharpe ratio was quoted
without the search that produced it: no record of how many configurations were
tried, so the reported number cannot be deflated. This ledger exists so N is a
measured quantity rather than a guess.

Two properties make it usable as evidence:

* Append-only. Records are written with O_APPEND and never rewritten, so a trial
  cannot be deleted after it disappoints.
* Hash-chained. Each record carries the SHA-256 of the previous record, so a
  back-dated or removed entry breaks the chain and the verification fails loudly.

A failing trial is still a trial. Recording only the winners would understate N
and flatter the survivor, which is the exact bias being corrected.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path


GENESIS = "0" * 64


@dataclass(frozen=True)
class TrialRecord:
    seq: int
    recorded_at: str
    hypothesis: str
    params: dict[str, float | int | str]
    window: str
    sharpe: float
    cum_net: float
    cum_gross: float
    cum_cost: float
    break_even_multiple: float
    mean_turnover: float
    days: int
    status: str
    note: str = ""


@dataclass
class TrialRegistry:
    path: Path
    _count: int = 0
    _head: str = GENESIS
    _records: list[dict] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            self._replay()
        else:
            self.path.touch()

    def _replay(self) -> None:
        prev = GENESIS
        for line in self.path.read_text().splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            claimed = entry.pop("prev_hash", None)
            if claimed != prev:
                raise RuntimeError(
                    f"registry chain broken at seq {entry.get('seq')}: "
                    f"prev_hash {str(claimed)[:12]} != {prev[:12]}"
                )
            if "hash" not in entry:
                # A hand-appended or truncated line has no digest of its own, so
                # there is no link to follow. Say so, rather than dying on the
                # missing key: the reader needs to know the ledger is untrustworthy,
                # not that a dict lookup failed.
                raise RuntimeError(
                    f"registry record at seq {entry.get('seq')} carries no hash; "
                    "the line was not written by the ledger"
                )
            prev = entry["hash"]
            self._records.append(entry)
            self._count += 1
        self._head = prev

    def record(self, trial: TrialRecord) -> str:
        payload = asdict(trial)
        payload["prev_hash"] = self._head
        blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        digest = hashlib.sha256(blob).hexdigest()
        payload["hash"] = digest
        line = json.dumps(payload, sort_keys=True, separators=(",", ":"))

        with self.path.open("a") as handle:
            handle.write(line + "\n")
            handle.flush()
            os.fsync(handle.fileno())

        self._head = digest
        self._count += 1
        self._records.append(payload)
        return digest

    @property
    def count(self) -> int:
        return self._count

    @property
    def head(self) -> str:
        return self._head

    def records(self) -> list[dict]:
        return list(self._records)

    def for_hypothesis(self, name: str) -> list[dict]:
        return [r for r in self._records if r["hypothesis"] == name]

    def verify(self) -> bool:
        """Recompute the chain from disk; False if any record was tampered with."""
        prev = GENESIS
        for line in self.path.read_text().splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            claimed_prev = entry.pop("prev_hash", None)
            claimed_hash = entry.pop("hash", None)
            if claimed_hash is None or claimed_prev != prev:
                return False
            # The digest covers every field plus the predecessor link, so it must
            # be recomputed with prev_hash still in the payload.
            entry["prev_hash"] = claimed_prev
            blob = json.dumps(entry, sort_keys=True, separators=(",", ":")).encode()
            if hashlib.sha256(blob).hexdigest() != claimed_hash:
                return False
            prev = claimed_hash
        return True


def now() -> str:
    return datetime.now(timezone.utc).isoformat()
