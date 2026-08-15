# Phase U.2: Setup Wizard Config Plumbing

## Goal
Make the bot-create path honor the strategy config produced by the Setup Wizard (spacing_pct, grid_levels, capital_per_level_pct, take_profit_pct, stop_loss_pct, max_drawdown_pct) instead of silently dropping user values.

## Acceptance Checklist
- [ ] `npm run lint` passes with 0 warnings.
- [ ] `npx tsc --noEmit` reports no errors.
- [ ] `npm test` passes after the migration test is added.
- [ ] A non-default wizard payload hits `bot-create.ts` and the returned BotConfig reflects the requested values (spacing 0.5, levels 5, etc.).
- [ ] BotConfig defaults still apply when a field is omitted.
- [ ] One new regression test covers: custom spacing_pct + max_drawdown_pct survive `POST /api/bots` and the persisted BotConfig.

## Files
- `src/app/api/bots/route.ts` — extend Zod schema with `config`, add runtime validation/clamping helpers, and pass `config` directly to `botCreateHandler`.
- `src/forest/api/handlers/bot-create.ts` — accept `config`, validate per-field with safe fallbacks, and pass resolved values into `BotConfig` instead of hardcoding.
- `src/forest/api/routes.ts` — extend `CreateBotPayload` (and the handler signature) with `config?: BotConfigParameters`.
- `tests/unit/bot-config-migration.test.ts` — new: Zod parsing + bot-create handler test asserting explicit spacing/drawdown are preserved.

## Constraints
- No new features beyond the protected wizard flow.
- Do not add or require protected deps in `bot-create.ts`; it is a plan-level artifact (the handler remains a sync server-action-style helper). 🔐
- Preserve all existing bot-delete behavior during the transition.