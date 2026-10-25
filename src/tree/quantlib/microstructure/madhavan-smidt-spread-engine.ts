export function computeMadhavanSmidtDecomposition(
  ticks: readonly MadhavanSmidtTick[], spreadOverride?: number,
): MadhavanSmidtDecompositionResult {
  if (ticks.length < 4) {
    return {
      spread: 0, adverseSelectionCoeff: 0, inventoryHoldingCoeff: 0, orderProcessingCost: 0,
      orderProcessingShare: 0.34, adverseSelectionShare: 0.33, inventoryHoldingShare: 0.33, rSquared: 0,
    };
  }

  const y: number[] = [], x1: number[] = [], x2: number[] = [], x3: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1], curr = ticks[i];
    y.push(curr.price - prev.price); x1.push(curr.direction - prev.direction);
    x2.push(curr.direction); x3.push(curr.inventory ?? 0);
  }

  const n = y.length, meanY = y.reduce((a, b) => a + b, 0) / n;
  let varY = 0, covYX1 = 0, varX1 = 0, covYX2 = 0, varX2 = 0, covYX3 = 0, varX3 = 0;
  for (let i = 0; i < n; i++) {
    varY += (y[i] - meanY) ** 2;
    covYX1 += y[i] * x1[i]; varX1 += x1[i] ** 2;
    covYX2 += y[i] * x2[i]; varX2 += x2[i] ** 2;
    covYX3 += y[i] * x3[i]; varX3 += x3[i] ** 2;
  }

  const c = Math.max(0, varX1 > 1e-8 ? covYX1 / varX1 : 0);
  const theta = Math.max(0, varX2 > 1e-8 ? covYX2 / varX2 : 0);
  const phi = Math.max(0, varX3 > 1e-8 ? covYX3 / varX3 : 0);
  const sumWeights = Math.max(1e-8, c + theta + phi);
  const alpha = c / sumWeights, gamma = theta / sumWeights, beta = 1.0 - alpha - gamma;
  const spread = spreadOverride ?? 2 * (c + theta);
  const r2 = varY > 1e-8 ? Math.min(1.0, Math.max(0, (covYX1 * c + covYX2 * theta) / varY)) : 0;

  return {
    spread, adverseSelectionCoeff: theta, inventoryHoldingCoeff: phi, orderProcessingCost: c,
    orderProcessingShare: Math.max(0, Math.min(1, alpha)),
    adverseSelectionShare: Math.max(0, Math.min(1, gamma)),
    inventoryHoldingShare: Math.max(0, Math.min(1, beta)),
    rSquared: r2,
  };
}

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
