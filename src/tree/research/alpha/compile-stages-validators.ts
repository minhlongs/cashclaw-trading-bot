import type { FeatureDeclaration } from '@/tree/alpha/indicator-types';
import { resolveStressConfig, type StressMode } from '@/tree/alpha/cost-stress';
import type { ResearchHypothesis } from '../hypothesis/types';
import { MIN_TRAIN_BARS, type CompileFailureCode, type DataWindow } from './experiment-spec';

export function validateFeatures(fList: readonly FeatureDeclaration[], sup: readonly string[] | undefined, win: DataWindow): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  const r: CompileFailureCode[] = [], names = new Set<string>();
  for (const f of fList) {
    if (names.has(f.name)) r.push('DUPLICATE_FEATURE');
    names.add(f.name);
    if (f.lookback <= 0 || !Number.isFinite(f.lookback)) r.push('INVALID_LOOKBACK');
    if (f.lookback > win.barCount) r.push('LOOKBACK_EXCEEDS_WINDOW');
  }
  if (sup && sup.length > 0) {
    const allowed = new Set(sup);
    for (const f of fList) if (!allowed.has(f.name)) r.push('UNSUPPORTED_FEATURE');
  }
  return r.length > 0 ? { ok: false, reasons: r } : { ok: true };
}

export function validateDataAndUniverse(h: ResearchHypothesis, fList: readonly FeatureDeclaration[], win: DataWindow): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  const r: CompileFailureCode[] = [];
  if (!h.universe || h.universe.symbols.length === 0) r.push('EMPTY_UNIVERSE');
  if (!h.timeframe || h.timeframe.trim() === '') r.push('EMPTY_TIMEFRAME');
  const maxL = Math.max(...fList.map((f) => f.lookback), 0);
  if (win.barCount < maxL + h.horizon + MIN_TRAIN_BARS) r.push('INSUFFICIENT_DATA_WINDOW');
  return r.length > 0 ? { ok: false, reasons: r } : { ok: true };
}

export function validateCost(costAssumption: StressMode): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  try { resolveStressConfig(costAssumption); return { ok: true }; } catch { return { ok: false, reasons: ['INVALID_COST_MODE'] }; }
}
