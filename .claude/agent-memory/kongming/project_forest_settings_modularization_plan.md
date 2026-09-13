---
name: project-forest-settings-modularization-plan
description: 2026-09-13 plan at .orchestrate/latest/plan.md; modularize actions.ts into types.ts, parsers.ts, actions.ts, <= 200 LOC budget, backward compatibility
metadata:
  type: project
---

Forest Settings Modularization & LOC Budget Compliance plan written to `.orchestrate/latest/plan.md`.

**Why:** `src/forest/settings/actions.ts` is 333 LOC, exceeding the strict <= 200 LOC project ceiling. It commingles types/constants, D1 deserialization/decryption, risk validation, and server action routing.

**How to apply:**
- `types.ts`: ~65 LOC (ceiling <= 90 LOC), defines `SettingsData`, `ExchangeKey`, `RiskLimitsInput`, `KillswitchDailyInput`, `SETTINGS_ROW_ID`, and default configs.
- `parsers.ts`: ~95 LOC (ceiling <= 120 LOC), D1 JSON parsing, WebCrypto `decrypt`, risk range validation, and risk overrides.
- `actions.ts`: ~115 LOC (ceiling <= 130 LOC), re-exports `SettingsData` for 100% backward compatibility, D1 client interaction, WebCrypto `encrypt`, and 7 public server actions.
- `parsers.test.ts`: ~110 LOC (ceiling <= 140 LOC), unit tests covering edge cases (corrupted JSON, missing fields, validation bounds).
- Invariants: 0 `:any`, 0 ESLint warnings, 0 Knip orphan exports, all 4,058+ tests green, Cloudflare Workers deployment + production smoke test.
