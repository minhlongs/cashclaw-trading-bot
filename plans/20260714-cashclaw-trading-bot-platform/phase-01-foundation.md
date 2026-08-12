---
phase: 1
title: "Foundation — Scaffold, DB, Auth"
status: pending
priority: P1
effort: 1d
dependencies: []
---

# Phase 1: Foundation

## Overview
Scaffold Next.js 16 project on CF Workers, set up D1 database schema, and wire basic routing. Blocks all subsequent phases.

## Requirements
- Functional: New CF Workers project deployable via Wrangler. D1 schema for bots, trades, users, configs. Bilingual routing (VN/EN).
- Non-functional: `npm run build` passes 0 errors. Build < 2min. Cold start < 100ms.

## Architecture
```
src/
  app/
    [locale]/
      (dashboard)/          # Protected routes
        page.tsx             # Login redirect
        dashboard/
          page.tsx           # Main dashboard
        bots/
          page.tsx           # Bot list
          [id]/page.tsx      # Bot detail
        settings/
          page.tsx           # Settings
      login/page.tsx         # Public login
  components/
    ui/                      # Shared shadcn/ui components
    trading/                 # Bot-specific components
  lib/
    auth/                    # Better Auth (CF-compatible)
    db/
      client.ts              # createServerClient() — DO NOT await
      schema.ts              # D1 table definitions
      migrations/
        001-initial.ts       # Create all tables
    i18n/
      config.ts              # next-intl setup
      vi.json                # Vietnamese strings
      en.json                # English strings
    config/
      exchange.ts            # Exchange endpoint configs
      tiers.ts               # (Reserve for SaaS later)
```

## D1 Schema

```typescript
// users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  locale TEXT DEFAULT 'vi',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

// bots table
CREATE TABLE bots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('grid', 'mean_reversion')),
  pair TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance', 'bybit', 'okx')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paper_test', 'live_running', 'paused', 'error', 'stopped')),
  config_json TEXT NOT NULL,  -- grid spacing, levels, capital, etc.
  capital_allocated REAL NOT NULL,
  capital_used REAL DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  max_drawdown REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

// trades table
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id),
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  entry_price REAL NOT NULL,
  exit_price REAL,
  quantity REAL NOT NULL,
  pnl REAL,
  fee REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled', 'failed')),
  exchange_order_id TEXT,
  error_message TEXT,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  created_at INTEGER NOT NULL
);

// api_credentials table (encrypted)
CREATE TABLE api_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  exchange TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  is_testnet INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

// audit_log table
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  bot_id TEXT REFERENCES bots(id),
  action TEXT NOT NULL,
  detail_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at);
CREATE INDEX idx_audit_log_bot ON audit_log(bot_id, created_at);
```

## Related Code Files
- Create: `wrangler.jsonc`, `tsconfig.json`, `src/app/[locale]/layout.tsx`
- Create: All D1 migration files, schema types
- Modify: None (new project)

## Implementation Steps
1. `npm create cloudflare@latest` → Next.js + Workers template
2. Configure `wrangler.jsonc`: D1 binding, routes, Cron triggers
3. Set up next-intl: `i18n.config.ts`, `middleware.ts` for `[locale]`
4. Create D1 schema + run migration via `wrangler d1 migrations apply`
5. Wire Better Auth (or simple session for internal use)
6. Create shared UI component library (buttons, cards, tables per design guidelines)
7. Build login page (wireframe: `01-login.html`)

## Success Criteria
- [ ] `npx wrangler deploy --dry-run` succeeds
- [ ] D1 tables created, schema matches design
- [ ] VN/EN locale switch works at root URL
- [ ] Login page renders wireframe-accurate layout

## Risk Assessment
- **Risk:** CF Workers free tier doesn't support next.js SSR well. **Mitigation:** Use Paid plan from day 1.
- **Risk:** next-intl v4 has breaking changes from v3. **Mitigation:** Pin to v4.x, follow official CF adapter docs.
