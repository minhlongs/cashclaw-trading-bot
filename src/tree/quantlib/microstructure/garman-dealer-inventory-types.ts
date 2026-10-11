export interface GarmanDealerInventoryParams {
  readonly initialInventory: number;
  readonly buyerArrivalRate: number;
  readonly sellerArrivalRate: number;
  readonly baseSpread: number;
  readonly inventorySensitivity: number;
  readonly referencePrice: number;
}

export interface GarmanDealerInventoryResult {
  readonly askPrice: number;
  readonly bidPrice: number;
  readonly effectiveSpread: number;
  readonly inventoryDrift: number;
  readonly inventoryVariance: number;
  readonly exhaustionProbability: number;
}
