// Checkpoint adapter types — CheckpointEnvelope, CheckpointAdapterResult.

/** Serialized checkpoint envelope (for storage/transport). */
export interface CheckpointEnvelope {
  readonly version: 1;
  readonly json: string;
  readonly resultHash: string;
}

/** Checkpoint adapter result. */
export type CheckpointAdapterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasons: readonly string[] };
