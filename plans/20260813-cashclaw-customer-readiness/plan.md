# CashClaw Customer-Readiness Plan

**Date:** 2026-08-13
**Goal:** Close the gap from "API worker with auth" to "product a customer can actually use"
**Constraint:** Paper-only for v1. All work via subagents.

---

## Executive Summary

Seven items remain. Three are **parallel-safe** (can run in one subagent simultaneously): Item 1 (CCXT go/no-go decision), Item 6 (route smoke test), Item 7 (API smoke test). The rest form a **dependency chain**: Item 3 (settings D1 persistence) must complete before Item 4 (save button wiring); Item 2 (paper lockdown) and Item 5 (bot persistence bug) are independent but small enough to bundle into one subagent.

**Recommended execution order:**

| Stream | Items | Parallel? | Estimated complexity |
|--------|-------|-----------|---------------------|
| A: Foundation fixes | 2 + 5 | Yes | Low (enforce mode in handler, fix duplicate hydration) |
| B: Settings persistence | 3 + 4 | Yes (3→4 sequential within stream) | Medium (D1 repo functions + wiring) |
| C: Smoke validation | 1 + 6 + 7 | Yes | Low (curl tests, decisions only) |

Streams A and B run in parallel. Stream C runs after A and B complete (smoke tests validate the whole system).

---

## Item 1: CCXT on CF Workers — GO / NO-GO

**Decision: NO-GO for v1. Lock UI to Paper-only.**

**Evidence (verified):**
- `src/tree/exchange/ccxt/client.ts` line 7: `declare const ccxt: any` — expects CCXT as a Workers global
- `package.json`: CCXT is **not listed** as a dependency
- CCXT uses `node:https`, `node:buffer` extensively — will fail on CF Workers even with `nodejs_compat`
- No code path in the UI or bot-create handler currently imports CCXT — the file exists but is never called

**Required action:**
- No code changes needed (CCXT is already not imported anywhere in active code paths)
- Add a comment in `src/tree/exchange/ccxt/client.ts` noting it is NOT active for v1
- The paper adapter in `bot-manager.ts:269-342` handles all trading — no external dependency needed

**Acceptance criteria:**
- [ ] `grep -r "ccxt" src/ --include="*.ts" --include="*.tsx"` shows no active imports (only the declaration file)
- [ ] No UI path can trigger live exchange calls

---

## Item 2: Paper-Only Lockdown Verification

**Current state (verified):**
- `bot-wizard-client.tsx:124`: `mode: 'paper' as const` — hardcoded in frontend
- `bots-list-client.tsx:161`: Status filter has `paper_test`, `paused`, `draft`, `error` — no `live_running` option in dropdown
- `bot-create-handler.ts`: Accepts `mode` from payload, defaults to `'paper'` but **does not enforce it**
- `BotManager.createBot`: Creates paper adapter when mode is `'paper'`, but would accept `'live'`

**Gap found:**
- API endpoint `POST /api/bots` allows `mode: 'live'` — a malicious or buggy client could bypass frontend lock

**Fix (in Stream A subagent):**
1. In `src/forest/api/handlers/bot-create.ts`, enforce paper-only for v1:
   ```typescript
   mode: 'paper', // v1: always paper, ignore payload.mode
   ```
2. In `src/tree/bot/bot-manager.ts`, add guard in `createBot`:
   ```typescript
   if (req.mode !== 'paper') {
     throw new Error('v1 only supports paper mode');
   }
   ```

**Acceptance criteria:**
- [ ] `POST /api/bots` with `mode: 'live'` is rejected or forced to paper
- [ ] Bot wizard UI shows no live trading option
- [ ] Bot list filter has no `live_running` dropdown option

---

## Item 3: Settings Persistence to D1

