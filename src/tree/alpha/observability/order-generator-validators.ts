import type { GenerateShadowOrdersParams } from './order-generator';

export interface EvaluatedDelta {
  readonly symbol: string;
  readonly delta: number;
  readonly price: number;
}

export function validateOrderGenerationParams(params: GenerateShadowOrdersParams): number {
  if (!params || typeof params !== 'object') {
    throw new TypeError('generateShadowOrders: params must be an object');
  }
  if (!Number.isFinite(params.portfolioEquity) || params.portfolioEquity <= 0) {
    throw new RangeError(
      `generateShadowOrders: portfolioEquity must be a positive finite number, got: ${params.portfolioEquity}`,
    );
  }
  if (
    !Number.isFinite(params.decisionTimestamp) ||
    !Number.isInteger(params.decisionTimestamp) ||
    params.decisionTimestamp <= 0
  ) {
    throw new RangeError(
      `generateShadowOrders: decisionTimestamp must be a positive integer, got: ${params.decisionTimestamp}`,
    );
  }

  const threshold = params.minWeightDeltaThreshold ?? 1e-6;
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError(
      `generateShadowOrders: minWeightDeltaThreshold must be a non-negative finite number, got: ${threshold}`,
    );
  }

  return threshold;
}

export function evaluateSymbolDelta(
  symbol: string,
  targetWeights: Readonly<Record<string, number>>,
  currentWeights: Readonly<Record<string, number>>,
  prices: Readonly<Record<string, number>>,
  threshold: number,
): EvaluatedDelta | null {
  const target = targetWeights[symbol];
  if (target === undefined || !Number.isFinite(target)) return null;

  const current = currentWeights[symbol] ?? 0;
  if (!Number.isFinite(current)) return null;

  const delta = target - current;
  if (Math.abs(delta) < threshold || delta === 0) return null;

  const price = prices[symbol];
  if (price === undefined || !Number.isFinite(price) || price <= 0) return null;

  return { symbol, delta, price };
}
