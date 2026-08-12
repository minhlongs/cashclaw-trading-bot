---
name: trade-bot-auth-guard-verification
description: A result gate wrongly passed trade-bot auth because prod smoke probed only one exact-path endpoint; how to verify auth + version here, with verified Hono/wrangler gotchas.
metadata:
  type: project
---

Result gate for trade-bot (CashClaw) issued a PASS on 2026-08-12 claiming "protected routes require auth
in all mutating endpoints", while 4 mutating endpoints were in fact open in production. Re-evaluation
found `POST /api/cron/eval` returning 200 with no token and executing `scheduler.tick()`.

**Why:** the smoke test probed a single endpoint (`/api/bots`, an exact path that happened to match its
middleware) and generalized to "protected routes". One passing probe proved nothing about the others, and
the ship report's "Protected endpoint → 401" row was true but unrepresentative.

**How to apply:** when judging auth on this repo, never accept an aggregate claim like "protected endpoints
return 401". Require one curl per guarded endpoint, sub-paths included, and treat a handler-specific
response (e.g. 400 "Reason is required", 500 "Bot not found") as proof the guard did NOT fire. Middleware
wiring is untested by the suite: `auth-guard.test.ts` and `worker.version.test.ts` build synthetic Hono apps
and never import `src/worker.ts`, so green tests cannot detect a route/middleware mismatch.

**Verified behaviours (re-checked 2026-08-12 against this repo's installed hono + live worker):**
- `app.use('/api/bots/*', mw)` DOES match the exact path `/api/bots` as well as sub-paths — switching an
  exact-path guard to `/*` is not a regression for the bare collection route. Do not flag it as one.
- Middleware must be registered BEFORE the route handlers to fail closed on sub-paths; guard registered
  after the handlers lets the handler answer first (this is what left `/api/cron/eval` open in prod).
- `npm run deploy` is bare `wrangler deploy` with no `--var VERSION:<sha>`, and `wrangler.jsonc` has no
  `vars`. Any deploy through the npm script silently serves `{"version":"0.0.0-dev","shortSha":"0000000"}`
  from `/api/version`, so version drift is invisible unless the flag is passed manually.
- Prod URL for probes: `https://cashclaw-trading-bot.agencyos-openclaw.workers.dev`.
