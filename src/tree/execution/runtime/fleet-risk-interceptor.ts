// Fleet Risk Interceptor — Guards Bot Execution Loops Against Portfolio Drawdowns
import type { RiskInterceptionDecision } from './runtime-execution-types';
import { evaluateFleetCircuitBreaker } from '../../../forest/risk/commander/fleet-circuit-breaker';

export function interceptOrderExecution(
  requestedQuantity: number,
  currentEquityUsd: number,
  peakEquityUsd: number,
  maxDrawdownThreshold = 0.15,
  warningDrawdownThreshold = 0.08,
): RiskInterceptionDecision {
  if (requestedQuantity <= 0) {
    return {
      allowed: false,
      action: 'block_emergency_pause',
      adjustedQuantity: 0,
      reason: 'Requested order quantity must be strictly positive',
    };
  }

  const status = evaluateFleetCircuitBreaker(
    currentEquityUsd,
    peakEquityUsd,
    maxDrawdownThreshold,
    warningDrawdownThreshold,
  );

  if (status.isTriggered || status.actionRequired === 'emergency_pause_all') {
    return {
      allowed: false,
      action: 'block_emergency_pause',
      adjustedQuantity: 0,
      reason: status.reason,
    };
  }

  if (status.actionRequired === 'reduce_risk') {
    return {
      allowed: true,
      action: 'throttle_half_size',
      adjustedQuantity: requestedQuantity * 0.5,
      reason: status.reason,
    };
  }

  return {
    allowed: true,
    action: 'execute',
    adjustedQuantity: requestedQuantity,
    reason: null,
  };
}
