import type { ChordiaSubrahmanyamParams, ChordiaSubrahmanyamResult } from './chordia-subrahmanyam-liquidity-types';

export function computeChordiaCommonality(p: ChordiaSubrahmanyamParams): ChordiaSubrahmanyamResult {
  const aSpreads = p.assetSpreads, n = aSpreads.length;
  if (n < 4) return { liquidityBeta: 0, commonalityRSquared: 0, downMarketBeta: 0, upMarketBeta: 0, averageAssetSpread: 0, sampleSize: 0 };
  const mSpreads: number[] = [];
  for (let i = 0; i < n; i++) {
    mSpreads.push(p.marketSpreads?.[i] ?? (i === 0 ? aSpreads[0]! : (aSpreads[i]! + aSpreads[i - 1]!) / 2));
  }
  const da: number[] = [], dm: number[] = [];
  for (let i = 1; i < n; i++) {
    da.push(aSpreads[i]! - aSpreads[i - 1]!);
    dm.push(mSpreads[i]! - mSpreads[i - 1]!);
  }
  const k = da.length, meanDa = da.reduce((a, b) => a + b, 0) / k, meanDm = dm.reduce((a, b) => a + b, 0) / k;
  let varM = 0, covAM = 0, varA = 0, sumDownDm2 = 0, sumDownCov = 0, sumUpDm2 = 0, sumUpCov = 0;
  for (let i = 0; i < k; i++) {
    const devA = da[i]! - meanDa, devM = dm[i]! - meanDm;
    varM += devM * devM; covAM += devA * devM; varA += devA * devA;
    if (dm[i]! < 0) { sumDownDm2 += dm[i]! * dm[i]!; sumDownCov += da[i]! * dm[i]!; }
    else { sumUpDm2 += dm[i]! * dm[i]!; sumUpCov += da[i]! * dm[i]!; }
  }
  const beta = varM > 1e-12 ? covAM / varM : 0;
  const r2 = varA > 1e-12 && varM > 1e-12 ? Math.min(1.0, Math.max(0, (covAM * covAM) / (varA * varM))) : 0;
  const downBeta = sumDownDm2 > 1e-12 ? sumDownCov / sumDownDm2 : beta;
  const upBeta = sumUpDm2 > 1e-12 ? sumUpCov / sumUpDm2 : beta;
  const avgSpread = aSpreads.reduce((a, b) => a + b, 0) / n;
  return { liquidityBeta: beta, commonalityRSquared: r2, downMarketBeta: downBeta, upMarketBeta: upBeta, averageAssetSpread: avgSpread, sampleSize: k };
}
