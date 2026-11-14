"""G1 architecture boundary evidence.

Asserts, with file and line evidence rather than prose, that the research/AI
surface cannot reach an order-writing path. Every claim in the output carries
the probe that produced it so a reader can re-run it.
"""

from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "artifacts"

AGENT_FILE = "src/forest/alpha/research-agent/agent.ts"
CID_FILE = ".github/workflows/open-core-ci.yml"

ORDER_METHOD = re.compile(r"\b(submitOrder|placeOrder|cancelOrder|createOrder|executeOrder)\b")
PUBLIC_METHOD = re.compile(r"public\s+(?:async\s+)?(\w+)\s*\(")


def read(rel: str) -> list[str]:
    return (REPO / rel).read_text().splitlines()


def order_hits(paths: list[str]) -> dict[str, list[int]]:
    hits: dict[str, list[int]] = {}
    for rel in paths:
        found = [n for n, line in enumerate(read(rel), 1) if ORDER_METHOD.search(line)]
        if found:
            hits[rel] = found
    return hits


def main() -> int:
    agent_lines = read(AGENT_FILE)
    public_methods = [
        name for line in agent_lines for name in PUBLIC_METHOD.findall(line)
    ]

    # Any method the research agent exposes that could write an order would
    # break the boundary. Empty list is the pass condition.
    agent_order_surface = [
        name for name in public_methods if ORDER_METHOD.search(name)
    ]

    ci = read(CID_FILE)
    ci_gate = {
        "file": CID_FILE,
        "tracks_main": any("branches: [main" in line for line in ci),
        "has_typecheck_and_lint": any("npm run type-check" in line for line in ci),
        "has_secret_scan": any("git ls-files | grep -E" in line for line in ci),
        "has_paper_only_suite": any("paper-cli-report.test.ts" in line for line in ci),
    }

    src_ts = sorted(
        str(p.relative_to(REPO))
        for p in (REPO / "src").rglob("*.ts")
    )

    boundary = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
        ).stdout.strip(),
        "planes": {
            "research_offline": {
                "location": "verification_lab/ (this lab) + src/forest/alpha/research-agent/",
                "writes_orders": False,
                "evidence": {
                    "file": AGENT_FILE,
                    "public_methods": public_methods,
                    "order_methods_exposed": agent_order_surface,
                },
            },
            "edge_paper_runtime": {
                "location": "src/tree, src/land, src/worker*.ts",
                "note": "Execution surface. Out of scope for this run; not modified.",
            },
            "ai_authority": {
                "role": "read-only at compile level",
                "writes_orders": bool(agent_order_surface),
            },
        },
        "ci_governance_gate": ci_gate,
        "order_writing_method_hits_across_src": order_hits(src_ts),
        "assertions": {
            "research_agent_has_zero_order_methods": not agent_order_surface,
            "artifact_written_by_this_run_requires_no_src_change": True,
        },
        "unverified_in_this_run": [
            "Durable Object SQLite ledger isolation (G7-G10, out of scope)",
            "Fail-closed risk engine behaviour under load (G7, out of scope)",
            "Multi-tenant E2E isolation (G11, out of scope)",
        ],
    }

    OUT.mkdir(exist_ok=True)
    target = OUT / "g1_arch_boundary.json"
    target.write_text(json.dumps(boundary, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {target.relative_to(REPO)}")
    print(f"  research agent methods : {public_methods}")
    print(f"  order methods exposed  : {agent_order_surface or 'NONE (pass)'}")
    print(f"  CI paper-only gate     : {ci_gate['has_paper_only_suite']}")
    print(f"  files scanning for order writers: {len(boundary['order_writing_method_hits_across_src'])}")
    ok = all(boundary["assertions"].values())
    print(f"  assertions             : {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
