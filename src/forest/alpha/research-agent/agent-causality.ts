import { declareFeature } from '@/tree/alpha/indicator-types';
import { MICROSTRUCTURE_FEATURE_NAMES } from '@/tree/alpha/microstructure/contracts';
import type { FeatureProposal } from './types';
import { NonCausalFeatureError } from './agent-errors';

export function validateFeatureCausality(proposal: FeatureProposal): void {
  const isSuspicious =
    proposal.combinationLogic.toLowerCase().includes('lead(') ||
    proposal.causalJustification.toLowerCase().includes('future') ||
    proposal.indicators.some((ind) => /t_plus|future|lead|t\+/i.test(ind));

  for (const indicator of proposal.indicators) {
    const isMicro = MICROSTRUCTURE_FEATURE_NAMES.includes(indicator as never);
    try {
      declareFeature({
        name: indicator,
        timeframe: '1m',
        source: isMicro ? 'orderbook' : 'ohlcv',
        lookback: proposal.lookbackPeriods[0] ?? 1,
        availability: 'when_listed',
        causal: !isSuspicious,
      });
    } catch (err) {
      throw new NonCausalFeatureError(`Feature '${indicator}' failed causality check: ${(err as Error).message}`);
    }
  }
}
