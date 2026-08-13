# OmniRoute Fullstack Excellence Map — Applied to Trade-Bot (CashClaw)

> **Date:** 2026-08-13
> **Author:** Kongming (autonomous counsel)
> **Source:** https://github.com/diegosouzapw/OmniRoute (v3.8.50, 47k stars)
> **Target:** /Users/macbook/trade-bot (CashClaw AI Trading Bot, ~11,500 LOC TypeScript)
> **Report type:** Advisory — no code changes made

---

## 1. Tom tat OmniRoute / OmniRoute Summary

### What makes OmniRoute excellent

OmniRoute is a mature, community-driven (320+ contributors, 6,773 commits) AI gateway that has evolved over years of real production use. Its engineering excellence is not accidental -- it is the result of systematic investment in quality infrastructure.

**The 5 pillars of OmniRoute excellence:**

| Pillar | OmniRoute | What it means |
|--------|-----------|---------------|
| **Testing at scale** | 25,000+ tests across Vitest (unit/UI), Node native `--test` (unit), Playwright (E2E), Stryker (mutation) | Bugs are caught mechanically, not by luck |
| **Ratchet-based quality gates** | Every metric (complexity, duplication, dead code, type coverage, bundle size, ESLint warnings) has a committed baseline that can only tighten, never loosen | Regressions are impossible to merge without conscious override |
| **Domain-driven architecture** | `src/domain/` as standalone business logic; `src/shared/` for cross-cutting; clear layer boundaries | Business rules are testable independently of frameworks |
| **Modular skill system** | 42 self-contained skills with SKILL.md manifests, each independently testable and composable | New capabilities don't create coupling |
| **Defensive engineering** | Three-layer resilience (circuit breaker, cooldown, lockout), prompt injection guard, credential masking, local-first privacy | Production failures are contained, not catastrophic |

### Quantified comparison

| Metric | OmniRoute | Trade-Bot |
|--------|-----------|-----------|
| Tests | 25,000+ | 5 test files |
| CI workflows | 25 GitHub Actions | 0 (no CI) |
| ESLint config | Complexity ratchets, SonarJS, suppressions baseline | `npm run lint` (no config found) |
| Mutation testing | Stryker with nightly runs | None |
| File size limits | `check:file-size` gate enforced | None |
| Dead code detection | `knip` with ratchet | None |
| Type coverage | `check:any-budget` with budget | `noEmit: true` in tsconfig, no enforcement |
| Documentation | 43-language i18n READMEs, OpenAPI contract testing | 2 markdown files in `docs/` |

---

## 2. Phan tich kien truc / Architecture Analysis

### OmniRoute source architecture (`src/`)

```
src/
  app/           — Next.js App Router pages/routes (frontend)
  server/        — Server-side entry and bootstrap
  domain/        — Pure business logic, framework-agnostic
  shared/        — Cross-cutting utilities (hooks, helpers)
  lib/           — Library code (memory, skills)
  models/        — Data models/schemas
  types/         — TypeScript type definitions
  hooks/         — Custom React hooks
  store/         — State management
  i18n/          — Internationalization
  middleware/    — Request middleware
  mitm/          — Man-in-the-middle proxy logic
  sse/           — Server-Sent Events
  scripts/       — Build and utility scripts
```

**Key architectural principles:**

1. **Domain layer is pure.** `src/domain/` contains 17 modules, each owning exactly one business concern (routing, policies, cost rules, degradation, lockout, quota). Zero framework imports. Fully testable in isolation.

2. **Shared layer is reusable.** `src/shared/` provides hooks, utilities, and components consumed by both `app/` (frontend) and `server/` (backend). Single implementation, multiple consumers.

3. **Types are centralized.** A dedicated `src/types/` folder prevents type duplication and ensures API contracts are single-sourced.

4. **Skills are independently deployable.** Each of the 42 skills in `skills/` is a self-contained module with its own `SKILL.md` manifest. Skills compose via the gateway but do not depend on each other.

### Trade-Bot source architecture (`src/`)

