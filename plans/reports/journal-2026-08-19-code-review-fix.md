# Journal — 2026-08-19 — Code Review Fix (Vietnamese checklist)

## What happened

The code-reviewer subagent returned **CONDITIONAL PASS** on the deploy
cycle. One defect survived the deploy itself: the Vietnamese section of
`docs/deploy-runbook.md` still listed a KV binding that does not exist in
`wrangler.jsonc`, contradicting the English section that had already been
fixed.

## What I did

- Aligned the Vietnamese env-var checklist line with the English section:
  D1 binding, `ALLOWED_ORIGINS` var, `ADMIN_TOKEN` secret,
  `ENCRYPTION_KEY` secret, with the same "no KV binding" rationale
  (`CACHE` declared optional in `src/lib/db/types.ts`, never read at
  runtime).
- Committed as `c99791a`.
- Re-ran the lint gate to confirm no new errors (0 warnings).

## Why it matters

A deploy runbook whose two language sections disagree is worse than a
runbook with one outdated section — a Vietnamese-speaking operator following
the Vietnamese checklist would chase a binding that does not exist, exactly
the failure mode the deploy cycle was meant to prevent. The English fix was
correct; the Vietnamese copy had simply not been carried over. Carrying both
sections together is the fix.

## Verified

- `npm run lint` — 0 warnings
- `git status` — clean after commit `c99791a`
- All six acceptance criteria from the review prompt now PASS, including (b)
  which previously FAILED on the Vietnamese section.

## Open item

`ENCRYPTION_KEY` secret is still unset on Cloudflare. Set it via
`wrangler secret put ENCRYPTION_KEY` before any customer stores exchange
credentials — otherwise those credentials persist in plaintext. Not a
data-loss risk today: `api_credentials` is empty in production D1 and
`getEncryptionKey()` falls back to passthrough when the key is absent.