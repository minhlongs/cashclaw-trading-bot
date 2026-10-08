import type { CircuitBreakerStatus } from './fleet-types';

export const DEFAULT_MAX_PORTFOLIO_DRAWDOWN = 0.15; // 15% Max DD triggers pause
export const DEFAULT_WARNING_PORTFOLIO_DRAWDOWN = 0.08; // 8% triggers risk reduction

export function evaluateFleetCircuitBreaker(
  currentEquityUsd: number,
  peakEquityUsd: number,
  maxDrawdownThreshold = DEFAULT_MAX_PORTFOLIO_DRAWDOWN,
  warningDrawdownThreshold = DEFAULT_WARNING_PORTFOLIO_DRAWDOWN,
): CircuitBreakerStatus {
  if (peakEquityUsd <= 0 || currentEquityUsd <= 0) {
    return {
      isTriggered: true,
      portfolioDrawdownPct: 1.0,
      reason: 'Equity depleted or invalid peak equity',
      actionRequired: 'emergency_pause_all',
    };
  }

  const drawdown = Math.max(0, (peakEquityUsd - currentEquityUsd) / peakEquityUsd);

  if (drawdown >= maxDrawdownThreshold) {
    return {
      isTriggered: true,
      portfolioDrawdownPct: drawdown,
      reason: `Portfolio drawdown ${(drawdown * 100).toFixed(1)}% exceeded emergency ceiling ${(maxDrawdownThreshold * 100).toFixed(1)}%`,
      actionRequired: 'emergency_pause_all',
    };
  }

  if (drawdown >= warningDrawdownThreshold) {
    return {
      isTriggered: false,
      portfolioDrawdownPct: drawdown,
      reason: `Portfolio drawdown ${(drawdown * 100).toFixed(1)}% reached warning threshold ${(warningDrawdownThreshold * 100).toFixed(1)}%`,
      actionRequired: 'reduce_risk',
    };
  }

  return {
    isTriggered: false,
    portfolioDrawdownPct: drawdown,
    reason: null,
    actionRequired: 'none',
  };
}