```
src/
  app/           — Next.js App Router (pages + API routes)
  components/    — React UI components (auth, bots, dashboard, settings)
  forest/        — API handlers + business orchestration
  tree/          — Core bot engine + exchange adapters + telemetry
  land/          — Cross-layer orchestration (bot-management, exchange-orchestration)
  lib/           — DB client, auth utils
  i18n/          — Internationalization config
  messages/      — Translation files
  styles/        — CSS
  worker.ts      — Cloudflare Worker entry (Hono)
  middleware.ts  — Next.js middleware
```

**The trade-bot layer model (forest/tree/land)** is a deliberate architectural choice for the CashClaw product. It separates:

- **Tree** (`src/tree/`) — Core domain: bot instances, strategies, exchange adapters, telemetry
- **Forest** (`src/forest/`) — Orchestration: API handlers, D1 adapters, scheduler, backtesting
- **Land** (`src/land/`) — Cross-layer integration: bot-management and exchange-orchestration boundaries

This is conceptually sound. The problem is not the architecture itself but the **implementation gaps** within it.

---

## 3. So sanh voi Trade-Bot / Trade-Bot Gap Analysis

### Gap 1: Testing Infrastructure (Critical)

**OmniRoute:** 25,000+ tests, four test runners, mutation testing, test impact analysis.

**Trade-Bot:** 5 test files covering a fraction of the codebase:

| Test file | Covers |
|-----------|--------|
| `forest/dashboard/actions.test.ts` | Dashboard actions |
| `forest/api/auth-guard.test.ts` | Auth guard middleware |
| `tree/exchange/provider/paper-provider.test.ts` | Paper exchange provider |
| `tree/bot/strategies/grid.trailing.test.ts` | Grid strategy trailing |
| `worker.version.test.ts` | Version endpoint |

**Missing test coverage:**
- BotInstance lifecycle (start/stop/pause/resume/tick) — 0 tests
- BotManager (create/start/stop/remove/hydration) — 0 tests
- Killswitch (halt/resume/thresholds) — 0 tests
- StrategyChain (leg-builder, strategy composition) — 0 tests
- D1 adapter (hydrate/patch/persist) — 0 tests
- Auth login/logout/session flow — 0 tests
- All API routes (bots CRUD, events, stats) — 0 tests
- Backtest engine — 0 tests
- Scheduler (tick loop, circuit-open guard) — 0 tests

**Assessment:** trade-bot has approximately 2-5% test coverage of business logic. OmniRoute's approach would require testing every module independently.

### Gap 2: CI/CD Pipeline (Critical)

**OmniRoute:** 25 GitHub Actions workflows with path-based skipping, advisory vs blocking gates, 8-shard test parallelism, ratchet baselines.

**Trade-Bot:** No CI at all. The `package.json` has `build`, `test`, `lint`, and `type-check` scripts, but nothing enforces them.

### Gap 3: DRY Violations in Core Code (High)

Trade-bot has a significant DRY violation in `src/forest/bot/d1-adapter.ts`:

- `hydrateFromD1()` and `loadAllBotsFromD1()` contain ~60 lines of identical bot-state restoration logic. Both functions iterate D1 rows, parse config, create bot instances, compare and patch state fields — the entire body is duplicated with only the query wrapper differing (`findBotsByUser` vs `findAllBots`).

- `src/tree/bot/bot-instance.ts` contains `placeOrder()` as both a private method (line ~190) and as a local function in `initializeStrategy()` (line ~210). Both implementations do nearly the same thing — fetch from exchange, update state, persist trade, emit telemetry. This means the same order-placement logic exists in two places.

OmniRoute avoids this by centralizing business logic in `src/domain/` — a single module owns each concern.

### Gap 4: Missing Runtime Dependencies (Critical)

`src/tree/exchange/ccxt/client.ts` does `declare const ccxt: any` — assuming CCXT is injected by the CF Workers bundler. But:

- `ccxt` is not in `package.json` dependencies
- `ccxt` is not in `node_modules`
- The comment says "In production: CCXT is bundled with the Workers build" but no build configuration supports this

**Impact:** Live trading via real exchanges is broken. Only paper trading works.

