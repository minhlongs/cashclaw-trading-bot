import type { MicrostructureTrade, VpinMetric } from './microstructure-types';

export const DEFAULT_VPIN_TOXICITY_THRESHOLD = 0.55;

export function computeVpin(
  trades: readonly MicrostructureTrade[],
  bucketVolumeSize: number,
  numBuckets = 5,
  toxicityThreshold = DEFAULT_VPIN_TOXICITY_THRESHOLD,
): VpinMetric {
  if (trades.length === 0 || bucketVolumeSize <= 0) {
    return { vpin: 0, sampleBucketsCount: 0, isToxic: false, timestampMs: 0 };
  }

  const buckets: Array<{ buyVol: number; sellVol: number }> = [];
  let currentBuy = 0;
  let currentSell = 0;
  let currentAccumulated = 0;

  for (const trade of trades) {
    let remainingTradeSize = trade.size;
    while (remainingTradeSize > 0) {
      const neededForBucket = bucketVolumeSize - currentAccumulated;
      const fillAmount = Math.min(remainingTradeSize, neededForBucket);

      if (trade.side === 'buy') {
        currentBuy += fillAmount;
      } else {
        currentSell += fillAmount;
      }

      currentAccumulated += fillAmount;
      remainingTradeSize -= fillAmount;

      if (currentAccumulated >= bucketVolumeSize) {
        buckets.push({ buyVol: currentBuy, sellVol: currentSell });
        currentBuy = 0;
        currentSell = 0;
        currentAccumulated = 0;
      }
    }
  }

  const activeBuckets = buckets.slice(-numBuckets);
  if (activeBuckets.length === 0) {
    return {
      vpin: 0,
      sampleBucketsCount: 0,
      isToxic: false,
      timestampMs: trades[trades.length - 1].timestampMs,
    };
  }

  let totalImbalance = 0;
  for (const b of activeBuckets) {
    totalImbalance += Math.abs(b.buyVol - b.sellVol);
  }

  const totalAnalyzedVolume = activeBuckets.length * bucketVolumeSize;
  const vpin = totalAnalyzedVolume > 0 ? totalImbalance / totalAnalyzedVolume : 0;

  return {
    vpin,
    sampleBucketsCount: activeBuckets.length,
    isToxic: vpin >= toxicityThreshold,
    timestampMs: trades[trades.length - 1].timestampMs,
  };
}
