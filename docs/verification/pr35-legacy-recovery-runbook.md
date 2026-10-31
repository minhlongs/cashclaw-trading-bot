# PR35 — Legacy entitlement recovery runbook (case-by-case audited restoration)

**Status:** owner policy locked 2026-10-30. This runbook and its tooling are prepared and tested on
synthetic data and isolated local Wrangler D1 only. **Nothing here has been applied to production.**
No grace period, auto-renewal, remote migration, provider call, or real entitlement restoration has
been performed or is authorized by this document.

## 1. Owner policy (locked; not yet applied to production)

1. Entitlements lacking proof remain locked out of paid access (fail closed). Data, history and bots
   are preserved.
2. No grace period and no auto-renewal is granted.
3. Missing proof is **never** treated as proof that the customer did not pay.
4. Restore only when all of the following are verified: identity + membership, payment-order-workspace
   binding, payment status, amount/currency, tier, and the entitlement term (expiry).
5. A signed legacy event alone is **insufficient** when it lacks the information needed to determine
   the entitlement and its expiry.
6. Restores must be performed by an authorized operator and carry actor, reason, evidence references,
   before/after state, and durable audit.
7. Secrets and raw payment payloads must never be written into audit.
8. Retries must not extend or grant additional entitlement; concurrent operations must not overwrite
   incorrectly.
9. No provider calls and no production data changes happen in this session.

## 2. Migration 0016 review under the policy: automatic vs manual

Migration 0016 (plus 0015) does the following **automatically** — all consistent with the policy:

- Fails closed: every non-BASIC entitlement row without a verifiable expiry/order is marked revoked
  (`revoked_at_ms`); the row itself is preserved.
- Preserves all legacy callback events (append-only history), bots, and entitlement rows; assigns
  bots to deterministic personal workspaces; provisions workspaces/OWNER memberships only for
  owners with real `users` rows (never for orphans or pseudo-owners).
- Provisions personal BASIC workspaces for session/bot owners. No paid access is granted anywhere.
- Does **not** restore anything, does **not** infer payment validity, does **not** grant grace, and
  does **not** extend any term. A historical `signature_verified=1` + `finished` callback proves only
  that the old handler recorded it that way; the legacy schema has no raw signed body, order binding,
  amount/currency expectation, or term/expiry — so it can never be auto-converted into access.

Everything else is **manual recovery** (section 4): per-case restoration after external
reconciliation with provider records (performed by the owner outside this tool; the tool never calls
providers). No behavior change to migration 0016 is required by the policy.

## 3. Recovery mechanism (minimal, architecture-matched)

- **`migrations/0017_legacy_entitlement_recovery_audit.sql`** — `saas_entitlement_recovery_audit`
  (append-only via triggers) plus two triggers that make the audit row and the entitlement restore a
  **single SQLite statement**:
  - `saas_entitlement_recovery_apply_guard` (BEFORE INSERT): re-verifies the ENTIRE decision basis
    at mutation time and aborts unless it is intact: the entitlement is still in the exact verified
    prior state (compare-and-swap on tier/`revoked_at_ms`/`expires_at_ms`/`current_payment_id`), the
    owner identity row exists, the workspace is still active with the same owner, the active unexpired
    OWNER membership still exists, and the matched payment evidence (legacy IPN event or payment
    order, recorded as `evidence_kind`/`evidence_order_id` in the audit row) is still present and
    unchanged (status, tier, amount, currency, binding). It also refuses any restore whose term has
    already ended at apply time (`restored_expires_at_ms > applied_at_ms`), so an expired entitlement
    can never be turned into an active one. Stale or concurrent retries abort without granting
    anything.
  - `saas_entitlement_recovery_apply_restore` (AFTER INSERT): performs the restore (clear
    `revoked_at_ms`, set `expires_at_ms` to the attested original term end, bind
    `current_payment_id`) and then re-checks the post-state; unless the restore landed exactly one
    row in the exact target state the whole statement aborts and rolls back — audit row included. A
    no-op UPDATE, a missing row or a wrong/partial update can never leave a "restored" audit record.
  - `recovery_id` primary key: a duplicate case id can never grant again. UPDATE/DELETE on the audit
    are rejected (append-only).
