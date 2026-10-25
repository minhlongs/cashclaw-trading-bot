export function computeEasleyVpin(p: EasleyVpinParams): EasleyVpinResult {
  const { trades, bucketVolume: V } = p, N = p.numBuckets ?? 20, sigma = p.priceStdDev ?? 1.0;
  if (V <= 0 || trades.length === 0) {
    return { vpin: 0, toxicityLevel: 'low', totalBuckets: 0, averageImbalance: 0, buckets: [] };
  }
  const buckets: VolumeBucket[] = [];
  let curBuy = 0, curSell = 0, curVol = 0;
  for (const t of trades) {
    const s = Math.abs(t.size);
    if (s <= 0) continue;
    const z = sigma > 1e-6 ? t.priceChange / sigma : (t.priceChange >= 0 ? 3 : -3);
    const pBuy = 1 / (1 + Math.exp(-1.702 * z));
    curBuy += s * pBuy; curSell += s * (1 - pBuy); curVol += s;
    while (curVol >= V) {
      const frac = V / curVol;
      const bBuy = curBuy * frac, bSell = curSell * frac;
      buckets.push({ index: buckets.length + 1, buyVolume: bBuy, sellVolume: bSell, absImbalance: Math.abs(bBuy - bSell) });
      curBuy *= (1 - frac); curSell *= (1 - frac); curVol -= V;
    }
  }
  const windowBuckets = buckets.slice(-N);
  const totalImbalance = windowBuckets.reduce((sum, b) => sum + b.absImbalance, 0);
  const vpin = windowBuckets.length > 0 ? totalImbalance / (windowBuckets.length * V) : 0;
  const level: ToxicityLevel = vpin < 0.2 ? 'low' : vpin < 0.4 ? 'moderate' : vpin < 0.7 ? 'high' : 'extreme';
  const avgImb = windowBuckets.length > 0 ? totalImbalance / windowBuckets.length : 0;
  return { vpin, toxicityLevel: level, totalBuckets: buckets.length, averageImbalance: avgImb, buckets };
}

export type ToxicityLevel = 'low' | 'moderate' | 'high' | 'extreme';

export interface VpinTrade {
  size: number;
  priceChange: number;
}

export interface VolumeBucket {
  index: number;
  buyVolume: number;
  sellVolume: number;
  absImbalance: number;
}

export interface EasleyVpinParams {
  trades: VpinTrade[];
  bucketVolume: number;
  numBuckets?: number;
  priceStdDev?: number;
}

export interface EasleyVpinResult {
  vpin: number;
  toxicityLevel: ToxicityLevel;
  totalBuckets: number;
  averageImbalance: number;
  buckets: VolumeBucket[];
}
