// Zoo falsification bridge (Phase 3, D5/D7). The single forest-layer seam
// that closes the "Vibe proposes → CashClaw falsifies" loop:
//   importAlphaZooManifest → evaluate (operator evaluator) → rank/IC
//   (analyzeIc, cross-sectional) → multiple-testing checks → per-alpha verdict.
// Pure composition: data is injected (panels), no I/O, no eval/exec. Errors
// propagate verbatim (fail-loud) — nothing is swallowed into a fake verdict.
//
// ESCROW O-1 (binding): the permutation check's statistic is the elementwise
// `returns × signals` product — a COVARIANCE PROXY, NOT Pearson/rank IC. The
// pooled global null also ignores panel structure (acceptable research
// triage). Both nuances are disclosed in report meta, never hidden.
//
// ESCROW O-2 (binding): a zero-signal alpha whose scores are constant over
// time PER SYMBOL but DISTINCT ACROSS SYMBOLS yields a well-defined (NaN-free)
// IC series whose bootstrap CI includes 0 → deterministic FALSIFIED. (Scores
// constant ACROSS symbols instead would give zero cross-sectional variance →
// null ICs → INSUFFICIENT_IC_OBSERVATIONS, a different terminal bucket.)

import { importAlphaZooManifest, type RegisteredAlpha } from '@/tree/research/alpha/zoo/zoo-adapter';
import type { ZooAdapterConfig, PerAlphaResult } from '@/tree/research/alpha/zoo/import-report';
import { parseFormula } from '@/tree/research/alpha/zoo/operator-parser';
import { evaluateFormula, type SymbolPanel as EvalPanel } from '@/tree/research/alpha/zoo/operator-evaluator';
import {
  analyzeIc,
  buildForwardReturnSeries,
  materializeVwap,
  type IcAnalysisConfig,
  type SymbolPanel as FactorPanel,
} from '@/tree/alpha/factors';
import {
  assertNoSilentSkips,
  computeZooTotals,
  type DeferredCheck,
  type ZooFalsificationReport,
  type ZooFalsificationRow,
} from './report-types';
import { mapVerdict } from './verdict';
import { buildIcWalkForwardShim } from './wf-shim';

/** Bridge configuration: adapter config + optional IC-analysis overrides. */
export interface ZooFalsificationConfig {
  readonly adapterConfig: ZooAdapterConfig;
  readonly icOverrides?: Partial<Omit<IcAnalysisConfig, 'horizonBars'>>;
}

const EVAL_FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;

/** Convert per-symbol factor panels into the evaluator's symbol×field panel. */
function toEvalPanel(panels: readonly FactorPanel[]): EvalPanel {
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

/** Deferred checks disclosed in report meta (D5) — never silently dropped. */
const DEFERRED_CHECKS: readonly DeferredCheck[] = [
  {
    check: 'pbo_proxy',
    reason:
      'pboProxy needs ≥2 configs × ≥2 OOS windows; the single-config seed run is degenerate. ' +
      'A horizon/quantile config axis is Phase 4 tuning-surface scope.',
  },
  {
    check: 'random_entry',
    reason:
      'compareAgainstRandomEntry needs trade-level EvaluationReport pairs; an IC study produces none by design.',
  },
];

const META_CAVEATS: readonly string[] = [
  'permutation statistic is elementwise returns×signals covariance proxy, NOT Pearson IC (escrow O-1)',
  'pooled permutation global null ignores panel structure (acceptable research triage)',
  'walk-forward shim degradationRatio:1 is neutral and unused by the consistency boolean',
  'verdicts are research records only — no promotion-state or paper/live surface',
];

/** Evaluate one registered alpha end-to-end into a falsification row. */
function evaluateAlpha(
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

/**
 * Run the full falsification bridge. `manifest` is the raw zoo manifest;
 * `panels` is the aligned symbol×time OHLCV cross-section. Every manifest
 * entry lands in exactly one terminal bucket (Σ≡N enforced before return).
 */
export async function runZooFalsification(
  manifest: unknown,
  panels: readonly FactorPanel[],
  config: ZooFalsificationConfig,
): Promise<ZooFalsificationReport> {
  const imported = await importAlphaZooManifest(manifest, config.adapterConfig);
  const manifestEntries = imported.totals.total;
  const evalPanel = toEvalPanel(panels);

  const registeredById = new Map(imported.registered.map((r) => [r.hypothesis.id, r]));
  const rows: ZooFalsificationRow[] = [];
  for (const result of imported.results as readonly PerAlphaResult[]) {
    const registered = result.hypothesisId === undefined
      ? undefined
      : registeredById.get(result.hypothesisId);
    if (registered === undefined) {
      rows.push({
        sourceAlphaId: result.sourceAlphaId,
        verdict: 'NOT_EVALUABLE',
        reasons: [`IMPORT_SKIPPED:${result.outcome}`, ...result.reasons],
      });
      continue;
    }
    rows.push(evaluateAlpha(registered, panels, evalPanel, config));
  }

  const report: ZooFalsificationReport = {
    totals: computeZooTotals(rows),
    rows,
    meta: { manifestEntries, deferredChecks: DEFERRED_CHECKS, caveats: META_CAVEATS },
  };
  assertNoSilentSkips(report, manifestEntries);
  return report;
}
