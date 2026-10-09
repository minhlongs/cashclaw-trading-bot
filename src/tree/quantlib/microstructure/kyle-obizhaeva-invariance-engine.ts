import type {
  KyleObizhaevaConfig,
  KyleObizhaevaImpactResult,
} from './kyle-obizhaeva-invariance-types';

export class KyleObizhaevaInvarianceEngine {
  private readonly dailyVolumeUsd: number;
  private readonly dailyVolatility: number;
  private readonly betScaleConstant: number;
  private readonly impactScaleConstant: number;
  private readonly impactPower: number;

  constructor(config: KyleObizhaevaConfig) {
    this.dailyVolumeUsd = Math.max(1, config.dailyVolumeUsd);
    this.dailyVolatility = Math.max(1e-6, config.dailyVolatility);
    this.betScaleConstant = config.betScaleConstant ?? 5.0;
    this.impactScaleConstant = config.impactScaleConstant ?? 1.0;
    this.impactPower = config.impactPower ?? 0.5;
  }

  getTradingVelocity(): number {
    return this.dailyVolumeUsd * this.dailyVolatility;
  }

  getInvariantBetSize(): number {
    const volSq = this.dailyVolatility * this.dailyVolatility;
    const ratio = this.dailyVolumeUsd / volSq;
    return this.betScaleConstant * Math.cbrt(ratio);
  }

  computeImpact(orderSizeUsd: number): KyleObizhaevaImpactResult {
    const size = Math.max(0, orderSizeUsd);
    const velocity = this.getTradingVelocity();
    const invariantBet = this.getInvariantBetSize();

    const normalizedTradeSize = invariantBet > 0 ? size / invariantBet : 0;
    const lambda =
      this.impactScaleConstant *
      Math.cbrt(this.dailyVolatility / this.dailyVolumeUsd);

    const impactFraction = lambda * Math.pow(normalizedTradeSize, this.impactPower);
    const priceImpactBps = Number((impactFraction * 10_000).toFixed(4));

    return {
      orderSizeUsd: size,
      tradingVelocity: Number(velocity.toFixed(2)),
      invariantBetSize: Number(invariantBet.toFixed(4)),
      normalizedTradeSize: Number(normalizedTradeSize.toFixed(6)),
      priceImpactBps,
      isCapacityConstrained: normalizedTradeSize > 1.0,
    };
  }
}