OmniRoute handles external dependencies by explicitly listing them in `package.json` with pinned versions, and its CI validates that all imports resolve.

### Gap 5: Dual API Surface (High)

Trade-bot has two independent HTTP layers:

1. **Hono (worker.ts)** — Cloudflare Worker entry, defines routes at `/api/bots`, `/api/killswitch`, `/api/cron/eval`, `/api/events`, `/api/stats/daily`
2. **Next.js App Router (src/app/api/)** — defines routes at `/api/bots`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/settings`

The Hono layer and Next.js layer both serve `/api/bots` — they can conflict. The Hono layer bypasses Next.js entirely, so Next.js middleware does not protect Hono routes.

OmniRoute has a single Next.js-based API surface with consistent middleware. Trade-bot needs to decide: Hono-for-Workers or Next.js-for-Workers, not both.

### Gap 6: Error Handling Quality (Medium)

**OmniRoute:** Custom error helper with structured error objects, `check:error-helper` CI gate enforcing its use, sanitized error output.

**Trade-Bot:** Mix of `throw new Error(...)`, bare `catch {}` blocks (swallowing errors silently), and `catch(() => {})` fire-and-forget patterns. Many critical paths have no error reporting:

```typescript
// d1-adapter.ts — every D1 call silently swallows errors
persistBot(this.deps.userId, { ... }).catch(() => {});

