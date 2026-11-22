"""Crash-safe, append-only local evidence ledger with SHA-256 hash chaining.

Design principles:
- Local hash chain provides tamper evidence relative to a trusted anchor;
  it does NOT independently prove external exchange authenticity.
- Source authenticity is recorded separately from local file integrity.
- Atomic temp + fsync + replace for raw response bytes and WAL recovery.
- Never overwrites an accepted record; rejects duplicates and flags same-day conflicts.
- Partial-write or corrupt ledger lines fail closed without advancing the day counter.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Sequence

SAFE_PATH_SEGMENT_RE = re.compile(r"[^A-Za-z0-9._-]")

GENESIS_PREVIOUS_RECORD_SHA256 = "0" * 64
VALIDATOR_VERSION = "h3_v2_passive_oos_v1.0.0"

# Distinct provenance classifications (never conflate local integrity with external attestation)
LOCAL_INTEGRITY_INTACT = "FILE_INTERNALLY_INTACT"
LOCAL_INTEGRITY_FAILED = "FILE_INTEGRITY_FAILED"
SOURCE_AUTHENTICITY_LOCAL_CAPTURE = "SOURCE_CAPTURED_LOCAL_UNAUTHENTICATED"
HISTORICAL_PARQUET_PROVENANCE = "HASH_RECORDED_UNVERIFIED"
NORMALIZED_REPRODUCIBLE = "NORMALIZED_OUTPUT_REPRODUCIBLE"
NORMALIZED_NOT_REPRODUCED = "NORMALIZED_OUTPUT_NOT_REPRODUCED"


class EvidenceStoreError(RuntimeError):
    """Fail-closed error raised on duplicate, tamper, or crash-recovery violations."""


class DuplicateRecordError(EvidenceStoreError):
    """Raised when attempting to overwrite or duplicate an already accepted record."""


class PartialWriteRecoveryError(EvidenceStoreError):
    """Raised when an uncommitted WAL or truncated ledger line is detected."""


def canonical_json_bytes(payload: Any) -> bytes:
    """Deterministic UTF-8 canonical JSON serialization."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sanitize_segment(value: str, label: str) -> str:
    cleaned = SAFE_PATH_SEGMENT_RE.sub("_", value.strip())
    if not cleaned or cleaned in {".", ".."} or ".." in cleaned:
        raise EvidenceStoreError(f"invalid_path_segment ({label}={value!r})")
    return cleaned


