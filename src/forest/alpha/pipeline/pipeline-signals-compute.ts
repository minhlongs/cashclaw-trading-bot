// Alpha Research Pipeline — Computation Steps
// Steps: compute_indicators, detect_regimes

import { extractRegimeFeatures } from '@/tree/regime/features';
import { RuleBasedRegimeClassifier } from '@/tree/regime/classifier';
import { indicators } from '@/tree/alpha/indicators';
import type { PipelineConfig, IndicatorData, RegimeData } from './types';
import type { RegimeResult } from '@/tree/regime/types';

export function stepComputeIndicators(cfg: PipelineConfig): IndicatorData {
  const { candles, indicatorSet } = cfg;
  const names = Object.keys(indicatorSet);
  const features: Record<string, number>[] = [];
  for (let i = 0; i < candles.length; i++) {
    const win = candles.slice(Math.max(0, i - (indicatorSet.lookback ?? 20) + 1), i + 1);
    const f: Record<string, number> = {};
    for (const n of names) {
      if (n === 'lookback') continue;
      const fn = indicators[n];
      if (fn) {
        const result = fn(win, 20, '1h');
        const v = typeof result.value === 'number' ? result.value : 0;
        f[n] = v;
      }
    }
    features.push(f);
  }
  return { features, names };
}

export function stepDetectRegimes(cfg: PipelineConfig): RegimeData {
  const { candles, regimeConfig } = cfg;
  const classifier = new RuleBasedRegimeClassifier();
  const regimes: RegimeResult[] = [];
  for (let i = 0; i < candles.length; i++) {
    const window = candles.slice(Math.max(0, i - 50), i + 1);
    if (window.length < 2) continue;
    const features = extractRegimeFeatures(window, regimeConfig);
    if (!features) continue;
    const result = classifier.classify(features, regimeConfig);
    regimes.push(result);
  }
  return { regimes, history: regimes };
}
