/**
 * Forest layer — Admin API route handlers
 *
 * Exports request handlers for admin endpoints that bridge BotManager
 * and D1 telemetry to client-consumable JSON shapes.
 *
 * All responses follow { ok: boolean, data?: T, error?: string }.
 *
 * File layout:
 *   app/api/{bots,killswitch,events,stats}/route.ts  — Next.js App Router route handlers
 *   src/forest/api/handlers.ts                        — shared handler implementations
 *   src/forest/api/middleware.ts                      — auth / rate-limit middleware
 */

export { botListHandler } from './handlers/bot-list';
export { botDetailHandler } from './handlers/bot-detail';
export { botControlHandler } from './handlers/bot-control';
export { botCreateHandler, type CreateBotPayload } from './handlers/bot-create';
export { killswitchHaltHandler, killswitchResumeHandler } from './handlers/killswitch';
export { eventsHandler } from './handlers/events';
export { dailyStatsHandler } from './handlers/daily-stats';
