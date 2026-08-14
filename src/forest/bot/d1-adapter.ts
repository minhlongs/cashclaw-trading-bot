/**
 * BotManager D1 Adapter — Re-exports
 * Split into d1-hydration.ts and d1-persistence.ts for modularity.
 * This file re-exports all public APIs for backward compatibility.
 */

// Re-export hydration helpers
export { hydrateFromD1, loadAllBotsFromD1 } from './d1-hydration';
export type { ErrorHandler } from './d1-hydration';

// Re-export persistence helpers
export {
  persistBot,
  patchBot,
  deleteBotRecord,
  persistTrade,
  persistCredential,
  persistEvent,
  persistSnapshot,
  persistAudit,
} from './d1-persistence';
