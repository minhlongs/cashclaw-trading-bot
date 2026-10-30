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
  - `saas_entitlement_recovery_apply_guard` (BEFORE INSERT): aborts unless the entitlement is still
    exactly in the verified prior state (compare-and-swap on `revoked_at_ms`/`expires_at_ms`/
    `current_payment_id`). Stale or concurrent retries abort without granting anything.
  - `saas_entitlement_recovery_apply_restore` (AFTER INSERT): performs the restore (clear
    `revoked_at_ms`, set `expires_at_ms` to the evidence-declared original term end, bind
    `current_payment_id`).
  - `recovery_id` primary key: a duplicate case id can never grant again (idempotent retry; terms are
    never extended). UPDATE/DELETE on the audit are rejected (append-only).
- **`scripts/verification/pr35-legacy-recovery-tool.mjs`** — local CLI (wrangler d1). Dry-run is the
  default; `--apply` is required to mutate. It performs the evidence verification (section 5) and
  records the audit row. It creates **no HTTP endpoint and no generic entitlement bypass**, and it
  never calls providers. `--remote` is refused unless `PR35_RECOVERY_ALLOW_REMOTE=1` (owner-run
  production sessions only; never set in verification).
- **`docs/verification/pr35-legacy-recovery-preflight.sql`** — READ-ONLY classification of every
  non-BASIC entitlement row into recovery-review classes (candidate-order-backed-evidence,
  candidate-legacy-evidence-needs-manual-term, reject-identity-unverified,
  reject-membership-unverified, reject-payment-evidence-not-finished, reject-no-payment-evidence,
  already-active-or-not-revoked). SELECT-only; never modify it to mutate data.

## 4. Case file (operator-authored; evidence-bound)

`scripts/verification/recovery-cases/*.json` — schema (all fields required):

| Field | Meaning |
| --- | --- |
| `caseId` | Unique recovery id (audit primary key; retries reuse it and are no-ops) |
| `actor` | Authorized operator identity (no credentials) |
| `reason` | Why this restore is legitimate (plain text) |
| `workspaceId`, `ownerUserId`, `tier` | The entitlement being restored (tier must match the stored row) |
| `paymentId`, `paymentStatus` | The verified payment (`finished`) |
| `priceAmount`, `priceCurrency` | Verified amount/currency (must match stored evidence) |
| `termEndsAtMs` | The **original** entitlement term end from provider records (never `now + term`) |
| `termBasis` | How the term was determined (provider record reference) |
| `evidenceRefs` | Non-empty reference strings (invoice/record ids). Strings matching secret/signature/payload/password/passcode/cookie/token patterns are rejected |

Evidence accepted by the tool (either source must match fully): a `saas_payment_orders` row bound to
the workspace/owner with `status='finished'`, matching amount/currency/tier; **or** a legacy
`saas_nowpayments_ipn_events` row with `signature_verified=1` and `finished`/`confirmed`, matching
workspace, tier, amount and currency. The term must be later than the verified payment time. A signed
event without a provider-reconciled term is rejected (case-005 demonstrates this).

## 5. Procedures

**Rollout order (production, owner-run later — NOT done here):**
1. Back up D1; capture the pre-migration preflight (`pr35-0016-legacy-preflight.sql`).
2. Writer drain/cutover (0016 is one-way for old writers; see migration notes).
3. Apply migrations 0015 → 0016 → 0017 in order.
4. Post-checks (0016 evaluator expectations: 6/6 unverifiable rows revoked; events/bots preserved).
5. Run `pr35-legacy-recovery-preflight.sql` (read-only) and review the classification with stakeholders.

**Recovery order (per case, authorized operator, later):**
1. Reconcile the claim against provider records **outside** this tool (no provider calls from the tool).
2. Author the case file with identity/membership, binding, status, amount/currency, tier, original
   term + basis, and evidence references.
3. Dry-run (default): `node scripts/verification/pr35-legacy-recovery-tool.mjs --cases <file>`.
4. Review the printed plan (before → after) with a second person.
5. Apply: same command with `--apply`. Re-read the audit row and entitlement row.
6. Audit review: `saas_entitlement_recovery_audit` rows are the durable record (before/after, actor,
   reason, refs); the table is append-only.

**Rejection is a first-class outcome**: insufficient/wrong evidence leaves the row revoked and writes
nothing. Missing proof is not a finding of non-payment; it stays a manual-review queue entry.

## 6. Idempotency and concurrency semantics (proven)

- Duplicate retry of a recorded `caseId` → `already-applied`; no mutation, term never extended.
- Stale/concurrent apply (state changed since verification) → `cas-conflict`; the CAS guard aborts the
  audit INSERT (and with it the restore) atomically; nothing is granted and no wrong overwrite occurs.
- A second INSERT reusing a recorded `caseId` on any row → primary-key abort.
- The audit row and the restore are one statement: a restore cannot exist unaudited, and an audit row
  cannot exist without its restore.

## 7. Evidence produced on synthetic data / local D1 (`pr35-legacy-recovery-eval.mjs --reset`)

- Baseline: 0016 fail-closed state intact (6 non-BASIC rows revoked, 0 audit rows).
- Read-only preflight classifies all 6 rows exactly as expected (2 candidates needing manual term
  reconciliation, 2 reject-payment-evidence-not-finished, 1 reject-no-payment-evidence,
  1 reject-identity-unverified).
- Dry-run verification performs no mutation.
- Rejections fail closed with explicit reasons: missing proof, failed payment, waiting payment, wrong
  amount, system owner, orphan BASIC, and a signed legacy event without term (schema rejection).
- Full-evidence restore lands on the exact evidence-declared original term (`expires_at_ms` equal to
  `termEndsAtMs`) with complete before/after audit (actor, reason, term basis, refs, verified facts).
- Idempotent retry: no re-grant, no term extension.
- Concurrent stale racer: `cas-conflict`; only one grant; the other term never overwrites.
- Primary-key backstop, append-only audit triggers, and audit hygiene (no secret/signature/payload
  strings) verified.
- Preservation: legacy events (4), bots (2, personal workspaces), memberships and the four
  unverifiable rows untouched (still revoked, no expiry/payment granted).

Artifacts: `docs/verification/artifacts/pr35-recovery-preflight.json`,
`docs/verification/artifacts/pr35-recovery-summary.json`.

## 8. Browser E2E artifact review status

The hosted browser suite passes on `62498f9` (run
[`41011314634`](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41011314634), and
earlier on `7c4a73f` run
[`41010114785`](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41010114785)).
**Artifact contents have NOT been viewed in this sandbox**: downloads redirect to
`productionresultssa*.blob.core.windows.net`, which is unreachable here (confirmed again 2026-10-30,
`EOF`). Direct links for the reviewer:

- https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41011314634/artifacts/12957797140
  (`pr35-browser-e2e-…`, 6,184,398 bytes; screenshots, sanitized traces, logs, manifest)
- https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/41010114785/artifacts/12956764872
  (5,811,976 bytes)

## 9. Boundaries (never)

- No merge, deploy, remote D1 migration/query, production restoration, live trading, real payment.
- No grace period, auto-renewal, or term extension — ever, including on retry.
- No provider calls from the tool; no secrets/payloads in case files or audit.
- No public recovery endpoint; no generic entitlement bypass.
- Rejected/missing proof is never recorded as customer non-payment.
