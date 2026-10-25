export function computeBarclayWarnerStealth(p: BarclayWarnerParams): BarclayWarnerResult {
  const trades = p.trades, n = trades.length;
  if (n === 0) {
    const empty: StealthBucketMetrics = { tradeCount: 0, totalVolume: 0, cpcFraction: 0, volumeFraction: 0, stealthRatio: 0 };
    return { smallBucket: empty, mediumBucket: empty, largeBucket: empty, dominantStealthBucket: 'medium', totalTrades: 0, netCumulativePriceChange: 0 };
  }
  const sizes = trades.map(t => Math.abs(t.size)).sort((a, b) => a - b);
  const median = sizes[Math.floor(n / 2)] ?? 100;
  const sCut = p.smallCutoff ?? median * 0.33, lCut = p.largeCutoff ?? median * 2.5;

  const buckets = { small: { count: 0, vol: 0, cpc: 0 }, medium: { count: 0, vol: 0, cpc: 0 }, large: { count: 0, vol: 0, cpc: 0 } };
  let totalVol = 0, totalAbsCpc = 0, netCpc = 0;
  for (const t of trades) {
    const s = Math.abs(t.size), dp = t.priceChange;
    totalVol += s; totalAbsCpc += Math.abs(dp); netCpc += dp;
    const b = s < sCut ? buckets.small : s <= lCut ? buckets.medium : buckets.large;
    b.count++; b.vol += s; b.cpc += dp;
  }
  const toMetrics = (b: { count: number; vol: number; cpc: number }): StealthBucketMetrics => {
    const cpcFrac = totalAbsCpc > 1e-12 ? b.cpc / totalAbsCpc : 0;
    const volFrac = totalVol > 1e-12 ? b.vol / totalVol : 0;
    const stealthRatio = volFrac > 1e-12 ? Math.abs(cpcFrac) / volFrac : 0;
    return { tradeCount: b.count, totalVolume: b.vol, cpcFraction: cpcFrac, volumeFraction: volFrac, stealthRatio };
  };
  const sm = toMetrics(buckets.small), mm = toMetrics(buckets.medium), lm = toMetrics(buckets.large);
  const dominant = mm.stealthRatio >= sm.stealthRatio && mm.stealthRatio >= lm.stealthRatio ? 'medium' : sm.stealthRatio >= lm.stealthRatio ? 'small' : 'large';
  return { smallBucket: sm, mediumBucket: mm, largeBucket: lm, dominantStealthBucket: dominant, totalTrades: n, netCumulativePriceChange: netCpc };
}

export interface StealthTrade {
  readonly size: number;
  readonly priceChange: number;
}

export interface StealthBucketMetrics {
  readonly tradeCount: number;
  readonly totalVolume: number;
  readonly cpcFraction: number;
  readonly volumeFraction: number;
  readonly stealthRatio: number;
}

export interface BarclayWarnerParams {
  readonly trades: readonly StealthTrade[];
  readonly smallCutoff?: number;
  readonly largeCutoff?: number;
}

export interface BarclayWarnerResult {
  readonly smallBucket: StealthBucketMetrics;
  readonly mediumBucket: StealthBucketMetrics;
  readonly largeBucket: StealthBucketMetrics;
  readonly dominantStealthBucket: 'small' | 'medium' | 'large';
  readonly totalTrades: number;
  readonly netCumulativePriceChange: number;
}
