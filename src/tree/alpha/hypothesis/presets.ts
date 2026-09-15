// Hypothesis Engine — Presets & Pure Helpers
// Extracted from generator.ts so both modules stay under the 150 LOC target.

import type { CombinerMethod } from '../types';
import type { BarrierConfig } from '../labeling';
import { RegimeLabel } from '../../regime/types';

// ── Indicator / Combiner / Optimizer / Regime Catalogs ─────────────────────────

export const ALL_INDICATORS = [
  'sma', 'ema', 'rsi', 'atr', 'bollinger', 'macd',
  'volume_zscore', 'returns', 'log_returns',
  'momentum', 'realized_volatility', 'distance_from_ma',
] as const;

export const ALL_COMBINERS: CombinerMethod[] = ['weighted_sum', 'voting', 'max_confidence'];
export const ALL_OPTIMIZERS = ['equal_weight', 'risk_parity', 'confidence_weighted', 'regime_sized'] as const;
export const ALL_REGIMES: RegimeLabel[] = [
  RegimeLabel.TREND_UP,
  RegimeLabel.TREND_DOWN,
  RegimeLabel.RANGE,
  RegimeLabel.HIGH_VOLATILITY,
  RegimeLabel.LOW_VOLATILITY,
  RegimeLabel.SHOCK,
];

export const LOOKBACK_RANGE: [number, number] = [14, 200];
export const DEFAULT_BARRIER: BarrierConfig = {
  takeProfitPct: 0.02,
  stopLossPct: 0.01,
  maxHoldingMs: 24 * 3600_000,
};

// ── Pure Helpers ───────────────────────────────────────────────────────────────

export function slug(len = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return s;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function pickN<T>(arr: readonly T[], min: number, max: number): T[] {
  const count = randomInt(min, Math.min(max, arr.length));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Regime-Specific Presets ───────────────────────────────────────────────────

export interface RegimeStrategy {
  indicators: readonly string[];
  combiner: CombinerMethod;
  description: string;
}

export const REGIME_STRATEGY: Record<RegimeLabel, RegimeStrategy> = {
  TREND_UP: {
    indicators: ['ema', 'macd', 'momentum', 'rsi'],
    combiner: 'weighted_sum',
    description: 'Trend-following with momentum confirmation',
  },
  TREND_DOWN: {
    indicators: ['sma', 'volume_zscore', 'rsi', 'atr'],
    combiner: 'voting',
    description: 'Defensive trend-down with volume and volatility checks',
  },
  RANGE: {
    indicators: ['bollinger', 'rsi', 'atr', 'distance_from_ma'],
    combiner: 'max_confidence',
    description: 'Mean-reversion with mean-distance confirmation',
  },
  HIGH_VOLATILITY: {
    indicators: ['atr', 'realized_volatility', 'volume_zscore', 'macd'],
    combiner: 'voting',
    description: 'Volatility-adjusted with risk-aware sizing',
  },
  LOW_VOLATILITY: {
    indicators: ['sma', 'ema', 'momentum', 'returns'],
    combiner: 'weighted_sum',
    description: 'Low-vol momentum with trend strength',
  },
  SHOCK: {
    indicators: ['atr', 'volume_zscore', 'rsi'],
    combiner: 'max_confidence',
    description: 'Shock detection with rapid mean-reversion',
  },
  UNKNOWN: {
    indicators: ['sma', 'rsi', 'macd', 'volume_zscore'],
    combiner: 'weighted_sum',
    description: 'Default balanced indicator set for unknown regimes',
  },
};
