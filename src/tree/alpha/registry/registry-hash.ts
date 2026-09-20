// Research Registry — hash utilities.
// Deterministic hashing of experiment configurations (FNV-1a 32-bit).

import { canonicalize } from '@/lib/canonical-json';
import type { ResearchEntry } from './types';

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
 * Deterministic hash of the experiment configuration only (excludes
 * outcome fields: result, status, falsificationReason, reproducibility).
 * Same configuration always yields the same hash.
 */
export function entryConfigHash(entry: ResearchEntry): string {
  const config = {
    hypothesis: entry.hypothesis,
    dataSources: entry.dataSources,
    featureSet: entry.featureSet,
    regime: entry.regime,
    trainPeriod: entry.trainPeriod,
    validationPeriod: entry.validationPeriod,
    oosPeriod: entry.oosPeriod,
    costs: entry.costs,
    slippage: entry.slippage,
    seed: entry.seed,
    gitCommit: entry.gitCommit,
  };
  return fnv1a32(canonicalize(config));
}
