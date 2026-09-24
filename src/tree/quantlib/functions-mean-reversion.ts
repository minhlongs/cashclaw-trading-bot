// Quantlib strategy function registry — Mean-reversion & Volatility-DCA strategies
// Composable trade-signal functions for mean reversion and volatility-adjusted DCA.

import type { QuantFn, QuantLibContext, QuantResult } from './index';
import { volatilityDca } from './volatility-dca';

export const meanReversionFunctions: QuantFn[] = [
  (ctx: QuantLibContext, params?: Record<string, number>): QuantResult => {
    if (ctx.lastPrice <= 0) {
      return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion' } };
    }
    const fairValue = params?.fairValue;
    const threshold = params?.threshold ?? 0.015;
    const maxConf = params?.maxConf ?? 0.8;

    if (fairValue === undefined || fairValue <= 0) {
      return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion', reason: 'no_fair_value' } };
    }

    if (threshold <= 0) {
      return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion', reason: 'invalid_threshold' } };
    }

    const deviation = (ctx.lastPrice - fairValue) / fairValue;

    if (deviation <= -threshold) {
      const strength = Math.min(1, Math.abs(deviation) / (2 * threshold));
      const confidence = parseFloat((strength * maxConf).toFixed(4));
      return {
        signal: 'buy',
        confidence,
        meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
      };
    }

    if (deviation >= threshold) {
      const strength = Math.min(1, deviation / (2 * threshold));
      const confidence = parseFloat((strength * maxConf).toFixed(4));
      return {
        signal: 'sell',
        confidence,
        meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
      };
    }

    return {
      signal: 'hold',
      confidence: 0,
      meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
    };
  },
];

export const volatilityDcaFunctions: QuantFn[] = [volatilityDca];
