// Grid Levels — Initial grid level construction.
// Levels are centred on `centerPrice` and sorted descending by triggerPrice.

import type { GridLevel, GridBotConfig } from '../types';

/**
 * Build initial grid levels centred on `centerPrice`.
 * Levels are sorted descending by triggerPrice (highest first).
 */
export function computeGridLevels(
  centerPrice: number,
  config: GridBotConfig,
): GridLevel[] {
  const levels: GridLevel[] = [];
  const spacing = centerPrice * (config.gridSpacingPct / 100);
  const levelCapital = config.capital * (config.capitalPerLevelPct / 100);
  const halfLevels = Math.floor(config.gridLevels / 2);

  for (let i = -halfLevels; i <= halfLevels; i++) {
    if (i === 0) continue;

    const triggerPrice = centerPrice + i * spacing;
    const side: 'buy' | 'sell' = i < 0 ? 'buy' : 'sell';
    const takeProfitPrice = side === 'buy'
      ? triggerPrice * (1 + config.takeProfitPct / 100)
      : triggerPrice * (1 - config.takeProfitPct / 100);
    const stopLossPrice = side === 'buy'
      ? triggerPrice * (1 - config.stopLossPct / 100)
      : triggerPrice * (1 + config.stopLossPct / 100);
    const quantity = levelCapital / triggerPrice;

    levels.push({
      level: Math.abs(i),
      side,
      triggerPrice: Math.max(0.00000001, triggerPrice),
      takeProfitPrice: Math.max(0.00000001, takeProfitPrice),
      stopLossPrice: Math.max(0.00000001, stopLossPrice),
      quantity,
      status: 'pending',
      orderId: null,
    });
  }

  levels.sort((a, b) => b.triggerPrice - a.triggerPrice);
  return levels;
}
