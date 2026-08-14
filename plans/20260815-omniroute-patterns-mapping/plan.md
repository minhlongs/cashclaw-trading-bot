# OmniRoute Patterns → Trade-Bot: Phase 1 (Observe)

> **Goal:** Add exchange health observability — per-exchange metrics, rate-limit tracking, latency telemetry.
> **Non-goals:** Cross-exchange routing, request queues, cost optimization (Phase 2-4).

## Tracks

### Track A: Exchange Health Telemetry
- Extend `TradeEventType` with `'exchange_health'` event
- Add `ExchangeHealthSnapshot` type to telemetry types
- Wire `ExchangeOrchestrator` health data into `TelemetryWriter`
- Emit health snapshots each scheduler tick

### Track B: Dashboard Exchange Health Cards
- Add `ExchangeHealthCard` type to dashboard types
- New `src/forest/dashboard/exchange-health.ts` server action
- Query provider health from `ExchangeOrchestrator`
- Expose via barrel in `actions.ts`

### Track C: Rate-Limit Tracking
- Add `RateLimitTracker` to `BotScheduler` — count API calls per exchange per tick
- Emit `rate_limit_usage` event details in telemetry
- Log rate-limit consumption alongside circuit-open checks

### Track D: Tests
- Unit tests for `ExchangeHealthSnapshot` emission
- Unit tests for `getExchangeHealth` server action
- Unit tests for `RateLimitTracker`

## Files to Create
- `src/forest/dashboard/exchange-health.ts` — exchange health server action

## Files to Modify
- `src/tree/telemetry/types.ts` — add exchange health types
- `src/tree/telemetry/writer.ts` — add `emitExchangeHealth()` method
- `src/forest/dashboard/actions.ts` — barrel export new action
- `src/forest/bot/scheduler.ts` — add rate-limit tracking + health emission
- `src/forest/dashboard/bot-kpis.ts` — extend `DashboardKpis` with exchange health

## Success Criteria
- `npm run type-check` passes
- `npm test` passes
- Exchange health data visible in dashboard types
- Rate-limit consumption logged per scheduler tick
