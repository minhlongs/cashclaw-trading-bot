import type { GateCheck } from './gate-checks-types';

export function checkDrawdown(actual: number, threshold: number): GateCheck {
  return {
    name: 'max_drawdown',
    passed: actual <= threshold,
    actual,
    threshold,
    detail: `Max drawdown ${actual.toFixed(4)} vs. maximum ${threshold}`,
  };
}

export function checkNetPnlAfterFees(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_net_pnl_after_fees',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Net PnL after NORMAL-stress fees ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}

export function checkNetPnlAdverse(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_net_pnl_adverse',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Net PnL under ADVERSE slippage ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}
