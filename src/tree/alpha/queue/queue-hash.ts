// Research Queue — Hash utilities
// Deterministic hash of job configurations (FNV-1a 32-bit).

import { canonicalize } from '@/lib/canonical-json';
import type { QueueJobSpec } from './types';

/** FNV-1a 32-bit hash over a string. Deterministic, dependency-free. */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned 32-bit, zero-padded hex for stable string form.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic hash of the job configuration only (excludes outcome
 * fields: status, result). Same configuration always yields the same
 * hash regardless of key order (canonicalize sorts keys).
 */
export function jobConfigHash(spec: QueueJobSpec): string {
  const config = {
    hypothesis: spec.hypothesis,
    features: spec.features,
    dataset: spec.dataset,
    regime: spec.regime,
    universe: spec.universe,
    costs: spec.costs,
    slippage: spec.slippage,
    seed: spec.seed,
  };
  return fnv1a32(canonicalize(config));
}
