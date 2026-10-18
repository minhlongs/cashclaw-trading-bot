import { computeHawkesIntensity, computeOrderBookImbalance } from '@/tree/quantlib/microstructure/hawkes-arrival-kernel';
import { GatheralRoughVolatilityEngine } from '@/tree/quantlib/volatility/gatheral-rough-volatility';
import { runBipowerJumpEstimation } from '@/tree/quantlib/volatility/bipower-jump-estimator';
import { validateCandleSeries } from '@/tree/alpha/data-quality/validator';
import type { Candle } from '@/tree/alpha/data-quality/types';
import { pearsonCorrelation } from '@/tree/alpha/correlation/compute';

export type DataFaultMode = 'NONE' | 'MONOTONICITY' | 'ZERO_VOLUME' | 'IMPOSSIBLE_OHLC';
export type RoughVolMode = 'ROUGH_BURST' | 'SMOOTH_DIFFUSION';

const ARRIVAL_TIMESTAMPS_MS = [1200, 2400, 3100, 3800, 4200, 4550, 4780, 4910, 4960, 4990] as const;

export function computeHawkesLobTelemetry(excitationAlpha = 0.65, decayBeta = 1.2) {
  const hawkes = computeHawkesIntensity(ARRIVAL_TIMESTAMPS_MS, 5000, {
    baselineMu: 1.15,
    excitationAlpha,
    decayBeta,
  });
  const lob = computeOrderBookImbalance([145, 110, 85, 64, 42], [68, 72, 60, 55, 48]);
  return { ...hawkes, ...lob };
}

const ROUGH_LOG_VOLS = [
  -3.42, -3.18, -3.55, -3.12, -3.61, -3.08, -3.49, -3.15, -3.58, -3.09,
  -3.51, -3.14, -3.62, -3.11, -3.47, -3.19, -3.56, -3.12, -3.53, -3.16,
  -3.59, -3.11, -3.48, -3.17,
] as const;

const SMOOTH_LOG_VOLS = Array.from({ length: 24 }, (_, i) => -3.5 + i * 0.025);

export function computeRoughVolatilityTelemetry(mode: RoughVolMode = 'ROUGH_BURST') {
  const engine = new GatheralRoughVolatilityEngine({ minObservations: 20, maxLag: 5, roughThreshold: 0.45 });
  const hurst = engine.estimateHurst(mode === 'ROUGH_BURST' ? ROUGH_LOG_VOLS : SMOOTH_LOG_VOLS);
  const returns =
    mode === 'ROUGH_BURST'
      ? [0.004, -0.003, 0.005, -0.002, 0.038, -0.004, 0.003, -0.002, 0.004, -0.003]
      : [0.004, 0.003, 0.005, 0.004, 0.003, 0.004, 0.005, 0.003, 0.004, 0.003];
  const jump = runBipowerJumpEstimation(returns, 0.05);

  return {
    mode,
    hurstExponent: hurst.hurstExponent,
    isRoughRegime: hurst.isRoughRegime,
    fitQuality: hurst.fitQuality,
    realizedVariance: jump.realizedVariance,
    bipowerVariation: jump.bipowerVariation,
    jumpZScore: jump.zScore,
    hasSignificantJump: jump.hasSignificantJump,
  };
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

import { ASSET_RETURN_VECTORS } from './quant-telemetry-seeds';

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
