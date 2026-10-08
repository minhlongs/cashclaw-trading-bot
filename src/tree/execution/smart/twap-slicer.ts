// Pure TWAP Order Slicing Engine with Anti-HFT Jitter
import type { TwapSlicingConfig, SlicedOrderChunk } from './smart-execution-types';

export function calculateTwapSlices(
  config: TwapSlicingConfig,
  pseudoRandomSequence: readonly number[] = [],
): readonly SlicedOrderChunk[] {
  if (config.totalQuantity <= 0 || config.sliceCount <= 0 || config.durationMinutes <= 0) {
    return [];
  }

  const baseChunkQty = config.totalQuantity / config.sliceCount;
  const baseIntervalMs = (config.durationMinutes * 60 * 1000) / config.sliceCount;
  const jitterRatio = Math.max(0, Math.min(0.5, config.jitterRatio ?? 0.15));

  const chunks: SlicedOrderChunk[] = [];
  for (let i = 0; i < config.sliceCount; i++) {
    const rawRnd = pseudoRandomSequence[i] ?? 0.5;
    const boundedRnd = Math.max(0, Math.min(1, rawRnd));
    // Jitter factor in range [1 - jitterRatio, 1 + jitterRatio]
    const jitterFactor = 1 - jitterRatio + boundedRnd * 2 * jitterRatio;
    const scheduledDelayMs = Math.round(i * baseIntervalMs * jitterFactor);

    chunks.push({
      chunkIndex: i,
      totalChunks: config.sliceCount,
      targetQuantity: Number(baseChunkQty.toFixed(8)),
      scheduledDelayMs,
      executionUrgency: 'AGGRESSIVE_TAKER',
    });
  }

  return chunks;
}
