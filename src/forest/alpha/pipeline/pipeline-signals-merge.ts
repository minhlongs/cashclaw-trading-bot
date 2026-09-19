// Alpha Research Pipeline — Derivative Signal Merge Helper

import type { AlphaSignal, FeatureVector } from '@/tree/alpha/types';
import type { DerivativeData } from './types';

export function mergeDerivativeSignals(
  signals: AlphaSignal[],
  dd: DerivativeData | undefined,
): void {
  for (const ds of dd?.signals ?? []) {
    const dir: AlphaSignal['direction'] =
      ds.direction === 'short' ? 'sell' : ds.direction === 'long' ? 'buy' : 'hold';
    const fv: FeatureVector = {
      features: [{ id: 'derivative', value: ds.confidence, causal: true }],
      computedAt: ds.timestamp,
      symbol: ds.symbol,
      lookback: 20,
    };
    signals.push({
      name: ds.reasons[0] ?? 'derivative',
      direction: dir,
      confidence: ds.confidence,
      features: fv,
      source: 'indicator',
      timestamp: ds.timestamp,
      metadata: { reasons: ds.reasons, features: ds.features },
    });
  }
}
