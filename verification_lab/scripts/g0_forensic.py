"""Phase 0 forensic reality map.

Read-only. Records what actually exists at the pinned commit so every later
claim can be traced to a file on disk rather than to a document. Refuses to
run on a dirty tree because a dirty tree makes the map unreproducible.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "artifacts"

# Subsystems the audit asserts are missing or present. Each entry is a claim to
# check, not a claim to trust.
PROBES = {
    "trial_registry": r"TrialRegistry|trial_registry|n_trials|num_trials",
    "cpcv": r"\bCPCV\b|combinatorial_purged",
    "deflated_sharpe": r"deflated[_-]?sharpe",
    "pbo": r"\bPBO\b|probability_of_backtest_overfitting",
    "min_trl": r"min[_-]?trl|minimum_track_record",
    "fail_closed": r"fail[_-]?closed|failClosed",
    "durable_object": r"DurableObject|durable_object",
    "decimal_money": r"decimal\.js|big\.js|BigNumber|dinero",
    "nautilus": r"nautilus",
    "skfolio": r"skfolio",
    "duckdb": r"duckdb",
    "hftbacktest": r"HftBacktest|hftbacktest",
}


def run(*args: str) -> str:
    return subprocess.run(args, cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(pattern: str) -> list[str]:
    result = subprocess.run(
        [
            "grep",
            "-rIlE",
            "--exclude=verification-lab-g0-g6-verdict.md",
            pattern,
            "src",
            "docs",
            "scripts",
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return sorted(line for line in result.stdout.splitlines() if line)


def in_origin_main(rel_path: str) -> bool:
    return (
        subprocess.run(
            ["git", "cat-file", "-e", f"origin/main:{rel_path}"],
            cwd=REPO,
            capture_output=True,
        ).returncode
        == 0
    )


def main() -> int:
    # The product tree must be pristine. The lab's own output paths are the work
    # being produced, so they are excluded from the cleanliness requirement --
    # otherwise the map could never be regenerated after the first run.
    status = run(
        "git",
        "status",
        "--porcelain",
        "--",
        ".",
        ":(exclude)verification_lab",
        ":(exclude)artifacts",
        ":(exclude).gitignore",
        ":(exclude)docs/verification-lab-g0-g6-verdict.md",
        ":(exclude)plans",
    )
    if status:
        print("REFUSING: product tree is dirty, forensic map would be unreproducible", file=sys.stderr)
        for line in status.splitlines()[:10]:
            print(f"  {line}", file=sys.stderr)
        return 2

    sha = run("git", "rev-parse", "HEAD")
    src_files = sorted(p for p in (REPO / "src").rglob("*") if p.is_file())
    by_suffix: dict[str, int] = {}
    for path in src_files:
        by_suffix[path.suffix or "<none>"] = by_suffix.get(path.suffix or "<none>", 0) + 1

    loc = 0
    for path in src_files:
        if path.suffix in {".ts", ".tsx"}:
            loc += sum(1 for _ in path.open("rb"))

    tests = sorted(
        str(p.relative_to(REPO))
        for p in REPO.rglob("*")
        if p.is_file()
        and p.suffix in {".ts", ".tsx"}
        and (".test." in p.name or ".spec." in p.name)
        and "node_modules" not in p.parts
        and "verification_lab" not in p.parts
    )

    package = json.loads((REPO / "package.json").read_text())

    required_list = [
        "artifacts/g0_source_manifest.json",
        "artifacts/g1_arch_boundary.json",
        "artifacts/g2_data_provenance.parquet",
        "tests/determinism/g3_signal_hash.test.ts",
        "artifacts/g4_leakage_audit.json",
        "artifacts/g5_statistical_validity.json",
        "artifacts/g6_execution_tca.json",
        "tests/risk/g7_fail_closed.test.ts",
        "artifacts/g8_tail_stress_matrix.json",
        "tests/execution/g9_order_lifecycle.test.ts",
        "tests/recovery/g10_durable_recovery.test.ts",
        "tests/security/g11_tenant_e2e.spec.ts",
        "artifacts/g12_ai_roi_redteam.json",
        "artifacts/g13_paper_tracking_error.json",
        "docs/compliance/g14_commercial_audit.md",
        "docs/governance/g15_owner_signoff.md",
    ]
    # Phase 0 measures the baseline product branch (`origin/main`), so re-running
    # the forensic map after the lab generates its own artifacts stays idempotent.
    artifact_present = {name: in_origin_main(name) for name in required_list}
    lab_worktree_present = {name: (REPO / name).exists() for name in required_list}

    map_ = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": sha,
        "commit_short": sha[:7],
        "branch": run("git", "rev-parse", "--abbrev-ref", "HEAD"),
        "tree_clean": not status,
        "origin_main": run("git", "rev-parse", "origin/main"),
        "inventory": {
            "src_file_count": len(src_files),
            "src_by_suffix": dict(sorted(by_suffix.items())),
            "src_ts_loc": loc,
            "test_file_count": len(tests),
            "migrations": len(list((REPO / "migrations").glob("*"))),
            "dependencies": len(package.get("dependencies", {})),
            "dev_dependencies": len(package.get("devDependencies", {})),
        },
        "package_manifest_sha256": sha256_file(REPO / "package.json"),
        "required_artifacts_present": artifact_present,
        "required_artifacts_present_count": sum(artifact_present.values()),
        "lab_worktree_artifacts_present": lab_worktree_present,
        "lab_worktree_artifacts_present_count": sum(lab_worktree_present.values()),
        "subsystem_probes": {
            name: {"pattern": pattern, "matching_files": probe(pattern)}
            for name, pattern in PROBES.items()
        },
        "probe_summary": {
            name: len(probe(pattern)) for name, pattern in PROBES.items()
        },
    }

    OUT.mkdir(exist_ok=True)
    target = OUT / "g0_forensic_reality_map.json"
    target.write_text(json.dumps(map_, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {target.relative_to(REPO)}")
    print(f"  commit            {sha[:12]}")
    print(f"  src files         {len(src_files)} ({loc} LOC ts/tsx)")
    print(f"  test files        {len(tests)}")
    print(f"  artifacts present {map_['required_artifacts_present_count']}/16")
    for name, count in map_["probe_summary"].items():
        print(f"  probe {name:18s} {count} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
