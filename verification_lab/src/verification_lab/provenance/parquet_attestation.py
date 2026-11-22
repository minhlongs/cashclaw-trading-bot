"""Explicit 5-state Parquet data hash attestation without circular self-trust.

A dataset is never declared authentic merely because Polars can read it or
because a local SHA-256 digest was computed. Authenticity requires equality
against an independently established trusted manifest digest (or a documented
alternate version within that trusted manifest).
"""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Mapping, Sequence

import polars as pl


class ProvenanceState(str, Enum):
    HASH_MATCH_TRUSTED_MANIFEST = "HASH_MATCH_TRUSTED_MANIFEST"
    HASH_RECORDED_UNVERIFIED = "HASH_RECORDED_UNVERIFIED"
    HASH_MISMATCH = "HASH_MISMATCH"
    MISSING_SOURCE = "MISSING_SOURCE"
    INVALID_SCHEMA = "INVALID_SCHEMA"


DEFAULT_REQUIRED_SCHEMAS: dict[str, tuple[str, ...]] = {
    "spot_1d.parquet": ("ts_ms", "open", "high", "low", "close", "volume", "symbol"),
    "perp_1d.parquet": ("ts_ms", "open", "high", "low", "close", "volume", "symbol"),
    "perp_4h.parquet": ("ts_ms", "open", "high", "low", "close", "volume", "symbol"),
    "funding.parquet": ("ts_ms", "funding_rate", "available_at_ms", "symbol"),
    "oi_monthly.parquet": ("ts_ms", "sum_open_interest", "symbol"),
    "hyperliquid_funding_1h.parquet": ("coin", "symbol", "ts_ms", "funding_rate"),
    "hyperliquid_l1_quotes.parquet": (
        "coin",
        "symbol",
        "ts_ms",
        "best_bid",
        "best_ask",
        "mid_px",
    ),
}


@dataclass(frozen=True)
class TrustedManifestEntry:
    filename: str
    trusted_sha256: str
    manifest_origin: str
    independent_origin_verified: bool = True
    version_id: str = "canonical"
    alternate_versions: tuple[tuple[str, str], ...] = ()
    source_path: str | None = None

    def match_digest(self, observed_sha256: str) -> str | None:
        """Return matched version_id if digest matches primary or documented alternate."""
        if observed_sha256 == self.trusted_sha256:
            return self.version_id
        for alt_version, alt_digest in self.alternate_versions:
            if observed_sha256 == alt_digest:
                return alt_version
        return None


@dataclass(frozen=True)
class ParquetAttestationRecord:
    filename: str
    state: str
    exists: bool
    rows: int
    columns: list[str]
    observed_sha256: str | None
    expected_sha256: str | None
    matched_version: str | None
    manifest_origin: str | None
    missing_columns: list[str] = field(default_factory=list)
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def compute_file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _is_circular_or_untrusted_manifest(
    dataset_path: Path,
    entry: TrustedManifestEntry,
) -> bool:
    if not entry.independent_origin_verified:
        return True
    if not entry.manifest_origin.strip():
        return True
    if entry.source_path is not None:
        try:
            if Path(entry.source_path).resolve() == dataset_path.resolve():
                return True
        except OSError:
            return True
    return False


