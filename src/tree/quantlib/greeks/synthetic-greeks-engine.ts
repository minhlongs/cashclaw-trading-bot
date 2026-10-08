import type { GreeksMetrics, OptionType } from './greeks-types';

export function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

export function normalPdf(x: number): number {
  return (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

export function calculateBlackGreeks(
  spotPrice: number,
  strikePrice: number,
  timeToExpiryYears: number,
  volatility: number,
  riskFreeRate = 0.04,
  optionType: OptionType = 'call',
): GreeksMetrics {
  if (spotPrice <= 0 || strikePrice <= 0 || timeToExpiryYears <= 0 || volatility <= 0) {
    return { delta: optionType === 'call' ? 1.0 : -1.0, gamma: 0, vega: 0, theta: 0, price: 0 };
  }

  const s = spotPrice;
  const k = strikePrice;
  const t = timeToExpiryYears;
  const v = volatility;
  const r = riskFreeRate;

  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(s / k) + (r + 0.5 * v * v) * t) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;

  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const npd1 = normalPdf(d1);
  const expNegRt = Math.exp(-r * t);

  const delta = optionType === 'call' ? nd1 : nd1 - 1.0;
  const gamma = npd1 / (s * v * sqrtT);
  const vega = (s * npd1 * sqrtT) / 100; // 1% vol change

  const thetaCall =
    (-(s * npd1 * v) / (2 * sqrtT) - r * k * expNegRt * nd2) / 365;
  const thetaPut =
    (-(s * npd1 * v) / (2 * sqrtT) + r * k * expNegRt * normalCdf(-d2)) / 365;
  const theta = optionType === 'call' ? thetaCall : thetaPut;

  const priceCall = s * nd1 - k * expNegRt * nd2;
  const pricePut = k * expNegRt * normalCdf(-d2) - s * normalCdf(-d1);
  const price = optionType === 'call' ? priceCall : pricePut;

  return {
    delta: Math.round(delta * 1e4) / 1e4,
    gamma: Math.round(gamma * 1e6) / 1e6,
    vega: Math.round(vega * 1e4) / 1e4,
    theta: Math.round(theta * 1e4) / 1e4,
    price: Math.round(price * 1e4) / 1e4,
  };
}