- **`scripts/verification/pr35-legacy-recovery-tool.mjs`** — local CLI (wrangler d1). Dry-run is the
  default; `--apply` is required to mutate. It performs the evidence verification (section 5) and
  records the audit row. It creates **no HTTP endpoint and no generic entitlement bypass**, and it
  never calls providers. `--remote` is refused unless `PR35_RECOVERY_ALLOW_REMOTE=1` (owner-run
  production sessions only; never set in verification). Exit codes: `0` dry-run OK / applied /
  idempotent already-applied; `1` usage error or remote gate refused; `2` case rejected.
- **`docs/verification/pr35-legacy-recovery-preflight.sql`** — READ-ONLY classification of every
  non-BASIC entitlement row into recovery-review classes (candidate-order-backed-evidence,
  candidate-legacy-evidence-needs-manual-term, reject-identity-unverified,
  reject-membership-unverified, reject-payment-evidence-not-finished, reject-no-payment-evidence,
  already-active-or-not-revoked). SELECT-only; never modify it to mutate data.

### Evidence scope and attestation (important)

The tool verifies case claims against **local database records only** (legacy
`saas_nowpayments_ipn_events` rows and server-created `saas_payment_orders` rows). Reconciliation
against provider dashboards/records is performed by the operator OUTSIDE the tool and is recorded as
**operator attestation** (`termBasis`, `evidenceRefs`) — it is NOT automated provider verification.
In particular the original entitlement term is operator attestation: the legacy schema has no term
field, so the tool enforces only internal consistency (term after the verified payment time, not yet
ended at apply time, within a hard 5-year sanity horizon and absolute year-3000 ceiling). A case
file can therefore never self-create payment proof (evidence rows must pre-exist and match exactly)
and can never extend or renew rights (idempotent `recovery_id`, CAS, term guards), but it cannot
machine-prove the historical term — that is what the two-person review and `termBasis` attestation
are for.

## 4. Case file (operator-authored; evidence-bound)

`scripts/verification/recovery-cases/*.json` — schema (all fields required):

| Field | Meaning |
| --- | --- |
| `caseId` | Unique recovery id (audit primary key). An identical retry is `already-applied` (no-op); a reused id with ANY different payload is `recovery-id-conflict` — never silently treated as approved |
| `actor` | Operator identity, 3-200 chars from `[A-Za-z0-9._:@ /<>+-()]` (no credentials/control characters; sensitive-keyword strings are rejected) |
| `reason` | Why this restore is legitimate (plain text; secret/signature/payload/password/passcode/cookie/token/authorization strings are rejected) |
| `workspaceId`, `ownerUserId`, `tier` | The entitlement being restored (tier must match the stored row) |
| `paymentId`, `paymentStatus` | The verified payment; `paymentStatus` must equal the status recorded in the matched evidence row |
| `priceAmount`, `priceCurrency` | Verified amount/currency (must match stored evidence; finite, bounded, alphabetic code) |
| `termEndsAtMs` | The **original** entitlement term end from provider records (never `now + term`); must be a safe positive integer, later than the payment time and the apply time, and within the sanity horizon |
| `termBasis` | How the term was determined — operator attestation (provider record reference) |
| `evidenceRefs` | Non-empty reference strings (invoice/record ids). Sensitive-keyword strings are rejected |
| `orderId` (optional) | Asserts which payment order was matched; a mismatch is rejected |

Evidence accepted by the tool (either source must match fully): a `saas_payment_orders` row with
`provider_payment_id` equal to the claimed payment id, bound to the workspace/owner,
`status='finished'`, `paid_at_ms` present, matching amount/currency/tier; **or** a legacy
`saas_nowpayments_ipn_events` row with `signature_verified=1` and `finished`/`confirmed`, matching
payment id, workspace, tier, amount and currency. An order_id-only match can never verify the
claimed payment id. A signed event without a reconciled term is rejected (case-005 demonstrates
this); an already-ended term is rejected (`term-already-ended`) and routed to customer-service
compensation instead (never a recovery restore).

## 5. Procedures

### Controls: what is code-enforced vs what is procedure

