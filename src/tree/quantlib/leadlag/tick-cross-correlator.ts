import type { CrossCorrelationState, LeadLagConfig, TickEvent } from './lead-lag-types';
import { updatePairCovariances } from './tick-cross-correlator-cov';
export { initializeCrossCorrelationState } from './tick-cross-correlator-state';
export { getPairLagMetrics } from './tick-cross-correlator-metrics';

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
