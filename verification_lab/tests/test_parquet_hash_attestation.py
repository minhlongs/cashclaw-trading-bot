"""Tests for 5-state Parquet hash attestation without circular self-trust."""

from __future__ import annotations

from pathlib import Path

import polars as pl
import pytest

from verification_lab.provenance.parquet_attestation import (
    ProvenanceState,
    TrustedManifestEntry,
    attest_normalized_parquets,
    attest_parquet_file,
    compute_file_sha256,
)

REQUIRED_COLS = ("ts_ms", "open", "high", "low", "close", "volume", "symbol")


def _write_sample_parquet(path: Path, close_val: float = 100.0) -> str:
    df = pl.DataFrame(
        {
            "ts_ms": [1700000000000, 1700086400000],
            "open": [99.0, 100.0],
            "high": [101.0, 102.0],
            "low": [98.0, 99.0],
            "close": [close_val, close_val + 1.0],
            "volume": [1000.0, 1100.0],
            "symbol": ["BTCUSDT", "BTCUSDT"],
        }
    )
    df.write_parquet(path)
    return compute_file_sha256(path)


def test_authentic_input_matching_trusted_manifest(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    digest = _write_sample_parquet(p, close_val=100.0)
    entry = TrustedManifestEntry(
        filename="spot_1d.parquet",
        trusted_sha256=digest,
        manifest_origin="external_signed_manifest_v1",
        independent_origin_verified=True,
        version_id="v1.0",
    )
    rec = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=entry)
    assert rec.state == ProvenanceState.HASH_MATCH_TRUSTED_MANIFEST.value
    assert rec.observed_sha256 == digest
    assert rec.matched_version == "v1.0"
    assert rec.rows == 2


def test_one_byte_file_mutation_detected(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    digest = _write_sample_parquet(p, close_val=100.0)
    entry = TrustedManifestEntry(
        filename="spot_1d.parquet",
        trusted_sha256=digest,
        manifest_origin="external_signed_manifest_v1",
        independent_origin_verified=True,
    )
    raw = bytearray(p.read_bytes())
    raw[-1] ^= 0x01
    p.write_bytes(bytes(raw))

    rec = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=entry)
    assert rec.state == ProvenanceState.HASH_MISMATCH.value
    assert rec.observed_sha256 != digest


def test_substituted_file_under_same_name_detected(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    trusted_digest = _write_sample_parquet(p, close_val=100.0)
    entry = TrustedManifestEntry(
        filename="spot_1d.parquet",
        trusted_sha256=trusted_digest,
        manifest_origin="external_signed_manifest_v1",
        independent_origin_verified=True,
    )
    # Substitute a completely valid Parquet with different values under the same filename
    substituted_digest = _write_sample_parquet(p, close_val=250.0)
    assert substituted_digest != trusted_digest

    rec = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=entry)
    assert rec.state == ProvenanceState.HASH_MISMATCH.value
    assert rec.observed_sha256 == substituted_digest
    assert rec.expected_sha256 == trusted_digest


def test_unexpected_schema_rejected(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    pl.DataFrame({"unexpected_col": [1, 2], "other": ["a", "b"]}).write_parquet(p)

    rec = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=None)
    assert rec.state == ProvenanceState.INVALID_SCHEMA.value
    assert "ts_ms" in rec.missing_columns


def test_missing_file_reported(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    rec = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=None)
    assert rec.state == ProvenanceState.MISSING_SOURCE.value
    assert rec.exists is False
    assert rec.observed_sha256 is None


def test_local_file_without_trusted_checksum_is_recorded_unverified(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    digest = _write_sample_parquet(p, close_val=100.0)

    rec = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=None)
    assert rec.state == ProvenanceState.HASH_RECORDED_UNVERIFIED.value
    assert rec.observed_sha256 == digest
    assert rec.expected_sha256 is None


def test_valid_file_from_documented_alternate_version_matches(tmp_path: Path) -> None:
    p_v1 = tmp_path / "v1.parquet"
    p_v2 = tmp_path / "spot_1d.parquet"
    digest_v1 = _write_sample_parquet(p_v1, close_val=100.0)
    digest_v2 = _write_sample_parquet(p_v2, close_val=105.0)
    assert digest_v1 != digest_v2

    entry = TrustedManifestEntry(
        filename="spot_1d.parquet",
        trusted_sha256=digest_v1,
        manifest_origin="external_signed_manifest_v2",
        independent_origin_verified=True,
        version_id="v1.0",
        alternate_versions=(("v1.1-restated", digest_v2),),
    )
    rec = attest_parquet_file(p_v2, REQUIRED_COLS, trusted_entry=entry)
    assert rec.state == ProvenanceState.HASH_MATCH_TRUSTED_MANIFEST.value
    assert rec.matched_version == "v1.1-restated"


def test_circular_self_referential_manifest_cannot_claim_authenticity(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    digest = _write_sample_parquet(p, close_val=100.0)

    self_ref_entry = TrustedManifestEntry(
        filename="spot_1d.parquet",
        trusted_sha256=digest,
        manifest_origin="local_file_itself",
        independent_origin_verified=True,
        source_path=str(p),
    )
    rec1 = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=self_ref_entry)
    assert rec1.state == ProvenanceState.HASH_RECORDED_UNVERIFIED.value

    unverified_origin_entry = TrustedManifestEntry(
        filename="spot_1d.parquet",
        trusted_sha256=digest,
        manifest_origin="unverified_manifest",
        independent_origin_verified=False,
    )
    rec2 = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=unverified_origin_entry)
    assert rec2.state == ProvenanceState.HASH_RECORDED_UNVERIFIED.value


def test_aggregate_attestation_reports_unverified_when_no_trusted_manifest(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    _write_sample_parquet(p, close_val=100.0)
    summary = attest_normalized_parquets(
        tmp_path,
        required_schemas={"spot_1d.parquet": REQUIRED_COLS},
        trusted_manifest=None,
    )
    assert summary["overall_provenance_state"] == ProvenanceState.HASH_RECORDED_UNVERIFIED.value
    assert summary["independent_authenticity_proven"] is False


def test_filename_mismatch_against_trusted_entry_fails_closed(tmp_path: Path) -> None:
    p = tmp_path / "spot_1d.parquet"
    digest = _write_sample_parquet(p, close_val=100.0)
    wrong_name_entry = TrustedManifestEntry(
        filename="perp_1d.parquet",
        trusted_sha256=digest,
        manifest_origin="external_signed_manifest_v1",
        independent_origin_verified=True,
    )
    rec = attest_parquet_file(p, REQUIRED_COLS, trusted_entry=wrong_name_entry)
    assert rec.state == ProvenanceState.HASH_MISMATCH.value
    assert "filename mismatch" in rec.reason
