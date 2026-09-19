/**
 * D1 Persistence Helpers
 * Re-exports bot lifecycle and telemetry persistence functions for backward compatibility.
 */

export {
  persistBot,
  patchBot,
  deleteBotRecord,
  persistCredential,
} from './d1-persistence-bot';

export {
  persistTrade,
  persistEvent,
  persistSnapshot,
  persistAudit,
} from './d1-persistence-telemetry';
