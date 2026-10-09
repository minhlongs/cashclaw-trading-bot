import type { CrossCorrelationState, LeadLagConfig } from './lead-lag-types';

export function updatePairCovariances(
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
        lagCovs[pairKey] = { ...lagCovs[pairKey], [lag]: newCov };
      }
    }
  }

  return lagCovs;
}
