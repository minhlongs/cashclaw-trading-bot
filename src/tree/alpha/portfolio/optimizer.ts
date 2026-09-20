// Portfolio Optimizer — Signal allocation engine
// Produces a PortfolioTarget from alpha signals using configurable sizing methods.

import type { AlphaSignal } from '../types';
import type { RegimeLabel } from '../../regime/types';
import type { Allocation, OptimizerConfig, PortfolioTarget } from './types';
import { filterQualified, HANDLERS } from './optimizer-filter';

// ── Regime Multiplier ────────────────────────────────────────────────────────

/** Returns a sizing multiplier (0–1.5) for the given regime. */
export function computeRegimeMultiplier(regime: RegimeLabel): number {
  switch (regime) {
    case 'TREND_UP':
      return 1.2;
    case 'TREND_DOWN':
      return 0.8;
    case 'RANGE':
      return 1.0;
    case 'LOW_VOLATILITY':
      return 1.1;
    case 'HIGH_VOLATILITY':
      return 0.6;
    case 'SHOCK':
      return 0.3;
    case 'UNKNOWN':
      return 0.5;
    default:
      return 0.5;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Optimizes a portfolio target from alpha signals.
 *
 * @param signals  Raw alpha signals from the alpha pipeline.
 * @param regime   Current market regime classification.
 * @param config   Optimizer configuration.
 * @returns        A PortfolioTarget with allocations, exposure, and cash reserve.
 */
export function optimizePortfolio(
  signals: AlphaSignal[],
  regime: RegimeLabel,
  config: OptimizerConfig,
): PortfolioTarget {
  const empty: PortfolioTarget = {
    allocations: [],
    totalExposure: 0,
    cashReserve: config.cashReservePct,
    leverageRatio: 0,
  };

  const qualified = filterQualified(signals, config.minConfidence, config.maxPositions);
  if (qualified.length === 0) return empty;

  // Base budget: fraction of equity available after cash reserve, capped by maxExposurePct.
  let budget = (1 - config.cashReservePct) * config.maxExposurePct;

  // For regime_sized, scale the entire budget by the regime multiplier so that
  // high-vol regimes reduce total exposure and trending regimes increase it.
  if (config.method === 'regime_sized') {
    budget *= computeRegimeMultiplier(regime);
  }

  // Clamp budget to non-negative.
  budget = Math.max(0, budget);

  if (budget <= 0) return empty;

  // Handler produces raw relative weights.
  const rawAllocations = HANDLERS[config.method](qualified);

  // Stamp the actual regime on each allocation.
  const tagged = rawAllocations.map((a) => ({ ...a, regime }));

  // Normalize raw weights to sum to the budget.
  const totalRaw = tagged.reduce((sum, a) => sum + a.weight, 0);
  const scale = totalRaw > 0 ? budget / totalRaw : 0;

  const allocations: Allocation[] = tagged.map((a) => ({
    ...a,
    weight: a.weight * scale,
    size: a.weight * scale,
  }));

  const totalExposure = allocations.reduce((sum, a) => sum + a.weight, 0);
  const equityFraction = 1 - config.cashReservePct;
  const leverageRatio = equityFraction > 0 ? totalExposure / equityFraction : 0;

  return { allocations, totalExposure, cashReserve: config.cashReservePct, leverageRatio };
}
