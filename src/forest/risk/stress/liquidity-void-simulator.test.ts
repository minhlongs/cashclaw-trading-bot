import { describe, it, expect } from 'vitest';
import { simulateLiquidityShock } from './liquidity-void-simulator';

describe('liquidity-void-simulator', () => {
  it('applies liquidity shock scaling spread and evaporating depth', () => {
    const stressed = simulateLiquidityShock(100, 0.05, 1000, {
      scenarioName: 'Flash Crash 2020',
      spreadMultiplier: 10,
      depthDepletionRatio: 0.85,
      priceShockPct: -0.30,
    });

    expect(stressed.shockedMidPrice).toBe(70);
    expect(stressed.stressedSpread).toBe(0.5);
    expect(stressed.stressedDepth).toBe(150); // 1000 * 0.15
  });
});
