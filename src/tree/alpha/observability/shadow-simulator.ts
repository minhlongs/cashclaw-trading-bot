import type { CostStressTier, ShadowFill, ShadowOrder } from './types';
import { CostStressTierSchema, ShadowFillSchema, ShadowOrderSchema } from './schemas';
import { resolveStressConfig } from '../cost-stress';

/**
 * Parameters for simulating hypothetical shadow execution fill.
 */
export interface SimulateShadowFillParams {
  readonly arrivalPrice: number;
  readonly latencyMs: number;
  readonly stressTier: CostStressTier;
  readonly fillTimestampOverride?: number;
}

/**
 * Validates simulation parameters and resolves the canonical CostStressTier.
 */
function validateSimulateParams(params: SimulateShadowFillParams): CostStressTier {
  if (!params || typeof params !== 'object') {
    throw new TypeError('simulateShadowFill: params must be an object');
  }
  if (!Number.isFinite(params.arrivalPrice) || params.arrivalPrice <= 0) {
    throw new RangeError(
      `simulateShadowFill: arrivalPrice must be a positive finite number, got: ${params.arrivalPrice}`,
    );
  }
  if (!Number.isFinite(params.latencyMs) || params.latencyMs < 0) {
    throw new RangeError(
      `simulateShadowFill: latencyMs must be a non-negative finite number, got: ${params.latencyMs}`,
    );
  }

  const rawTier = typeof params.stressTier === 'string' ? params.stressTier.toLowerCase() : params.stressTier;
  const validatedTier = CostStressTierSchema.parse(rawTier);

  if (params.fillTimestampOverride !== undefined) {
    if (
      !Number.isFinite(params.fillTimestampOverride) ||
      !Number.isInteger(params.fillTimestampOverride) ||
      params.fillTimestampOverride <= 0
    ) {
      throw new RangeError(
        `simulateShadowFill: fillTimestampOverride must be a positive integer, got: ${params.fillTimestampOverride}`,
      );
    }
  }

  return validatedTier;
}

/**
 * Determines whether the given parameter is a single SimulateShadowFillParams object.
 */
function isSingleParams(
  p: Readonly<Record<string, SimulateShadowFillParams>> | SimulateShadowFillParams,
): p is SimulateShadowFillParams {
  return (
    typeof p === 'object' &&
    p !== null &&
    'arrivalPrice' in p &&
    typeof (p as SimulateShadowFillParams).arrivalPrice === 'number' &&
    'stressTier' in p
  );
}

/**
 * Simulates a single hypothetical shadow fill with causal latency penalties and
 * cost stress tier slippage and fee models.
 *
 * Strictly fail-closed: paper/shadow only — zero live execution capability.
 */
export function simulateShadowFill(
  order: ShadowOrder,
  params: SimulateShadowFillParams,
): ShadowFill {
  const validatedOrder = ShadowOrderSchema.parse(order);
  const validatedTier = validateSimulateParams(params);
  const stressConfig = resolveStressConfig(validatedTier);

  const fillTimestamp =
    params.fillTimestampOverride ??
    Math.round(validatedOrder.decisionTimestamp + params.latencyMs);

  const fillQuantity = validatedOrder.size / validatedOrder.price;
  const slipRate = stressConfig.slipPct + stressConfig.marketImpactPct;

  const fillPrice =
    validatedOrder.side === 'buy'
      ? params.arrivalPrice * (1 + slipRate)
      : params.arrivalPrice * (1 - slipRate);

  const feeAmount = fillPrice * fillQuantity * stressConfig.feePct;

  const sideFactor = validatedOrder.side === 'buy' ? 1 : -1;
  const slippageBps =
    sideFactor * ((fillPrice - validatedOrder.price) / validatedOrder.price) * 10_000;

  const rawFillId = `fill_${validatedOrder.orderId}_${fillTimestamp}`;
  const fillId = rawFillId.length <= 100 ? rawFillId : rawFillId.slice(0, 100);

  return ShadowFillSchema.parse({
    fillId,
    orderId: validatedOrder.orderId,
    symbol: validatedOrder.symbol,
    side: validatedOrder.side,
    fillPrice,
    fillQuantity,
    fillTimestamp,
    feeAmount,
    slippageBps,
    stressTier: validatedTier,
  });
}

/**
 * Batch-simulates hypothetical shadow fills across an array of shadow orders.
 * Accepts either uniform simulation parameters or a per-symbol / per-orderId map.
 */
export function simulateShadowFills(
  orders: readonly ShadowOrder[],
  paramsMap: Readonly<Record<string, SimulateShadowFillParams>> | SimulateShadowFillParams,
): readonly ShadowFill[] {
  if (!Array.isArray(orders)) {
    throw new TypeError('simulateShadowFills: orders must be an array');
  }
  if (!paramsMap || typeof paramsMap !== 'object') {
    throw new TypeError('simulateShadowFills: paramsMap must be an object');
  }

  const isSingle = isSingleParams(paramsMap);
  const fills: ShadowFill[] = [];

  for (const order of orders) {
    const orderParams = isSingle
      ? paramsMap
      : ((paramsMap as Readonly<Record<string, SimulateShadowFillParams>>)[order.symbol] ??
        (paramsMap as Readonly<Record<string, SimulateShadowFillParams>>)[order.orderId]);

    if (!orderParams) {
      throw new Error(
        `simulateShadowFills: missing simulation params for order ${order.orderId} (symbol: ${order.symbol})`,
      );
    }

    fills.push(simulateShadowFill(order, orderParams));
  }

  return fills;
}
