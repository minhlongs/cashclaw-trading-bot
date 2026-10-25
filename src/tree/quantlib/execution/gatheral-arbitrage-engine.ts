export class GatheralArbitrageEngine {
  public static evaluateDecayKernel(config: GatheralDecayConfig): GatheralArbitrageCheck {
    const { decayKernel, decayFactor: alpha, characteristicTime: tau, initialImpact: gamma0 } = config;
    if (alpha <= 0 || tau <= 0 || gamma0 <= 0) throw new Error('Parameters must be positive');
    const isPower = decayKernel === 'power-law';
    const isArbitrageFree = isPower ? alpha >= 1.0 : true;
    const isConvex = isPower ? alpha > 0 : true;
    const isMonotone = true;
    const halfLife = isPower ? tau * (Math.pow(2, 1 / alpha) - 1) : tau * Math.LN2;
    const k1 = isPower ? gamma0 / Math.pow(1 + 1 / tau, alpha) : gamma0 * Math.exp(-1 / tau);
    return { isArbitrageFree, isConvex, isMonotoneDecreasing: isMonotone, decayHalfLife: halfLife, kernelValueAt1: k1 };
  }
}

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
