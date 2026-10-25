export function computeFoucaultKadanOrderBook(p: FoucaultKadanParams): FoucaultKadanResult {
  const q = Math.max(0, p.queueDepth), lambda = Math.max(1e-4, p.marketOrderArrivalRate);
  const delta = Math.max(1e-5, p.tickSize), c = Math.max(0, p.traderImpatienceCost);
  const sigma = Math.max(0, p.volatility), tLimit = Math.max(1e-4, p.timeLimitSec);

  const expectedWait = (q + 1) / lambda;
  const waitingCost = c * expectedWait;
  const reservationSpread = Math.max(delta, delta + waitingCost + sigma * Math.sqrt(expectedWait));
  const fillProbability = Math.min(1, Math.max(0, 1 - Math.exp(-lambda * (tLimit / (q + 1)))));
  const optimalOrderType: 'LIMIT' | 'MARKET' = fillProbability >= 0.5 && waitingCost <= delta * 2 ? 'LIMIT' : 'MARKET';

  return { expectedWaitTimeSec: expectedWait, reservationSpread, fillProbability, optimalOrderType, waitingCostPerUnit: waitingCost };
}

export interface FoucaultKadanParams {
  readonly queueDepth: number;
  readonly marketOrderArrivalRate: number;
  readonly traderImpatienceCost: number;
  readonly tickSize: number;
  readonly volatility: number;
  readonly timeLimitSec: number;
}

export interface FoucaultKadanResult {
  readonly expectedWaitTimeSec: number;
  readonly reservationSpread: number;
  readonly fillProbability: number;
  readonly optimalOrderType: 'LIMIT' | 'MARKET';
  readonly waitingCostPerUnit: number;
}