**Code-enforced (DB/CLI):** dry-run default; `--remote` env gate; evidence re-verification and CAS
at mutation time (identity/workspace/membership/payment evidence/entitlement prior state); term
guards (not ended at apply time, within horizon, safe integers); `recovery_id` idempotency and
conflict detection; append-only audit; atomic audit+restore with post-state rollback; actor/reason/
ref hygiene (no secrets or payloads); exact exit codes.

**Procedural only (NOT code-enforced):** the two-person review below is a runbook step — the CLI
only records an `actor` string and cannot verify who actually reviewed or approved the case.
External provider reconciliation is operator attestation. Role separation, backup custody and
stakeholder sign-off are likewise organizational controls. Do not describe the system as having
technical two-person enforcement.

**Rollout order (production, owner-run later — NOT done here):**
1. Back up D1 (export the database). Verification: the backup artifact exists, is non-empty, and a
   spot-check query (`COUNT(*)` on `saas_workspace_entitlements`, `saas_nowpayments_ipn_events`,
   `saas_payment_orders`, `bots`, `users`) equals the pre-backup counts recorded in the run log.
   Restore drill: restore the backup into an isolated local Wrangler D1 (`wrangler d1 execute
   --file`, `--persist-to` a scratch dir) and re-run the same counts there; only then is the backup
   considered valid.
2. Capture the pre-migration preflight (`pr35-0016-legacy-preflight.sql`, read-only) and archive it
   with the run log.
3. Writer drain/cutover: stop old writers first (0016 is one-way for old writers; see migration
   notes). Verification: writer metrics/logs show zero writes for the drain window, and a smoke
   request through the old writer path is rejected/queued rather than silently writing.
4. Apply migrations 0015 → 0016 → 0017 in order. Verification: `d1 migrations list` shows all three
   applied; the 0016 evaluator expectations hold on production counts (unverifiable rows revoked;
   events/bots/memberships counts unchanged from the pre-migration capture).
5. Run `pr35-legacy-recovery-preflight.sql` (read-only) and review the classification with
   stakeholders before any per-case recovery.

**Recovery order (per case, authorized operator, later):**
1. Reconcile the claim against provider records **outside** this tool (no provider calls from the
   tool); record what was reconciled as operator attestation.
2. Author the case file with identity/membership, binding, status, amount/currency, tier, original
   term + basis, and evidence references.
3. Dry-run (default): `node scripts/verification/pr35-legacy-recovery-tool.mjs --cases <file>`.
4. Review the printed plan (before → after) with a second person (procedural control — see above).
5. Apply: same command with `--apply`. Re-read the audit row and entitlement row.
6. Audit review: `saas_entitlement_recovery_audit` rows are the durable record (before/after, actor,
   reason, refs); the table is append-only.

**Rejection is a first-class outcome**: insufficient/wrong evidence leaves the row revoked and writes
nothing. Missing proof is not a finding of non-payment; it stays a manual-review queue entry.

## 6. Idempotency and concurrency semantics (proven on synthetic data)

- Duplicate retry of a recorded `caseId` with identical payload → `already-applied`; no mutation,
  term never extended. The CLI exits `0` (idempotent success).
- Reused `caseId` with ANY different payload → `recovery-id-conflict` (verify) / same on a racing
  INSERT (the tool compares the recorded payload and never reports the new payload as approved).
- Stale/concurrent apply (state changed since verification — entitlement, membership, owner, or
  payment evidence) → `cas-conflict`; the guard aborts the audit INSERT (and with it the restore)
  atomically; nothing is granted and no wrong overwrite occurs.
- Two different recovery ids targeting one entitlement: only the first verified apply lands; the
  stale racer is `cas-conflict`, a later fresh attempt is `entitlement-not-revoked`.
- A restore term that has already ended at apply time → `term-already-ended` (tool) — and the SQL
  guard enforces it even for stale snapshots: an expired entitlement can never become active.
- Trigger/storage failure during the restore and no-op/wrong updates both roll back the audit row
  with the entitlement (single-statement atomicity + post-state check).
- A second INSERT reusing a recorded `caseId` on any row → primary-key abort.
- The audit row and the restore are one statement: a restore cannot exist unaudited, and an audit
  row cannot exist without its restore.

## 7. Evidence produced on synthetic data / local D1 (`pr35-legacy-recovery-eval.mjs --reset`)

