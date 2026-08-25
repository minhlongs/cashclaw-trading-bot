// Tree-layer stress cost resolver for alpha research modules.
// mirrors forest/backtest/cost-model to keep tree layering clean.

export type StressMode = 'normal' | 'conservative' | 'adverse' | 'extreme';

export interface StressConfig {
  readonly feePct: number;
  readonly slipPct: number;
  readonly marketImpactPct: number;
}

const STRESS_CONFIGS: Record<StressMode, StressConfig> = {
  // 2026-realistic: Binance/Bybit/OKX retail maker+taker range
  normal: { feePct: 0.0008, slipPct: 0.0003, marketImpactPct: 0.0005 },
  conservative: { feePct: 0.0010, slipPct: 0.0007, marketImpactPct: 0.0010 },
  adverse: { feePct: 0.0010, slipPct: 0.0020, marketImpactPct: 0.0020 },
  // Severe market dislocation: wider spreads, deeper impact, higher fees — 100 bps total
  extreme: { feePct: 0.0015, slipPct: 0.0040, marketImpactPct: 0.0045 },
};

/** Resolve fee/slip/impact tuple for a stress mode. */
export function resolveStressConfig(mode: StressMode): StressConfig {
  return { ...STRESS_CONFIGS[mode] };
}
