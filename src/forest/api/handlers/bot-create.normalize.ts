export type CoerceArgs = {
  config: Record<string, number> | undefined;
  key: string;
  defaultValue: number;
  min: number;
  max: number;
};

export function normalizeWizardConfig(raw?: Record<string, number>): Record<string, number> {
  const aliases: Record<string, string> = {
    spacing_pct: 'gridSpacingPct',
    spacingPct: 'gridSpacingPct',
    grid_levels: 'gridLevels',
    gridLevels: 'gridLevels',
    capital_per_level_pct: 'capitalPerLevelPct',
    capitalPerLevelPct: 'capitalPerLevelPct',
    take_profit_pct: 'takeProfitPct',
    takeProfitPct: 'takeProfitPct',
    stop_loss_pct: 'stopLossPct',
    stopLossPct: 'stopLossPct',
    max_drawdown_pct: 'maxDrawdownPct',
    maxDrawdownPct: 'maxDrawdownPct',
    bb_period: 'bbPeriod',
    bbPeriod: 'bbPeriod',
    bb_std: 'bbStdDev',
    bbStdDev: 'bbStdDev',
    rsi_period: 'rsiPeriod',
    rsiPeriod: 'rsiPeriod',
    rsi_buy: 'rsiBuyThreshold',
    rsiBuyThreshold: 'rsiBuyThreshold',
    rsi_sell: 'rsiSellThreshold',
    rsiSellThreshold: 'rsiSellThreshold',
    volume_multiplier: 'volumeMultiplier',
    volumeMultiplier: 'volumeMultiplier',
    position_size_pct: 'positionSizePct',
    positionSizePct: 'positionSizePct',
    cooldown_minutes: 'cooldownMinutes',
    cooldownMinutes: 'cooldownMinutes',
    lookback_period: 'lookbackPeriod',
    lookbackPeriod: 'lookbackPeriod',
    zscore_threshold: 'zScoreThreshold',
    zScoreThreshold: 'zScoreThreshold',
    price_drop_step: 'priceDropStep',
    priceDropStep: 'priceDropStep',
    max_steps: 'maxSteps',
    maxSteps: 'maxSteps',
    base_order_size_pct: 'baseOrderSizePct',
    baseOrderSizePct: 'baseOrderSizePct',
    volatility_window: 'volatilityWindow',
    volatilityWindow: 'volatilityWindow',
    vol_baseline: 'volBaseline',
    volBaseline: 'volBaseline',
    rebound_target: 'reboundTarget',
    reboundTarget: 'reboundTarget',
  };
  const out: Record<string, number> = {};
  for (const src in raw ?? {}) {
    const normalized = src.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const name = aliases[normalized] ?? aliases[src] ?? src;
    out[name] = (raw as Record<string, number>)[src];
  }
  return out;
}

export function coerceNum({ config, key, defaultValue, min, max }: CoerceArgs): number {
  const raw = config?.[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return defaultValue;
  }
  return Math.min(max, Math.max(min, raw));
}
