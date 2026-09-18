// Zoo falsification evaluation helpers (Phase 3, D5/D7).
// Pure composition: no I/O, no network, no Node APIs, deterministic.

import type { RegisteredAlpha } from '@/tree/research/alpha/zoo/zoo-adapter';
import { parseFormula } from '@/tree/research/alpha/zoo/operator-parser';
import { evaluateFormula, type SymbolPanel as EvalPanel } from '@/tree/research/alpha/zoo/operator-evaluator';
import {
  analyzeIc,
  buildForwardReturnSeries,
  materializeVwap,
  type SymbolPanel as FactorPanel,
} from '@/tree/alpha/factors';
import type { ZooFalsificationRow } from './report-types';
import { mapVerdict } from './verdict';
import { buildIcWalkForwardShim } from './wf-shim';
import type { ZooFalsificationConfig } from './run-zoo-falsification';

const EVAL_FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;

/** Convert per-symbol factor panels into the evaluator's symbol×field panel. */
export function toEvalPanel(panels: readonly FactorPanel[]): EvalPanel {
  const symbols = panels.map((p) => p.symbol);
  const fields: Record<string, (number | null)[][]> = {};
  for (const f of EVAL_FIELDS) fields[f] = panels.map((p) => [...p[f]]);
  fields['vwap'] = panels.map((p) => [...materializeVwap(p)]);
  return { symbols, fields };
}

/** Split valid IC values into `n` roughly-equal chunks; mean of each. */
function chunkMeans(values: readonly number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  const size = Math.floor(values.length / n);
  for (let c = 0; c < n; c += 1) {
    const start = c * size;
    const end = c === n - 1 ? values.length : start + size;
    const slice = values.slice(start, end);
    out.push(slice.length === 0 ? null : slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

/** Evaluate one registered alpha end-to-end into a falsification row. */
export function evaluateAlpha(
  registered: RegisteredAlpha,
  panels: readonly FactorPanel[],
  evalPanel: EvalPanel,
  config: ZooFalsificationConfig,
): ZooFalsificationRow {
  const { hypothesis, provenance } = registered;
  const formula = hypothesis.transformations[0] ?? '';
  const base = { sourceAlphaId: provenance.sourceAlphaId, hypothesisId: hypothesis.id };

  const parsed = parseFormula(formula);
  if (!parsed.ok) {
    return { ...base, verdict: 'NOT_EVALUABLE', reasons: [parsed.reason] };
  }

  const bars = panels[0].timestamps.length;
  const horizon = hypothesis.horizon;
  if (parsed.value.maxLookback + horizon > bars - 1) {
    return { ...base, verdict: 'NOT_EVALUABLE', reasons: ['INSUFFICIENT_DATA_WARMUP'] };
  }

  const evaluated = evaluateFormula(formula, evalPanel);
  if (!evaluated.ok) {
    return { ...base, verdict: 'NOT_EVALUABLE', reasons: [evaluated.reason] };
  }

  const scores: Record<string, readonly (number | null)[]> = {};
  panels.forEach((p, i) => {
    scores[p.symbol] = evaluated.value[i];
  });

  const ic = analyzeIc(panels, scores, { ...config.icOverrides, horizonBars: horizon });
  const icStats = { icMean: ic.icMean, icStd: ic.icStd, icIr: ic.icIr, validIcCount: ic.validIcCount };
  if (ic.validIcCount === 0) {
    return { ...base, verdict: 'NOT_EVALUABLE', reasons: ['NO_VALID_IC_POINTS'], icStats };
  }
  if (ic.insufficientIcObservations) {
    return { ...base, verdict: 'NOT_EVALUABLE', reasons: ['INSUFFICIENT_IC_OBSERVATIONS'], icStats };
  }

  const validIcs = ic.icSeries.flatMap((p) => (p.ic === null ? [] : [p.ic]));
  const pooledScores: number[] = [];
  const pooledFwds: number[] = [];
  for (const p of panels) {
    const fwd = buildForwardReturnSeries(p, horizon).forwardReturns;
    const score = scores[p.symbol];
    for (let t = 0; t < score.length; t += 1) {
      const s = score[t];
      const f = fwd[t];
      if (s !== null && f !== null && Number.isFinite(s) && Number.isFinite(f)) {
        pooledScores.push(s);
        pooledFwds.push(f);
      }
    }
  }

  const walkForward = buildIcWalkForwardShim(chunkMeans(validIcs, 6), 'zoo-ic-shim');
  const { verdict, reasons, checks } = mapVerdict({
    hypothesisId: hypothesis.id,
    icValues: validIcs,
    pooledForwardReturns: pooledFwds,
    pooledScores,
    walkForward,
  });
  return { ...base, verdict, reasons, checks, icStats };
}
