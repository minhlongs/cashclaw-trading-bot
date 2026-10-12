import type { KyleObizhaevaConfig, KyleObizhaevaImpactResult, KyleObizhaevaInvarianceConfig, KyleObizhaevaInvarianceResult } from './kyle-obizhaeva-invariance-types';

export class KyleObizhaevaImpactCalculator {
  public static computeImpact(
    cfg: KyleObizhaevaConfig, size: number, velocity: number, invBet: number
  ): KyleObizhaevaImpactResult {
    const s = Math.max(0, size);
    const norm = invBet > 0 ? s / invBet : 0;
    const lam = (cfg.impactScaleConstant ?? 1.0) * Math.cbrt(Math.max(1e-6, cfg.dailyVolatility) / Math.max(1, cfg.dailyVolumeUsd));
    const frac = lam * Math.pow(norm, cfg.impactPower ?? 0.5);
    return {
      orderSizeUsd: s, tradingVelocity: Number(velocity.toFixed(2)),
      invariantBetSize: Number(invBet.toFixed(4)), normalizedTradeSize: Number(norm.toFixed(6)),
      priceImpactBps: Number((frac * 10_000).toFixed(4)), isCapacityConstrained: norm > 1.0,
    };
  }

  public static calculateInvariants(c: KyleObizhaevaInvarianceConfig): KyleObizhaevaInvarianceResult {
    const { price: P, averageDailyVolume: adv, annualizedVolatility: sig, scalingConstant: k = 10000 } = c;
    if (P <= 0 || adv <= 0 || sig <= 0 || k <= 0) throw new Error('Parameters must be positive');
    const dVol = P * adv, act = (dVol * sig) / k;
    const bets = Math.pow(act, 2 / 3), invSize = Math.pow(Math.max(1e-12, dVol / (sig * k)), 1 / 3);
    return { dollarVolume: dVol, tradingVelocity: dVol / (invSize * P), invariantOrderSize: invSize, invariantPriceImpact: sig / Math.pow(act, 1 / 3), expectedDailyBets: bets };
  }
}
