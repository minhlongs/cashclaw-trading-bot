import { computeDeflatedSharpe, computeExpectedMaxSharpe } from '@/forest/research/swarm/deflated-sharpe';
import { volatilityDca } from '@/tree/quantlib/volatility-dca';
import { resolveStressConfig } from '@/tree/alpha/cost-stress';
import { TIER_TO_STRESS, REGIME_SEEDS, CANDIDATE_TRIALS } from './quant-telemetry-seeds';
import {
  computeHawkesLobTelemetry,
  computeRoughVolatilityTelemetry,
  computeDataQualityTelemetry,
  computeCorrelationTelemetry,
  type DataFaultMode,
  type RoughVolMode,
} from './quant-wave2-telemetry';
import {
  computeLeadLagTelemetry,
  computeAlmgrenChrissTelemetry,
  type LeadLagPairId,
  type ExecutionUrgencyPreset,
} from './quant-wave3-telemetry';

export {
  computeHawkesLobTelemetry,
  computeRoughVolatilityTelemetry,
  computeDataQualityTelemetry,
  computeCorrelationTelemetry,
  computeLeadLagTelemetry,
  computeAlmgrenChrissTelemetry,
  type DataFaultMode,
  type RoughVolMode,
  type LeadLagPairId,
  type ExecutionUrgencyPreset,
};

export type CostTierId = 'BASE' | 'ELEVATED' | 'EXTREME';
export type RegimeId = 'LOW_VOL_TREND' | 'HIGH_VOL_BREAKOUT' | 'HIGH_VOL_CHOP' | 'LIQUIDITY_CRISIS';

export function computeRegimeAttributionTelemetry(costTier: CostTierId, regimeFilter: 'ALL' | RegimeId) {
  const stressCfg = resolveStressConfig(TIER_TO_STRESS[costTier]);
  const totalFrictionBps = Math.round((stressCfg.feePct + stressCfg.slipPct + stressCfg.marketImpactPct) * 10000);
  const penaltyScale = totalFrictionBps / 100;
  const ddMultiplier = 1 + (totalFrictionBps - 16) * 0.005;

  const filtered = regimeFilter === 'ALL' ? REGIME_SEEDS : REGIME_SEEDS.filter((r) => r.regime === regimeFilter);
  const rows = filtered.map((seed) => {
    const dcaResult = volatilityDca(
      { symbol: 'BTC/USDT', balance: 10000, lastPrice: seed.simPrice },
      { referencePrice: 64250, volatility: seed.volatility, volBaseline: 0.02, priceDropStep: 0.025, stepIndex: 0, maxSteps: 5 },
    );
    const netSharpe = Number((seed.grossSharpe - penaltyScale * seed.turnoverRate).toFixed(2));
    const stressedDdPct = Number((seed.baseMaxDdPct * ddMultiplier).toFixed(1));
    return { ...seed, netSharpe, stressedDdPct, dcaSignal: dcaResult.signal.toUpperCase(), dcaConfidence: dcaResult.confidence };
  });

  const meanNetSharpe = Number((rows.reduce((acc, r) => acc + r.netSharpe, 0) / rows.length).toFixed(2));
  const worstDdPct = Number(Math.max(...rows.map((r) => r.stressedDdPct)).toFixed(1));
  return { totalFrictionBps, meanNetSharpe, worstDdPct, rows };
}

export function computeFdrGateTelemetry(fdrAlpha: number, totalTrials: number, method: 'BH_FDR' | 'HOLM_BONFERRONI') {
  const expectedMaxSharpe = Number(computeExpectedMaxSharpe(totalTrials, 0.5).toFixed(2));
  const rows = CANDIDATE_TRIALS.map((trial, index) => {
    const rank = index + 1;
    const criticalP = method === 'BH_FDR' ? (rank / totalTrials) * fdrAlpha : fdrAlpha / (totalTrials - rank + 1);
    const dsrOut = computeDeflatedSharpe(
      { estimatedSharpe: trial.observedSharpe, sampleLength: 730, numTrials: totalTrials, skewness: -0.15, kurtosis: 3.8 },
      0.95,
    );
    const dsr = Number(dsrOut.deflatedSharpeRatio.toFixed(2));
    const survived = trial.rawPValue <= criticalP && dsrOut.isSignificant;
    return { ...trial, rank, criticalP, dsr, verdict: survived ? ('SURVIVED' as const) : ('REJECTED_FDR' as const) };
  });
  return { expectedMaxSharpe, rows, survivedCount: rows.filter((r) => r.verdict === 'SURVIVED').length };
}

export function computeQuantTelemetrySnapshot() {
  return {
    paperOnly: true as const,
    adrInvariant: 'ADR-001' as const,
    generatedAt: '2026-10-17T11:45:00.000Z',
    regime: computeRegimeAttributionTelemetry('BASE', 'ALL'),
    fdr: computeFdrGateTelemetry(0.05, 12, 'BH_FDR'),
    dataQuality: computeDataQualityTelemetry('NONE'),
    correlation: computeCorrelationTelemetry(30),
    hawkesLob: computeHawkesLobTelemetry(),
    roughVolatility: computeRoughVolatilityTelemetry('ROUGH_BURST'),
    leadLagHayashiYoshida: computeLeadLagTelemetry('BTC_PERP->ETH_SPOT'),
    almgrenChrissExecution: computeAlmgrenChrissTelemetry('BALANCED_AC'),
  };
}