def attest_parquet_file(
    path: Path,
    required_columns: Sequence[str],
    trusted_entry: TrustedManifestEntry | None = None,
) -> ParquetAttestationRecord:
    """Attest a single Parquet file into one of the five explicit provenance states."""
    filename = path.name
    if not path.exists() or not path.is_file():
        return ParquetAttestationRecord(
            filename=filename,
            state=ProvenanceState.MISSING_SOURCE.value,
            exists=False,
            rows=0,
            columns=[],
            observed_sha256=None,
            expected_sha256=trusted_entry.trusted_sha256 if trusted_entry else None,
            matched_version=None,
            manifest_origin=trusted_entry.manifest_origin if trusted_entry else None,
            reason="Dataset file does not exist on disk.",
        )

    observed_sha = compute_file_sha256(path)

    # Validate Parquet readability and required columns first so corrupted/malformed
    # or unexpected-schema files are never silently treated as valid datasets.
    try:
        df = pl.read_parquet(path)
    except Exception as exc:
        if trusted_entry and not _is_circular_or_untrusted_manifest(path, trusted_entry):
            if trusted_entry.match_digest(observed_sha) is None:
                return ParquetAttestationRecord(
                    filename=filename,
                    state=ProvenanceState.HASH_MISMATCH.value,
                    exists=True,
                    rows=0,
                    columns=[],
                    observed_sha256=observed_sha,
                    expected_sha256=trusted_entry.trusted_sha256,
                    matched_version=None,
                    manifest_origin=trusted_entry.manifest_origin,
                    reason=f"Digest mismatch and unreadable Parquet: {exc}",
                )
        return ParquetAttestationRecord(
            filename=filename,
            state=ProvenanceState.INVALID_SCHEMA.value,
            exists=True,
            rows=0,
            columns=[],
            observed_sha256=observed_sha,
            expected_sha256=trusted_entry.trusted_sha256 if trusted_entry else None,
            matched_version=None,
            manifest_origin=trusted_entry.manifest_origin if trusted_entry else None,
            reason=f"Parquet read error: {exc}",
        )

    columns = list(df.columns)
    missing_cols = [c for c in required_columns if c not in columns]

    # When a trusted, independently verified manifest exists, verify filename binding & hash equality.
    if trusted_entry is not None and not _is_circular_or_untrusted_manifest(path, trusted_entry):
        if trusted_entry.filename != filename:
            return ParquetAttestationRecord(
                filename=filename,
                state=ProvenanceState.HASH_MISMATCH.value,
                exists=True,
                rows=int(df.height),
                columns=columns,
                observed_sha256=observed_sha,
                expected_sha256=trusted_entry.trusted_sha256,
                matched_version=None,
                manifest_origin=trusted_entry.manifest_origin,
                missing_columns=missing_cols,
                reason=(
                    f"Trusted manifest entry filename mismatch: entry={trusted_entry.filename}, "
                    f"observed={filename}."
                ),
            )
        matched_version = trusted_entry.match_digest(observed_sha)
        if matched_version is None:
            return ParquetAttestationRecord(
                filename=filename,
                state=ProvenanceState.HASH_MISMATCH.value,
                exists=True,
                rows=int(df.height),
                columns=columns,
                observed_sha256=observed_sha,
                expected_sha256=trusted_entry.trusted_sha256,
                matched_version=None,
                manifest_origin=trusted_entry.manifest_origin,
                missing_columns=missing_cols,
                reason="Observed SHA-256 does not match trusted manifest or documented alternates.",
            )

        if missing_cols or df.height == 0:
            return ParquetAttestationRecord(
                filename=filename,
                state=ProvenanceState.INVALID_SCHEMA.value,
                exists=True,
                rows=int(df.height),
                columns=columns,
                observed_sha256=observed_sha,
                expected_sha256=trusted_entry.trusted_sha256,
                matched_version=matched_version,
                manifest_origin=trusted_entry.manifest_origin,
                missing_columns=missing_cols,
                reason=(
                    f"Missing required columns {missing_cols}"
                    if missing_cols
                    else "Parquet dataset has zero rows."
                ),
            )

        return ParquetAttestationRecord(
            filename=filename,
            state=ProvenanceState.HASH_MATCH_TRUSTED_MANIFEST.value,
            exists=True,
            rows=int(df.height),
            columns=columns,
            observed_sha256=observed_sha,
            expected_sha256=trusted_entry.trusted_sha256,
            matched_version=matched_version,
            manifest_origin=trusted_entry.manifest_origin,
            reason=(
                "SHA-256 matched independently verified trusted manifest "
                f"(version={matched_version})."
            ),
        )

    # No independently verified trusted manifest covers this file.
    if missing_cols or df.height == 0:
        return ParquetAttestationRecord(
            filename=filename,
            state=ProvenanceState.INVALID_SCHEMA.value,
            exists=True,
            rows=int(df.height),
            columns=columns,
            observed_sha256=observed_sha,
            expected_sha256=None,
            matched_version=None,
            manifest_origin=None,
            missing_columns=missing_cols,
            reason=(
                f"Missing required columns {missing_cols}"
                if missing_cols
                else "Parquet dataset has zero rows."
            ),
        )

    circular_note = (
        "Manifest rejected because independent origin was not verified or was self-referential."
        if trusted_entry is not None
        else "No independently verified trusted manifest digest is available for this file."
    )
    return ParquetAttestationRecord(
        filename=filename,
        state=ProvenanceState.HASH_RECORDED_UNVERIFIED.value,
        exists=True,
        rows=int(df.height),
        columns=columns,
        observed_sha256=observed_sha,
        expected_sha256=None,
        matched_version=None,
        manifest_origin=None,
        reason=(
            f"{circular_note} Local SHA-256 recorded for auditability, "
            "but provenance is NOT independently verified."
        ),
    )


def attest_normalized_parquets(
    data_dir: Path,
    *,
    required_schemas: Mapping[str, Sequence[str]] | None = None,
    trusted_manifest: Mapping[str, TrustedManifestEntry] | None = None,
) -> dict[str, Any]:
    """Attest all required normalized Parquet files and summarize overall provenance."""
    schemas = required_schemas or DEFAULT_REQUIRED_SCHEMAS
    manifest = trusted_manifest or {}

    records: dict[str, dict[str, Any]] = {}
    state_counts: dict[str, int] = {s.value: 0 for s in ProvenanceState}

    for filename, req_cols in schemas.items():
        rec = attest_parquet_file(
            data_dir / filename,
            required_columns=req_cols,
            trusted_entry=manifest.get(filename),
        )
        records[filename] = rec.to_dict()
        state_counts[rec.state] += 1

    if state_counts[ProvenanceState.HASH_MISMATCH.value] > 0:
        overall_state = ProvenanceState.HASH_MISMATCH.value
    elif state_counts[ProvenanceState.INVALID_SCHEMA.value] > 0:
        overall_state = ProvenanceState.INVALID_SCHEMA.value
    elif state_counts[ProvenanceState.MISSING_SOURCE.value] > 0:
        overall_state = ProvenanceState.MISSING_SOURCE.value
    elif state_counts[ProvenanceState.HASH_RECORDED_UNVERIFIED.value] > 0:
        overall_state = ProvenanceState.HASH_RECORDED_UNVERIFIED.value
    else:
        overall_state = ProvenanceState.HASH_MATCH_TRUSTED_MANIFEST.value

    return {
        "overall_provenance_state": overall_state,
        "independent_authenticity_proven": overall_state
        == ProvenanceState.HASH_MATCH_TRUSTED_MANIFEST.value,
        "state_counts": state_counts,
        "datasets": records,
        "upstream_manifest_note": (
            "Local normalized Parquet datasets are gitignored and have no pre-existing "
            "independent checksum manifest in main; artifacts/g2_data_provenance.parquet "
            "only records 12/7808 raw monthly rows as checksum_verified=true. "
            "Accordingly, local files without an external trusted manifest are reported "
            "as HASH_RECORDED_UNVERIFIED rather than authentic."
        ),
    }