24 PASS stages, including:
- Baseline: 0016 fail-closed state intact; read-only preflight classifies all 6 rows exactly.
- Case-file rejections: 25 malformed/hostile inputs (bad actor, credential-like actor, sensitive
  keywords in actor/reason/termBasis/refs, NaN/Infinity/overflow/fractional/string/missing terms,
  bad amounts/currencies/tiers/ids).
- CLI exit-code contract: usage/gate = 1, dry-run OK = 0, reject = 2, already-applied = 0,
  conflicting duplicate = 2; `--remote` refused without the env gate.
- Verify rejections: tier/status/currency/binding mismatches, elapsed term, horizon overflow — all
  read-only, 0 audit rows.
- Static fixtures: missing/failed/waiting proof, wrong amount, system owner, orphan BASIC, term-less
  signed event — fail closed with explicit reasons; rows stay revoked.
- Order-backed evidence with strict `provider_payment_id`+workspace binding; order refunded between
  verify and apply → `cas-conflict`; clean apply records `evidence_kind`/`evidence_order_id`.
- Stale-verify CAS: membership revocation, owner change, tier change, expiry change, evidence amount
  change and evidence signature change between verify and apply all abort with `cas-conflict`.
- DB-level term guard blocks an elapsed restore even with a stale snapshot.
- Simulated storage failure inside the restore trigger: audit row and entitlement roll back together;
  the same case then applies cleanly (no PK residue). A zero-row restore UPDATE cannot leave a
  "restored" audit record (post-state guard).
- Duplicate semantics (identical retry / conflicting payload / racing id on a different target),
  two-ids-one-entitlement race, primary-key backstop, append-only audit, audit hygiene
  (no secret/signature/payload strings; evidence kind recorded).
- Preservation: payment history, orders, bots, memberships, users and workspaces are byte-identical
  before/after the whole run; the 4 unverifiable rows stay revoked with no expiry granted.

Migration 0016 evaluator (`pr35-migration-0016-legacy-eval.mjs --reset`) also runs in CI and passes.
A third evaluator, `pr35-ops-scheduling-eval.mjs --reset`, proves the migration 0018 semantics
(ops approval CAS/atomic transitions, append-only approval audit, durable tick leases, alert
dispatch dedup/retry) on the same isolated local D1 basis. All evaluators run in the hosted CI job
**Migration + legacy recovery evaluators (isolated local D1)** on every pull request — isolated
local Wrangler D1 only, no secrets, no remote D1, strict assertions and nonzero exit codes.

Artifacts: `docs/verification/artifacts/pr35-recovery-preflight.json`,
`docs/verification/artifacts/pr35-recovery-summary.json` (also uploaded as a CI artifact).

## 8. Browser E2E artifact review status

The hosted browser suite passes on `59d7993` (run
[`41017846377`](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41017846377)), and on
earlier heads `62498f9` (run
[`41011314634`](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41011314634)) and
`7c4a73f` (run
[`41010114785`](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41010114785)).
The newest head's run and artifact links are maintained in the PR body (authoritative live record);
the runs listed here cover the heads named with each link.
**Artifact contents have NOT been viewed in this sandbox**: downloads redirect to
`productionresultssa*.blob.core.windows.net`, which is unreachable here (re-confirmed 2026-10-30,
`EOF`). Direct links for the reviewer (each artifact covers the specific head noted above):

- Latest head `59d7993`: https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41017846377
  (browser job artifact `pr35-browser-e2e-59d7993…`; see the run's Artifacts section)
- https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41011314634/artifacts/12957797140
  (`pr35-browser-e2e-…`, 6,184,398 bytes; screenshots, sanitized traces, logs, manifest — head `62498f9`)
- https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41010114785/artifacts/12956764872
  (5,811,976 bytes — head `7c4a73f`)

## 9. Boundaries (never)

- No merge, deploy, remote D1 migration/query, production restoration, live trading, real payment.
  No remote recovery is performed by this session or its tooling runs.
- No grace period, auto-renewal, or term extension — ever, including on retry.
- No provider calls from the tool; no secrets/payloads in case files or audit.
- No public recovery endpoint; no generic entitlement bypass.
- Rejected/missing proof is never recorded as customer non-payment.
