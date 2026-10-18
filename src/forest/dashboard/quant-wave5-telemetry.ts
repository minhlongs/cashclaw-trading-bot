import { computeDupireMartingaleSurface } from '@/tree/quantlib/volatility/dupire-martingale-transport';
import { computeRoughPathLevySignature } from '@/tree/quantlib/signatures/rough-path-levy-area';

export type MotSmilePreset = 'ARBITRAGE_FREE_SVI' | 'STEEP_PUT_SKEW' | 'BUTTERFLY_VIOLATION';
export type SignatureRegimePreset = 'BTC_LEADS_SOL' | 'SOL_LEADS_BTC' | 'SYNCHRONOUS_NOISE';

const MOT_STRIKE_GRID = [-0.30, -0.20, -0.10, 0.0, 0.10, 0.20, 0.30] as const;

const MOT_CONFIGS: Record<
  MotSmilePreset,
  { sviA: number; sviB: number; sviRho: number; sviM: number; sviSigma: number }
> = {
  ARBITRAGE_FREE_SVI: { sviA: 0.042, sviB: 0.11, sviRho: -0.32, sviM: 0.0, sviSigma: 0.18 },
  STEEP_PUT_SKEW: { sviA: 0.048, sviB: 0.16, sviRho: -0.68, sviM: -0.04, sviSigma: 0.15 },
  BUTTERFLY_VIOLATION: { sviA: 0.005, sviB: 2.75, sviRho: 0.0, sviM: 0.0, sviSigma: 0.02 },
};

export function computeMartingaleOptimalTransportTelemetry(preset: MotSmilePreset = 'ARBITRAGE_FREE_SVI') {
  const cfg = MOT_CONFIGS[preset];
  const surface = computeDupireMartingaleSurface({
    logMoneynessGrid: MOT_STRIKE_GRID,
    maturityYears: 0.25,
    ...cfg,
  });
  return {
    preset,
    ...cfg,
    ...surface,
  };
}

const SIGNATURE_PATHS: Record<
  SignatureRegimePreset,
  { pairLabel: string; path1: readonly number[]; path2: readonly number[] }
> = {
  BTC_LEADS_SOL: {
    pairLabel: 'BTC-PERP → SOL-PERP',
    path1: [0.0, 0.035, 0.082, 0.115, 0.074, 0.028, 0.012],
    path2: [0.0, 0.002, 0.033, 0.080, 0.112, 0.071, 0.025],
  },
  SOL_LEADS_BTC: {
    pairLabel: 'SOL-PERP → BTC-PERP',
    path1: [0.0, 0.002, 0.033, 0.080, 0.112, 0.071, 0.025],
    path2: [0.0, 0.035, 0.082, 0.115, 0.074, 0.028, 0.012],
  },
  SYNCHRONOUS_NOISE: {
    pairLabel: 'BTC-PERP ↔ ETH-PERP (Lock)',
    path1: [0.0, 0.018, 0.042, 0.065, 0.051, 0.039, 0.044],
    path2: [0.0, 0.018, 0.042, 0.065, 0.051, 0.039, 0.044],
  },
};

export function computeRoughPathSignaturesTelemetry(preset: SignatureRegimePreset = 'BTC_LEADS_SOL') {
  const seed = SIGNATURE_PATHS[preset];
  const sig = computeRoughPathLevySignature({
    path1: seed.path1,
    path2: seed.path2,
  });
  return {
    preset,
    pairLabel: seed.pairLabel,
    ...sig,
  };
}
