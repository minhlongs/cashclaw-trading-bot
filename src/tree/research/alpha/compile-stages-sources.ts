import { z } from 'zod';
import type { FeatureDeclaration } from '@/tree/alpha/indicator-types';
import type { CompileFailureCode } from './experiment-spec';

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

const SOURCE_KEYWORDS: ReadonlyArray<{ readonly source: FeatureDeclaration['source']; readonly keywords: readonly string[] }> = [
  { source: 'derivatives', keywords: ['funding', 'oi', 'open_interest', 'liquidation', 'basis'] },
  { source: 'orderbook', keywords: ['spread', 'depth', 'imbalance', 'orderbook'] },
  { source: 'trades', keywords: ['trade', 'volume_delta', 'tape'] },
  { source: 'synthetic', keywords: ['synthetic', 'computed', 'derived'] },
];

export function inferFeatureSource(name: string): FeatureDeclaration['source'] {
  const n = name.toLowerCase();
  for (const entry of SOURCE_KEYWORDS) {
    if (entry.keywords.some((kw) => n.includes(kw))) return entry.source;
  }
  return 'ohlcv';
}
