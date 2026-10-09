import type { KyleObizhaevaSpreadParams, KyleObizhaevaSpreadResult } from './kyle-obizhaeva-spread-types';

export function computeKyleObizhaevaSpread(p: KyleObizhaevaSpreadParams): KyleObizhaevaSpreadResult {
  const v = Math.max(1, p.dollarVolume), sigma = Math.max(1e-6, p.volatility), price = Math.max(1e-4, p.price);
  const cSpread = p.invariantSpreadCoeff ?? 0.25, cSize = p.invariantSizeCoeff ?? 0.05;
  const gamma = Math.cbrt(sigma / v); // (sigma / V)^(1/3) dimensional scaling
  const spreadFraction = cSpread * gamma;
  const invariantSpread = spreadFraction * price;
  const invariantSpreadBps = spreadFraction * 10_000;
  const tradeSizeDollar = cSize * (1 / gamma) * sigma; // Q_dollar = cSize * (V / sigma)^(1/3) * sigma
  const invariantTradeSize = Math.max(1e-6, tradeSizeDollar / price);
  const invariantTradeCount = Math.max(1, Math.round(v / tradeSizeDollar));

  return {
    invariantSpread,
    invariantSpreadBps,
    invariantTradeSize,
    invariantTradeCount,
    dimensionalGamma: gamma,
  };
}
