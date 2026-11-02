# PR #35 local Worker/D1 verification

This is an isolated regression harness for PR #35. It uses Wrangler local mode, synthetic users/orders, and local D1 persistence only. The HTTP tests refuse non-loopback destinations. They do not call a provider or use a production credential. These checks are Worker→D1 tests, not browser E2E.

## Worker + D1 runtime and restart checks

From the repository root:

```sh
npm run build:worker
node scripts/verification/pr35-worker-d1-setup.mjs --reset
npx wrangler dev --local --ip 0.0.0.0 --port 8787 \
  --persist-to .wrangler/verification/pr35-d1-worker \
  --config .wrangler/pr35-local.jsonc \
  --show-interactive-dev-session=false
```

In a second terminal while the Worker is running:

```sh
node scripts/verification/pr35-worker-d1-regression.mjs
```

The regression script writes `.wrangler/verification/pr35-worker-runtime-results.json`. It checks Worker-bound D1 health and data, synthetic A/B authentication, localized Operations server render and workspace isolation, Operations create/history/version/CAS conflict, failed bot creation reservation release, an eight-way BASIC quota race and persisted/listed-bot count, spoofed quota claims, invalid/valid signed callbacks, order/amount binding, duplicate/concurrent/out-of-order callback sequencing, injected D1 write faults with rollback/retry, and refund behavior.

To verify process restart persistence, stop the Wrangler dev process completely, start the exact same command again against the same D1 persistence directory, then run:

```sh
node scripts/verification/pr35-worker-d1-restart-check.mjs
```

This verifies the Operations item/history/version, bot and reservation, workspace entitlement, callback idempotency, and terminal refund readback after restart. The restart result is written to `.wrangler/verification/pr35-worker-restart-results.json`.

`--reset` removes only `.wrangler/verification/pr35-d1-worker`, the named isolated test database. The setup script generates a fresh local HMAC secret, writes ignored local Wrangler config/vars, applies local migrations, and seeds the two fixed synthetic test accounts. It never adds a test bypass or hook to production code. The default synthetic passcodes are in the test scripts; override them with `PR35_USER_A_PASSCODE` / `PR35_USER_B_PASSCODE` if desired. Keep `.wrangler/` files out of commits and do not copy local secrets into artifacts.

## Migration 0016 synthetic legacy-state evaluation

This creates a separate isolated local D1 database, applies migrations 0001–0015, seeds representative synthetic entitlement/event/session/bot states, captures pre-state, applies 0016, captures post-state, and asserts the row impacts:

```sh
node scripts/verification/pr35-migration-0016-legacy-eval.mjs --reset
```

`--reset` deletes only `.wrangler/verification/pr35-migration-d1`. The output artifacts are sanitized and saved under `docs/verification/artifacts/`. The synthetic seed is maintained in `scripts/verification/pr35-migration-0016-legacy-seed.sql`.

A read-only production-preflight query (not run against remote D1 in this work) is provided at `docs/verification/pr35-0016-legacy-preflight.sql`. It is intended to be reviewed and run only after the owner approves a migration plan and backup. It contains no mutations.

## Durable artifacts and known gaps

- `artifacts/pr35-worker-runtime-results.json` — 13 passing Worker HTTP/D1 checks.
- `artifacts/pr35-worker-restart-results.json` — restart/readback and callback replay pass.
- `artifacts/pr35-migration-before.json`, `pr35-migration-after.json`, `pr35-migration-0016-summary.json` — synthetic 0016 before/after data and impact summary.
- No browser screenshots exist. No Playwright/Chromium E2E was run because this environment has no browser executable and the required Playwright browser archive is hosted at `cdn.playwright.dev`, which is outside the available outbound host set. Do not treat Worker SSR HTTP responses or jsdom tests as hydrated browser E2E. Browser interaction, mobile, loading/empty/validation/error rendering, accessibility, and screenshots remain unverified.
