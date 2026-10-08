/**
 * @file tick-cross-correlator.ts
 * @description Online tick cross-correlation engine maintaining exponential variance and lagged covariance buffers.
 */

import type {
  CrossCorrelationState,
  LeadLagConfig,
  PairLagMetrics,
  TickEvent,
} from './lead-lag-types';

export function initializeCrossCorrelationState(
  symbols: string[],
  maxLag = 5
): CrossCorrelationState {
  const lastPrices: Record<string, number> = {};
  const returnHistories: Record<string, number[]> = {};
  const variances: Record<string, number> = {};
  const observationCounts: Record<string, number> = {};
  const lagCovariances: Record<string, Record<number, number>> = {};

  for (const s1 of symbols) {
    lastPrices[s1] = 0;
    returnHistories[s1] = [];
    variances[s1] = 0;
    observationCounts[s1] = 0;
    for (const s2 of symbols) {
      if (s1 === s2) continue;
      const key = `${s1}:${s2}`;
      lagCovariances[key] = {};
      for (let lag = 1; lag <= maxLag; lag++) {
        lagCovariances[key][lag] = 0;
      }
    }
  }

  return { symbols, lastPrices, returnHistories, variances, observationCounts, lagCovariances };
}

function updatePairCovariances(
  state: CrossCorrelationState,
  symbol: string,
  ret: number,
  count: number,
  config: LeadLagConfig
): Record<string, Record<number, number>> {
  const lagCovs = { ...state.lagCovariances };
  const alpha = 1 - config.decayFactor;

  for (const other of state.symbols) {
    if (other === symbol) continue;
    const pairKey = `${other}:${symbol}`;
    const otherHist = state.returnHistories[other] || [];
    if (!lagCovs[pairKey]) lagCovs[pairKey] = {};

    for (let lag = 1; lag <= config.maxLag; lag++) {
      if (otherHist.length >= lag + 1) {
        const laggedRet = otherHist[otherHist.length - 1 - lag];
        const covVal = state.lagCovariances[pairKey]?.[lag] || 0;
        const newCov = count <= lag ? laggedRet * ret : config.decayFactor * covVal + alpha * laggedRet * ret;
        lagCovs[pairKey] = {
          ...lagCovs[pairKey],
          [lag]: newCov,
        };
      }
    }
  }

  return lagCovs;
}

export function updateTickCrossCorrelation(
  state: CrossCorrelationState,
  tick: TickEvent,
  config: LeadLagConfig
): CrossCorrelationState {
  const { symbol, price } = tick;
  if (!state.symbols.includes(symbol) || price <= 0) return state;

  const prevPrice = state.lastPrices[symbol];
  const newState: CrossCorrelationState = {
    ...state,
    lastPrices: { ...state.lastPrices, [symbol]: price },
    returnHistories: { ...state.returnHistories },
    variances: { ...state.variances },
    observationCounts: { ...state.observationCounts },
    lagCovariances: { ...state.lagCovariances },
  };

  if (prevPrice <= 0) {
    newState.returnHistories[symbol] = [0];
    return newState;
  }

  const ret = (price - prevPrice) / prevPrice;
  const history = [...(state.returnHistories[symbol] || []), ret];
  if (history.length > config.maxLag + 20) history.shift();
  newState.returnHistories[symbol] = history;

  const count = (state.observationCounts[symbol] || 0) + 1;
  newState.observationCounts[symbol] = count;

  const alpha = 1 - config.decayFactor;
  const currentVar = state.variances[symbol] || 0;
  newState.variances[symbol] = count === 1 ? ret * ret : config.decayFactor * currentVar + alpha * ret * ret;
  newState.lagCovariances = updatePairCovariances(state, symbol, ret, count, config);

  return newState;
}

export function getPairLagMetrics(
  state: CrossCorrelationState,
  lead: string,
  follower: string,
  lag: number
): PairLagMetrics {
  const pairKey = `${lead}:${follower}`;
  const cov = state.lagCovariances[pairKey]?.[lag] || 0;
  const varLead = Math.max(1e-12, state.variances[lead] || 0);
  const varFollow = Math.max(1e-12, state.variances[follower] || 0);
  const rawCorr = cov / Math.sqrt(varLead * varFollow);
  const correlation = Math.max(-1, Math.min(1, Number.isFinite(rawCorr) ? rawCorr : 0));
  return { lag, correlation, covariance: cov };
}
