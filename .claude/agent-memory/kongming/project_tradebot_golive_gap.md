---
name: project-tradebot-golive-gap
description: trade-bot (CashClaw) state history — the 2026-08-12 "GO-LIVE" verdict was a narrow auth+version slice; by 2026-08-15 the Phase L-S quality campaign closed most of those gaps. Current open issue is quality-gate integrity (flaky CI), not missing product wiring.
metadata:
  type: project
---

**Superseded snapshot (2026-08-12):** `.orchestrate/latest/ship-report.md` declared trade-bot "GREEN / GO-LIVE" for a task that only added a Bearer auth guard + `/api/version`. At that time: no UI deployed, ccxt absent from package.json, D1/KV bindings commented out, settings had `// TODO: persist to D1`, login form was `// TODO: wire auth`. See [[feedback-verify-full-user-journey]] for the process lesson.

**Re-verified 2026-08-15 — most of that is now FIXED.** Do not repeat the old gap list as current:
- `ccxt ^4.5.73` is a real dependency in `package.json`; `@opennextjs/cloudflare` is the deploy path (`npm run deploy`), so the Next.js app does ship.
- Settings persistence is implemented **with AES-256-GCM encryption** (`src/lib/crypto.ts`, used at `src/forest/settings/actions.ts:188-190`). Zero `TODO`/`FIXME` remain anywhere in `src/`.
- D1 is wired: 6 migrations, repositories, hydration (`src/forest/bot/d1-hydration.ts`), session-cookie middleware.
- Quality campaign Phases L-S: 1635 tests / 123 files, lint 0 warnings, TS 0 errors, coverage 87.94% stmts / 88.57% branches, zero `any` in non-test code.

**Current open issue (2026-08-15) is quality-signal integrity, not product wiring:**
- `npm test` is **flaky-red ~60% of runs** (measured 3/5 exit 1). Root cause: `src/components/settings/strategy-settings.test.tsx` leaves a 100ms `setTimeout` promise unawaited; `setSaving(false)` fires after jsdom teardown → `ReferenceError: window is not defined`. `.github/workflows/ci.yml` final step is `npm test`, so CI is intermittently red.
- Coverage thresholds in `vitest.config.ts` are **decorative** — `npm test` is `vitest run` with no `--coverage`, so CI never evaluates them.
- `quality-gates.json` is read by **nothing** and its numbers (maxWarnings 91, statements 25) contradict reality (0, 87.94).
- 13 removable no-op `eslint-disable` directives (12 confirmed unnecessary by `eslint --report-unused-disable-directives`).
- `src/land/bot-management/` (392 lines incl. tests) is a **fully orphaned module** — zero importers outside its own test.
- `src/tree/bot/*` violates the documented "`tree/` = pure domain, no I/O" contract (`docs/system-architecture.md:9,27`) by importing `patchBot`/`persistBot`/`persistTrade` from `@/forest/bot/d1-adapter`.

**How to apply:** this repo's weak spot has shifted from "is it built?" to "do the green metrics mean anything?" Verify enforcement wiring (does CI actually run the gate?) before trusting a reported metric. Re-check with `npx vitest run` several times — a single green run proves nothing on a flaky suite.
