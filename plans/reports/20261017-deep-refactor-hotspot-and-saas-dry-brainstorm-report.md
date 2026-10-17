# Deep Refactor Introspection Report (`/ak-brainstorm --deep`)

**Date:** 2026-10-17
**Project:** CashClaw (`/Users/macbook/trade-bot`)
**Mode:** `--deep` (5-Turn Socratic Code Introspection + Hotspot & DRY Audit)

---

## 1. Brainstorm Contract (4 Fields)

- **Outcome:**
  1. Unify duplicated SaaS workspace/tier/active-bot resolution across `POST /api/bots`, `POST /api/ee/sync`, `GET/POST /api/ee/credits`, and `GET /api/ee/alpha-feed` into a single canonical helper (`src/ee/tenancy/workspace-request-context.ts`), fixing two remaining runtime inconsistencies:
     - `POST /api/ee/credits` currently defaults `tier` to `'BASIC'` via Zod instead of resolving `defaultSaasEntitlementStore.getWorkspaceTier(workspaceId)` when `body.tier` is omitted.
     - `POST /api/ee/sync` currently defaults `activeBots` to `0` when `x-cashclaw-active-bots` is absent instead of falling back to live `botListHandler()` count.
  2. Decompose the 7 largest production files in `src/` (`177–196 LOC`) into single-responsibility modules strictly `<= 140 LOC`, lowering the repository production file ceiling from `196 LOC` to `<= 176 LOC`.
  3. Slice the top 2 remaining test monoliths (`src/__tests__/e2e-smoke.test.ts` at `412 LOC` and `src/forest/research/tradingagents/debate-to-hypothesis.test.ts` at `410 LOC`) into focused suites `< 250 LOC`.
- **Constraints:**
  - `PAPER/BACKTEST ONLY` — zero live trading or real order execution paths.
  - Strictly preserve all public exports, component props, route URLs, and 25-step open-core boundaries (`npm run audit:oss`).
  - Zero `:any` types, zero `console.log` in production, zero new `eslint-disable` comments.
- **Non-goals:**
  - No new SaaS product features, database schema migrations, or external provider integrations.
  - No changes to the 25-step catalog definitions or cryptographic HMAC formats.
- **Acceptance Criteria:**
  - Every non-test `.ts`/`.tsx` file in `src/` is strictly `<= 176 LOC` (all 7 target hotspots `<= 140 LOC`).
  - `POST /api/ee/credits` automatically honors IPN-upgraded workspace tiers from `defaultSaasEntitlementStore` when `tier` is omitted in payload.
  - `POST /api/ee/sync` falls back to live active bot count from `botListHandler()` when `x-cashclaw-active-bots` header is omitted.
  - `npx tsc --noEmit`, `npm test`, and `npm run audit:oss` pass 100%.

---

## 2. 5-Turn Socratic `--deep` Code Introspection

### Turn 1 — Empirical Hotspot & Ceiling Telemetry
- **Observation:** Scanning all non-test `.ts`/`.tsx` files in `src/` reveals 7 files clustered at `177–196 LOC`:
  1. `src/components/quant/fdr-multiple-testing-gate.tsx` (`196 LOC`)
  2. `src/components/quant/regime-attribution-simulator.tsx` (`191 LOC`)
  3. `src/components/strategies/volatility-dca-visualizer.tsx` (`184 LOC`)
  4. `src/components/quant/deliberation-theater.tsx` (`182 LOC`)
  5. `src/ee/billing/saas-entitlement-store.ts` (`182 LOC`)
  6. `src/components/quant/alpha-zoo-evaluator.tsx` (`181 LOC`)
  7. `src/components/quant/microstructure-liquidity-analyzer.tsx` (`177 LOC`)

