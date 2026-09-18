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

import { importAlphaZooManifest } from '@/tree/research/alpha/zoo/zoo-adapter';
import type { ZooAdapterConfig, PerAlphaResult } from '@/tree/research/alpha/zoo/import-report';
import type { IcAnalysisConfig, SymbolPanel as FactorPanel } from '@/tree/alpha/factors';
import {
  assertNoSilentSkips,
  computeZooTotals,
  type DeferredCheck,
  type ZooFalsificationReport,
  type ZooFalsificationRow,
} from './report-types';
import { toEvalPanel, evaluateAlpha } from './eval-helpers';

/** Bridge configuration: adapter config + optional IC-analysis overrides. */
export interface ZooFalsificationConfig {
  readonly adapterConfig: ZooAdapterConfig;
  readonly icOverrides?: Partial<Omit<IcAnalysisConfig, 'horizonBars'>>;
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
