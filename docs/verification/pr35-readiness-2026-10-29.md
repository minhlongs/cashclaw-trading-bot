# PR #35 readiness update — migration 0016 and browser E2E

**Review date:** 2026-10-29 (Asia/Ho_Chi_Minh)
**PR:** [#35](https://github.com/minhlongs/cashclaw-trading-bot/pull/35), remains Draft
**Base:** `main` at `11a774e820920dfbdb8e0ee52fe4599a69851770`
**Continuation started at:** `4a08e3a6c9c5fb53974d4291425f1700c9db2f59`, which was verified as both local and remote PR head before edits.
**Current change status:** changes are not committed yet; hosted checks and hosted browser run have not occurred. Do not treat this worktree report as final-head approval.

**Readiness: PARTIAL / NOT READY FOR OWNER REVIEW yet.** Migration behavior and synthetic local-D1 evaluation pass. The hosted Playwright job has run twice and failed during login: the first run only exposed timeouts; a sanitized check annotation from the second identified `403 Cross-origin request denied` because the test used `127.0.0.1` while the OpenNext Worker canonicalized its origin as `localhost`. The test base URL has now been aligned to `localhost` without changing or weakening the middleware origin check. A new hosted run is pending; no browser acceptance pass or usable screenshot/trace review is established yet. Keep the PR Draft. This is not merge, deployment, production, live-trading, or profitability approval.

## Migration 0016: evidence and impact

### What the old evidence establishes

The legacy event table records `payment_id`, `workspace_id`, `target_tier`, one current `payment_status`, `pay_amount`, `pay_currency`, `signature_verified`, and `processed_at_ms`. Two synthetic rows have `signature_verified=1` and `payment_status='finished'`. This supports the narrow statement that the old callback handler recorded those callbacks as signature-verified and finished at those historical timestamps. It is **not** a re-verifiable signed payload and does not establish a currently active entitlement.

The pre-0016 data has no payment-order binding, expected checkout price/currency, provider raw signed body or digest, purchase term, entitlement expiry, or trustworthy mapping from an event to an entitlement owner. A historical `finished` callback cannot establish how long access was bought or whether it should remain active today. `signature_verified=1` is not proof that the new order/owner/price/term checks would pass. Conversely, missing evidence, a lone `failed`/`waiting` row, or a system pseudo-owner does **not** prove that an earlier payment was invalid: the old schema/event retention cannot establish that no earlier successful payment existed. The migration therefore distinguishes **unverifiable** from **invalid** and does not label missing proof as fraud or a failed payment.

### Synthetic before/after results

Executed by `scripts/verification/pr35-migration-0016-legacy-eval.mjs` against Wrangler **local D1 only**: migrations 0001–0015, synthetic seed, then 0016. No `--remote` command was used.

| Measure | Before 0016 | After 0016 | Meaning |
|---|---:|---:|---|
| Legacy entitlements | 8 | 10 | No legacy entitlement row was deleted; two personal BASIC rows were added. |
| Non-BASIC entitlements | 6 | 6 retained, all revoked | `expires_at_ms` is null for all six. Revocation is fail-closed policy, **not a finding that six payments were invalid**. |
| BASIC entitlements | 2 | 4 | Existing BASIC remains; two valid session-backed personal BASIC workspaces are added. |
| Workspaces / OWNER memberships | Tables absent | 8 / 8 | Valid legacy owners and two personal workspaces receive memberships. |
| OWNER membership with no matching `users` row | Not applicable | 0 | The system pseudo-owner and orphan negative-control were not provisioned. |
| Legacy IPN event rows | 4 | 4 retained | Two signed-finished, one waiting, one failed; retained, not copied into the new history table. |
| New IPN history / payment orders | Tables absent | 0 / 0 | No legacy order or signed event was fabricated. |
| Bots | 2 | 2 | Both preserved and assigned to their matching personal workspace. |
| Orphan negative control | One BASIC entitlement + one orphan session | No workspace, membership, or personal workspace | Missing user identity fails closed without deleting source rows. |

Per-row pre/post outcome from the synthetic table:

| Legacy workspace | Old evidence | Owner has `users` row? | After 0016 |
|---|---|---:|---|
| `legacy-paid-finished-proof` | `finished`, signature flag 1 | Yes | PREMIUM retained, revoked; no expiry/order can be inferred. |
| `legacy-paid-no-proof` | No event row | Yes | PREMIUM retained, revoked; unknown is not invalid. |
| `legacy-paid-expired-like` | Old `finished`, signature flag 1 | Yes | ENTERPRISE retained, revoked; timestamp cannot establish term or present expiry. |
| `legacy-paid-failed-payment` | `failed`, signature flag 1 | Yes | PREMIUM retained, revoked; this event does not exclude an earlier success. |
| `legacy-paid-pending-payment` | `waiting`, signature flag 1 | Yes | PREMIUM retained, revoked; pending is not proof of payment, but history is incomplete. |
| `legacy-paid-system-owner` | No event row | No (`system`) | MASTER retained, revoked; no workspace or membership. |
| `legacy-basic` | BASIC | Yes | BASIC retained; workspace and owner membership provisioned. |
| `legacy-orphan-basic-negative-test` | BASIC; no event | No (`legacy-user-missing`) | Source entitlement retained; no workspace/membership or personal workspace. |
| `personal:legacy-user-a`, `personal:legacy-user-b` | Valid user/session | Yes | Two new BASIC workspaces; existing bots assigned/preserved. |

The five synthetic paid-owner IDs in the corrected seed have `users` rows; the sixth non-BASIC record uses the special `system` owner. A separate, explicitly labeled negative control has a BASIC entitlement and session for `legacy-user-missing`, with no corresponding user. The evaluator passes only when the orphan receives no workspace or membership, and it checks the session resolver joins `user_sessions` to `users`.

The earlier six missing-user membership results were a **synthetic fixture defect**: that seed inserted entitlement owners without inserting their corresponding users. They are not evidence that six production customers are orphans. However, the pre-0016 entitlement, session, and bot tables have no foreign keys to `users`; real orphan rows are therefore possible integrity cases. No production data was queried. The read-only preflight now reports entitlement owners, sessions, and bots missing users separately; run it against a protected, authorized pre-migration snapshot and review each result. Do not equate an orphan identity with an invalid payment or grant access solely because a payment record exists.

### Applied migration behavior and owner choices

Migration 0016 now creates entitlement-derived workspaces/memberships only when an owner exists in `users`; session/bot personal-workspace backfills and bot workspace assignment also require a matching user. Session authentication joins `user_sessions` to `users`, rejecting orphan sessions. Historical paid rows and legacy events are retained. The six non-BASIC rows remain visible but revoked because the old schema cannot prove an expiry. This is conservative access behavior, not payment adjudication.

No grace period or recovery grant has been applied. Owner choices remain:

1. **Keep strict fail-closed behavior:** old unverifiable paid rows stay at BASIC until manually reconciled. Lowest unauthorized-access risk; legitimate customers may temporarily lose paid access.
2. **Approve a time-bounded grace policy:** define eligible rows, a fixed end date, and scope (for example, only existing non-system owners with active user records). This could preserve real subscribers, but risks granting access to unpaid, failed, pending, expired, or unprovable rows. No grace duration or eligibility rule is chosen here.
3. **Approve case-by-case evidence recovery:** reconcile provider/contract evidence to exact owner, workspace, payment/order, expected amount/currency, product term, and an explicit expiry; require reviewer and auditable per-row manifest. Only exact approved rows should be restored, with a positive and negative local-D1 test before any separate change. The legacy callback row alone is insufficient. No recovery importer or automatic grant is included in this change.
4. **Do not restore unverifiable rows:** retain the revocation and direct customers to a new properly bound order or support review. This avoids inferring rights but carries the highest customer-access impact.

The team owner must select policy before any production migration. Do not run migration remotely as part of this PR.

Evidence files: `docs/verification/artifacts/pr35-migration-before.json`, `pr35-migration-preflight.json`, `pr35-migration-after.json`, and `pr35-migration-0016-summary.json`. The read-only preflight was executed against the synthetic pre-migration snapshot and found the intentionally orphaned `system` and `legacy-user-missing` owners, one orphan session, and no orphan bots; these are fixture results, not production counts. Read-only SQL: `docs/verification/pr35-0016-legacy-preflight.sql`.

## Browser E2E implementation and evidence status

Added an actual Playwright suite targeting the built OpenNext Worker and isolated Wrangler local D1; HTTP/jsdom tests are not being counted as browser E2E. The suite covers synthetic A/B login and session/workspace isolation; Vietnamese/English hydration; Operations create/reload/status/history/version; a two-tab compare-and-swap conflict; loading/empty/validation/error states; mobile layout; skip-link keyboard/focus; axe WCAG 2.1 A/AA scan; screenshots; and persistence/history after stopping and relaunching the Worker against the same D1 directory.

Requested Playwright config is explicit: raw output `.wrangler/verification/pr35-playwright-raw`, `line` reporter, no `webServer` or `reuseExistingServer`, 60-second test timeout, zero retries, 1365×900 default viewport, trace on, 10-second expect timeout, headless. The PR-only GitHub Actions job installs Chromium in the hosted runner, runs the Worker/local-D1 harness, and uploads screenshots, sanitized traces and logs for 14 days. The harness removes its secret-bearing test setup, redacts known synthetic credentials, secret/session/auth/signature data from text and trace ZIP contents, checks for leaks, and fails if checks fail; a scrubber self-test is included.

**Browser outcome: HOSTED ATTEMPTS FAILED; acceptance remains unverified.** GitHub Actions installed Chromium and ran the suite on heads `685037e` ([run 40904530585](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/40904530585)) and `1bd935a` ([run 40907035318](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/40907035318)); both browser jobs failed. The first diagnostic was hidden by the runner log transport. The second run's sanitized Check annotation identified login `POST /api/auth/login` as HTTP 403 `Cross-origin request denied` for `127.0.0.1`. A local HTTP check confirmed the same Origin on `localhost:8787` returns 200 while `127.0.0.1:8787` is rejected; the harness and Playwright default now use `localhost` while retaining the middleware's cross-origin protection. A new hosted run on the fix is pending. Artifacts were uploaded for both failed runs, but their Azure blob download host is blocked from this sandbox, so the run's artifacts are accessible to the owner through the Actions UI but were not downloaded or inspected here. Playwright discovery is not execution; do not claim hydrated browser acceptance until the fixed hosted run passes and artifacts are reviewed.

Separate local OpenNext Worker + Wrangler D1 regression evidence is available and is not a substitute for browser execution: 13 runtime checks passed over Worker HTTP; after terminating and restarting the Worker against the same isolated D1, two restart/readback checks passed. These prove behavior in this local Worker/D1 configuration only, not hosted-browser behavior or production D1 semantics. Results: `docs/verification/artifacts/pr35-worker-runtime-results.json` and `pr35-worker-restart-results.json`.

## Checks completed in this worktree

| Check | Result |
|---|---|
| Migration 0016 local-D1 evaluator | PASS: exact synthetic before/after counts above; source rows retained; orphan negative control rejected. |
| Playwright discovery | PASS: 4 tests discovered; no browser was launched. |
| `npm run type-check` | PASS. |
| `npm run lint` | PASS (`eslint src/ --max-warnings 0`). |
| `npm run build:worker` | PASS: OpenNext Cloudflare Worker bundle built. Existing Next middleware deprecation warning remains. |
| `npm test` | PASS: 729 test files / 6,092 tests; existing Vitest `environmentMatchGlobs` deprecation and synthetic expected-failure logs remain. |
| Targeted D1/auth tests | PASS: 2 files / 19 tests after correcting the D1 fixture to insert its synthetic `users` rows. |
| OpenNext Worker HTTP regression | PASS: 13 checks with local Wrangler D1; results linked above. |
| Worker restart/readback | PASS: 2 checks with same isolated local D1; results linked above. |
| Artifact scrubber self-test | PASS: synthetic email/passcode, session cookie, authorization, secret, and signature redaction in JSON and trace ZIP. |
| `npm audit` | 22 findings in the dependency tree (7 moderate, 11 high, 4 critical); none of the newly added direct browser/archive packages were named in the vulnerable-package report. Not remediated in this scoped change. |
| Browser Playwright discovery | PASS: 4 tests listed; this did not launch a browser. |
| Browser E2E execution, coverage, Knip/dead-code suite, final-HEAD GitHub CI/governance | NOT YET VERIFIED for this uncommitted change set. |

## Finalization required

1. Inspect and finish all files; run `git diff --check`, lint and appropriate full tests.
2. Commit/push only to `arena/06ec4bf4-cashclaw-trading-bot`; keep PR #35 Draft.
3. Wait for the new PR-only hosted browser job and ordinary CI/governance on the exact final SHA. Review and download-check sanitized screenshot/trace/log artifacts; report exact run URLs and results. Fix any failure without skipping or weakening an assertion.
4. Update this report and PR body with final exact head/check statuses and artifact links. If hosted browser execution is blocked or fails, leave PARTIAL/BLOCKED and name the blocker.

No merge, deployment, remote migration/query, provider call, production secret, live operation, real payment, or real-money use occurred or is authorized by this work.
