// Deterministic hypothesis assembly (D4) + provenance construction for the
// zoo adapter. Pure module: no I/O. Every field is derived from the parsed
// zoo entry + adapter config — no randomness, no wall clock unless the
// caller injects one via config.nowIso.

import type { Universe } from '@/tree/alpha/universe/types';
import { buildNormalizedRepresentation, type AlphaProvenance } from '../provenance';
import type { ResearchHypothesis } from '../../hypothesis/types';
import type { AlphaZooEntry } from './zoo-metadata';
import type { NormalizedFormula } from './operator-vocabulary';
import type { ZooAdapterConfig } from './import-report';

/** Normalized timeframe: zoo frequency values are exactly {'1d','1D'}. */
export function normalizeTimeframe(frequency: readonly string[]): string {
  return frequency[0].toLowerCase();
}

/**
 * Deterministic notes-first mechanism template. Contains the causal
 * connective 'may indicate' so the mechanism gate judges LENGTH and
 * vacuous patterns only — never padded to pass (D4).
 */
export function buildMechanism(entry: AlphaZooEntry): string {
  const name = entry.nickname ?? entry.id;
  const body = entry.notes.trim() !== '' ? entry.notes.trim() : entry.formula_latex.trim();
  return (
    `${name}. Theme ${entry.theme.join(', ')}: ${body}. ` +
    `Cross-sectional ${entry.theme[0]} relation between ${entry.columns_required.join(', ')} ` +
    `may indicate exploitable structure.`
  );
}

/** Assemble the ResearchHypothesis candidate for one parsed zoo entry (D4). */
export function buildZooHypothesis(
  entry: AlphaZooEntry,
  normalized: NormalizedFormula,
  universe: Universe,
  config: ZooAdapterConfig,
): ResearchHypothesis {
  const timeframe = normalizeTimeframe(entry.frequency);
  const lookback = Math.max(entry.min_warmup_bars, 1);
  return {
    id: `zoo-${entry.id}`,
    title: `${entry.nickname ?? entry.id} (${entry.id})`,
    description:
      `Imported from Vibe-Trading zoo (${entry.id}). Original market tags: ` +
      `${entry.universe.join(', ')}. Formula: ${normalized.normalizedFormula}`,
    rationale:
      `Zoo metadata lists theme ${entry.theme.join(', ')} with decay horizon ` +
      `${entry.decay_horizon} bars and min warmup ${entry.min_warmup_bars} bars.`,
    source: 'vibe-zoo',
    parentHypothesisId: null,
    universe,
    timeframe,
    horizon: entry.decay_horizon,
    features: entry.columns_required.map((col) => ({ name: col, lookback, params: {} })),
    transformations: [normalized.normalizedFormula],
    regimeConstraints: [],
    expectedMechanism: buildMechanism(entry),
    expectedDirection: 'neutral',
    expectedHoldingPeriod: entry.decay_horizon,
    costAssumption: config.defaultCostMode,
    generatedBy: config.importerVersion,
    createdAt: config.nowIso ?? new Date().toISOString(),
    experimentVersion: 1,
  };
}

/** Canonical dedup payload (D1): formula + window params, NOT raw text. */
export function buildDedupPayload(
  normalizedFormula: string,
  entry: AlphaZooEntry,
): Record<string, number | string> {
  return {
    formula: normalizedFormula,
    warmupBars: entry.min_warmup_bars,
    horizon: entry.decay_horizon,
    timeframe: normalizeTimeframe(entry.frequency),
  };
}

/** Provenance record for a registered zoo alpha (raw-string formula hash). */
export function buildZooProvenance(
  entry: AlphaZooEntry,
  normalized: NormalizedFormula,
  formulaHash: string,
  sourceRepository: string,
  sourceVersion: string | null,
  config: ZooAdapterConfig,
): AlphaProvenance {
  return {
    sourceZoo: 'vibe-trading-zoo',
    sourceAlphaId: entry.id,
    sourceRepository,
    sourceVersion,
    formulaHash,
    importTimestamp: config.nowIso ?? new Date().toISOString(),
    importerVersion: config.importerVersion,
    normalizedRepresentation: buildNormalizedRepresentation(
      buildDedupPayload(normalized.normalizedFormula, entry),
    ),
  };
}
