/**
 * D1 Hydration Helpers
 * Loads persistent bots from D1 into BotManager on startup.
 *
 * Exports `toBotStatus` and `restoreBotStateFromRow` as shared utilities
 * used by both BotQueryService (read path) and BotManager lazy hydration
 * (write path).
 *
 * Facade: re-exports all public symbols from submodules.
 */

// Error handler callback type for structured error logging
export type ErrorHandler = (error: Error, context: string) => void;

export {
  toBotStatus,
  restoreBotStateFromRow,
  type BotHydrateRow,
} from './d1-hydration-mapper';

export {
  hydrateFromD1,
  loadAllBotsFromD1,
} from './d1-hydration-impl';
