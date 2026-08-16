// Backtest Engine — Realistic Cost Model
// Pure functions for modelling fees, slippage, and market impact.

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type StressMode = 'normal' | 'conservative' | 'adverse';

export interface CostConfig {
  /** Taker fee as a decimal fraction (e.g. 0.0005 = 5 bps). */
  feePct: number;
  /** Slippage as a decimal fraction (e.g. 0.0005 = 5 bps). */
  slipPct: number;
  /** Market impact as a decimal fraction applied via square-root model. */
  marketImpactPct: number;
  /** Stress scenario selector. */
  stressMode: StressMode;
}

export interface CostBreakdown {
  netPnl: number;
  fees: number;
  slippage: number;
  marketImpact: number;
}

export interface StressConfig {
  readonly feePct: number;
  readonly slipPct: number;
}

// ──────────────────────────────────────────────
// Default Stress Configs (tuneable)
// ──────────────────────────────────────────────

const STRESS_CONFIGS: Record<StressMode, StressConfig> = {
  normal:      { feePct: 0.0005, slipPct: 0.0005 },  //  5 bps
  conservative: { feePct: 0.0010, slipPct: 0.0010 },  // 10 bps
  adverse:     { feePct: 0.0020, slipPct: 0.0020 },  // 20 bps
};

// ──────────────────────────────────────────────
// Public Functions
// ──────────────────────────────────────────────

/** Resolve fee/slip pair for a stress mode. */
export function resolveStressConfig(mode: StressMode): StressConfig {
  return { ...STRESS_CONFIGS[mode] };
}

/**
 * Estimate market impact using a square-root model.
 * Returns a fractional cost: impact = volatility_constant * sqrt(order / adv).
 * The volatility_constant is baked in at 0.1 (typical for crypto).
 * Returns 0 when avgDailyVolume is zero or negative.
 */
export function estimateMarketImpact(
  orderSize: number,
  avgDailyVolume: number,
): number {
  if (avgDailyVolume <= 0 || orderSize <= 0) return 0;
  const VOLATILITY_CONSTANT = 0.1;
  return VOLATILITY_CONSTANT * Math.sqrt(orderSize / avgDailyVolume);
}

/**
 * Apply transaction costs to a gross PnL figure.
 *
 * @param grossPnl   Raw profit/loss before costs.
 * @param notional    Absolute notional value of the trade (price * quantity).
 * @param config      Cost parameters.
 * @returns           Breakdown of net result and individual cost components.
 */
export function applyCosts(
  grossPnl: number,
  notional: number,
  config: CostConfig,
): CostBreakdown {
  if (notional <= 0) {
    return { netPnl: grossPnl, fees: 0, slippage: 0, marketImpact: 0 };
  }

  const fees = notional * config.feePct;
  const slippage = notional * config.slipPct;
  const marketImpact = notional * config.marketImpactPct;

  const totalCost = fees + slippage + marketImpact;
  return {
    netPnl: grossPnl - totalCost,
    fees,
    slippage,
    marketImpact,
  };
}
