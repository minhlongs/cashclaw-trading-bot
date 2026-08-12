# Memory: replan-20260812-v5 — Paper-mode-only v1 trade-bot

**Date:** 2026-08-12  
**Scope:** Paper-mode-only v1 (live mode = separate v2 milestone)  
**Target:** `/Users/macbook/trade-bot`  

## Summary of decisions recorded in `.orchestrate/latest/plan.md`

### UI Architecture
- **Choice:** OpenNext + Cloudflare Workers (`@opennextjs/cloudflare`)
- **Rationale:** Preserves Next.js 16 App Router + `next-intl@4` i18n; portable off Cloudflare if needed; zero code changes beyond adapter
- **Fallback:** `output: 'export'` + Cloudflare Pages static hosting if OpenNext proves incompatible

### CCXT
- **v1 decision:** NO CCXT — paper trading only, `src/tree/exchange/paper/index.ts` already simulates
- **v2 path:** Dedicated research needed on Workers compatibility; may need `nodejs_compat` + polyfills or raw `fetch` + exchange REST APIs

### D1 Database
- **Current gap:** `wrangler.jsonc` bindings commented out; `createServerClient()` returns null; TODOs in settings actions
- **Required actions:** (1) `wrangler d1 create cashclaw-db`, (2) fix `wrangler.jsonc` with real DB ID, (3) apply `migrations/0001_initial_schema.sql`, (4) wire `createServerClient(env)` callers, (5) persist exchange API keys + risk limits to D1

### Bilingual Docs
- **Mandatory:** All customer-facing content must have VN+EN per Sophia handover rules
- **Already using:** `next-intl` with `vi`/`en` locales; `src/messages/vi.json` + `src/messages/en.json`
- **Remaining:** Write bilingual messages for all new UI strings; verify toggle end-to-end

### Execution Roadmap (5 steps)
1. Add `@opennextjs/cloudflare`, update `next.config.mjs`, verify `npm run build`
2. Verify paper trading works without CCXT
3. Provision D1 + fix `wrangler.jsonc` + apply migration
4. Wire login mínimo + settings D1 persistence
5. Write bilingual VI/EN docs + walkthrough session

### Acceptance Criteria (Gate ≥33 tests)
- A1: `npm run build` → 0 TypeScript errors
- A2: `npm test` → all tests pass (≥33)
- A3: `npx wrangler deploy --dry-run` → exit 0
- A4: D1 migration applied; `createServerClient(env)` returns real DB
- A5: Paper trade end-to-end (no CCXT, no real orders)
- A6: UI publicly accessible without Bearer token (Paper mode)
- A7: Bilingual content (VN+EN) on all pages
- A8: No `console.log` in production code
- A9: Zod validation on all API inputs
- A10: Tier enum: `BASIC | PREMIUM | ENTERPRISE | MASTER`

### Assumptions (with confidence)
- A1: `@opennextjs/cloudflare` works with Next.js 16 + next-intl@4 (Medium — verify after install)
- A2: D1 can be provisioned via `wrangler d1 create` (High — standard Wrangler CLI)
- A3: `nodejs_compat` sufficient for CCXT in v2 (Medium — test in v2 only)
- A4: `0001_initial_schema.sql` compatible with current schema (High — schema generated from it)
- A5: Paper-mode UI does not need customer API keys (High — paper simulates)
- A6: `ADMIN_TOKEN` bearer auth sufficient for v1 ops (High — already wired)
- A7: No external SEO/analytics needing Workers (Medium — can add later)
- A8: `next-intl` config fully bilingual (High — already set up)

## Related memories
- [[project_tradebot_golive_gap]] — identified the GO-LIVE gap (no UI, no CCXT, no D1 persistence, no customer auth)
- [[feedback_verify_full_user_journey_not_just_task_scope]] — rule: don't trust pipeline's own GO-LIVE verdict; verify actual customer journey