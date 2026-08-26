// AlphaCompiler validation stages — extracted from compiler.ts.
// Pure logic: no I/O, no network, no eval/exec. Each stage fail-closed with reason codes.

import { z } from 'zod';
import type { FeatureDeclaration } from '@/tree/alpha/indicator-types';
import { resolveStressConfig, type StressMode } from '@/forest/backtest/cost-model';
import type { ResearchHypothesis } from '../hypothesis/types';
import {
  MIN_TRAIN_BARS,
  type CompileFailureCode,
  type DataWindow,
} from './experiment-spec';

/** Map Zod validation errors to CompileFailureCode. */
export function mapZodErrors(issues: readonly z.ZodIssue[]): CompileFailureCode[] {
  return issues.map((issue) => {
    const path = issue.path.join('.');
    if (path === 'expectedMechanism') return 'MECHANISM_REJECTED';
    if (path === 'universe.symbols' || path === 'universe') return 'EMPTY_UNIVERSE';
    if (path === 'timeframe') return 'EMPTY_TIMEFRAME';
    if (path === 'costAssumption') return 'INVALID_COST_MODE';
    if (path.startsWith('features') && issue.code === 'too_small') return 'INVALID_LOOKBACK';
    return 'INTERNAL_ERROR';
  }) as CompileFailureCode[];
}

/** Keyword → FeatureSource mapping for name-based inference. */
const SOURCE_KEYWORDS: ReadonlyArray<{ readonly source: FeatureDeclaration['source']; readonly keywords: readonly string[] }> = [
  { source: 'derivatives', keywords: ['funding', 'oi', 'open_interest', 'liquidation', 'basis'] },
  { source: 'orderbook', keywords: ['spread', 'depth', 'imbalance', 'orderbook'] },
  { source: 'trades', keywords: ['trade', 'volume_delta', 'tape'] },
  { source: 'synthetic', keywords: ['synthetic', 'computed', 'derived'] },
];

/** Infer FeatureSource from feature name heuristic (can be extended). */
export function inferFeatureSource(name: string): FeatureDeclaration['source'] {
  const n = name.toLowerCase();
  for (const entry of SOURCE_KEYWORDS) {
    if (entry.keywords.some((kw) => n.includes(kw))) {
      return entry.source;
    }
  }
  return 'ohlcv';
}

/** Validate features: duplicates, lookbacks, supported allowlist, window coverage. */
export function validateFeatures(
  features: readonly FeatureDeclaration[],
  supportedFeatures: readonly string[] | undefined,
  dataWindow: DataWindow,
): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  const reasons: CompileFailureCode[] = [];

  // No duplicate names
  const names = new Set<string>();
  for (const f of features) {
    if (names.has(f.name)) {
      reasons.push('DUPLICATE_FEATURE');
    }
    names.add(f.name);
  }

  // Lookbacks finite positive
  for (const f of features) {
    if (f.lookback <= 0 || !Number.isFinite(f.lookback)) {
      reasons.push('INVALID_LOOKBACK');
    }
    if (f.lookback > dataWindow.barCount) {
      reasons.push('LOOKBACK_EXCEEDS_WINDOW');
    }
  }

  // Supported features allowlist (if provided)
  if (supportedFeatures && supportedFeatures.length > 0) {
    const allowed = new Set(supportedFeatures);
    for (const f of features) {
      if (!allowed.has(f.name)) {
        reasons.push('UNSUPPORTED_FEATURE');
      }
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}

/** Validate universe, timeframe, and data window coverage. */
export function validateDataAndUniverse(
  h: ResearchHypothesis,
  features: readonly FeatureDeclaration[],
  dataWindow: DataWindow,
): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  const reasons: CompileFailureCode[] = [];

  if (!h.universe || h.universe.symbols.length === 0) {
    reasons.push('EMPTY_UNIVERSE');
  }

  if (!h.timeframe || h.timeframe.trim() === '') {
    reasons.push('EMPTY_TIMEFRAME');
  }

  const maxLookback = Math.max(...features.map((f) => f.lookback), 0);
  const requiredBars = maxLookback + h.horizon + MIN_TRAIN_BARS;
  if (dataWindow.barCount < requiredBars) {
    reasons.push('INSUFFICIENT_DATA_WINDOW');
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}

/** Validate cost assumption resolves to a valid StressConfig. */
export function validateCost(costAssumption: StressMode): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  try {
    resolveStressConfig(costAssumption);
    return { ok: true };
  } catch {
    return { ok: false, reasons: ['INVALID_COST_MODE'] };
  }
}