**Current state (verified):**
- D1 `settings` table exists (`migrations/0002_auth_settings.sql:15-24`) with columns: `id, user_id, exchange_creds_json, risk_limits_json, killswitch_enabled, killswitch_reason, killswitch_triggered_at, updated_at`
- `getSettings()` returns hardcoded DEFAULT_SETTINGS (line 47-60, `// TODO: wire to D1`)
- `updateExchangeCredentials()` validates only (line 62-78, `// TODO: store encrypted in D1`)
- `updateRiskLimits()` validates only (line 80-98, `// TODO: persist to D1`)
- `persistCredential()` and `findCredential()` exist in `d1-adapter.ts` and `repositories.ts` — can store encrypted exchange creds
- **No `findSettingsByUser()` or `upsertSettings()` in repositories.ts**

**Fix (in Stream B subagent):**

Step 1 — Add settings repository functions to `src/lib/db/repositories.ts`:
```typescript
export async function findSettingsByUser(db: D1Database, userId: string): Promise<Settings | null> {
  const row = await db.prepare('SELECT * FROM settings WHERE user_id = ?').bind(userId).first<Settings>();
  return row ?? null;
}

export async function upsertSettings(db: D1Database, settings: Settings): Promise<void> {
  await db.prepare(`
    INSERT INTO settings (id, user_id, exchange_creds_json, risk_limits_json, killswitch_enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      exchange_creds_json = excluded.exchange_creds_json,
      risk_limits_json = excluded.risk_limits_json,
      killswitch_enabled = excluded.killswitch_enabled,
      updated_at = excluded.updated_at
  `).bind(
    settings.id, settings.user_id, settings.exchange_creds_json,
    settings.risk_limits_json, settings.killswitch_enabled, settings.updated_at
  ).run();
}
```

Step 2 — Wire `getSettings()` in `src/forest/settings/actions.ts`:
```typescript
export async function getSettings(): Promise<SettingsData> {
  const db = createServerClient();
  if (!db) return DEFAULT_SETTINGS;

  // Find or create settings row (single-user v1: userId = 'admin')
  let row = await findSettingsByUser(db, 'admin');
  if (!row) {
    // Create default settings row
    const defaultRow: Settings = {
      id: 'settings_admin',
      user_id: 'admin',
      exchange_creds_json: JSON.stringify(DEFAULT_SETTINGS.exchanges),
      risk_limits_json: JSON.stringify(DEFAULT_SETTINGS.risk),
      killswitch_enabled: 1,
      killswitch_reason: null,
      killswitch_triggered_at: null,
      updated_at: Date.now(),
    };
    await upsertSettings(db, defaultRow);
    row = defaultRow;
  }

  return {
    exchanges: JSON.parse(row.exchange_creds_json || '{}'),
    risk: JSON.parse(row.risk_limits_json || '{}'),
    killswitch: {
      enabled: row.killswitch_enabled === 1,
      reason: row.killswitch_reason,
      triggeredAt: row.killswitch_triggered_at,
    },
  };
}
```

Step 3 — Wire `updateRiskLimits()` to persist to D1
Step 4 — Wire `updateExchangeCredentials()` to persist via `persistCredential()` (already exists)

**Acceptance criteria:**
- [ ] `GET /api/settings` returns values from D1 (not hardcoded defaults)
- [ ] `POST /api/settings` with `type: 'risk'` persists to D1 and is reflected on next GET
- [ ] `POST /api/settings` with `type: 'exchange'` stores credentials in D1

---

## Item 4: Settings Save Button Wiring

**Current state (verified):**
- `settings-client.tsx:236-248`: Save button handler is `setTimeout(r, 400)` — placeholder
- Risk input fields use `defaultValue` (uncontrolled) — need to read DOM values or switch to controlled state
- Exchange credential inputs are `readOnly` (lines 139, 147) — no edit flow yet

**Fix (in Stream B subagent, after Item 3):**

Step 1 — Add `useState` for risk values (convert from uncontrolled to controlled):
```typescript
const [riskValues, setRiskValues] = useState({
  maxDrawdownPct: settings.risk.maxDrawdownPct,
  dailyLossLimitPct: settings.risk.dailyLossLimitPct,
  cooldownMinutes: settings.risk.cooldownMinutes,
  maxOpenOrders: settings.risk.maxOpenOrders,
});
```

Step 2 — Wire save button to `POST /api/settings`:
```typescript
onClick={async () => {
  setSaving(true);
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'risk',
        maxDrawdownPct: riskValues.maxDrawdownPct,
        dailyLossLimitPct: riskValues.dailyLossLimitPct,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      // Optionally show success toast
    }
  } finally {
    setSaving(false);
  }
}}
```

Step 3 — Add `cooldownMinutes` and `maxOpenOrders` to the `RiskSchema` Zod validation in `src/app/api/settings/route.ts`

**Acceptance criteria:**
- [ ] Changing risk values and clicking Save persists to D1
- [ ] Reloading settings page shows saved values
- [ ] Zod validation rejects out-of-range values

---

## Item 5: Bot Persistence Verification + Bug Fix

**Current state (verified):**
- `BotManager.createBot()` (line 151-161): Calls `persistBot()` to D1 on every bot creation
- `hydrateFromD1()` (d1-adapter.ts:64-96): Loads all bots from D1, calls `manager.createBot()` for each
- `loadAllBotsFromD1()` (d1-adapter.ts:102-128): Same as above, single-user version
- `botListHandler` and `botCreateHandler` both call `loadAllBotsFromD1()` before operating

**Bug found:**
- `loadAllBotsFromD1()` calls `manager.createBot()` which calls `persistBot()` — this inserts a NEW row into D1 every time `loadAllBotsFromD1()` is called, even if the bot already exists
- Second call to `loadAllBotsFromD1()` will throw `Bot already exists` from `createBot` line 106-108
- This means: create bot -> next request calls `loadAllBotsFromD1()` again -> throws error -> bot list breaks

**Fix (in Stream A subagent):**

In `src/forest/bot/d1-adapter.ts`, `loadAllBotsFromD1()`:
```typescript
export async function loadAllBotsFromD1(): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const manager = getBotManager();
  const rows = await findAllBots(db);

  for (const row of rows) {
    try {
      // Skip if already hydrated in memory
      if (manager.getBot(row.id)) continue;

      const config = JSON.parse(row.config_json) as BotConfig;
      manager.createBot({
        id: row.id,
        config,
        exchangeConfig: {
          apiKey: '',
          apiSecret: '',
          testnet: true,
          sandbox: true,
          rateLimitMs: 100,
        },
        mode: 'paper',
      });
    } catch {
      // skip malformed config or already-hydrated bots
    }
  }
}
```

Also fix `persistBot()` call inside `createBot` — skip if bot was loaded from D1 (not user-created):
- Option A: Add a `skipPersist` flag to `CreateBotRequest`
- Option B: Check if bot already exists in D1 before inserting (use `findBotById`)

**Acceptance criteria:**
- [ ] Create bot -> redeploy -> bot still exists after cold start
- [ ] Calling `loadAllBotsFromD1()` twice does not throw or duplicate rows
- [ ] Bot list API returns correct bot count after multiple page loads

---

## Item 6: Runtime Error Check — All UI Routes

**Routes to verify (both `/vi/` and `/en/` prefixes):**
- `/vi` (redirect to `/vi/dashboard`)
- `/vi/login` (or `/vi/(auth)/login`)
- `/vi/dashboard`
- `/vi/bots`
- `/vi/bots/new`
- `/vi/settings`
- `/vi/backtests`

**Test method (Stream C subagent):**
```bash
for route in vi vi/login vi/dashboard vi/bots vi/bots/new vi/settings vi/backtests; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://cashclaw.agencyos.network/$route")
  echo "$route -> $code"
done
```

**Acceptance criteria:**
- [ ] All routes return HTTP 200
- [ ] HTML contains expected content (not error page)
- [ ] No 500 errors in Cloudflare Workers logs

---

## Item 7: Full Smoke Test

**API smoke tests (Stream C subagent):**

### Auth flow
```bash
# Login
curl -X POST https://cashclaw.agencyos.network/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cashclaw.app","passcode":"cashclaw2026"}' \
  -c cookies.txt
# Expected: {"ok":true,"user":{"id":"...","email":"admin@cashclaw.app"}}

# Check session
curl https://cashclaw.agencyos.network/api/auth/me -b cookies.txt
# Expected: {"ok":true,"user":{...}}

# Logout
curl -X POST https://cashclaw.agencyos.network/api/auth/logout -b cookies.txt
```

### Bot CRUD
```bash
# Create bot
curl -X POST https://cashclaw.agencyos.network/api/bots \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"id":"smoke_test_1","name":"Smoke Test","strategy":"grid","pair":"BTC/USDT","exchange":"binance","capital":1000,"config":{"spacing_pct":0.5,"levels":10,"capital_per_level_pct":10,"max_drawdown_pct":15},"mode":"paper"}'
# Expected: {"ok":true,"data":{"id":"smoke_test_1"}}

# List bots
curl https://cashclaw.agencyos.network/api/bots -b cookies.txt
# Expected: bot list includes smoke_test_1

# Delete bot
curl -X DELETE https://cashclaw.agencyos.network/api/bots/smoke_test_1 -b cookies.txt
```

### Settings
```bash
# Get settings
curl https://cashclaw.agencyos.network/api/settings -b cookies.txt
# Expected: settings data with risk/exchange values

# Update risk
curl -X POST https://cashclaw.agencyos.network/api/settings \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"type":"risk","maxDrawdownPct":20,"dailyLossLimitPct":15}'
# Expected: {"ok":true}
```

**Acceptance criteria:**
- [ ] Auth flow completes without errors
- [ ] Bot CRUD works end-to-end
- [ ] Settings GET/POST round-trips correctly
- [ ] No unhandled exceptions in Workers logs

---

## Execution Plan

### Stream A: Foundation Fixes (Item 2 + Item 5)
**Subagent:** `fullstack-developer`
**Files to modify:**
- `src/forest/api/handlers/bot-create.ts` — enforce paper mode
- `src/tree/bot/bot-manager.ts` — add v1 mode guard
- `src/forest/bot/d1-adapter.ts` — fix duplicate hydration bug

**Estimated effort:** 30 min

### Stream B: Settings Persistence (Item 3 + Item 4)
**Subagent:** `fullstack-developer`
**Files to modify:**
- `src/lib/db/repositories.ts` — add `findSettingsByUser()`, `upsertSettings()`
- `src/lib/db/types.ts` — add `Settings` type if missing
- `src/forest/settings/actions.ts` — wire getSettings/updateRiskLimits/updateExchangeCredentials to D1
- `src/components/settings/settings-client.tsx` — wire save button, controlled state
- `src/app/api/settings/route.ts` — extend RiskSchema with cooldownMinutes/maxOpenOrders

**Estimated effort:** 45 min

### Stream C: Smoke Validation (Item 1 + Item 6 + Item 7)
**Subagent:** `tester`
**Prerequisite:** Streams A and B completed
**Files to modify:** None (read-only validation)

**Estimated effort:** 20 min

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| D1 `settings` table may not have been applied to remote | Settings persistence fails | Run `bash scripts/apply-migrations.sh` before testing |
| `loadAllBotsFromD1` hydration timing: called per-request | Cold start latency on first request | Acceptable for v1 single-user; document as known limitation |
| Exchange credential encryption not implemented | Credentials stored as plaintext in D1 | Acceptable for v1 paper-only (no real keys); add encryption before live mode |
| Bot list returns empty on first load after deploy | User sees no bots | Hydration happens on first API call; add loading state in UI (already exists) |

---

## Success Metrics

1. **Zero runtime crashes**: All UI routes return 200, no unhandled exceptions
2. **Settings persistence**: Change risk limits -> reload -> values preserved
3. **Bot persistence**: Create bot -> redeploy -> bot survives
4. **Paper-only enforced**: No code path allows live trading execution
5. **All 58 tests pass**: `npm test` green
6. **TypeScript clean**: `npm run type-check` zero errors
