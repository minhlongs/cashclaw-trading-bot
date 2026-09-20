// Regime-specific barrier configurations for HypothesisGenerator.
import { RegimeLabel } from '../../regime/types';
import type { BarrierConfig } from '../labeling';

export const REGIME_BARRIERS: Partial<Record<RegimeLabel, BarrierConfig>> = {
  TREND_UP: { takeProfitPct: 0.03, stopLossPct: 0.015, maxHoldingMs: 48 * 3600_000 },
  TREND_DOWN: { takeProfitPct: 0.015, stopLossPct: 0.005, maxHoldingMs: 12 * 3600_000 },
  RANGE: { takeProfitPct: 0.01, stopLossPct: 0.01, maxHoldingMs: 6 * 3600_000 },
  HIGH_VOLATILITY: { takeProfitPct: 0.04, stopLossPct: 0.02, maxHoldingMs: 24 * 3600_000 },
  LOW_VOLATILITY: { takeProfitPct: 0.015, stopLossPct: 0.01, maxHoldingMs: 36 * 3600_000 },
  SHOCK: { takeProfitPct: 0.05, stopLossPct: 0.025, maxHoldingMs: 6 * 3600_000 },
};
