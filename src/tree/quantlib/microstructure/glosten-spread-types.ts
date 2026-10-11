export interface GlostenQuote {
  readonly orderSize: number;
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly marginalSpread: number;
  readonly adverseSelectionCost: number;
  readonly inventoryCost: number;
}

export interface GlostenSpreadParams {
  readonly midPrice: number;
  readonly orderSizes: readonly number[];
  readonly baseSpread?: number;
  readonly infoIntensity?: number;
  readonly depthCurvature?: number;
  readonly specialistInventory?: number;
  readonly inventoryPenalty?: number;
}

export interface GlostenSpreadResult {
  readonly quotes: readonly GlostenQuote[];
  readonly averageEffectiveSpread: number;
  readonly quoteDepthScore: number;
}
