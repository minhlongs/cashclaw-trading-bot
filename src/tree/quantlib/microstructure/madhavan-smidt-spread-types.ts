export interface MadhavanSmidtTick {
  readonly price: number;
  readonly midpoint: number;
  readonly direction: 1 | -1 | 0; // Trade sign indicator
  readonly inventory?: number;    // Specialist/dealer inventory position
}

export interface MadhavanSmidtDecompositionResult {
  readonly spread: number;
  readonly adverseSelectionCoeff: number; // theta: private info coefficient
  readonly inventoryHoldingCoeff: number;  // phi: inventory adjustment coefficient
  readonly orderProcessingCost: number;    // c: order processing cost
  readonly orderProcessingShare: number;   // alpha in [0, 1]
  readonly adverseSelectionShare: number;  // gamma in [0, 1]
  readonly inventoryHoldingShare: number;  // beta in [0, 1]
  readonly rSquared: number;
}
