# 04 — G3 Deterministic Signal Validation Audit

**Artifact:** `artifacts/g3_signal_determinism.json` (SHA-256 `4c1c2ebdb7697b61d3976ba71c34c09d7a56bee1f9b7e8819d24e392ef337bc8`)
**Audit Script:** `verification_lab/scripts/audit_g3_determinism.py`
**Verdict:** `PASS_100_PCT_IDENTICAL`

## 1. Cross-Environment Process-Restarted Determinism Matrix

Executed **20 independent process-restarted runs** across two separate Python `3.12.13` virtual environments (`10` runs in `/tmp/cc-g3-env1`, `10` runs in `/tmp/cc-g3-env2`, `20` distinct OS PIDs: `77346` through `77386`).

| Metric | Verified Value |
| --- | --- |
| Total Process-Restarted Runs | `20` (`10` env1 + `10` env2) |
| Unique OS PIDs | `20` |
| Unique Output SHA-256 Hashes | `1` (`identical_across_all_runs: true`) |
| Canonical Output SHA-256 | `89286eb1ff760629665e425d89f3b04d03d868264e2c122aaadd798b76e0837a` |
| Canonical Strategy Spec SHA-256 | `05ba3f4e78891212ef633819e9e97e7fcdd521650c87c07c0d2cd619ca21d359` |
| Signed Strategy Spec `payloadSha256` | `43ac1c5bec68810391da6d366156b933369dada96631fe0c54d66c376ef94169` (`signed_strategy_spec_verified: true`) |
| Production `h3_basis_carry` Positions SHA-256 | `ad81ef2ae309aba41bce2cbe73ec1c655cfa9cdf3022fd76139a5b5f7823c9f0` |
| Production `h3_basis_carry` Non-Zero Position Days | `58` |
| LLM in Signal / Order Path | `false` (`llm_in_path: false`) |
| Packages Pinned in Both Envs | `numpy 2.5.5`, `polars 1.44.2` |

## 2. Production `h3_basis_carry` Parameters Verified

Every run loaded and verified `artifacts/signed_strategy_spec_h3_maker.json` (`payloadSha256`) and executed the real production `h3_basis_carry` module with:
- `entryAnnualBps: 800.0`
- `exitAnnualBps: 150.0`
- `fifoFillProbability: 0.55`
- `lookbackDays: 30`
- `maxGrossLeverage: 1.0`

## 3. Determinism Invariants Checked

Across all 20 runs (`signal_count: 135`, `event_count: 270`, `entries: 3`, `exits: 3`):
- Warmup period handling and recursive indicator (EMA/RSI) state evolution produced bit-identical outputs.
- Order sizing, rounding, event ordering, and canonical JSON serialization produced a single SHA-256 digest across all 20 PIDs.
- Zero LLM calls, zero nondeterministic clock reads, and zero unordered map iterations exist in the signal generation path.
- Data origin is explicitly labeled `SYNTHETIC_SOFTWARE_TEST_FIXTURE`.
