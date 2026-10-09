import type { VolatilityDcaBotConfig } from '../types';
import type { VolatilityDcaCallbacks } from './volatility-dca-math';

export interface VolatilityDcaState {
  config: VolatilityDcaBotConfig;
  callbacks: VolatilityDcaCallbacks;
  running: boolean;
  referencePrice: number;
  stepIndex: number;
  positionQty: number;
  positionCost: number;
  priceWindow: number[];
}

export function createInitialVolatilityDcaState(
  config: VolatilityDcaBotConfig,
  callbacks: VolatilityDcaCallbacks,
): VolatilityDcaState {
  return {
    config,
    callbacks,
    running: false,
    referencePrice: 0,
    stepIndex: 0,
    positionQty: 0,
    positionCost: 0,
    priceWindow: [],
  };
}
