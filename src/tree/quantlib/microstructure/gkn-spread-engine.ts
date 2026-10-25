export function computeGKNSpreadDecomposition(bars: readonly GKNPriceBar[], spreadOverride?: number): GKNSpreadDecompositionResult {
  if (bars.length < 4) {
    return { spread: 0, orderProcessingShare: 0.5, adverseSelectionShare: 0.5, serialCovariance: 0, priceReturnVariance: 0 };
  }
  const r: number[] = [], rm: number[] = [], u: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1], curr = bars[i];
    const retP = Math.log(Math.max(1e-6, curr.price) / Math.max(1e-6, prev.price));
    const retM = Math.log(Math.max(1e-6, curr.midpoint) / Math.max(1e-6, prev.midpoint));
    r.push(retP);
    rm.push(retM);
    u.push(retP - retM);
  }
  const meanU = u.reduce((a, b) => a + b, 0) / u.length;
  const meanR = r.reduce((a, b) => a + b, 0) / r.length;
  let covU = 0, covR = 0, varR = 0;
  for (let i = 1; i < u.length; i++) {
    covU += (u[i] - meanU) * (u[i - 1] - meanU);
    covR += (r[i] - meanR) * (r[i - 1] - meanR);
  }
  for (const val of r) varR += (val - meanR) ** 2;
  covU /= u.length - 1;
  covR /= r.length - 1;
  varR /= r.length;

  const rawSpread = spreadOverride ?? 2 * Math.sqrt(Math.max(1e-8, -covR));
  const sHalf = rawSpread / 2;
  const sHalfSq = Math.max(1e-8, sHalf * sHalf);
  const alphaRaw = Math.max(0, -covU) / sHalfSq;
  const alpha = Math.max(0, Math.min(1.0, alphaRaw));
  const gamma = 1.0 - alpha;

  return { spread: rawSpread, orderProcessingShare: alpha, adverseSelectionShare: gamma, serialCovariance: covU, priceReturnVariance: varR };
}

export interface GKNPriceBar {
  readonly price: number;
  readonly midpoint: number;
}

export interface GKNSpreadDecompositionResult {
  readonly spread: number;
  readonly orderProcessingShare: number;
  readonly adverseSelectionShare: number;
  readonly serialCovariance: number;
  readonly priceReturnVariance: number;
}