// bot-instance.ts — order placement failure is silently eaten
} catch (error) {
  this.emitTelemetry('error', { ... });
  return null;  // caller never knows the order failed
}
```

### Gap 7: Configuration & Linting (Medium)

| Config | OmniRoute | Trade-Bot |
|--------|-----------|-----------|
| ESLint | Custom config with complexity ratchets, SonarJS, suppressions baseline | `eslint-config-next` only (no project-level config found) |
| Prettier | Enforced in CI | Not configured |
| TypeScript | Multiple tsconfig profiles (core, dashboard, typecheck) | Single `tsconfig.json` |
| File size limits | `check:file-size` gate | None |
| Import boundaries | `check:known-symbols`, `check:route-guard-membership` | None |

### Gap 8: Documentation (Medium)

**OmniRoute:** 43-language README translations, `AGENTS.md` + `CLAUDE.md` + `GEMINI.md` for AI agent context, OpenAPI contract testing, `docs/` directory with architecture diagrams.

**Trade-Bot:** 2 files in `docs/` (`customer-setup-guide.md`, `design-guidelines.md`), wireframes in `docs/wireframes/`, and the `CLAUDE.md` context file. No OpenAPI spec, no architecture diagrams.

---

## 4. Ap dung thuc te / Practical Mapping

### Pattern 1: Adopt a Quality Ratchet System

**OmniRoute does it:** Every quality metric has a committed baseline. CI checks that metrics only tighten, never loosen. New violations are introduced only with conscious override.

**Trade-Bot should do:**

1. Create a `config/quality/` directory with baseline files:
   - `complexity-baselines.json` — max cyclomatic complexity per file
   - `test-coverage-baseline.json` — min coverage per module
   - `any-budget.json` — max `:any` occurrences per file

2. Add quality check scripts to `package.json`:
```json
"check:complexity": "eslint src/ --rule 'complexity: error' --format json",
"check:any-budget": "tsc --noEmit | grep -c 'any'",
"check:file-size": "find src/ -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1 > 200 {print}'"
```

3. Start with lenient baselines (reflect current state), then tighten over time.

### Pattern 2: Centralize Domain Logic

**OmniRoute does it:** `src/domain/` is a standalone layer with 17 focused modules. Business rules are framework-agnostic and fully testable.

**Trade-Bot should do:**

The forest/tree/land model is already in place but not fully realized. Specifically:

- **Extract order placement into a single domain function.** Currently duplicated in `bot-instance.ts` (private method + strategy callback). Create `src/tree/bot/order-executor.ts` that owns the full order lifecycle.

- **Extract bot state restoration.** The ~60 lines duplicated between `hydrateFromD1()` and `loadAllBotsFromD1()` should become a single `restoreBotFromRow(row: D1BotRow): BotInstance` function in `src/forest/bot/d1-adapter.ts`.

- **Separate pure strategy evaluation from I/O.** `GridStrategy` and `MeanRevStrategy` are coupled to the placeOrder callback. Extract the signal generation into pure functions that take state and return signals, then have the callback handle I/O. This enables testing strategies without mocking exchanges.

### Pattern 3: Implement the Test Pyramid

**OmniRoute does it:** Unit tests (8-shard parallel) -> Vitest (UI/component) -> Playwright (E2E) -> Stryker (mutation).

**Trade-Bot should build incrementally:**

**Phase 1 (Quick Wins — 1 week):**

| Test file to create | Priority | Why |
|---------------------|----------|-----|
| `tree/bot/killswitch.test.ts` | P0 | Killswitch is a safety-critical component. No tests = potential fund loss |
| `tree/bot/bot-instance.test.ts` | P0 | Core lifecycle — start/stop/tick state machine |
| `tree/bot/bot-manager.test.ts` | P0 | Singleton orchestration — create/start/stop/hydration |
| `forest/api/auth-guard.test.ts` | Already exists | Extend with negative cases |
| `app/api/auth/login/route.test.ts` | P1 | Auth is customer-facing |

**Phase 2 (Core Engine — 2 weeks):**

| Test file | Coverage target |
|-----------|-----------------|
| `tree/bot/strategy-chain/*.test.ts` | Leg builder + strategy composition |
| `tree/bot/strategies/mean-reversion.test.ts` | Mean reversion signal generation |
| `forest/bot/scheduler.test.ts` | Tick loop + circuit-open guard |
| `forest/bot/d1-adapter.test.ts` | D1 hydration + persistence (mock D1) |

**Phase 3 (Integration — ongoing):**
- Vitest config update: add `environment: 'jsdom'` for component tests
- Add Playwright for critical flows: login -> create bot -> start -> verify running
- Set up coverage thresholds (start at 40%, target 70%)

### Pattern 4: Establish CI Pipeline

**OmniRoute does it:** 25 GitHub Actions workflows with sophisticated job dependencies.

**Trade-Bot should start with 1 workflow:**

```yaml
# .github/workflows/ci.yml (minimal starter)
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

Then add gates incrementally:
1. First: type-check + lint + build + test (already have scripts)
2. Then: add coverage thresholds
3. Then: add complexity budgets
4. Then: add file size limits

### Pattern 5: Error Handling Standardization

**OmniRoute does it:** Custom error helper with structured output, enforced by CI.

**Trade-Bot should:**

1. Create a standard result type for all handlers:
```typescript
// src/lib/result.ts
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

2. Replace bare `catch {}` blocks with structured error handling:
```typescript
// Before (current)
persistBot(this.deps.userId, { ... }).catch(() => {});

// After
persistBot(this.deps.userId, { ... }).catch((err) => {
  this.deps.onError(err instanceof Error ? err : new Error(String(err)), 'd1:persistBot');
});
```

3. Stop swallowing errors silently in critical paths (order placement, D1 persistence).

### Pattern 6: Resolve the Dual API Surface

**OmniRoute does it:** Single Next.js-based API surface with consistent middleware.

**Trade-Bot should pick one:**

**Recommendation:** Consolidate on Next.js App Router for API routes (already partially done in `src/app/api/`). The Hono Worker in `worker.ts` should handle only:
- Static asset serving via ASSETS binding
- Health/version endpoints
- CF Cron trigger delegation

All business-logic API routes should live in `src/app/api/` and use Next.js middleware for auth. This eliminates the middleware gap where Hono routes bypass Next.js auth.

---

## 5. Uu trien khai / Implementation Priority

### Immediate (This Week) — Quick Wins

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | Add `ccxt` to package.json or explicitly mark live-exchange as unimplemented | 30 min | Removes false promise from codebase |
| 2 | Deduplicate `hydrateFromD1` / `loadAllBotsFromD1` — extract shared restore logic | 2h | Removes 60 lines of DRY violation |
| 3 | Write killswitch unit tests (P0 safety) | 4h | Safety-critical component gets coverage |
| 4 | Write bot-instance lifecycle tests | 4h | Core engine gets basic coverage |
| 5 | Add `.github/workflows/ci.yml` with type-check + lint + build + test | 2h | CI enforcement begins |
| 6 | Replace bare `catch {}` with structured error logging in critical paths | 2h | Observability into silent failures |

### Short-term (2 Weeks)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 7 | Consolidate dual API surface (Hono vs Next.js) | 1d | Eliminates route conflicts |
| 8 | Extract order placement into single domain function | 1d | Removes duplication in bot-instance |
| 9 | Add complexity ratchet config (`config/quality/`) | 2h | Quality baseline established |
| 10 | Write bot-manager and scheduler tests | 1d | Core orchestration covered |
| 11 | Set up Vitest coverage reporting with threshold | 2h | Measurable coverage tracking |
| 12 | Add `.eslintrc` with complexity rules | 1h | Lint enforcement begins |

### Medium-term (1 Month)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 13 | Separate pure strategy evaluation from I/O callbacks | 2d | Strategies become independently testable |
| 14 | Add Playwright E2E for critical flows | 3d | Customer journey validated end-to-end |
| 15 | Implement file size limits (200 LOC per file) | Ongoing | Prevents code bloat |
| 16 | Create architecture docs with layer diagrams | 1d | Onboarding clarity |
| 17 | Set up D1 migration testing in CI | 4h | Schema changes validated before deploy |

### Long-term (Quarter)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 18 | Adopt pnpm workspaces if trade-bot grows | 1d | Monorepo readiness |
| 19 | Add mutation testing (Stryker) | 2d | Test quality beyond coverage |
| 20 | Implement Test Impact Analysis (TIA) | 1d | Fast CI for large test suites |
| 21 | Add OpenAPI contract testing | 1d | API stability guarantees |

---

## 6. Mau code tham khao / Reference Code Patterns

### Pattern A: Standardized Result Type (from OmniRoute's response pattern)

```typescript
// OmniRoute: all responses follow { ok: boolean, data?: T, error?: string }
// Trade-Bot already uses this in forest/api/ — extend to ALL business logic

// src/lib/result.ts
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(error: string, code?: string): Result<never> {
  return { ok: false, error, code };
}
```

### Pattern B: Extracted Bot State Restoration (fixes DRY violation)

```typescript
// src/forest/bot/d1-adapter.ts — extracted shared logic

function restoreBotState(bot: BotInstance, row: BotRow): void {
  const snapshot = bot.getSnapshot();
  const patch: Partial<BotState> = {};

  const fields = [
    'total_trades', 'started_at', 'stopped_at', 'last_error',
    'last_tick_at', 'last_order_at', 'current_drawdown', 'total_pnl',
    'win_count', 'loss_count', 'max_drawdown',
  ] as const;

  const stateKeyMap: Record<string, keyof BotState> = {
    total_trades: 'totalTrades',
    started_at: 'startedAt',
    stopped_at: 'stoppedAt',
    last_error: 'error',
    last_tick_at: 'lastTickAt',
    last_order_at: 'lastOrderAt',
    current_drawdown: 'currentDrawdown',
    total_pnl: 'totalPnl',
    win_count: 'winCount',
    loss_count: 'lossCount',
    max_drawdown: 'maxDrawdown',
  };

  for (const field of fields) {
    const rowVal = row[field];
    const stateKey = stateKeyMap[field];
    if (rowVal != null && rowVal !== snapshot[stateKey]) {
      (patch as Record<string, unknown>)[stateKey] = rowVal;
    }
  }

  if (Object.keys(patch).length > 0) {
    bot.patchState(patch);
  }
}

// Now both hydrateFromD1 and loadAllBotsFromD1 call:
restoreBotState(bot, row);
```

### Pattern C: Quality Ratchet Config (from OmniRoute's `config/quality/`)

```json
// config/quality/complexity-baselines.json
{
  "description": "Max cyclomatic complexity per file. Baseline as of 2026-08-13.",
  "thresholds": {
    "src/tree/bot/bot-instance.ts": 25,
    "src/tree/bot/bot-manager.ts": 20,
    "src/forest/bot/d1-adapter.ts": 30,
    "src/forest/api/handlers/*.ts": 15,
    "default": 15
  }
}
```

### Pattern D: Structured Error Logging (replaces silent catch)

```typescript
// Before (trade-bot current):
try {
  await bot.tick();
  await this.persistBotState(bot);
} catch (err) {
  errors.push({ botId: bot.id, message: error.message });
  this.deps.onEvalError?.(bot.id, error);
}

// After (with structured logging like OmniRoute):
try {
  await bot.tick();
  await this.persistBotState(bot);
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  errors.push({
    botId: bot.id,
    message: error.message,
    stack: error.stack,
    context: 'scheduler.tick',
    timestamp: Date.now(),
  });
  this.deps.onEvalError?.(bot.id, error);
  // Emit to telemetry for dashboard visibility
  this.deps.telemetry?.emit(bot.id, 'error', {
    context: 'scheduler.tick',
    message: error.message,
  });
}
```

### Pattern E: CI Quality Gate (minimal starter from OmniRoute's ci.yml)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Quality Gates
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Type check
        run: npm run type-check
      - name: Lint
        run: npm run lint
      - name: Build
        run: npm run build
      - name: Tests
        run: npm test
      - name: File size check
        run: |
          LARGE=$(find src/ \( -name '*.ts' -o -name '*.tsx' \) -not -path '*.test.*' -not -path '*node_modules*' | xargs wc -l | awk '$1 > 200 {print $2 " (" $1 " lines)"}')
          if [ -n "$LARGE" ]; then
            echo "::warning::Files exceeding 200 LOC:"
            echo "$LARGE"
          fi
```

---

## 7. Risk Assessment

### What trade-bot is doing RIGHT (do not break these)

1. **forest/tree/land layer model** — this is a sound architectural decision. The execution has gaps but the model is correct.
2. **Killswitch pattern** — separate safety component with configurable thresholds. Well-designed.
3. **StrategyChain composition** — leg-builder pattern for composable strategies is extensible.
4. **Zod validation** on API inputs (login route) — matches OmniRoute's approach.
5. **Paper-only lockdown** in BotManager — safety-first design for v1.
6. **D1 schema design** — well-structured with proper indexes and CHECK constraints.
7. **Bilingual i18n setup** with `next-intl` — already in place.

### What to avoid

1. **Do not rewrite the architecture.** The forest/tree/land model is correct; fix the implementation gaps within it.
2. **Do not add more features before testing.** The killswitch has 0 tests — this is a financial safety risk, not a tech-debt note.
3. **Do not adopt OmniRoute's full CI complexity.** Start with 1 workflow, add gates incrementally. OmniRoute's 25 workflows evolved over years.
4. **Do not create a shared package/workspace until there is a second consumer.** YAGNI.
5. **Do not add mutation testing yet.** Get basic coverage to 50%+ first, then invest in mutation testing quality.

---

## 8. Assumptions

| Assumption | Confidence | What would change the answer |
|------------|------------|------------------------------|
| Trade-bot is still in early development (pre-production) | HIGH — git history shows 11 commits, memory confirms GO-LIVE was narrowly scoped | If already serving real customers, testing priority escalates further |
| The forest/tree/land layer model is intentional and should be preserved | HIGH — it appears in CLAUDE.md and git commits show deliberate implementation | If it was a mistake, a restructure to simpler feature-folder would be warranted |
| CCXT integration is planned but not yet wired (not abandoned) | MEDIUM — the code exists but dependency is missing, no TODO comment explains why | If CCXT is abandoned, the exchange adapter layer should be removed or stubbed |
| The founder wants to eventually match OmniRoute's quality bar | MEDIUM — this analysis was requested, suggesting aspiration | If the goal is MVP-only, many recommendations can be deferred |
| Trade-bot targets CF Workers deployment (not Node.js server) | HIGH — wrangler.jsonc and open-next.config.ts confirm this | If also targeting Node.js, testing approach changes |

---

*End of report. Advisory only — no files were modified.*
