import type { GlostenQuote, GlostenSpreadParams, GlostenSpreadResult } from './glosten-spread-types';

export function computeGlostenSpread(p: GlostenSpreadParams): GlostenSpreadResult {
  const m0 = Math.max(1e-4, p.midPrice), s0 = Math.max(1e-4, p.baseSpread ?? 0.02);
  const lambdaInfo = Math.max(0, p.infoIntensity ?? 0.005), beta = Math.max(0.1, p.depthCurvature ?? 0.8);
  const inv = p.specialistInventory ?? 0, zetaInv = Math.max(0, p.inventoryPenalty ?? 0.001);
  const sizes = p.orderSizes.length > 0 ? p.orderSizes : [1];
  const quotes: GlostenQuote[] = [];
  let spreadSum = 0;
  for (const q of sizes) {
    const size = Math.max(0, q);
    const advSel = 2 * lambdaInfo * Math.pow(size, beta);
    const invCost = zetaInv * inv;
    const marginalSpread = Math.max(1e-4, s0 + advSel + invCost);
    const halfSpread = marginalSpread / 2;
    const bidPrice = Math.max(1e-4, m0 - halfSpread), askPrice = m0 + halfSpread;
    spreadSum += marginalSpread;
    quotes.push({ orderSize: size, bidPrice, askPrice, marginalSpread, adverseSelectionCost: advSel, inventoryCost: invCost });
  }
  const avgSpread = quotes.length > 0 ? spreadSum / quotes.length : s0;
  const depthScore = Math.max(0, 1 / (1 + lambdaInfo * 100));
  return { quotes, averageEffectiveSpread: avgSpread, quoteDepthScore: depthScore };
}
