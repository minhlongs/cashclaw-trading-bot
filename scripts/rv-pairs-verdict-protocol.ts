// Pre-registered protocol for the real-data pairs walk-forward verdict.
// Shared by the verdict script entry; pure definitions only (no I/O).
//
// Funding carry: N/A — Binance derivative endpoints return HTTP 403 from
// this environment (FUNDING_NOTE convention); spot klines only here.

import type {
  PairSelectionConfig,
  PairSimConfig,
} from '@/tree/alpha/relative-value';

export const UNIVERSE = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT',
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'LINKUSDT',
] as const;
export const TIMEFRAME = '1d';
export const LIMIT = 1000;
/** ≥2 windows (train 250 + validate 50 + test 100, step 100) + margin. */
export const MIN_BARS = 600;
export const REPORT_DIR = 'plans/reports';
export const WINDOW_CONFIG = {
  trainBars: 250, validateBars: 50, testBars: 100, stepBars: 100,
} as const;
export const SELECTION_BASE: PairSelectionConfig = {
  validationWindow: 80, minObs: 10, maxHalfLife: 50,
  minCorrelation: 0.5, hedgeWindow: 80, topK: 5,
};
const STABILITY = {
  validationWindow: 80, minObs: 10, maxHalfLife: 50,
  minCorrelation: 0.5, subWindows: 3, hedgeWindow: 80,
} as const;

/** Arm-level sim knobs (the only fields that differ across M1–M4). */
interface SimOverrides {
  readonly hedgeMode?: 'rolling' | 'frozen';
  readonly inSimTradabilityGate?: boolean;
  readonly entryFilter?: (timestamp: number) => boolean;
}

function simConfig(overrides: SimOverrides): PairSimConfig {
  return {
    // zWindow=20: population-std z-score caps |z| at sqrt(zWindow-1); a
    // 5-bar window tops out just under 2.0 so entryZ=2.0 could never fire.
    zWindow: 20, minObs: 10, entryZ: 2.0, exitZ: 0.5, stopZ: 3.5,
    hedgeWindow: 60, maxHalfLife: 50, minCorrelation: 0,
    validationWindow: 60, revalidateEvery: 20,
    stressMode: 'conservative', minObservations: 30,
    hedgeMode: overrides.hedgeMode,
    inSimTradabilityGate: overrides.inSimTradabilityGate,
    entryFilter: overrides.entryFilter,
  };
}

/** M4 regime entry filter: risk-on while BTC close(t−1) ≥ SMA50 of strictly
 * prior bars (causal trend proxy); pre-warmup timestamps pass through. */
function buildTrendFilter(
  timestamps: readonly number[],
  btcCloses: readonly number[],
): (ts: number) => boolean {
  const period = 50;
  const indexOf = new Map(timestamps.map((t, i) => [t, i]));
  return (ts: number): boolean => {
    const i = indexOf.get(ts);
    if (i === undefined || i < period) return true;
    let sum = 0;
    for (let k = i - period; k < i; k++) sum += btcCloses[k]!;
    return btcCloses[i - 1]! >= sum / period;
  };
}

export interface ArmDef {
  readonly id: string;
  readonly selection: PairSelectionConfig;
  readonly sim: PairSimConfig;
}

/** Arm definitions per plan §Step-2 table; M4 adds the causal trend filter. */
export function buildArms(
  btcCloses: readonly number[],
  timestamps: readonly number[],
): readonly ArmDef[] {
  return [
    { id: 'M1', selection: { ...SELECTION_BASE, distanceMode: true },
      sim: simConfig({ hedgeMode: 'frozen', inSimTradabilityGate: false }) },
    { id: 'M2', selection: SELECTION_BASE,
      sim: simConfig({ hedgeMode: 'frozen', inSimTradabilityGate: true }) },
    { id: 'M3', selection: SELECTION_BASE,
      sim: simConfig({ inSimTradabilityGate: true }) },
    { id: 'M4', selection: { ...SELECTION_BASE, stability: STABILITY },
      sim: simConfig({
        inSimTradabilityGate: true,
        entryFilter: buildTrendFilter(timestamps, btcCloses),
      }) },
  ];
}

export const ADAPTER = {
  experimentId: 'rv-m4-oos-verdict',
  symbol: 'PAIRS/M4-primary',
  timeframe: TIMEFRAME,
  periodsPerYear: 365,
  stressMode: 'conservative' as const,
} as const;
