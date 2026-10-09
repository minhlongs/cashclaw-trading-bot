import { describe, it, expect } from 'vitest';
import { DeliberationReflexiveLoop } from '../../src/forest/research/tradingagents/deliberation-reflexive-loop';
import type { FactorOOSResult, AgentBeliefPrior } from '../../src/forest/research/tradingagents/deliberation-reflexive-types';

describe('DeliberationReflexiveLoop', () => {
  const loop = new DeliberationReflexiveLoop();

  it('boosts confidence score for factors passing survival gate', () => {
    const oosResults: FactorOOSResult[] = [
      {
        factorName: 'ALPHA_MOMENTUM_7D',
        icMean: 0.08,
        irRatio: 1.4,
        quantileSpread: 0.035,
        verdict: 'PAPER_CANDIDATE',
      },
    ];

    const updated = loop.updateBeliefPriors([], oosResults);
    expect(updated).toHaveLength(1);
    expect(updated[0]?.confidenceScore).toBeGreaterThan(0.5);
    expect(updated[0]?.isQuarantined).toBe(false);
  });

  it('penalizes and quarantines persistently failing factors', () => {
    const currentPriors: AgentBeliefPrior[] = [
      {
        featureKey: 'ALPHA_OVERFIT_NOISE',
        confidenceScore: 0.3,
        sampleCount: 2,
        isQuarantined: false,
        feedbackNotes: ['Prior failure'],
      },
    ];

    const oosResults: FactorOOSResult[] = [
      {
        factorName: 'ALPHA_OVERFIT_NOISE',
        icMean: -0.06,
        irRatio: -0.8,
        quantileSpread: -0.02,
        verdict: 'KILLED',
      },
    ];

    const updated = loop.updateBeliefPriors(currentPriors, oosResults);
    expect(updated[0]?.isQuarantined).toBe(true);
    expect(updated[0]?.confidenceScore).toBeLessThan(0.3);

    const guidance = loop.generateDebateGuidance(updated);
    expect(guidance.quarantinedFactors).toContain('ALPHA_OVERFIT_NOISE');
    expect(guidance.summaryPromptGuidance).toContain('Avoid quarantined');
  });
});
