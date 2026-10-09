export interface AdaptiveSliceConfig {
  readonly totalQuantity: number;
  readonly sliceCount: number;
  readonly volumeWeights?: readonly number[];
  readonly minSliceRatio?: number;
}

export interface AdaptiveVolumeSlice {
  readonly sliceIndex: number;
  readonly targetQuantity: number;
  readonly weightPct: number;
  readonly isAggressive: boolean;
}

export function calculateAdaptiveVolumeSlices(
  config: AdaptiveSliceConfig
): readonly AdaptiveVolumeSlice[] {
  const { totalQuantity, sliceCount, minSliceRatio = 0.05 } = config;

  if (totalQuantity <= 0 || !Number.isFinite(totalQuantity) || sliceCount <= 0) {
    return [];
  }

  const rawWeights: number[] = [];
  if (config.volumeWeights && config.volumeWeights.length === sliceCount) {
    for (const w of config.volumeWeights) {
      rawWeights.push(Math.max(w, minSliceRatio));
    }
  } else {
    for (let i = 0; i < sliceCount; i++) {
      const normalizedTime = (i / Math.max(1, sliceCount - 1)) * 2 - 1;
      const uWeight = 1.0 + 0.8 * (normalizedTime * normalizedTime);
      rawWeights.push(uWeight);
    }
  }

  const sumWeights = rawWeights.reduce((acc, v) => acc + v, 0);
  if (sumWeights <= 0) return [];

  const slices: AdaptiveVolumeSlice[] = [];
  let allocated = 0;

  for (let i = 0; i < sliceCount; i++) {
    const rawW = rawWeights[i]!;
    const weightPct = rawW / sumWeights;

    let sliceQty: number;
    if (i === sliceCount - 1) {
      sliceQty = Math.max(0, totalQuantity - allocated);
    } else {
      sliceQty = totalQuantity * weightPct;
      allocated += sliceQty;
    }

    slices.push({
      sliceIndex: i,
      targetQuantity: Number(sliceQty.toFixed(6)),
      weightPct: Number((weightPct * 100).toFixed(2)),
      isAggressive: weightPct > 1 / sliceCount,
    });
  }

  return slices;
}
