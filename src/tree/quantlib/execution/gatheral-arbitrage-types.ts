export interface GatheralDecayConfig {
  decayKernel: 'power-law' | 'exponential';
  decayFactor: number;
  characteristicTime: number;
  initialImpact: number;
}

export interface GatheralArbitrageCheck {
  isArbitrageFree: boolean;
  isConvex: boolean;
  isMonotoneDecreasing: boolean;
  decayHalfLife: number;
  kernelValueAt1: number;
}
