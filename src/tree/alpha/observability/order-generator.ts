import type { ShadowOrder, ShadowOrderSide } from './types';
import { ShadowOrderSchema } from './schemas';
import {
  validateOrderGenerationParams,
  evaluateSymbolDelta,
} from './order-generator-validators';

export interface GenerateShadowOrdersParams {
  readonly currentWeights: Readonly<Record<string, number>>;
  readonly targetWeights: Readonly<Record<string, number>>;
  readonly prices: Readonly<Record<string, number>>;
  readonly portfolioEquity: number;
  readonly decisionTimestamp: number;
  readonly minWeightDeltaThreshold?: number;
}

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
    if (!evaluated) continue;

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
