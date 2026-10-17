import type { PastorStambaughBar, PastorStambaughResult } from './pastor-stambaugh-types';

export function runPastorStambaugh(bars: readonly PastorStambaughBar[]): PastorStambaughResult {
  const m = bars.length - 1;
  let sumX = 0, sumY = 0, sumR = 0;
  const xs: number[] = [], ys: number[] = [], rs: number[] = [];
  for (let i = 0; i < m; i++) {
    const b0 = bars[i]!, b1 = bars[i + 1]!;
    if (b0.dollarVolume < 0 || b1.dollarVolume < 0) throw new Error('Dollar volume must be non-negative');
    const re0 = b0.assetReturn - b0.marketReturn;
    const re1 = b1.assetReturn - b1.marketReturn;
    const signedVol = Math.sign(re0) * (b0.dollarVolume / 1_000_000);
    xs.push(signedVol); ys.push(re1); rs.push(b0.assetReturn);
    sumX += signedVol; sumY += re1; sumR += b0.assetReturn;
  }
  const meanX = sumX / m, meanY = sumY / m, meanR = sumR / m;
  let covXY = 0, varX = 0, covRY = 0, varR = 0;
  for (let i = 0; i < m; i++) {
    const dx = xs[i]! - meanX, dy = ys[i]! - meanY, dr = rs[i]! - meanR;
    covXY += dx * dy; varX += dx * dx; covRY += dr * dy; varR += dr * dr;
  }
  const gamma = varX > 1e-12 ? covXY / varX : 0;
  const phi = varR > 1e-12 ? covRY / varR : 0;
  return {
    gammaLiquidity: Number(gamma.toFixed(6)),
    phiAutocorrelation: Number(phi.toFixed(6)),
    reversalStrength: Number(Math.max(0, -gamma).toFixed(6)),
    transitionCount: m,
  };
}