### Turn 2 — SaaS API Route DRY & State Resolution Seams
- **Cross-Examination:** Do all EE/SaaS routes resolve workspace tier and bot count consistently?
- **Finding:** No:
  - `GET /api/ee/credits` queries `defaultSaasEntitlementStore.getWorkspaceTier(workspaceId)`, but `POST /api/ee/credits` uses `tier: SaasTierSchema.default('BASIC')`. If a workspace upgrades to `PREMIUM` via NOWPayments IPN and calls `POST /api/ee/credits` with `{ workspaceId, modelTier, promptTokens, completionTokens }`, Zod forces `tier = 'BASIC'` (`100` credits instead of `2,500`).
  - `POST /api/bots` falls back to `botListHandler()` for active bot count, whereas `POST /api/ee/sync` defaults missing `x-cashclaw-active-bots` to `0`.
  - Header/query parsing (`x-cashclaw-workspace`, `x-cashclaw-tier`, `x-cashclaw-active-bots`) is copy-pasted across 4 route handlers.

### Turn 3 — UI Component Responsibility Coupling
- **Cross-Examination:** Why are the 6 Quant/Strategy visualizers between `177–196 LOC`?
- **Finding:** Each file mixes:
  1. Static domain datasets and types (`CANDIDATE_TRIALS`, `REGIME_DATA`, `COST_TIERS`, `DEBATE_LOG`, `MICROSTRUCTURE_SNAPSHOTS`, `ZOO_FACTORS`),
  2. Pure domain math (`BH_FDR`/`HOLM_BONFERRONI` p-value step-up, net Sharpe friction decay, VPIN toxicity fence), and
  3. Repeated `PAPER_ONLY • ADR-001` header banner + interactive table JSX.
- Extracting pure data/calculation models (`*-model.ts`) or sub-tables cleanly drops all 6 components to `95–130 LOC` while making the domain math directly unit-testable.

### Turn 4 — `SaasEntitlementStore` (`182 LOC`) Cohesion
- **Cross-Examination:** Why did `src/ee/billing/saas-entitlement-store.ts` grow to `182 LOC`?
- **Finding:** It combines D1 prepared statement SQL strings + snake_case row mapping with the stateful `SaasEntitlementStore` cache class. Extracting pure D1 SQL operations into `src/ee/billing/saas-entitlement-d1.ts` reduces both files to `~100 LOC`.

### Turn 5 — Remaining Test Monoliths (`> 400 LOC`)
- **Cross-Examination:** Which test files still exceed `400 LOC`?
- **Finding:** `src/__tests__/e2e-smoke.test.ts` (`412 LOC`) combines `POST /api/bots` and `GET/PUT/POST /api/settings` suites in one file; `src/forest/research/tradingagents/debate-to-hypothesis.test.ts` (`410 LOC`) combines failure-mode tests and happy-path/lineage tests in one file.

---

## 3. Options Comparison & Recommendation

| Option | Scope | Pros | Trade-offs |
|---|---|---|---|
| **Option 1 (Recommended): Quad-Cluster Deep Refactor** | 1) `workspace-request-context.ts` + fix `POST /api/ee/credits` & `POST /api/ee/sync`<br>2) Modularize all 7 production files (`177–196 LOC` → `<= 140 LOC`)<br>3) Slice top 2 test monoliths (`> 400 LOC` → `< 250 LOC`) | Fixes real `POST /api/ee/credits` & `sync` bugs, eliminates API route duplication, brings max production LOC in `src/` down to `<= 176 LOC`. | Touches ~18 files; requires careful re-export preservation. |
| **Option 2: SaaS API DRY Only** | Extract `workspace-request-context.ts` and patch `credits`/`sync` routes only | Very small diff (`5` files). | Leaves 7 production files at `177–196 LOC` right against the 200-line ceiling. |
| **Option 3: UI & Store Modularization Only** | Split the 7 files (`177–196 LOC`) without touching SaaS API routes | Lowers LOC ceiling cleanly. | Misses the `POST /api/ee/credits` tier fallback bug and route duplication. |

**Recommendation:** **Option 1 (Quad-Cluster Deep Refactor)** — resolves both the behavioral DRY bugs in the SaaS API layer and the top 7 LOC hotspots in one cohesive, verifiable pass.

## 4. Unresolved Questions
- None. All file boundaries, public exports, and test contracts are verified from repo state.
