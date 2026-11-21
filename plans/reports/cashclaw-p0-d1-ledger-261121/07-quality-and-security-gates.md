# 07 — Quality & Security Gates Report

All applicable repository quality, build, security, and verification gates were executed locally against the remediated tree on branch `fix/cashclaw-d1-ledger-integrity`.

## Gate Execution Summary

| Gate | Command | Result | Exact Evidence |
|---|---|---|---|
| **TypeScript** | `npm run type-check` (`tsc --noEmit`) | **PASS** | 0 errors |
| **ESLint** | `npm run lint` (`eslint src/ --max-warnings 0`) | **PASS** | 0 errors, 0 warnings |
| **ESLint Suppressions** | `grep -r 'eslint-disable' src/ ...` vs `eslint-suppressions.json` | **PASS** | Current `6` == Baseline `6` (0 new suppressions) |
| **Dead Code (Knip)** | `npx knip` | **PASS** | Clean exit `0` |
| **Vitest Full Suite** | `npm test` (`vitest run`) | **PASS** | **761/761 test files, 6,412/6,412 tests passed** (+14 new recovery/oracle/lineage tests over 6,398 baseline) |
| **Actual D1 & Fault Matrix** | `npx vitest run tests/recovery/d1_*.test.ts` | **PASS** | 3 files, 14/14 tests passed (including actual local Wrangler D1 `changes()` proof, 18-case fault matrix, Fixtures A–E, backup/restore) |
| **Python Oracle (`Decimal`)** | `scripts/verify_ledger_oracle.py` (invoked by Vitest) | **PASS** | Reconciles `Assets - Liabilities - Equity === 0` with 0 micro-USD tolerance; catches tampered snapshots |
| **OpenNext Worker Build** | `npm run build:worker` | **PASS** | `.open-next/worker.js` built cleanly |
| **workerd + Local D1** | `wrangler dev --local --persist-to ...` | **PASS** | `GET /` `307`, `GET/POST /api/bots` `401` |
| **Playwright Security E2E** | `npx playwright test` | **PASS** | **7/7 Chromium E2E tests passed** (`g11_tenant_e2e.spec.ts`, `p1-01-backtest-bypass-e2e.spec.ts`) |
| **Open-Core Governance** | `open-core-boundary`, `paper-cli-report`, `src/ee/__tests__` + tracked leak check | **PASS** | 10/10 files, 49/49 tests passed; 0 `.claude`/`.agentkit`/`.env` files tracked |
| **Gitleaks** | `gitleaks dir src scripts migrations` & `tests` | **PASS (0 new leaks)** | `src`: 0, `scripts`: 0, `migrations`: 0; `tests`: 2 pre-existing synthetic test tokens in `tests/risk/g7_fail_closed.test.ts:481,487` (0 in modified/new files). `.open-next/` is gitignored build output. |
| **Diff Hygiene** | `git diff --check` | **PASS** | 0 whitespace/conflict markers |
| **Python Verification Lab** | `pytest -c verification_lab/pyproject.toml` | **165 PASS / 5 BLOCKED_MISSING_DATA** | See honest disposition below |

## Honest Disposition of the 5 Failing Python Verification Lab Tests

In isolated Python 3.12 venv (`/tmp/cashclaw-p0-d1-261121/pyvenv`), `pytest -c verification_lab/pyproject.toml` produced **165 passed, 5 failed** — matching the exact baseline from #14. None of the 5 failures are caused by this PR, and none were silently excluded or masked with fabricated data:

1. `test_g13_bridge_cli.py::test_multiday_ts_reconciliation_bridge_progression_and_fail_closed_tamper_guards` — **BLOCKED_MISSING_DATA**: requires gitignored `verification_lab/data/normalized` parquets.
2. `test_g13_bridge_cli.py::test_geoblock_http_451_fallback_and_missing_parquet_ci_resilience` — **BLOCKED_MISSING_DATA**: requires gitignored `verification_lab/data/raw/g13_day0_snapshot.json` in `--offline` mode.
3. `test_issue59_extensions.py::test_committed_provenance_has_zero_hard_errors_verified_uniusdt_checksum_and_oi` — **BLOCKED_MISSING_DATA**: requires gitignored `verification_lab/data/normalized/oi_monthly.parquet` (produced by `g2_ingest.py` from external Binance Vision archives).
4. `test_issue59_extensions.py::test_h3_maker_flattens_delisted_positions_on_settlement_across_entire_maker_grid` — **BLOCKED_MISSING_DATA**: requires gitignored `verification_lab/data/normalized/perp_1d.parquet`.
5. `test_issue63_calibration_and_g13.py::test_committed_g13_artifact_is_honestly_day0_inconclusive_and_offline_safe` — **BLOCKED_MISSING_DATA**: requires gitignored `verification_lab/data/raw/g13_day0_snapshot.json`.

Per Founder Authorization, historical market datasets were **not** synthesized and G13 cache/genesis (`2026-11-14T13:07:31.631351Z`) was **not** altered.
