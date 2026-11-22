# 08 — Strategy Identity Safety Gate (§8)

**Implementation Files:**
- `src/tree/paper-forward/strategy-identity-types.ts` (Zod schemas & strict types)
- `src/tree/paper-forward/strategy-identity-gate.ts` (fail-closed evaluator & canonical profiles)
- `src/tree/paper-forward/index.ts` (public barrel export)
- `tests/risk/strategy_identity_gate.test.ts` & `tests/risk/strategy_identity_gate_hardening.test.ts` (`34/34` tests passing)

## 1. Fail-Closed Architecture and Purity

The Strategy Identity Safety Gate enforces economic and research-provenance parity before any strategy can be promoted to paper-forward execution:
- **Open-Core `tree/` Purity:** Zero imports from `@/ee`, `@/forest`, `@/land`, `node:fs`, `fetch`, or live order authority modules.
- **Zero Historical Mutation:** Does not modify `artifacts/signed_strategy_spec_h3_maker.json`, `artifacts/strategy_lifecycle_registry.json`, or `artifacts/g13_paper_tracking_error.json`.
- **Fail-Closed Verdicts:** `evaluateStrategyIdentityGate(declaredRaw, runtimeRaw)` returns `ok: true` (`ECONOMICALLY_IDENTICAL`, `promotionAllowed: true`) only when both schemas parse strictly and all 9 dimensions pass; otherwise it returns `ok: false` (`promotionAllowed: false`) with explicit `StrategyIdentityMismatch[]`. `assertStrategyIdentityParity()` throws on any failure.

## 2. Nine Economic and Provenance Dimensions Verified

| # | Dimension | Enforcement Rule |
| --- | --- | --- |
| 1 | `legs` | `declared.legs === runtime.supportedLegs` (`1` or `2`) |
| 2 | `structure` | `declared.structure === runtime.structure` (`directional` vs `market_neutral`) |
| 3 | `funding_accrual` | If `declared.requiresFundingAccrual`, runtime must set `supportsFundingAccrual: true` |
| 4 | `hedge_execution` | If `declared.requiresHedgeExecution`, runtime must set `supportsHedgeExecution: true` |
| 5 | `borrow_financing` | If `declared.requiresBorrowFinancing`, runtime must set `supportsBorrowFinancing: true` |
| 6 | `fee_settlement_model` | Exact match (`single_leg_spot`, `two_leg_spot_perp_maker_taker`, `two_leg_spot_perp_taker_only`) |
| 7 | `bar_granularity` | `declared.barGranularity` must be included in `runtime.supportedBarGranularities` |
| 8 | `paper_execution` | `declared.paperExecutionRequired: z.literal(true)`, `runtime.paperExecutionCapable: true`, `runtime.liveOrderAuthority: z.literal(false)` |
| 9 | `research_provenance` | `oosStatus === 'UNTOUCHED_FRESH_OOS'` and `paperForwardEligible === true` |

## 3. Security and Input Hardening

Verified across `34/34` unit and adversarial hardening tests:
- `.strict()` on `StrategyProvenanceSchema`, `DeclaredStrategyEconomicsSchema`, and `RuntimeCapabilityProfileSchema` rejects unknown keys and prototype-pollution payloads (`__proto__`, `constructor`).
- `.trim().min(1)` rejects whitespace-only `strategyId`, `runtimeId`, and `sourceModule`.
- `sha256HexSchema` enforces lowercase 64-character hex (`^[0-9a-f]{64}$`).
- Canonical profiles (`H3_MAKER_LAB_DECLARED_ECONOMICS`, `H3_MAKER_BOT_RUNTIME_CAPABILITY`, `G13_PAPER_FORWARD_RUNNER_CAPABILITY`, `ALL_BAR_GRANULARITIES`, `DAILY_BAR_GRANULARITIES`) are deeply `Object.freeze()`d.
- Evaluating `H3_MAKER_LAB_DECLARED_ECONOMICS` against `H3_MAKER_BOT_RUNTIME_CAPABILITY` returns `ECONOMICALLY_DIFFERENT` (`ECONOMIC_IDENTITY_MISMATCH`, `promotionAllowed: false`).
- Evaluating `H3_MAKER_LAB_DECLARED_ECONOMICS` against `G13_PAPER_FORWARD_RUNNER_CAPABILITY` returns `INSUFFICIENT_EVIDENCE` (`PROVENANCE_NOT_PROMOTABLE`) because `oosStatus` is `EXPOSED_HOLDOUT_QUARANTINED`.
