import type { CostStressTier } from './types';
import { CostStressTierSchema } from './schemas';

export interface SimulateShadowFillParams {
  readonly arrivalPrice: number;
  readonly latencyMs: number;
  readonly stressTier: CostStressTier;
  readonly fillTimestampOverride?: number;
}

export function validateSimulateParams(params: SimulateShadowFillParams): CostStressTier {
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

export function isSingleParams(
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
