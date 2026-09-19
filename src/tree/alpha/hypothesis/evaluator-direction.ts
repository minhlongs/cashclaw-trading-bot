// Direction inference rules for hypothesis evaluation.

import type { AlphaDirection } from '../types';

export type DirectionRule = (v: number) => AlphaDirection;

export function defaultDirection(v: number): AlphaDirection {
  return v > 0 ? 'buy' : v < 0 ? 'sell' : 'hold';
}

export const DIRECTION_RULES: Record<string, DirectionRule> = {
  rsi: (v) => (v < 30 ? 'buy' : v > 70 ? 'sell' : 'hold'),
  macd: defaultDirection,
  bollinger: (v) => (v < -1 ? 'buy' : v > 1 ? 'sell' : 'hold'),
  momentum: defaultDirection,
  returns: defaultDirection,
  log_returns: defaultDirection,
  atr: (v) => (v > 1 ? 'sell' : v < -1 ? 'buy' : 'hold'),
  realized_volatility: (v) => (v > 1 ? 'sell' : v < -1 ? 'buy' : 'hold'),
  volume_zscore: (v) => (v > 1 ? 'sell' : v < -1 ? 'buy' : 'hold'),
};

export function inferDirection(indicator: string, value: number | null): AlphaDirection {
  if (value === null) return 'hold';
  const directionFn = DIRECTION_RULES[indicator];
  return directionFn ? directionFn(value) : defaultDirection(value);
}
