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

export interface LobLevel {
  readonly bidPrice: number;
  readonly bidSize: number;
  readonly askPrice: number;
  readonly askSize: number;
}

export interface ContKukanovOfiParams {
  readonly prevLevels: readonly LobLevel[];
  readonly currLevels: readonly LobLevel[];
  readonly decayBeta?: number; // Level power decay parameter beta (default 0.5)
  readonly impactMultiplier?: number; // Basis point impact per unit OFI (default 1.0)
}

export interface ContKukanovOfiResult {
  readonly levelOfis: readonly number[];
  readonly totalOfi: number;
  readonly predictedPriceImpact: number;
  readonly depthImbalance: number;
}
