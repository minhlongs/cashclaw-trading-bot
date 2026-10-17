import { computeRollSpread } from './roll-spread-engine';
import type { RollSpreadParams, RollSpreadResult } from './roll-spread-types';

export class RollEffectiveSpreadEngine {
  private readonly defaultTickSize: number;

  constructor(options: { tickSize?: number } = {}) {
    this.defaultTickSize = options.tickSize ?? 1e-4;
  }

  estimateSpread(
    priceSeries: readonly number[],
    tickSize: number = this.defaultTickSize,
  ): RollSpreadResult {
    return computeRollSpread({ priceSeries, tickSize });
  }
}

export { computeRollSpread, type RollSpreadParams, type RollSpreadResult };
