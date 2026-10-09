import { buildForwardReturnSeries, validateAlignedPanels, type SymbolPanel } from './panel';
import { validateConfig, validateScores } from './ic-helpers';
import { runIcRebalanceLoop, compileIcResult } from './ic-analysis-calc';
import type { IcAnalysisConfig, IcAnalysisResult } from './ic-analysis-types';
export type { IcAnalysisConfig, IcAnalysisResult, IcPoint, QuantileSpreadPoint } from './ic-analysis-types';

export function analyzeIc(
  panels: readonly SymbolPanel[],
  scores: Readonly<Record<string, readonly (number | null)[]>>,
  config: IcAnalysisConfig,
): IcAnalysisResult {
  const { rebalanceStride, quantiles, minCrossSectionalSymbols, stabilityWindow } = validateConfig(config);
  validateAlignedPanels(panels);
  const times = panels[0]!.timestamps;
  const forwardBySymbol = new Map(panels.map((p) => [p.symbol, buildForwardReturnSeries(p, config.horizonBars).forwardReturns]));
  validateScores(panels, scores, times.length);
  const { icSeries, spread, topWeights } = runIcRebalanceLoop(panels, scores, forwardBySymbol, times, rebalanceStride, minCrossSectionalSymbols, quantiles);
  return compileIcResult(icSeries, spread, topWeights, config, stabilityWindow);
}
