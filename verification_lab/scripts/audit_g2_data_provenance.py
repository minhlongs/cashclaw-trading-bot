#!/usr/bin/env python3
"""Independent G2 Point-in-Time Data Provenance Audit (Supreme Command #19).

Reads artifacts/g2_data_provenance.parquet (read-only), checks local gitignored
normalized/raw dataset presence, runs 9 deterministic provenance edge-case
validators on explicitly labeled SYNTHETIC_SOFTWARE_TEST_FIXTURE inputs, and
emits artifacts/g2_data_provenance.json.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
PARQUET_PATH = REPO_ROOT / "artifacts" / "g2_data_provenance.parquet"
OUTPUT_PATH = REPO_ROOT / "artifacts" / "g2_data_provenance.json"

DATA_ORIGIN_SYNTHETIC = "SYNTHETIC_SOFTWARE_TEST_FIXTURE"

REQUIRED_LOCAL_FILES = [
    "verification_lab/data/normalized/spot_1d.parquet",
    "verification_lab/data/normalized/perp_1d.parquet",
    "verification_lab/data/normalized/perp_4h.parquet",
    "verification_lab/data/normalized/funding.parquet",
    "verification_lab/data/normalized/oi_metrics.parquet",
    "verification_lab/data/raw/g13_day0_snapshot.json",
]

AFFECTED_MISSING_DATA_TESTS = [
    "verification_lab/tests/test_g13_bridge_cli.py::test_multiday_ts_reconciliation_bridge_progression_and_fail_closed_tamper_guards",
    "verification_lab/tests/test_g13_bridge_cli.py::test_geoblock_http_451_fallback_and_missing_parquet_ci_resilience",
    "verification_lab/tests/test_issue59_extensions.py::test_committed_provenance_has_zero_hard_errors_verified_uniusdt_checksum_and_oi",
    "verification_lab/tests/test_issue59_extensions.py::test_h3_maker_flattens_delisted_positions_on_settlement_across_entire_maker_grid",
    "verification_lab/tests/test_issue63_calibration_and_g13.py::test_committed_g13_artifact_is_honestly_day0_inconclusive_and_offline_safe",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


# ---------------------------------------------------------------------------
# Deterministic G2 provenance validators
# ---------------------------------------------------------------------------

def detect_missing_candles(timestamps_ms: list[int], expected_step_ms: int) -> list[dict[str, int]]:
    gaps: list[dict[str, int]] = []
    ordered = sorted(timestamps_ms)
    for prev, curr in zip(ordered, ordered[1:]):
        diff = curr - prev
        if diff > expected_step_ms:
            missing_count = (diff // expected_step_ms) - 1
            gaps.append(
                {
                    "prev_ts_ms": prev,
                    "curr_ts_ms": curr,
                    "missing_bars": missing_count,
                    "irregular_step_ms": diff,
                }
            )
    return gaps


def detect_timestamp_collisions(timestamps_ms: list[int]) -> list[int]:
    seen: set[int] = set()
    dups: list[int] = []
    for ts in timestamps_ms:
        if ts in seen and ts not in dups:
            dups.append(ts)
        seen.add(ts)
    return dups


def detect_stale_observations(
    obs_timestamps_ms: list[int], now_ms: int, max_age_ms: int
) -> list[dict[str, int]]:
    stale: list[dict[str, int]] = []
    for idx, ts in enumerate(obs_timestamps_ms):
        age = now_ms - ts
        if age > max_age_ms:
            stale.append({"index": idx, "ts_ms": ts, "age_ms": age})
    return stale


def detect_reordered_funding_events(timestamps_ms: list[int]) -> list[dict[str, int]]:
    violations: list[dict[str, int]] = []
    for idx in range(1, len(timestamps_ms)):
        if timestamps_ms[idx] <= timestamps_ms[idx - 1]:
            violations.append(
                {
                    "index": idx,
                    "prev_ts_ms": timestamps_ms[idx - 1],
                    "curr_ts_ms": timestamps_ms[idx],
                }
            )
    return violations


def validate_funding_intervals(
    timestamps_ms: list[int], expected_interval_hours: int, tolerance_ms: int = 1000
) -> dict[str, Any]:
    expected_ms = expected_interval_hours * 3600 * 1000
    bad_intervals: list[dict[str, int]] = []
    for idx in range(1, len(timestamps_ms)):
        delta = timestamps_ms[idx] - timestamps_ms[idx - 1]
        if abs(delta - expected_ms) > tolerance_ms:
            bad_intervals.append(
                {"index": idx, "delta_ms": delta, "expected_ms": expected_ms}
            )
    return {
        "expected_interval_hours": expected_interval_hours,
        "valid": len(bad_intervals) == 0,
        "bad_intervals": bad_intervals,
    }


def select_point_in_time_universe(
    listings: list[dict[str, Any]], as_of_ms: int
) -> list[str]:
    active: list[str] = []
    for row in listings:
        listed = row["listed_at_ms"]
        delisted = row.get("delisted_at_ms")
        if listed <= as_of_ms and (delisted is None or as_of_ms < delisted):
            active.append(row["symbol"])
    return sorted(active)


def detect_zombie_bars_after_delist(
    bars_ts_ms: list[int], delisted_at_ms: int
) -> list[int]:
    return [ts for ts in bars_ts_ms if ts > delisted_at_ms]


def detect_data_revision(recorded_sha256: str, current_payload: bytes) -> dict[str, Any]:
    current_sha256 = sha256_bytes(current_payload)
    return {
        "recorded_sha256": recorded_sha256,
        "current_sha256": current_sha256,
        "revision_detected": current_sha256 != recorded_sha256,
    }


def detect_missing_oi_periods(
    expected_months: list[str], present_months: list[str]
) -> dict[str, Any]:
    missing = sorted(set(expected_months) - set(present_months))
    return {
        "expected_count": len(expected_months),
        "present_count": len(present_months),
        "missing_months": missing,
        "missing_data_flag": len(missing) > 0,
    }


@dataclass(frozen=True)
class EdgeCaseResult:
    case_id: str
    name: str
    data_origin: str
    passed: bool
    details: dict[str, Any]


def run_synthetic_edge_case_suite() -> list[dict[str, Any]]:
    base_ms = 1_704_067_200_000  # 2024-01-01T00:00:00Z
    hour_ms = 3_600_000
    day_ms = 86_400_000

    results: list[EdgeCaseResult] = []

    # 1. Missing candles (including sub-step irregular forward step > expected_step_ms)
    candles = [base_ms, base_ms + day_ms, base_ms + 4 * day_ms]
    gaps = detect_missing_candles(candles, day_ms)
    sub_step_candles = [base_ms, base_ms + day_ms, base_ms + 2 * day_ms + 12 * hour_ms]
    sub_step_gaps = detect_missing_candles(sub_step_candles, day_ms)
    clean_candles = [base_ms + i * day_ms for i in range(5)]
    clean_gaps = detect_missing_candles(clean_candles, day_ms)
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-01",
            name="missing_candles",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=(
                len(gaps) == 1
                and gaps[0]["missing_bars"] == 2
                and gaps[0]["irregular_step_ms"] == 3 * day_ms
                and len(sub_step_gaps) == 1
                and sub_step_gaps[0]["missing_bars"] == 0
                and sub_step_gaps[0]["irregular_step_ms"] == day_ms + 12 * hour_ms
                and len(clean_gaps) == 0
            ),
            details={
                "gaps_detected": gaps,
                "sub_step_gaps_detected": sub_step_gaps,
                "clean_control_zero_false_positives": len(clean_gaps) == 0,
            },
        )
    )

    # 2. Timestamp collisions
    colliding = [base_ms, base_ms + hour_ms, base_ms + hour_ms, base_ms + 2 * hour_ms]
    dups = detect_timestamp_collisions(colliding)
    clean_dups = detect_timestamp_collisions([base_ms + i * hour_ms for i in range(4)])
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-02",
            name="timestamp_collisions",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=dups == [base_ms + hour_ms] and len(clean_dups) == 0,
            details={
                "duplicate_timestamps_ms": dups,
                "clean_control_zero_false_positives": len(clean_dups) == 0,
            },
        )
    )

    # 3. Stale observations
    now_ms = base_ms + 10 * hour_ms
    obs = [base_ms + 9 * hour_ms, base_ms + 2 * hour_ms]
    stale = detect_stale_observations(obs, now_ms=now_ms, max_age_ms=4 * hour_ms)
    clean_stale = detect_stale_observations(
        [base_ms + 8 * hour_ms, base_ms + 9 * hour_ms], now_ms=now_ms, max_age_ms=4 * hour_ms
    )
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-03",
            name="stale_observations",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=len(stale) == 1 and stale[0]["index"] == 1 and len(clean_stale) == 0,
            details={
                "stale_observations": stale,
                "max_age_ms": 4 * hour_ms,
                "clean_control_zero_false_positives": len(clean_stale) == 0,
            },
        )
    )

    # 4. Reordered funding events
    reordered = [base_ms, base_ms + 8 * hour_ms, base_ms + 4 * hour_ms, base_ms + 16 * hour_ms]
    order_violations = detect_reordered_funding_events(reordered)
    clean_order = detect_reordered_funding_events([base_ms + i * 8 * hour_ms for i in range(4)])
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-04",
            name="reordered_funding_events",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=len(order_violations) == 1 and order_violations[0]["index"] == 2 and len(clean_order) == 0,
            details={
                "order_violations": order_violations,
                "clean_control_zero_false_positives": len(clean_order) == 0,
            },
        )
    )

    # 5. 1h & 8h funding interval validation (Hyperliquid 1h vs Binance 8h)
    hl_1h = [base_ms + i * hour_ms for i in range(5)]
    bn_8h = [base_ms + i * 8 * hour_ms for i in range(5)]
    hl_check = validate_funding_intervals(hl_1h, expected_interval_hours=1)
    bn_check = validate_funding_intervals(bn_8h, expected_interval_hours=8)
    mismatch_check = validate_funding_intervals(hl_1h, expected_interval_hours=8)
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-05",
            name="funding_interval_1h_and_8h",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=hl_check["valid"] and bn_check["valid"] and (not mismatch_check["valid"]),
            details={
                "hyperliquid_1h_valid": hl_check["valid"],
                "binance_8h_valid": bn_check["valid"],
                "cross_interval_mismatch_caught": not mismatch_check["valid"],
                "clean_control_zero_false_positives": hl_check["valid"] and bn_check["valid"],
            },
        )
    )

    # 6. Historical pair selection (point-in-time universe membership)
    listings = [
        {"symbol": "BTCUSDT", "listed_at_ms": base_ms - 365 * day_ms, "delisted_at_ms": None},
        {"symbol": "EOSUSDT", "listed_at_ms": base_ms - 365 * day_ms, "delisted_at_ms": base_ms + 30 * day_ms},
        {"symbol": "NEWCOINUSDT", "listed_at_ms": base_ms + 60 * day_ms, "delisted_at_ms": None},
    ]
    pit_early = select_point_in_time_universe(listings, as_of_ms=base_ms + 10 * day_ms)
    pit_late = select_point_in_time_universe(listings, as_of_ms=base_ms + 90 * day_ms)
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-06",
            name="historical_pair_selection",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=pit_early == ["BTCUSDT", "EOSUSDT"] and pit_late == ["BTCUSDT", "NEWCOINUSDT"],
            details={
                "pit_early": pit_early,
                "pit_late": pit_late,
                "clean_control_zero_false_positives": "NEWCOINUSDT" not in pit_early and "EOSUSDT" not in pit_late,
            },
        )
    )

    # 7. Delisted markets (no post-delist zombie bars)
    delist_ts = base_ms + 30 * day_ms
    bars = [base_ms + 29 * day_ms, delist_ts, base_ms + 31 * day_ms, base_ms + 32 * day_ms]
    zombies = detect_zombie_bars_after_delist(bars, delisted_at_ms=delist_ts)
    clean_zombies = detect_zombie_bars_after_delist([base_ms + 28 * day_ms, base_ms + 29 * day_ms, delist_ts], delisted_at_ms=delist_ts)
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-07",
            name="delisted_markets_zombie_bars",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=len(zombies) == 2 and len(clean_zombies) == 0,
            details={
                "delisted_at_ms": delist_ts,
                "zombie_bars_detected": zombies,
                "clean_control_zero_false_positives": len(clean_zombies) == 0,
            },
        )
    )

    # 8. Data revisions (SHA-256 hash mismatch on revised payload)
    orig_payload = b"ts,open,high,low,close\n1704067200000,42000,42500,41800,42300\n"
    revised_payload = b"ts,open,high,low,close\n1704067200000,42000,42500,41800,42301\n"
    rev_check = detect_data_revision(sha256_bytes(orig_payload), revised_payload)
    clean_rev = detect_data_revision(sha256_bytes(orig_payload), orig_payload)
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-08",
            name="data_revisions_sha256_mismatch",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=rev_check["revision_detected"] is True and clean_rev["revision_detected"] is False,
            details={
                **rev_check,
                "clean_control_zero_false_positives": clean_rev["revision_detected"] is False,
            },
        )
    )

    # 9. Missing open-interest periods
    oi_check = detect_missing_oi_periods(
        expected_months=["2021-01", "2021-02", "2021-03"],
        present_months=["2021-01", "2021-03"],
    )
    clean_oi = detect_missing_oi_periods(
        expected_months=["2021-01", "2021-02", "2021-03"],
        present_months=["2021-01", "2021-02", "2021-03"],
    )
    results.append(
        EdgeCaseResult(
            case_id="G2-EC-09",
            name="missing_open_interest_periods",
            data_origin=DATA_ORIGIN_SYNTHETIC,
            passed=(
                oi_check["missing_data_flag"] is True
                and oi_check["missing_months"] == ["2021-02"]
                and clean_oi["missing_data_flag"] is False
            ),
            details={
                **oi_check,
                "clean_control_zero_false_positives": clean_oi["missing_data_flag"] is False,
            },
        )
    )

    return [
        {
            "case_id": r.case_id,
            "name": r.name,
            "data_origin": r.data_origin,
            "passed": r.passed,
            "details": r.details,
        }
        for r in results
    ]


def audit_committed_parquet(parquet_path: Path) -> dict[str, Any]:
    df = pl.read_parquet(parquet_path)
    dataset_counts = {
        row["dataset"]: int(row["len"])
        for row in df.group_by("dataset").len().sort("dataset").to_dicts()
    }
    status_counts = {
        str(row["status"]): int(row["len"])
        for row in df.group_by("status").len().sort("status").to_dicts()
    }

    all_symbols = sorted(df["symbol"].unique().to_list())
    hl_symbols = sorted(
        df.filter(pl.col("dataset").str.starts_with("hyperliquid"))["symbol"].unique().to_list()
    )
    binance_symbols = sorted(
        df.filter(~pl.col("dataset").str.starts_with("hyperliquid"))["symbol"].unique().to_list()
    )
    delisted_symbols = sorted(
        df.filter(pl.col("is_delisted") == True)["symbol"].unique().to_list()  # noqa: E712
    )

    checksum_verified_true = int(df.filter(pl.col("checksum_verified") == True).height)  # noqa: E712
    checksum_verified_false = int(df.filter(pl.col("checksum_verified") == False).height)  # noqa: E712
    zombie_bars_total = int(df["zombie_bars_filtered"].sum())
    zombie_rows_nonzero = int(df.filter(pl.col("zombie_bars_filtered") > 0).height)

    available_at_non_null = int(df.filter(pl.col("available_at_utc").is_not_null()).height)
    available_at_non_empty = int(
        df.filter(
            pl.col("available_at_utc").is_not_null() & (pl.col("available_at_utc").cast(pl.Utf8) != "")
        ).height
    )

    return {
        "path": str(parquet_path.relative_to(REPO_ROOT)),
        "sha256": sha256_file(parquet_path),
        "bytes": parquet_path.stat().st_size,
        "row_count": int(df.height),
        "column_count": int(df.width),
        "columns": list(df.columns),
        "dataset_breakdown": dataset_counts,
        "status_breakdown": status_counts,
        "symbol_coverage": {
            "total_distinct_symbol_entries": len(all_symbols),
            "binance_symbol_count": len(binance_symbols),
            "binance_symbols": binance_symbols,
            "delisted_symbol_count": len(delisted_symbols),
            "delisted_symbols": delisted_symbols,
            "hyperliquid_symbol_entries": hl_symbols,
        },
        "checksum_verified_stats": {
            "verified_true": checksum_verified_true,
            "verified_false": checksum_verified_false,
            "verified_ratio": round(checksum_verified_true / max(df.height, 1), 6),
        },
        "zombie_bars_filtered_stats": {
            "total_zombie_bars_filtered": zombie_bars_total,
            "rows_with_zombie_bars_filtered": zombie_rows_nonzero,
        },
        "available_at_utc_completeness": {
            "non_null_rows": available_at_non_null,
            "non_empty_rows": available_at_non_empty,
            "completeness_ratio": round(available_at_non_empty / max(df.height, 1), 6),
        },
    }


def check_local_datasets() -> dict[str, Any]:
    present: list[str] = []
    missing: list[str] = []
    for rel in REQUIRED_LOCAL_FILES:
        if (REPO_ROOT / rel).exists():
            present.append(rel)
        else:
            missing.append(rel)
    return {
        "present_files": present,
        "missing_files": missing,
        "local_data_status": "COMPLETE" if not missing else "BLOCKED_MISSING_DATA",
        "affected_pytest_tests": AFFECTED_MISSING_DATA_TESTS if missing else [],
        "affected_pytest_count": len(AFFECTED_MISSING_DATA_TESTS) if missing else 0,
    }


def main() -> int:
    parquet_summary = audit_committed_parquet(PARQUET_PATH)
    local_data = check_local_datasets()
    edge_cases = run_synthetic_edge_case_suite()
    edge_passed = sum(1 for c in edge_cases if c["passed"])

    report = {
        "gate": "G2_POINT_IN_TIME_DATA_PROVENANCE",
        "schema_version": "1.0.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "committed_provenance_parquet": parquet_summary,
        "local_gitignored_datasets": local_data,
        "synthetic_edge_case_validation": {
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "total_cases": len(edge_cases),
            "passed_cases": edge_passed,
            "all_passed": edge_passed == len(edge_cases),
            "cases": edge_cases,
        },
        "verdict": {
            "provenance_manifest_verified": parquet_summary["row_count"] == 7808
            and parquet_summary["column_count"] == 17,
            "synthetic_validators_passed": edge_passed == len(edge_cases),
            "raw_local_data_status": local_data["local_data_status"],
        },
    }

    OUTPUT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"G2 audit complete: rows={parquet_summary['row_count']} cols={parquet_summary['column_count']} "
        f"edge_cases={edge_passed}/{len(edge_cases)} local={local_data['local_data_status']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