def _atomic_write_bytes(dest: Path, data: bytes, *, allow_overwrite: bool = False) -> None:
    """Write bytes atomically via temp file + fsync + os.replace."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not allow_overwrite:
        raise DuplicateRecordError(f"refusing_to_overwrite_existing_file ({dest})")
    fd, tmp_name = tempfile.mkstemp(prefix=f".{dest.name}.", suffix=".tmp", dir=str(dest.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, dest)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise


@dataclass(frozen=True)
class LedgerRecord:
    record_id: str
    strategy_id: str
    observation_day_utc: str
    captured_at_utc: str
    available_at_utc: str
    venue: str
    instrument: str
    raw_source_id: str
    raw_sha256: str
    normalized_sha256: str
    frozen_spec_sha256: str
    previous_record_sha256: str
    record_sha256: str
    validator_version: str
    eligibility_status: str
    rejection_reasons: list[str]
    raw_relpath: str
    local_integrity_status: str
    source_authenticity_status: str
    reproducibility_status: str
    synthetic_fixture: bool
    normalized_observation: dict[str, Any]
    offline_replay_result: dict[str, Any] | None
    raw_venue_files: list[dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def compute_record_sha256(record_without_hash: dict[str, Any]) -> str:
    """Compute SHA-256 over canonical record fields excluding ``record_sha256``."""
    body = {k: v for k, v in record_without_hash.items() if k != "record_sha256"}
    return sha256_bytes(canonical_json_bytes(body))


@dataclass(frozen=True)
class ChainVerificationReport:
    intact: bool
    record_count: int
    local_integrity_status: str
    source_authenticity_status: str
    errors: list[str]
    head_record_sha256: str
    has_uncommitted_wal: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AppendOnlyEvidenceStore:
    """Append-only local evidence store for passive prospective OOS captures."""

    def __init__(self, store_dir: Path) -> None:
        self.store_dir = Path(store_dir)
        self.raw_dir = self.store_dir / "raw"
        self.ledger_path = self.store_dir / "ledger.jsonl"
        self.wal_path = self.store_dir / "ledger.wal"

    def _ensure_layout(self) -> None:
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def _read_raw_lines_checked(self) -> list[dict[str, Any]]:
        if not self.ledger_path.exists():
            return []
        raw_text = self.ledger_path.read_text(encoding="utf-8")
        if not raw_text:
            return []
        if not raw_text.endswith("\n"):
            raise PartialWriteRecoveryError("ledger_trailing_partial_line_detected")
        records: list[dict[str, Any]] = []
        for idx, line in enumerate(raw_text.splitlines()):
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError as exc:
                raise PartialWriteRecoveryError(f"corrupt_ledger_json_at_line_{idx + 1}: {exc}") from exc
            if not isinstance(parsed, dict):
                raise PartialWriteRecoveryError(f"non_object_ledger_entry_at_line_{idx + 1}")
            records.append(parsed)
        return records

    def _resolve_contained_raw_path(self, relpath: str) -> Path | None:
        """Resolve a relative path strictly inside ``self.raw_dir``; return None on traversal."""
        if not relpath or relpath.startswith("/") or "\\" in relpath:
            return None
        try:
            raw_root = self.raw_dir.resolve()
            candidate = (self.store_dir / relpath).resolve()
            if candidate == raw_root or not candidate.is_relative_to(raw_root):
                return None
            if candidate.exists() and not candidate.is_file():
                return None
            return candidate
        except (OSError, ValueError):
            return None

    def _committed_raw_relpaths(self, existing: Sequence[dict[str, Any]]) -> set[str]:
        committed: set[str] = set()
        for rec in existing:
            rel = rec.get("raw_relpath")
            if isinstance(rel, str) and rel:
                committed.add(rel)
            for vf in rec.get("raw_venue_files") or []:
                if isinstance(vf, dict) and isinstance(vf.get("relpath"), str):
                    committed.add(vf["relpath"])
        return committed

    def recover_if_needed(self) -> dict[str, Any]:
        """Inspect WAL and ledger for partial writes; clean uncommitted orphan raw files without advancing counters."""
        actions: list[str] = []
        wal_present = self.wal_path.exists()
        if wal_present:
            wal_text = self.wal_path.read_text(encoding="utf-8").strip()
            existing = self._read_raw_lines_checked()
            committed_paths = self._committed_raw_relpaths(existing)
            if wal_text:
                try:
                    wal_record = json.loads(wal_text)
                except json.JSONDecodeError:
                    # Truncated WAL before commit: safe to remove orphan WAL, ledger untouched.
                    self.wal_path.unlink(missing_ok=True)
                    actions.append("discarded_truncated_uncommitted_wal")
                else:
                    wal_id = wal_record.get("record_id")
                    if any(r.get("record_id") == wal_id for r in existing):
                        # Already committed to ledger before crash removed WAL.
                        self.wal_path.unlink(missing_ok=True)
                        actions.append(f"cleaned_already_committed_wal ({wal_id})")
                    else:
                        # Uncommitted WAL: remove any unreferenced orphan raw files so retry is not blocked.
                        orphan_rels: list[str] = []
                        wal_raw = wal_record.get("raw_relpath")
                        if isinstance(wal_raw, str) and wal_raw:
                            orphan_rels.append(wal_raw)
                        for vf in wal_record.get("raw_venue_files") or []:
                            if isinstance(vf, dict) and isinstance(vf.get("relpath"), str):
                                orphan_rels.append(vf["relpath"])
                        for rel in orphan_rels:
                            if rel not in committed_paths:
                                resolved = self._resolve_contained_raw_path(rel)
                                if resolved is not None and resolved.exists():
                                    resolved.unlink(missing_ok=True)
                                    actions.append(f"removed_uncommitted_orphan_raw ({rel})")
                        self.wal_path.unlink(missing_ok=True)
                        actions.append(f"aborted_uncommitted_wal_without_advancing_ledger ({wal_id})")
            else:
                self.wal_path.unlink(missing_ok=True)
                actions.append("removed_empty_wal")
        return {"wal_found": wal_present, "actions": actions}

    def list_records(self) -> list[dict[str, Any]]:
        return self._read_raw_lines_checked()

    def append_record(
        self,
        *,
        record_id: str,
        strategy_id: str,
        observation_day_utc: str,
        captured_at_utc: str,
        available_at_utc: str,
        venue: str,
        instrument: str,
        raw_source_id: str,
        raw_bytes: bytes,
        normalized_observation: dict[str, Any],
        frozen_spec_sha256: str,
        eligibility_status: str,
        rejection_reasons: Sequence[str],
        offline_replay_result: dict[str, Any] | None = None,
        source_authenticity_status: str = SOURCE_AUTHENTICITY_LOCAL_CAPTURE,
        reproducibility_status: str = NORMALIZED_NOT_REPRODUCED,
        synthetic_fixture: bool = False,
        validator_version: str = VALIDATOR_VERSION,
        raw_venue_envelopes: Sequence[tuple[str, str, bytes]] | None = None,
    ) -> LedgerRecord:
        """Append one immutable record with atomic raw-byte preservation and WAL commit.

        ``raw_venue_envelopes`` is an optional sequence of ``(raw_source_id, endpoint_url, raw_bytes)``
        tuples for verbatim venue HTTP response preservation.
        """
        if not raw_bytes:
            raise EvidenceStoreError("missing_or_empty_raw_bytes")
        if self.wal_path.exists():
            raise PartialWriteRecoveryError("unrecovered_wal_present_run_recover_first")

        self._ensure_layout()
        existing = self._read_raw_lines_checked()
        committed_paths = self._committed_raw_relpaths(existing)

        for rec in existing:
            if rec.get("record_id") == record_id:
                raise DuplicateRecordError(f"duplicate_record_id ({record_id})")
            if (
                rec.get("observation_day_utc") == observation_day_utc
                and rec.get("venue") == venue
                and rec.get("instrument") == instrument
                and rec.get("eligibility_status") == "ELIGIBLE"
                and eligibility_status == "ELIGIBLE"
            ):
                raise DuplicateRecordError(
                    f"duplicate_accepted_day ({observation_day_utc}, {venue}, {instrument})"
                )

        prev_hash = existing[-1]["record_sha256"] if existing else GENESIS_PREVIOUS_RECORD_SHA256
        raw_hash = sha256_bytes(raw_bytes)
        norm_hash = sha256_bytes(canonical_json_bytes(normalized_observation))

        safe_day = _sanitize_segment(observation_day_utc, "observation_day_utc")
        safe_id = _sanitize_segment(record_id, "record_id")
        raw_relpath = f"raw/{safe_day}/{safe_id}.bin"
        raw_abs = self._resolve_contained_raw_path(raw_relpath)
        if raw_abs is None:
            raise EvidenceStoreError(f"raw_relpath_escapes_store ({raw_relpath})")

        # Allow idempotent reuse only if an unreferenced orphan file already has identical SHA-256.
        if raw_abs.exists():
            if raw_relpath not in committed_paths and sha256_bytes(raw_abs.read_bytes()) == raw_hash:
                pass
            else:
                raise DuplicateRecordError(f"refusing_to_overwrite_existing_file ({raw_abs})")
        else:
            _atomic_write_bytes(raw_abs, raw_bytes, allow_overwrite=False)

        raw_venue_files: list[dict[str, str]] = []
        for idx, (env_source_id, env_url, env_bytes) in enumerate(raw_venue_envelopes or []):
            if not env_bytes:
                raise EvidenceStoreError(f"empty_raw_venue_envelope_bytes ({env_source_id})")
            env_sha = sha256_bytes(env_bytes)
            env_rel = f"raw/{safe_day}/{safe_id}_env{idx:02d}_{env_sha[:12]}.bin"
            env_abs = self._resolve_contained_raw_path(env_rel)
            if env_abs is None:
                raise EvidenceStoreError(f"raw_venue_relpath_escapes_store ({env_rel})")
            if env_abs.exists():
                if env_rel not in committed_paths and sha256_bytes(env_abs.read_bytes()) == env_sha:
                    pass
                else:
                    raise DuplicateRecordError(f"refusing_to_overwrite_existing_file ({env_abs})")
            else:
                _atomic_write_bytes(env_abs, env_bytes, allow_overwrite=False)
            raw_venue_files.append(
                {
                    "raw_source_id": env_source_id,
                    "endpoint_url": env_url,
                    "relpath": env_rel,
                    "sha256": env_sha,
                }
            )

        payload: dict[str, Any] = {
            "record_id": record_id,
            "strategy_id": strategy_id,
            "observation_day_utc": observation_day_utc,
            "captured_at_utc": captured_at_utc,
            "available_at_utc": available_at_utc,
            "venue": venue,
            "instrument": instrument,
            "raw_source_id": raw_source_id,
            "raw_sha256": raw_hash,
            "normalized_sha256": norm_hash,
            "frozen_spec_sha256": frozen_spec_sha256,
            "previous_record_sha256": prev_hash,
            "validator_version": validator_version,
            "eligibility_status": eligibility_status,
            "rejection_reasons": list(rejection_reasons),
            "raw_relpath": raw_relpath,
            "raw_venue_files": raw_venue_files,
            "local_integrity_status": LOCAL_INTEGRITY_INTACT,
            "source_authenticity_status": source_authenticity_status,
            "reproducibility_status": reproducibility_status,
            "synthetic_fixture": bool(synthetic_fixture),
            "normalized_observation": normalized_observation,
            "offline_replay_result": offline_replay_result,
        }
        rec_hash = compute_record_sha256(payload)
        payload["record_sha256"] = rec_hash
        line_bytes = canonical_json_bytes(payload) + b"\n"

        # Write-ahead log first, then append to ledger, then remove WAL.
        _atomic_write_bytes(self.wal_path, line_bytes, allow_overwrite=True)
        with open(self.ledger_path, "ab") as handle:
            handle.write(line_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        self.wal_path.unlink(missing_ok=True)

        return LedgerRecord(**payload)

    def verify_chain(self) -> ChainVerificationReport:
        """Idempotent verify-only check of raw files, canonical hashes, and SHA-256 chain links."""
        errors: list[str] = []
        has_wal = self.wal_path.exists()
        if has_wal:
            errors.append("uncommitted_wal_present")

        try:
            records = self._read_raw_lines_checked()
        except PartialWriteRecoveryError as exc:
            return ChainVerificationReport(
                intact=False,
                record_count=0,
                local_integrity_status=LOCAL_INTEGRITY_FAILED,
                source_authenticity_status=SOURCE_AUTHENTICITY_LOCAL_CAPTURE,
                errors=[str(exc)],
                head_record_sha256=GENESIS_PREVIOUS_RECORD_SHA256,
                has_uncommitted_wal=has_wal,
            )

        expected_prev = GENESIS_PREVIOUS_RECORD_SHA256
        seen_ids: set[str] = set()
        for idx, rec in enumerate(records):
            rec_id = rec.get("record_id", f"idx_{idx}")
            if rec_id in seen_ids:
                errors.append(f"duplicate_record_id_in_chain ({rec_id})")
            seen_ids.add(rec_id)

            if rec.get("previous_record_sha256") != expected_prev:
                errors.append(
                    f"chain_link_mismatch_at_{idx} "
                    f"(expected_prev={expected_prev[:12]}, actual={str(rec.get('previous_record_sha256'))[:12]})"
                )

            recomputed_rec_hash = compute_record_sha256(rec)
            if rec.get("record_sha256") != recomputed_rec_hash:
                errors.append(f"record_sha256_tamper_at_{idx} ({rec_id})")

            norm_obs = rec.get("normalized_observation")
            recomputed_norm = sha256_bytes(canonical_json_bytes(norm_obs))
            if rec.get("normalized_sha256") != recomputed_norm:
                errors.append(f"normalized_sha256_mismatch_at_{idx} ({rec_id})")

            raw_rel = str(rec.get("raw_relpath", ""))
            raw_path = self._resolve_contained_raw_path(raw_rel)
            if raw_path is None:
                errors.append(f"raw_relpath_traversal_or_invalid_at_{idx} ({raw_rel})")
            elif not raw_path.exists():
                errors.append(f"missing_raw_bytes_file_at_{idx} ({raw_rel})")
            else:
                actual_raw_hash = sha256_bytes(raw_path.read_bytes())
                if actual_raw_hash != rec.get("raw_sha256"):
                    errors.append(f"raw_bytes_sha256_mismatch_at_{idx} ({rec_id})")

            for vf_idx, vf in enumerate(rec.get("raw_venue_files") or []):
                if not isinstance(vf, dict):
                    errors.append(f"malformed_raw_venue_file_entry_at_{idx}_{vf_idx}")
                    continue
                vf_rel = str(vf.get("relpath", ""))
                vf_path = self._resolve_contained_raw_path(vf_rel)
                if vf_path is None:
                    errors.append(f"raw_venue_relpath_traversal_at_{idx}_{vf_idx} ({vf_rel})")
                elif not vf_path.exists():
                    errors.append(f"missing_raw_venue_file_at_{idx}_{vf_idx} ({vf_rel})")
                elif sha256_bytes(vf_path.read_bytes()) != vf.get("sha256"):
                    errors.append(f"raw_venue_sha256_mismatch_at_{idx}_{vf_idx} ({rec_id})")

            expected_prev = str(rec.get("record_sha256", ""))

        intact = len(errors) == 0
        return ChainVerificationReport(
            intact=intact,
            record_count=len(records),
            local_integrity_status=LOCAL_INTEGRITY_INTACT if intact else LOCAL_INTEGRITY_FAILED,
            source_authenticity_status=SOURCE_AUTHENTICITY_LOCAL_CAPTURE,
            errors=errors,
            head_record_sha256=expected_prev if records else GENESIS_PREVIOUS_RECORD_SHA256,
            has_uncommitted_wal=has_wal,
        )
