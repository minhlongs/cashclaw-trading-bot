// Black Swan Liquidity Void & Flash Crash Shock Simulator
import type { LiquidityShockScenario, StressedL2State } from './stress-types';

export function simulateLiquidityShock(
  midPrice: number,
  baseSpread: number,
  baseDepth: number,
  scenario: LiquidityShockScenario,
): StressedL2State {
  const safeMid = Math.max(0.0001, midPrice);
  const safeSpread = Math.max(0.0001, baseSpread);
  const safeDepth = Math.max(0, baseDepth);

  const shockedMidPrice = safeMid * (1 + scenario.priceShockPct);
  const stressedSpread = safeSpread * Math.max(1, scenario.spreadMultiplier);
  const remainingDepthRatio = Math.max(0.01, 1 - Math.min(0.99, scenario.depthDepletionRatio));
  const stressedDepth = safeDepth * remainingDepthRatio;

  return {
    originalSpread: safeSpread,
    stressedSpread: Number(stressedSpread.toFixed(6)),
    originalDepth: safeDepth,
    stressedDepth: Number(stressedDepth.toFixed(4)),
    shockedMidPrice: Number(shockedMidPrice.toFixed(4)),
  };
}
