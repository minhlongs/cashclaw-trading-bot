// Cross-sectional universe math (mission §3C).
// Pure, deterministic — no I/O, no network, no Node APIs, no Math.random/Date.now.

import {
  RebalanceRule,
  Universe,
  Weighting,
  VALID_REBALANCE_RULES,
  VALID_WEIGHTINGS,
} from './types';

export {
  rankAssets,
  percentileNormalize,
  selectLongShort,
  marketNeutralWeights,
  basketNeutralize,
} from './universe-math';

// ── Universe construction ─────────────────────────────────────────────────────

/**
 * Build an immutable universe from a symbol set.
 * Throws on empty input, duplicate symbols, or unknown enum values.
 */
export function createUniverse(
  id: string,
  symbols: readonly string[],
  weighting: Weighting = 'equal',
  rebalanceRule: RebalanceRule = 'daily',
): Universe {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('createUniverse: id must be a non-empty string');
  }
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('createUniverse: symbols must be a non-empty array');
  }
  if (!VALID_WEIGHTINGS.includes(weighting)) {
    throw new Error(`createUniverse: invalid weighting '${weighting}'`);
  }
  if (!VALID_REBALANCE_RULES.includes(rebalanceRule)) {
    throw new Error(`createUniverse: invalid rebalanceRule '${rebalanceRule}'`);
  }

  const normalized = symbols
    .map((s) => (typeof s === 'string' ? s.trim() : s))
    .filter((s): s is string => typeof s === 'string' && s !== '');

  if (normalized.length === 0) {
    throw new Error('createUniverse: symbols must contain at least one non-empty string');
  }

  const seen = new Set<string>();
  for (const s of normalized) {
    if (seen.has(s)) {
      throw new Error(`createUniverse: duplicate symbol '${s}'`);
    }
    seen.add(s);
  }

  return {
    id: id.trim(),
    symbols: Object.freeze(normalized),
    weighting,
    rebalanceRule,
  };
}
