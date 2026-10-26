# Phase 3 — Pillar 3: Bot Wizard Ergonomics, QuantExecution Wiring & /bots Filter Fix

## Context
- `VolatilityDcaBotConfig` and `handleVolatilityDcaTicker` support `quantExecution?: boolean`, but the Bot Wizard UI, `/api/bots` Zod schema, `normalizeWizardConfig`, and `botCreateHandler` do not wire it through.
- `ReviewStep` falls through to `MEANREV_FIELDS` when `form.strategy === 'volatility_dca'`.
- `FIELD_KEY_MAP` has a key mismatch (`rsi_buy_threshold` vs `rsi_buy`).
- `bots-list-client.tsx` status filter omits `live_running` and has a dead `<Filter />` button.
- `basic-step.tsx` inputs lack `id` and `htmlFor` attributes.

## Files Owned
- `src/components/bots/wizard-types.ts`
- `src/components/bots/wizard-defaults.ts`
- `src/components/bots/basic-step.tsx`
- `src/components/bots/config-step.tsx`
- `src/components/bots/review-step.tsx`
- `src/components/bots/bots-list-client.tsx`
- `src/app/api/bots/route.ts`
- `src/forest/api/handlers/bot-create.normalize.ts`
- `src/forest/api/handlers/bot-create.ts`
- `src/components/bots/review-step.test.tsx`
- `src/components/bots/config-step.test.tsx`
- `src/components/bots/bots-list-client.test.tsx`
- `src/app/api/bots/route.test.ts`

## Implementation Steps
1. Add `type?: 'number' | 'checkbox'` to `FieldDef` in `wizard-types.ts`.
2. In `wizard-defaults.ts`, add `quantExecution: 0` to `VOLATILITY_DCA_DEFAULTS`, add `{ key: 'quantExecution', label: 'QuantLib Execution', type: 'checkbox' }` to `VOLATILITY_DCA_FIELDS`, and add `rsi_buy`, `rsi_sell`, and `quantExecution` mappings in `FIELD_KEY_MAP`.
3. Add explicit `id` and `htmlFor` pairings in `basic-step.tsx`.
4. Render checkbox toggle for `field.type === 'checkbox'` in `config-step.tsx`.
5. Fix `review-step.tsx` to select `VOLATILITY_DCA_FIELDS` and `VOLATILITY_DCA_DEFAULTS` when `form.strategy === 'volatility_dca'`, and display `Enabled` / `Disabled` (`t('enabled')` / `t('disabled')`) for `quantExecution`.
6. Update `src/app/api/bots/route.ts`, `src/forest/api/handlers/bot-create.normalize.ts`, and `src/forest/api/handlers/bot-create.ts` (`<= 90 LOC`) to accept and normalize `quantExecution`.
7. Update `src/components/bots/bots-list-client.tsx` to include `live_running` in the status `<select>`, use localized status labels, and remove the dead `<Filter />` button.
8. Add unit tests in `review-step.test.tsx`, `config-step.test.tsx`, `bots-list-client.test.tsx`, and `route.test.ts`.
