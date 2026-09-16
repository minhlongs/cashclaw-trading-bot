---
name: worker-modularization-plan
description: Cloudflare worker entrypoint (src/worker.ts) modularization architecture and ship plan
metadata:
  type: project
---

Modularization plan for `src/worker.ts` written to `.orchestrate/latest/plan.md` on 2026-09-14.

**Decomposition Structure:**
- `src/worker/types.ts` (~25 LOC): `WorkerEnv`, `ScheduledEvent`, `ScheduledReport`
- `src/worker/middleware.ts` (~70 LOC): CORS origin matching, prettyJSON, Hono logger, static assets Next.js fallback, protected auth guards
- `src/worker/routes.ts` (~115 LOC): system probes (/api/health, /api/version), operator bot routes (/internal/api/bots/*), killswitch, events, daily stats, cron eval, 404, 500
- `src/worker/scheduled.ts` (~65 LOC): `BotManager.drainQueues()`, queue drainage logging, isolated microstructure ingest pipeline
- `src/worker.ts` (~40 LOC): facade assembling middleware, routes, scheduled export, and `type Env = WorkerEnv`

**Quality & Invariants:**
- Every file <= 120 LOC (far below <= 150 LOC target and <= 200 LOC ceiling)
- 100% backward compatibility for CF edge runtime and 28 existing worker tests
- 0 TS errors, 0 ESLint warnings, 0 Knip issues, all 4,108+ tests pass
- Ship plan: pre-deploy gates → commit → `npm run deploy` → smoke test live endpoints → changelog sync
