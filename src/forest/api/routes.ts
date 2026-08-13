/**
 * Forest layer — Admin API route handlers
 *
 * Exports request handlers for admin endpoints that bridge BotManager
 * and D1 telemetry to client-consumable JSON shapes.
 *
 * All responses follow { ok: boolean, data?: T, error?: string }.
 *
 * API surface split:
 *   - src/app/api/bots/              — Next.js App Router (session-cookie auth, user-facing)
 *   - src/worker.ts → /internal/api/ — Hono Worker (Bearer token, operator/cron access)
 *   - src/app/api/auth/, settings/   — Next.js App Router only (no Hono equivalent)
 *
 * File layout:
 *   src/forest/api/handlers/   — shared handler implementations
 *   src/forest/api/auth-guard.ts — Hono Bearer token middleware (worker.ts)
 *   src/middleware.ts            — Next.js session-cookie middleware (app router)
 */

export { botListHandler } from './handlers/bot-list';
export { botDetailHandler } from './handlers/bot-detail';
export { botControlHandler } from './handlers/bot-control';
export { botCreateHandler, type CreateBotPayload } from './handlers/bot-create';
export { killswitchHaltHandler, killswitchResumeHandler } from './handlers/killswitch';
export { eventsHandler } from './handlers/events';
export { dailyStatsHandler } from './handlers/daily-stats';
