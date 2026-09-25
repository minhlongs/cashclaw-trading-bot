import { describe, expect, it } from 'vitest';
import type { AlphaDecisionRecord, FeatureSnapshotHash } from '../../../../tree/alpha/observability/types';
import { RegimeLabel } from '../../../../tree/regime/types';
import { evaluateObservability } from '../evaluate';
import { ObservabilityReportSchema } from '../schemas';

const HASH_ZERO = '0'.repeat(64) as FeatureSnapshotHash;

function makeDec(alphaId: string, symbol: string, regime: RegimeLabel, ts: number, expRet: number, expCost: number): AlphaDecisionRecord {
  return {
    alphaId, direction: 'buy', confidence: 0.85, expectedReturn: expRet, expectedCost: expCost,
    expectedTurnover: 0.15, regime, horizon: '4h', featureDependencies: ['vol', 'basis'],
    featureSnapshotHash: HASH_ZERO, timestamp: ts, symbol,
  };
}

describe('Adversarial Multi-Asset Multi-Regime Edge Analytics', () => {
  it('accurately attributes 6 alphas across 4 regimes and satisfies partition invariance', () => {
    const alphas = ['alpha-mom', 'alpha-rev', 'alpha-arb', 'alpha-fund', 'alpha-brk', 'alpha-ob'];
    const regimes = [RegimeLabel.TREND_UP, RegimeLabel.TREND_DOWN, RegimeLabel.RANGE, RegimeLabel.HIGH_VOLATILITY];
    const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT'];

    const decisions: AlphaDecisionRecord[] = [];
    const realizedMap = new Map<string, number>();

    let t = 1700000000000;
    let oracleTotalExpNet = 0;
    let oracleTotalRealNet = 0;

    for (let aIdx = 0; aIdx < alphas.length; aIdx++) {
      const alphaId = alphas[aIdx]!;
      for (let rIdx = 0; rIdx < regimes.length; rIdx++) {
        const regime = regimes[rIdx]!;
        const symbol = symbols[(aIdx + rIdx) % symbols.length]!;
        const expRet = Number((0.01 * (aIdx + 1) + 0.005 * (rIdx + 1)).toFixed(6));
        const expCost = 0.002;
        const realNet = Number((expRet - expCost + (aIdx % 2 === 0 ? 0.004 : -0.003)).toFixed(6));

        t += 1000;
        decisions.push(makeDec(alphaId, symbol, regime, t, expRet, expCost));
        realizedMap.set(`${alphaId}:${t}`, realNet);

        oracleTotalExpNet += Number((expRet - expCost).toFixed(8));
        oracleTotalRealNet += Number(realNet.toFixed(8));
      }
    }

    const report = evaluateObservability({
      alphaDecisions: decisions, portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [], realizedReturns: realizedMap,
    });

    expect(ObservabilityReportSchema.parse(report)).toBeDefined();
    expect(report.sampleCounts.alphaDecisions).toBe(24);

    const expectedMeanExp = Number((oracleTotalExpNet / 24).toFixed(8));
    const expectedMeanReal = Number((oracleTotalRealNet / 24).toFixed(8));
    const expectedDelta = Number((expectedMeanReal - expectedMeanExp).toFixed(8));

    expect(report.edgeAttribution.expectedNetReturnMean).toBeCloseTo(expectedMeanExp, 6);
    expect(report.edgeAttribution.realizedNetReturnMean).toBeCloseTo(expectedMeanReal, 6);
    expect(report.edgeAttribution.edgeDeltaMean).toBeCloseTo(expectedDelta, 6);

    // Verify all 6 alphas and 4 regimes are accounted for
    expect(Object.keys(report.edgeAttribution.byAlpha)).toHaveLength(6);
    expect(Object.keys(report.edgeAttribution.byRegime)).toHaveLength(4);

    // Alpha partition invariance
    let alphaSumExp = 0;
    let alphaSumReal = 0;
    for (const alphaId of alphas) {
      const a = report.edgeAttribution.byAlpha[alphaId]!;
      expect(a.decisionCount).toBe(4);
      alphaSumExp += a.expectedNetReturnMean * a.decisionCount;
      alphaSumReal += a.realizedNetReturnMean * a.decisionCount;
    }
    expect(alphaSumExp / 24).toBeCloseTo(report.edgeAttribution.expectedNetReturnMean, 6);
    expect(alphaSumReal / 24).toBeCloseTo(report.edgeAttribution.realizedNetReturnMean, 6);

    // Regime partition invariance
    let regimeSumExp = 0;
    let regimeSumReal = 0;
    for (const reg of regimes) {
      const r = report.edgeAttribution.byRegime[reg]!;
      expect(r.decisionCount).toBe(6);
      regimeSumExp += r.expectedNetReturnMean * r.decisionCount;
      regimeSumReal += r.realizedNetReturnMean * r.decisionCount;
    }
    expect(regimeSumExp / 24).toBeCloseTo(report.edgeAttribution.expectedNetReturnMean, 6);
    expect(regimeSumReal / 24).toBeCloseTo(report.edgeAttribution.realizedNetReturnMean, 6);
  });

  it('respects realized return lookup hierarchy (composite key > alphaId > symbol > fallback)', () => {
    const d1 = makeDec('alpha-hier', 'BTC/USDT', RegimeLabel.TREND_UP, 1000, 0.05, 0.01);
    const d2 = makeDec('alpha-hier', 'BTC/USDT', RegimeLabel.RANGE, 2000, 0.05, 0.01);
    const d3 = makeDec('alpha-other', 'ETH/USDT', RegimeLabel.TREND_DOWN, 3000, 0.05, 0.01);
    const d4 = makeDec('alpha-unmatched', 'SOL/USDT', RegimeLabel.HIGH_VOLATILITY, 4000, 0.05, 0.01);

    const realizedMap: Record<string, number> = {
      'alpha-hier:1000': 0.10, // Composite match
      'alpha-hier': 0.08,       // AlphaId fallback for d2
      'ETH/USDT': 0.06,         // Symbol fallback for d3
    };

    const report = evaluateObservability({
      alphaDecisions: [d1, d2, d3, d4], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [], realizedReturns: realizedMap,
    });

    const byAlpha = report.edgeAttribution.byAlpha;
    expect(byAlpha['alpha-hier']?.realizedNetReturnMean).toBeCloseTo(0.09, 4); // (0.10 + 0.08)/2
    expect(byAlpha['alpha-other']?.realizedNetReturnMean).toBe(0.06);          // 0.06 via ETH/USDT
    expect(byAlpha['alpha-unmatched']?.realizedNetReturnMean).toBe(0.04);      // fallback to 0.05 - 0.01 = 0.04
    expect(byAlpha['alpha-unmatched']?.edgeDeltaMean).toBe(0);                 // zero edge erosion on fallback
  });

  it('correctly calculates winRate and Sharpe edge cases', () => {
    const d1 = makeDec('alpha-sharpe', 'BTC/USDT', RegimeLabel.TREND_UP, 1000, 0.03, 0.005);
    const d2 = makeDec('alpha-sharpe', 'BTC/USDT', RegimeLabel.TREND_UP, 2000, 0.03, 0.005);
    const d3 = makeDec('alpha-sharpe', 'BTC/USDT', RegimeLabel.TREND_UP, 3000, 0.03, 0.005);

    // Identical returns -> variance = 0 -> Sharpe is null
    const repFlat = evaluateObservability({
      alphaDecisions: [d1, d2, d3], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [], realizedReturns: { 'alpha-sharpe': 0.02 },
    });
    expect(repFlat.edgeAttribution.byAlpha['alpha-sharpe']?.sharpe).toBeNull();
    expect(repFlat.edgeAttribution.byAlpha['alpha-sharpe']?.winRate).toBe(1.0);

    // Divergent returns -> positive mean -> Sharpe > 0
    const repVar = evaluateObservability({
      alphaDecisions: [d1, d2, d3], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [],
      realizedReturns: { 'alpha-sharpe:1000': 0.05, 'alpha-sharpe:2000': 0.01, 'alpha-sharpe:3000': -0.01 },
    });
    expect(repVar.edgeAttribution.byAlpha['alpha-sharpe']?.sharpe).toBeGreaterThan(0);
    expect(repVar.edgeAttribution.byAlpha['alpha-sharpe']?.winRate).toBeCloseTo(2 / 3, 3);
  });
});
