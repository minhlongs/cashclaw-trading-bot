// Individual validation checks for Strategy Survival Gate (Phase 15). Pure, deterministic.

import type { GateCheck } from './gate-checks-types';
import { checkDrawdown, checkNetPnlAfterFees, checkNetPnlAdverse } from './gate-checks-pnl';
import { checkSharpe, checkRegimeCoverage } from './gate-checks-regime';

export type { GateCheck };
export { checkDrawdown, checkNetPnlAfterFees, checkNetPnlAdverse, checkSharpe, checkRegimeCoverage };

export function checkTradeCount(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_trades',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `${actual} trades vs. minimum ${threshold}`,
  };
}

export function checkExpectancy(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_expectancy',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Expectancy ${actual.toFixed(4)} vs. minimum ${threshold}`,
  };
}

export function checkProfitFactor(actual: number, threshold: number): GateCheck {
  return {
    name: 'min_profit_factor',
    passed: actual >= threshold,
    actual,
    threshold,
    detail: `Profit factor ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}
