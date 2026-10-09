import type { LsbSpreadParams, LsbSpreadResult } from './lsb-spread-types';

export function computeLsbSpread(p: LsbSpreadParams): LsbSpreadResult {
  const pList = p.transactionPrices, n = pList.length;
  if (n < 3) return { effectiveSpread: 0, adverseSelectionRatio: 0, orderProcessingRatio: 0, adverseSelectionSpread: 0, orderProcessingSpread: 0, sampleSize: 0 };
  const qMid: number[] = [];
  for (let i = 0; i < n; i++) {
    qMid.push(p.quoteMidpoints?.[i] ?? (i === 0 ? pList[0]! : (pList[i]! + pList[i - 1]!) / 2));
  }
  let sumZ2 = 0, sumZDeltaQ = 0, sumAbsZ = 0, count = 0;
  for (let t = 0; t < n - 1; t++) {
    const pt = pList[t]!, qt = qMid[t]!, qNext = qMid[t + 1]!;
    const zt = pt - qt, deltaQ = qNext - qt;
    sumZ2 += zt * zt;
    sumZDeltaQ += zt * deltaQ;
    sumAbsZ += Math.abs(zt);
    count++;
  }
  const lambda = sumZ2 > 1e-12 ? Math.max(0, Math.min(1.0, sumZDeltaQ / sumZ2)) : 0.5;
  const avgSpread = count > 0 ? 2 * (sumAbsZ / count) : 0;
  const orderProc = Math.max(0, 1.0 - lambda);
  return {
    effectiveSpread: avgSpread,
    adverseSelectionRatio: lambda,
    orderProcessingRatio: orderProc,
    adverseSelectionSpread: lambda * avgSpread,
    orderProcessingSpread: orderProc * avgSpread,
    sampleSize: count,
  };
}
