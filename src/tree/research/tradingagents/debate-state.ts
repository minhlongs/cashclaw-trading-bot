// DebateCheckpoint — checkpoint state adapter for the deliberation layer
// (task §9). Pure module: no I/O, no LangGraph dependency. CashClaw owns
// its own checkpoint shape; the adapter serializes/deserializes it
// deterministically and binds every checkpoint to a SHA-256 resultHash of
// the canonical debate state (WebCrypto only). Fail-closed validation.

export type {
  DebateRound,
  DebateState,
  DebateCheckpoint,
  SerializeCheckpointResult,
  DeserializeCheckpointResult,
} from './types-internal';
export { debateCheckpointSchema } from './debate-state-schemas';
export { computeDebateResultHash } from './debate-state-hash';
export { serializeCheckpoint, deserializeCheckpoint } from './debate-state-serialize';
