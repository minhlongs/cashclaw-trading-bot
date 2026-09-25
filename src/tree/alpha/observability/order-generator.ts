import type { ShadowOrder, ShadowOrderSide } from './types';
import { ShadowOrderSchema } from './schemas';

/**
 * Parameters for generating hypothetical shadow orders from portfolio weight deltas.
 */
export interface GenerateShadowOrdersParams {
  readonly currentWeights: Readonly<Record<string, number>>;
  readonly targetWeights: Readonly<Record<string, number>>;
  readonly prices: Readonly<Record<string, number>>;
  readonly portfolioEquity: number;
  readonly decisionTimestamp: number;
  readonly minWeightDeltaThreshold?: number;
}

interface EvaluatedDelta {
  readonly symbol: string;
  readonly delta: number;
  readonly price: number;
}

/**
 * Validates top-level parameters for shadow order generation.
 */
function validateOrderGenerationParams(params: GenerateShadowOrdersParams): number {
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

/**
 * Evaluates weight delta and reference price for a single candidate symbol.
 * Returns null if delta is below threshold or price is non-positive.
 */
function evaluateSymbolDelta(
  symbol: string,
  targetWeights: Readonly<Record<string, number>>,
  currentWeights: Readonly<Record<string, number>>,
  prices: Readonly<Record<string, number>>,
  threshold: number,
): EvaluatedDelta | null {
  const target = targetWeights[symbol];
  if (target === undefined || !Number.isFinite(target)) {
    return null;
  }

  const current = currentWeights[symbol] ?? 0;
  if (!Number.isFinite(current)) {
    return null;
  }

  const delta = target - current;
  if (Math.abs(delta) < threshold || delta === 0) {
    return null;
  }

  const price = prices[symbol];
  if (price === undefined || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return { symbol, delta, price };
}

/**
 * Generates hypothetical shadow orders based on target portfolio weight deltas
 * strictly using causal reference prices at decision timestamp t.
 *
 * Weight delta: delta_w_i = targetWeights[symbol] - (currentWeights[symbol] ?? 0).
 * Filters out |delta_w_i| < threshold and symbols with non-positive or missing prices.
 *
 * Strictly causal: zero forward-looking bias.
 */
export function generateShadowOrders(params: GenerateShadowOrdersParams): readonly ShadowOrder[] {
  const threshold = validateOrderGenerationParams(params);
  const targetWeights = params.targetWeights ?? {};
  const currentWeights = params.currentWeights ?? {};
  const prices = params.prices ?? {};

  const symbols = Object.keys(targetWeights).sort();
  const orders: ShadowOrder[] = [];
  let orderIndex = 0;

  for (const symbol of symbols) {
    const evaluated = evaluateSymbolDelta(
      symbol,
      targetWeights,
      currentWeights,
      prices,
      threshold,
    );
    if (!evaluated) {
      continue;
    }

    const side: ShadowOrderSide = evaluated.delta > 0 ? 'buy' : 'sell';
    const notionalSize = Math.abs(evaluated.delta) * params.portfolioEquity;
    const rawOrderId = `ord_${symbol}_${params.decisionTimestamp}_${orderIndex}`;
    const orderId = rawOrderId.length <= 100 ? rawOrderId : rawOrderId.slice(0, 100);

    const order = ShadowOrderSchema.parse({
      orderId,
      symbol,
      side,
      size: notionalSize,
      price: evaluated.price,
      targetWeightDelta: evaluated.delta,
      decisionTimestamp: params.decisionTimestamp,
    });

    orders.push(order);
    orderIndex++;
  }

  return orders;
}
