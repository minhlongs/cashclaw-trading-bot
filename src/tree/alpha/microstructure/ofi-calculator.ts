import type { L2TopSnapshot, OfiResult } from './microstructure-types';

export function calculateSingleStepOfi(
  prev: L2TopSnapshot,
  curr: L2TopSnapshot,
): OfiResult {
  let deltaBid = 0;
  if (curr.bidPrice > prev.bidPrice) {
    deltaBid = curr.bidSize;
  } else if (curr.bidPrice === prev.bidPrice) {
    deltaBid = curr.bidSize - prev.bidSize;
  } else {
    deltaBid = -prev.bidSize;
  }

  let deltaAsk = 0;
  if (curr.askPrice < prev.askPrice) {
    deltaAsk = curr.askSize;
  } else if (curr.askPrice === prev.askPrice) {
    deltaAsk = curr.askSize - prev.askSize;
  } else {
    deltaAsk = -prev.askSize;
  }

  const rawOfi = deltaBid - deltaAsk;
  const totalDepth = Math.max(1, curr.bidSize + curr.askSize);
  const normalizedOfi = Math.max(-1, Math.min(1, rawOfi / totalDepth));

  return {
    ofi: rawOfi,
    normalizedOfi,
    timestampMs: curr.timestampMs,
  };
}
