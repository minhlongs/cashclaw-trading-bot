import { computeDeflatedSharpe, computeExpectedMaxSharpe } from '@/forest/research/swarm/deflated-sharpe';
import { volatilityDca } from '@/tree/quantlib/volatility-dca';
import { resolveStressConfig } from '@/tree/alpha/cost-stress';
import { validateCandleSeries } from '@/tree/alpha/data-quality/validator';
import type { Candle } from '@/tree/alpha/data-quality/types';
import { pearsonCorrelation } from '@/tree/alpha/correlation/compute';
import {
  TIER_TO_STRESS,
  REGIME_SEEDS,
  CANDIDATE_TRIALS,
  ASSET_RETURN_VECTORS,
} from './quant-telemetry-seeds';

export type CostTierId = 'BASE' | 'ELEVATED' | 'EXTREME';
export type RegimeId = 'LOW_VOL_TREND' | 'HIGH_VOL_BREAKOUT' | 'HIGH_VOL_CHOP' | 'LIQUIDITY_CRISIS';
export type DataFaultMode = 'NONE' | 'MONOTONICITY' | 'ZERO_VOLUME' | 'IMPOSSIBLE_OHLC';

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
    return {
      ...seed,
      netSharpe,
      stressedDdPct,
      dcaSignal: dcaResult.signal.toUpperCase(),
      dcaConfidence: dcaResult.confidence,
    };
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
    return {
      ...trial,
      rank,
      criticalP,
      dsr,
      verdict: survived ? ('SURVIVED' as const) : ('REJECTED_FDR' as const),
    };
  });
  return { expectedMaxSharpe, rows, survivedCount: rows.filter((r) => r.verdict === 'SURVIVED').length };
}

export function computeDataQualityTelemetry(faultMode: DataFaultMode) {
  const baseTs = 1728000000000;
  const intervalMs = 3600000;
  const candles: Candle[] = Array.from({ length: 12 }, (_, idx) => {
    const timestamp = faultMode === 'MONOTONICITY' && idx === 5 ? baseTs + 3 * intervalMs : baseTs + idx * intervalMs;
    const high = faultMode === 'IMPOSSIBLE_OHLC' && idx === 4 ? 61000 : 62500 + idx * 40;
    const low = 61800 + idx * 30;
    const volume = faultMode === 'ZERO_VOLUME' && idx === 6 ? 0 : 120 + idx * 8;
    return { timestamp, open: 62000 + idx * 35, high, low, close: 62150 + idx * 35, volume };
  });
  const validation = validateCandleSeries(candles, {
    expectedIntervalMs: intervalMs,
    asOf: baseTs + 12 * intervalMs,
    volume: { allowZeroVolume: false, flagIsolatedZeroVolume: true },
  });
  return {
    valid: validation.valid,
    status: validation.status,
    signalFence: validation.valid ? ('SIGNAL_ALLOWED' as const) : ('FLAT_FENCE_ENGAGED' as const),
    totalCandles: validation.totalCandles,
    violationCount: validation.violations.length,
    checkResults: validation.checkResults,
  };
}

export function computeCorrelationTelemetry(windowDays: 7 | 30 | 90) {
  const scale = windowDays === 7 ? 1.05 : windowDays === 30 ? 1.0 : 0.92;
  const symbols = Object.keys(ASSET_RETURN_VECTORS);
  const pairs: Array<{ pair: string; corr: number; clusterRisk: 'HIGH_CONTAGION' | 'DIVERSIFIED' }> = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const raw = pearsonCorrelation(ASSET_RETURN_VECTORS[symbols[i]], ASSET_RETURN_VECTORS[symbols[j]]);
      const corr = Number(Math.min(0.99, Math.max(-0.99, raw * scale)).toFixed(2));
      pairs.push({
        pair: `${symbols[i]}/${symbols[j]}`,
        corr,
        clusterRisk: corr >= 0.85 ? 'HIGH_CONTAGION' : 'DIVERSIFIED',
      });
    }
  }
  return { windowDays, pairs };
}

export function computeQuantTelemetrySnapshot() {
  return {
    paperOnly: true as const,
    adrInvariant: 'ADR-001' as const,
    generatedAt: '2026-10-17T10:30:00.000Z',
    regime: computeRegimeAttributionTelemetry('BASE', 'ALL'),
    fdr: computeFdrGateTelemetry(0.05, 12, 'BH_FDR'),
    dataQuality: computeDataQualityTelemetry('NONE'),
    correlation: computeCorrelationTelemetry(30),
  };
}
