export function computeHasbrouckFosterSpread(p: HasbrouckFosterSpreadParams): HasbrouckFosterSpreadResult {
  const pList = p.transactionPrices, n = pList.length;
  if (n < 3) return { effectiveSpread: 0, buyImpact: 0, sellImpact: 0, asymmetryIndex: 0, orderProcessingRatio: 0, sampleSize: 0 };
  const mList: number[] = [];
  for (let i = 0; i < n; i++) {
    mList.push(p.quoteMidpoints?.[i] ?? (i === 0 ? pList[0]! : (pList[i]! + pList[i - 1]!) / 2));
  }
  let sumQp2 = 0, sumQm2 = 0, sumQpDm = 0, sumQmDm = 0, sumZ2 = 0, sumZDm = 0, sumAbsZ = 0, count = 0;
  for (let t = 0; t < n - 1; t++) {
    const pt = pList[t]!, mt = mList[t]!, mNext = mList[t + 1]!, deltaM = mNext - mt, zt = pt - mt;
    const vol = p.signedTradeVolumes?.[t] ?? (zt >= 0 ? 1 : -1);
    const qPlus = Math.max(0, vol), qMinus = Math.max(0, -vol);
    sumQp2 += qPlus * qPlus; sumQm2 += qMinus * qMinus; sumQpDm += qPlus * deltaM; sumQmDm += qMinus * (-deltaM);
    sumZ2 += zt * zt; sumZDm += zt * deltaM; sumAbsZ += Math.abs(zt); count++;
  }
  const lambdaBuy = sumQp2 > 1e-12 ? Math.max(0, sumQpDm / sumQp2) : 0;
  const lambdaSell = sumQm2 > 1e-12 ? Math.max(0, sumQmDm / sumQm2) : 0;
  const asym = Math.abs(lambdaBuy - lambdaSell) / (lambdaBuy + lambdaSell + 1e-6);
  const phi = sumZ2 > 1e-12 ? Math.max(0, Math.min(1.0, sumZDm / sumZ2)) : 0.5;
  const effSpread = count > 0 ? 2 * (sumAbsZ / count) : 0;
  return { effectiveSpread: effSpread, buyImpact: lambdaBuy, sellImpact: lambdaSell, asymmetryIndex: Math.min(1.0, asym), orderProcessingRatio: 1.0 - phi, sampleSize: count };
}

export interface HasbrouckFosterSpreadParams {
  readonly transactionPrices: readonly number[];
  readonly quoteMidpoints?: readonly number[];
  readonly signedTradeVolumes?: readonly number[];
}

export interface HasbrouckFosterSpreadResult {
  readonly effectiveSpread: number;
  readonly buyImpact: number;
  readonly sellImpact: number;
  readonly asymmetryIndex: number;
  readonly orderProcessingRatio: number;
  readonly sampleSize: number;
}
