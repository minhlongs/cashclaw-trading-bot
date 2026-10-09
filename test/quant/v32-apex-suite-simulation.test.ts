import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '@/tree/regime/types';
import { computeHubermanStanzlExecution } from '@/tree/quantlib/execution/huberman-stanzl-engine';
import { computeTothFarmerImpact } from '@/tree/quantlib/microstructure/toth-farmer-impact-engine';
import { createNode, addChild, ancestors, descendants, isDeadEnd } from '@/tree/alpha/hypothesis/lineage.core';
import {
  buildCalibrationAggregates,
  computeAgentCalibrationScores,
  rankUsefulness,
  computeExpectationGap,
  aggregateExpectationGapByRegime,
} from '@/forest/research/tradingagents/calibration.core';
import type { ProvenanceOutcome } from '@/forest/research/tradingagents/calibration.types';

describe('Triad v32 Apex Multi-Domain Quantitative & Architecture Suite Simulation', () => {
  it('integrates Huberman-Stanzl execution, Tóth-Farmer impact, lineage graph & calibration core', () => {
    // 1. Huberman-Stanzl execution
    const exec = computeHubermanStanzlExecution({
      totalShares: 5000,
      timeHorizon: 1.0,
      numSteps: 5,
      permanentImpactCoeff: 0.0008,
      temporaryImpactCoeff: 0.004,
      riskAversion: 0.0002,
      initialPrice: 200,
    });
    expect(exec.terminalShares).toBe(0);
    expect(exec.isManipulationFree).toBe(true);

    // 2. Tóth-Farmer square root impact
    const impact = computeTothFarmerImpact({
      orderVolume: 5000,
      dailyVolume: 500000,
      volatility: 0.025,
      preFactor: 0.7,
      powerLawExponent: 0.5,
      decayTimeConstant: 1.0,
      evaluationSteps: 5,
    });
    expect(impact.peakImpact).toBeGreaterThan(0);
    expect(impact.participationRate).toBe(0.01);

    // 3. Lineage graph operations
    const root = createNode('H100', null);
    const withChild = addChild([root], 'H100', 'H100-A', 'MUTATION_PARAM');
    expect(descendants(withChild, 'H100').length).toBe(1);
    expect(ancestors(withChild, 'H100-A')[0].id).toBe('H100');
    expect(isDeadEnd(withChild, 'H100')).toBe(false);

    // 4. Calibration core operations
    const outcomes: ProvenanceOutcome[] = [
      {
        agentRole: 'bull-researcher',
        providerId: 'Claude-Fable',
        modelId: 'fixture-reasoning',
        regime: RegimeLabel.TREND_UP,
        predictedDirection: 'long',
        predictedConfidence: 0.8,
        predictedReturn: 0.05,
        predictedVolatility: 0.02,
        realizedReturn: 0.04,
        realizedVolatility: 0.02,
        thesisSurvived: true,
      },
    ];
    const aggs = buildCalibrationAggregates(outcomes);
    expect(aggs.size).toBe(1);
    const scores = computeAgentCalibrationScores(aggs);
    expect(scores.length).toBe(1);
    const ranked = rankUsefulness(scores);
    expect(ranked.length).toBe(1);

    const gap = computeExpectationGap({
      predictedDirection: 'long',
      predictedConfidence: 0.8,
      predictedReturn: 0.05,
      predictedVolatility: 0.02,
      realizedReturn: 0.04,
      realizedVolatility: 0.02,
      thesisSurvived: true,
      regime: RegimeLabel.TREND_UP,
    });
    expect(gap.returnGap).toBeCloseTo(0.01, 5);
    const regimeGaps = aggregateExpectationGapByRegime([gap]);
    expect(regimeGaps.get(RegimeLabel.TREND_UP)?.count).toBe(1);
  });
});
