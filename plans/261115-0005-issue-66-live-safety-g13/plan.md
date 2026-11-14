# Plan: Issue #66 — Production Safety Wiring (G7/G9/G10), SaaS G6/G12 Guards & Automated Daily Gate G13

- **Issue:** [#66](https://github.com/minhlongs/cashclaw-trading-bot/issues/66)
- **Branch:** `feat/issue-66-live-safety-wiring-and-g13`
- **Status:** In Progress
- **Safety Posture:** `PAPER/BACKTEST ONLY` (`$0` live capital, `liveTradingUnlocked: false`, Gate G15 hard-locked)

## Phases & Disjoint Ownership

| Phase | Owner | Files Owned | Status |
|---|---|---|---|
| **Phase 1: Runtime Bot & Cron Fail-Closed Wiring** | Stream 1 (`feat/66-stream1-runtime-safety`) | `src/tree/bot/**` (excluding `config-types.ts` / `bot-strategy.ts` / `bot-manager-default-config.ts`), `src/worker-cron.ts`, `src/worker.test.ts`, `src/worker-extended.test.ts`, `src/ee/scheduler/**`, `tests/risk/g7_live_bot_wiring.test.ts` | Dispatched |
| **Phase 2: SaaS Strategy Tiering (`h3_maker`) & G12 Credit Guard** | Stream 2 (`feat/66-stream2-saas-guards`) | `src/tree/bot/config-types.ts`, `src/tree/bot/bot-strategy.ts`, `src/tree/bot/bot-manager-default-config.ts`, `src/tree/bot/strategies/h3-maker.ts`, `src/forest/api/handlers/bot-create*.ts`, `src/forest/api/handlers/bot-list*.ts`, `src/app/api/bots/**`, `src/components/bots/**`, `src/components/quant/deliberation-theater*`, `src/app/api/ee/credits/**`, `src/lib/db/schema-tables.ts`, `src/lib/db/types-entities.ts`, `migrations/0018_add_h3_maker_strategy.sql`, `src/messages/{en,vi}.json` | Dispatched |
| **Phase 3: Automated Gate G13 TS-to-Python Checkpoint & Daily CI** | Stream 3 (`feat/66-stream3-g13-bridge`) | `scripts/g13-checkpoint.ts`, `verification_lab/scripts/g13_paper_forward.py`, `verification_lab/tests/test_g13_bridge_cli.py`, `.github/workflows/g13-paper-forward.yml`, `package.json`, `docs/governance/g13_g15_paper_forward_runbook.md`, `tests/paper-forward/g13_bridge_cli.test.ts` | Dispatched |
| **Phase 4: Integration, Full Quality Gate, E2E, Isolated Review & Merge** | Orchestrator | Integrated branch `feat/issue-66-live-safety-wiring-and-g13` | Pending |

## Acceptance Criteria (`Done Means`)

1. `/Users/macbook/trade-bot` clean on updated `main` containing the merged PR commit; `verification_lab` cache preserved; 0 stale worktrees.
2. `BotManagerFactory.createBot`, `createBotSync`, `BotInstance`, and `executeOrder` instantiate and enforce `CapitalProtectionEngine` (G7), `PaperOrderLifecycleEngine` (G9), and `MicroDoubleEntryLedger` + `D1AtomicLedgerBatcher` (G10) by default (`Assets - Liabilities - Equity === 0n`).
3. `src/worker-cron.ts` fails closed on any D1 lease error (`LEASE_D1_ERROR` / `SQLITE_BUSY`), never falling back to in-memory lease when `DB` is bound, enforces `ExecutionBudgetGuard`, and releases leases with `fencingToken` in `finally`.
4. `POST /api/bots` and `StrategyStep` expose `UNVERIFIED_RETAIL_SANDBOX` for `grid`/`mean_reversion`/`volatility_dca`, support signed `h3_maker` via `SignedStrategySpec`, and reject `ARCHIVED_FALSIFIED` families; `DeliberationTheater` displays the G12 negative-ROI notice (`-$89.68`, zero order authority) and `POST /api/ee/credits` rejects `REASONING` debits with `403 MULTI_AGENT_DEBATE_DISABLED_NEGATIVE_ROI` unless `allowNegativeRoiResearch: true`.
5. `npm run g13:checkpoint -- --offline` runs end-to-end TS `PaperForwardRunner` -> Python `Decimal(prec=50)` oracle with exit code 0, tracking error `< 15 bps/month`, `live_trading_unlocked === false`, and valid `.github/workflows/g13-paper-forward.yml`.
6. `npm run quality:gate`, `npm run build`, `pytest`, and Playwright `g11_tenant_e2e.spec.ts` all pass; isolated `code-reviewer` reports 0 BLOCKER/HIGH issues; PR passes GitHub CI, is squash-merged to `main`, and Issue #66 is labeled `shipped`.
