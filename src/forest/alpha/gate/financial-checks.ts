import type { GateCheck } from './types';
import { checkMinSharpeSortino, checkMinRegimeCoverage } from './financial-checks-core';

export { checkMinSharpeSortino, checkMinRegimeCoverage };

export function checkMinTrades(numTrades: number, threshold = 30): GateCheck {
  const isInteger = Number.isInteger(numTrades);
  const passed = isInteger && numTrades >= 0 && numTrades >= threshold;
  return {
    name: 'min_trades',
    passed,
    actual: Number.isFinite(numTrades) ? numTrades : null,
    threshold,
    detail: Number.isFinite(numTrades)
      ? `${numTrades} trades vs. minimum ${threshold}`
      : `Invalid trade count: ${numTrades}`,
  };
}

export function checkMinNetExpectancy(expectancy: number, threshold = 0): GateCheck {
  const passed = Number.isFinite(expectancy) && expectancy > threshold;
  return {
    name: 'min_net_expectancy',
    passed,
    actual: Number.isFinite(expectancy) ? expectancy : null,
    threshold,
    detail: Number.isFinite(expectancy)
      ? `Net expectancy ${expectancy.toFixed(4)} vs. minimum > ${threshold}`
      : `Invalid net expectancy: ${expectancy}`,
  };
}

export function checkMinProfitFactor(profitFactor: number, threshold = 1.2): GateCheck {
  const isFinitePf = Number.isFinite(profitFactor);
  const passed = isFinitePf ? profitFactor >= threshold && profitFactor >= 0 : profitFactor === Infinity;
  return {
    name: 'min_profit_factor',
    passed,
    actual: isFinitePf || profitFactor === Infinity ? profitFactor : null,
    threshold,
    detail: isFinitePf || profitFactor === Infinity
      ? `Profit factor ${isFinitePf ? profitFactor.toFixed(2) : String(profitFactor)} vs. minimum ${threshold}`
      : `Invalid profit factor: ${profitFactor}`,
  };
}

export function checkMaxDrawdown(maxDrawdown: number, threshold = 0.25): GateCheck {
  const passed = Number.isFinite(maxDrawdown) && maxDrawdown >= 0 && maxDrawdown <= threshold;
  return {
    name: 'max_drawdown',
    passed,
    actual: Number.isFinite(maxDrawdown) ? maxDrawdown : null,
    threshold,
    detail: Number.isFinite(maxDrawdown)
      ? `Max drawdown ${(maxDrawdown * 100).toFixed(2)}% vs. maximum ${(threshold * 100).toFixed(2)}%`
      : `Invalid max drawdown: ${maxDrawdown}`,
  };
}
