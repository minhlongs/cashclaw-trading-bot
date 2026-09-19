/**
 * Bot Query Service
 * Reads bot data directly from D1 — no BotManager, no pre-hydration.
 * Used by read-only call sites (dashboard, bot-list, bot-detail, health check).
 *
 * Facade: re-exports all public symbols from submodules.
 */

export type { BotSummary, BotMetrics, BotRow } from './bot-query-service-types';
export { rowToBotSummary } from './bot-query-service-mapper';
export { BotQueryService } from './bot-query-service-class';
