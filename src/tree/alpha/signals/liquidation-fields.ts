import type { LiquidationPoint } from './funding-types';
import { rollingMean, rollingStd } from './funding-stats';

export function liquidationFields(liquidations: LiquidationPoint[], t: number, lookbackBars: number, candleIntervalMs: number) {
  const windowStart = t - lookbackBars * candleIntervalMs;
  const liqWindow = liquidations.filter(l => l.timestamp >= windowStart && l.timestamp <= t);
  const longNotional = liqWindow.filter(l => l.side === 'long').reduce((s, l) => s + l.notionalUsd, 0);
  const shortNotional = liqWindow.filter(l => l.side === 'short').reduce((s, l) => s + l.notionalUsd, 0);
  const liquidationImbalance = longNotional - shortNotional;
  const allLiquidations = liqWindow.map(l => l.notionalUsd);
  const liqMean = rollingMean(allLiquidations, Math.min(allLiquidations.length, lookbackBars)) ?? 0;
  const liqStd = rollingStd(allLiquidations, Math.min(allLiquidations.length, lookbackBars)) ?? 1;
  return {
    liquidationImbalance,
    liquidationZScore: liqStd > 0 ? (liquidationImbalance - liqMean) / liqStd : null,
  };
}

export function basisFields(premiumIndex: { timestamp: number; basis: number }[], t: number, lookbackBars: number) {
  const eligible = premiumIndex.filter(p => p.timestamp <= t);
  const basisPoint = eligible.length > 0 ? eligible[eligible.length - 1] : undefined;
  const basis = basisPoint ? basisPoint.basis : null, hist = eligible.map(p => p.basis);
  return {
    basis,
    basisZScore: basis !== null && hist.length >= lookbackBars
      ? (basis - (rollingMean(hist, lookbackBars) ?? 0)) / (rollingStd(hist, lookbackBars) ?? 1)
      : null,
  };
}
