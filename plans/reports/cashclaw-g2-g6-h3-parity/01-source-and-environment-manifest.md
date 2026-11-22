# 01 — Source and Environment Manifest

**Command:** CashClaw Supreme Command #19 — Quant Scientific Integrity & H3 Strategy Parity
**Date:** 2026-11-22
**Status:** Verified
**Verdict:** `READY_FOR_OWNER_QUANT_REVIEW`

## 1. Source Pin and Worktree Isolation

All audit scripts, TypeScript safety gates, and evidence artifacts were executed inside an isolated git worktree branched from the verified `origin/main` commit.

| Field | Verified Value |
| --- | --- |
| Repository | `https://github.com/minhlongs/cashclaw-trading-bot` |
| Verified `origin/main` SHA | `05e4f1aa2389b88a1e427335651cc07a87841bfb` (PR #70 squash merge) |
| Isolated Worktree Path | `/Users/macbook/orca/workspaces/trade-bot/h3-parity` |
| Feature Branch | `research/g2-g6-h3-strategy-identity` |
| Protected Local Checkout | `/Users/macbook/trade-bot` (5 pre-existing modified tracked files untouched) |
| PR #35 Status | OPEN, Draft, `headRefOid: 8453915b6929b11d9766e9c138511ef50c885d92`, untouched |
| Production / Remote D1 / Live Trading | ZERO mutations (`HOLD_PRODUCTION`, `PAPER_ONLY`, `liveTradingUnlocked === false`) |
| G13 Observation State | Preserved untouched (`genesis_utc: 2026-11-14T13:07:31.631351Z`, `elapsed_days: 0`) |

## 2. Dependency Manifest Hashes

| Manifest | SHA-256 |
| --- | --- |
| `package-lock.json` | `798429524fc629d3fd85ac6e964fd55e2913e401c781eb6cc69a50127e58a00e` |
| `verification_lab/pyproject.toml` | `c9a36b542cc5a085d0445e5bee1551bf49be14a746ce036434d0c234feb83eab` |

## 3. Runtime Environments

| Runtime | Version / Configuration |
| --- | --- |
| Node.js | `v26.7.0` |
| npm | `11.19.0` |
| Python (Env 1) | `/tmp/cc-g3-env1/bin/python` — Python `3.12.13` (`polars 1.44.2`, `pyarrow 21.0.0`, `duckdb 1.5.6`, `numpy 2.5.5`, `pytest 9.2.0`) |
| Python (Env 2) | `/tmp/cc-g3-env2/bin/python` — Python `3.12.13` (`polars 1.44.2`, `pyarrow 21.0.0`, `duckdb 1.5.6`, `numpy 2.5.5`, `pytest 9.2.0`) |

## 4. Immutable Historical Artifacts (Zero-Byte Mutation Baseline)

All pre-existing historical research and governance artifacts were preserved with zero byte changes and verified by SHA-256 digest:

| Artifact Path | SHA-256 |
| --- | --- |
| `artifacts/signed_strategy_spec_h3_maker.json` | `3e020570aaeba0a84e67dde272a45102d4ee7ed50d5c84a38f80f60f18c3d39b` |
| `artifacts/strategy_lifecycle_registry.json` | `e2f53b8e3f9555bae48b30f4b872da0e36b8c80a99b7ad01ab5f5da51cc08127` |
| `artifacts/trial_registry.jsonl` | `37ee9db5c0bf0aba14558b5d370dc2fb42c3455a56dfa7d134727206c0c1373d` |
| `artifacts/g13_paper_tracking_error.json` | `eca612906239b29ef3df79846eae627e58616a8be85b070626a59b4f95e94ad9` |
| `artifacts/g2_data_provenance.parquet` | `95b91ca8040c19026f7dac061d7e5d8c2829fd3dfa6925e9424958933859149f` |
| `artifacts/g4_leakage_audit.json` | `02aedc39447d0473619608223bbf829d31e37207c1fe5bb5dc218aa956565ed8` |
| `artifacts/g5_statistical_validity.json` | `e03cf128be2431e852cebdd0433b5eb2beee47072b42deebd85e9b4c7d2c055e` |
| `artifacts/g6_execution_tca.json` | `e5110ca512f0ed932833cb4d92673b57a1f3c41860c187dbe9a49be1c48fe679` |

## 5. Newly Generated Independent Audit Artifacts

| Artifact Path | SHA-256 |
| --- | --- |
| `artifacts/g2_data_provenance.json` | `9ccf0b84cf585f24451b279abd0cf89a0350f1b5b18594ef82e4862ce6643599` |
| `artifacts/g3_signal_determinism.json` | `4c1c2ebdb7697b61d3976ba71c34c09d7a56bee1f9b7e8819d24e392ef337bc8` |
| `artifacts/g4_independent_leakage_audit.json` | `ef501e68877b07b0379b6ddbbb8761e756babb22943f9150316727eded21520f` |
| `artifacts/g5_independent_statistical_audit.json` | `c9dd053d277c235ff247048bff6bcf0f7d97777b523c7cf450644654bdfa6848` |
| `artifacts/g6_independent_execution_audit.json` | `f16765240af0d947e51bdf87e1b9c6053e75f1dd3e539c6139bef0e401e00e2a` |
| `artifacts/strategy_identity_assessment.json` | `13eb0708cc0629757de69b94c45b44d79d784400c03347bbd8c5f136c9a5c351` |
