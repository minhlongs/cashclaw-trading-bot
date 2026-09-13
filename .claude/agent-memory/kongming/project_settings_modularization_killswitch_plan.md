---
name: project-settings-modularization-killswitch-plan
description: 2026-09-13 plan at .orchestrate/latest/plan.md; KillswitchSettings extraction, bilingual i18n, test suite decomposition, <= 200 LOC budget
metadata:
  type: project
---

2026-09-13 plan written at `.orchestrate/latest/plan.md`. Settings component modularization and test suite decomposition.

**Why:** `settings-client.tsx` (239 LOC) and its test suites `settings-client.test.tsx` (389 LOC) and `exchange-settings.test.tsx` (217 LOC) violate the strict $\le 200$ LOC rule in `CLAUDE.md`. Kill switch panel needs single-responsibility extraction with interactive mutation locking and bilingual i18n support.

**How to apply:** Implement `KillswitchSettings` (~70 LOC), refactor `settings-client.tsx` to $\le 130$ LOC, decompose tests to $\le 190$ LOC each, add i18n keys to `en.json` and `vi.json`, verify 4,058+ tests pass, deploy to Cloudflare Workers edge runtime with smoke checks.
