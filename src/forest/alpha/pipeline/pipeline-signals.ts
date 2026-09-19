// Alpha Research Pipeline — Signal Generation & Event Labeling Facade
// Steps: generate_signals, label_events (+ re-exports fetch, compute, merge)

import { RegimeLabel, type RegimeResult } from '@/tree/regime/types';
import type { AlphaSignal, FeatureVector } from '@/tree/alpha/types';
import type {
  PipelineConfig,
  IndicatorData,
  SignalData,
  EventData,
  DerivativeData,
} from './types';
import { mergeDerivativeSignals } from './pipeline-signals-merge';

export { stepFetchData, stepFetchDerivatives } from './pipeline-signals-fetch';
export { stepComputeIndicators, stepDetectRegimes } from './pipeline-signals-compute';
export { mergeDerivativeSignals } from './pipeline-signals-merge';

export function stepGenerateSignals(cfg: PipelineConfig, map: Map<string, unknown>): SignalData {
  const { candles, regimeConfig, indicatorSet } = cfg;
  const rd = map.get('detect_regimes') as { regimes: RegimeResult[] } | undefined;
  const id = map.get('compute_indicators') as IndicatorData | undefined;
  const dd = map.get('fetch_derivatives') as DerivativeData | undefined;
  const signals: AlphaSignal[] = [];
  const off = regimeConfig.lookback;
  const lb = indicatorSet['lookback'] ?? 20;
  for (let i = 0; rd && id && i < rd.regimes.length; i++) {
    const idx = i + off;
    const f = id.features[idx];
    if (!f) continue;
    const rsi = f['rsi'] ?? 50;
    const regime = rd.regimes[i].label;
    const ts = candles[idx].timestamp;
    const fv: FeatureVector = {
      features: Object.entries(f).map(([id2, v]) => ({ id: id2, value: v, causal: false })),
      computedAt: ts,
      symbol: cfg.symbol,
      lookback: lb,
    };
    let name: string;
    let dir: AlphaSignal['direction'];
    let conf = 0;
    if (rsi < 30 && regime === RegimeLabel.TREND_UP) {
      name = 'rsi_regime_buy';
      dir = 'buy';
      conf = (30 - rsi) / 30;
    } else if (rsi > 70 && regime === RegimeLabel.TREND_DOWN) {
      name = 'rsi_regime_sell';
      dir = 'sell';
      conf = (rsi - 70) / 30;
    } else {
      name = 'hold';
      dir = 'hold';
    }
    signals.push({
      name,
      direction: dir,
      confidence: conf,
      features: fv,
      source: 'indicator',
      timestamp: ts,
      metadata: {},
    });
  }
  mergeDerivativeSignals(signals, dd);
  return { signals };
}

export function stepLabelEvents(map: Map<string, unknown>): EventData {
  const sd = map.get('generate_signals') as SignalData | undefined;
  return { labels: (sd?.signals ?? []).map(s => s.direction) };
}
