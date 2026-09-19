// Checkpoint Adapter — serializes/deserializes DebateCheckpoint.
// Pure module: no LangGraph imports. SHA-256 resultHash over canonical
// debateState (WebCrypto only). Round-trip tested.

export type {
  CheckpointEnvelope,
  CheckpointAdapterResult,
} from './checkpoint-adapter.types';
export {
  serializeCheckpointEnvelope,
  deserializeCheckpointEnvelope,
  createCheckpoint,
  resumeFromCheckpoint,
  verifyCheckpoint,
} from './checkpoint-adapter.core';
