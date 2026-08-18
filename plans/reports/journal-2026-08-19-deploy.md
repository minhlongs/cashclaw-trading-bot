# Journal — 2026-08-19 — Production Deploy (Go-Live)

## What happened

Deployed the CashClaw paper-trading platform to Cloudflare Workers
production. This is the accepted brainstorm contract from the
`/ak-cook --auto --parallel` invocation — "next task go live."

The platform ships as **paper-only**. The falsification campaign concluded
with a NO-GO (all 24 hypothesis classes falsified, zero persistent OOS
positive expectancy on OHLCV/funding/OI data), so the honest product is a
research/paper platform — not a live trader. No real orders, no live capital.

## What I did today

**Scout first.** A deployment-infra scout found three blockers before the
runbook was even usable:

1. **Deploy script name mismatch.** `docs/deploy-runbook.md` referenced
   `npm run deploy:worker`, which does not exist in `package.json`. The real
   script is `npm run deploy` — it injects `GIT_COMMIT_SHA` and
   `BUILD_TIMESTAMP` from the current commit, then runs OpenNext build +
   deploy. Fixed the runbook (both EN and VN sections).
2. **Stale KV binding checklist.** The runbook's pre-deploy checklist asked
   for a KV binding that no longer exists in `wrangler.jsonc`. Verified:
   `CACHE` is declared optional in `src/lib/db/types.ts` but is never read at
   runtime. Rewrote the checklist to the actual required secrets/vars.
3. **No `.env.example`.** The repo had none — developers and CI had to read
   source to learn required secrets (`ADMIN_TOKEN`, `ENCRYPTION_KEY`) and
   vars (`ALLOWED_ORIGINS`, `VERSION`, `GIT_COMMIT_SHA`,
   `BUILD_TIMESTAMP`). Added one. Also un-ignored it in `.gitignore` — the
   `.env.*` glob was catching it.

**Pre-deploy gates (all green):**
- `npm run type-check` — 0 errors
- `npm run lint` — 0 warnings (`--max-warnings 0`)
- `npm run build` — clean
- `npm test` — 1880/1880 passing

**Deploy:** `npm run deploy` → `https://cashclaw-trading-bot.agencyos-openclaw.workers.dev`

**Post-deploy smoke (all pass):**
- `/api/health` → `{"status":"ok","checks":{"db":"ok","circuitBreaker":"ok","rateLimiter":"ok"}}`
- `/api/version` → `shortSha: 00c81b3f`, `environment: production`
- `/api/killswitch-status` → 200
- `/api/metrics` → 200

**Docs updated:** `docs/development-roadmap.md` (new Go-Live section),
`docs/project-changelog.md` (new entry), this journal.

## Why it matters

A deploy runbook that points at a nonexistent command is worse than no
runbook — it invites a failed deploy under pressure. The KV binding check was
asking operators to configure something the app never reads. Both were
silent failures waiting to happen. Fixing them before go-live means the
next deploy (or a rollback) actually works.

The `ENCRYPTION_KEY` secret is still not set on Cloudflare, but this is not
a data-loss risk: `api_credentials` is empty in production D1, and
`getEncryptionKey()` falls back to plaintext passthrough when the key is
absent. Flagged as a follow-up so it gets set before the first real customer
stores credentials.

## Open item

`ENCRYPTION_KEY` secret is unset on Cloudflare. Set it via
`wrangler secret put ENCRYPTION_KEY` before any customer stores exchange
credentials — otherwise those credentials persist in plaintext.

## Verified

- Production health endpoint returns `status: "ok"` with all three probes
  green.
- SHA in `/api/version` (`00c81b3f`) matches the deployed commit.
- No secrets committed; `.env.example` is the only env file tracked.