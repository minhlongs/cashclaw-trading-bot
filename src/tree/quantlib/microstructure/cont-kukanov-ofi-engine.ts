import type { ContKukanovOfiParams, ContKukanovOfiResult, LobLevel } from './cont-kukanov-ofi-types';

function computeLevelOfi(prev: LobLevel, curr: LobLevel): number {
  const bidOfi = curr.bidPrice > prev.bidPrice ? curr.bidSize : curr.bidPrice === prev.bidPrice ? curr.bidSize - prev.bidSize : -prev.bidSize;
  const askOfi = curr.askPrice < prev.askPrice ? -curr.askSize : curr.askPrice === prev.askPrice ? curr.askSize - prev.askSize : prev.askSize;
  return bidOfi - askOfi;
}

export function computeContKukanovOfi(p: ContKukanovOfiParams): ContKukanovOfiResult {
  const beta = p.decayBeta ?? 0.5, mult = p.impactMultiplier ?? 1.0;
  const kMax = Math.min(p.prevLevels.length, p.currLevels.length);
  if (kMax === 0) return { levelOfis: [], totalOfi: 0, predictedPriceImpact: 0, depthImbalance: 0 };

  const levelOfis: number[] = [];
  let totalOfi = 0, totalBidDepth = 0, totalAskDepth = 0;

  for (let k = 0; k < kMax; k++) {
    const ofiK = computeLevelOfi(p.prevLevels[k]!, p.currLevels[k]!);
    levelOfis.push(ofiK);
    const weight = Math.pow(k + 1, -beta);
    totalOfi += weight * ofiK;
    totalBidDepth += p.currLevels[k]!.bidSize;
    totalAskDepth += p.currLevels[k]!.askSize;
  }

  const denom = totalBidDepth + totalAskDepth;
  const depthImbalance = denom > 0 ? (totalBidDepth - totalAskDepth) / denom : 0;
  const predictedPriceImpact = totalOfi * mult;

  return { levelOfis, totalOfi, predictedPriceImpact, depthImbalance };
}
