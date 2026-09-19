// Alpha Research Pipeline — Attribution Step
// Step: attribute

import type { PipelineConfig, SignalData, RegimeData, AttributeData } from './types';
import { attributePerformance } from '@/forest/alpha/attribution/analyzer';
import { extractTrades } from './pipeline-utils';

export function stepAttribute(cfg: PipelineConfig, map: Map<string, unknown>): AttributeData {
  const { candles, regimeConfig } = cfg;
  const sd = map.get('generate_signals') as SignalData | undefined;
  const rd = map.get('detect_regimes') as RegimeData | undefined;
  const trades = extractTrades(sd?.signals ?? [], candles, regimeConfig.lookback);
  const obs = (rd?.regimes ?? []).map(r => ({ timestamp: r.timestamp, label: r.label }));
  return { attributions: attributePerformance(trades, sd?.signals ?? [], obs) };
}
