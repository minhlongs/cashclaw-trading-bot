// Relative-value evaluation seam.
// Order: validate inputs → run pair sim → build report; errors propagate.

import { runPairSpreadSim, type PairPanel } from '@/tree/alpha/relative-value';
import { buildRelativeValueReport } from './report';
import { computeRealizedPairBetaSeries } from './realized-beta';
import { computeRealizedPairCorrelationSeries } from './rolling-correlation';
import type { RelativeValueEvalConfig, RelativeValueResult } from './types';
import { validateEvalInputs } from './evaluate-validate';

export function evaluateRelativeValue(
  panel: PairPanel,
  config: RelativeValueEvalConfig,
): RelativeValueResult {
  validateEvalInputs(panel, config);
  const sim = runPairSpreadSim(panel, config);
  const realizedPairBetaSeries = computeRealizedPairBetaSeries(panel, sim.periods, config);
  const rollingCorrelationSeries = computeRealizedPairCorrelationSeries(panel, sim.periods, config);
  const baseReport = buildRelativeValueReport(sim, config);
  const report = {
    ...baseReport,
    pairLabel: `${panel.legA}/${panel.legB}`,
    ...(realizedPairBetaSeries !== undefined ? { realizedPairBetaSeries } : {}),
    ...(rollingCorrelationSeries !== undefined ? { rollingCorrelationSeries } : {}),
  };
  return { sim, report, validation: sim.validationTrail };
}
