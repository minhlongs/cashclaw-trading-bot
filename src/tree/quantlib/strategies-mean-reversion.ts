import type { QuantLibContext, QuantResult } from './index';

export function meanReversion(ctx: QuantLibContext, params?: Record<string, number>): QuantResult {
  if (ctx.lastPrice <= 0) return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion' } };
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
    return {
      signal: 'buy',
      confidence: parseFloat((strength * maxConf).toFixed(4)),
      meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
    };
  }
  if (deviation >= threshold) {
    const strength = Math.min(1, deviation / (2 * threshold));
    return {
      signal: 'sell',
      confidence: parseFloat((strength * maxConf).toFixed(4)),
      meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
    };
  }
  return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) } };
}
