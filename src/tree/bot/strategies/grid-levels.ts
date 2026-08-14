// Grid Levels — Pure functions for grid computation, trailing TP/SL, and metrics.
// Extracted from GridStrategy for separation of concerns.

import type { GridLevel, GridBotConfig } from '../types';

/** Action returned when a trailing exit triggers. */
export interface CloseAction {
  level: GridLevel;
  closePrice: number;
  reason: 'take-profit' | 'stop-loss';
}

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

/**
 * Update trailing TP/SL for all filled levels.
 * Mutates levels in-place (seeds on first call, ratchets on subsequent).
 */
export function updateTrailingLevels(
  levels: GridLevel[],
  price: number,
  takeProfitPct: number,
  stopLossPct: number,
): void {
  for (const level of levels) {
    if (level.status !== 'filled' || !level.filledPrice) continue;

    const tpOff = level.filledPrice * (takeProfitPct / 100);
    const slOff = level.filledPrice * (stopLossPct / 100);

    if (!level.trailingActive) {
      if (level.side === 'buy') {
        level.currentTpPrice = level.filledPrice + tpOff;
        level.currentSlPrice = level.filledPrice - slOff * 2;
      } else {
        level.currentTpPrice = level.filledPrice - tpOff;
        level.currentSlPrice = level.filledPrice + slOff * 2;
      }
      level.trailingActive = true;
      level.trailingSkipExit = true;
      continue;
    }

    if (level.side === 'buy') {
      const tpTarget = price - tpOff;
      if (tpTarget > (level.currentTpPrice ?? -Infinity)) {
        level.currentTpPrice = tpTarget;
      }
      if (price > level.filledPrice) {
        const raw = price - slOff;
        const clamped = Math.min(
          Math.max(raw, level.filledPrice - slOff * 2),
          level.filledPrice,
        );
        if (clamped > (level.currentSlPrice ?? -Infinity)) {
          level.currentSlPrice = clamped;
        }
      }
    } else {
      const tpTarget = price + tpOff;
      if (tpTarget < (level.currentTpPrice ?? Infinity)) {
        level.currentTpPrice = tpTarget;
      }
      if (price < level.filledPrice) {
        const raw = price + slOff;
        const clamped = Math.max(
          Math.min(raw, level.filledPrice + slOff * 2),
          level.filledPrice,
        );
        if (clamped < (level.currentSlPrice ?? Infinity)) {
          level.currentSlPrice = clamped;
        }
      }
    }
  }
}

/**
 * Check trailing exits and return close actions.
 * Mutates trailingSkipExit in-place; caller applies the returned closes.
 */
export function findTrailingExits(
  levels: GridLevel[],
  price: number,
): CloseAction[] {
  const closes: CloseAction[] = [];
  for (const level of levels) {
    if (
      !level.trailingActive ||
      !level.currentTpPrice ||
      !level.currentSlPrice ||
      level.status !== 'filled'
    ) continue;

    if (level.trailingSkipExit) {
      level.trailingSkipExit = false;
      continue;
    }

    if (level.side === 'buy') {
      if (price >= level.currentTpPrice) {
        closes.push({ level, closePrice: price, reason: 'take-profit' });
      } else if (price <= level.currentSlPrice) {
        closes.push({ level, closePrice: price, reason: 'stop-loss' });
      }
    } else {
      if (price <= level.currentTpPrice) {
        closes.push({ level, closePrice: price, reason: 'take-profit' });
      } else if (price >= level.currentSlPrice) {
        closes.push({ level, closePrice: price, reason: 'stop-loss' });
      }
    }
  }
  return closes;
}

/**
 * Compute total deployed capital across open/filled levels.
 */
export function computeDeployedCapital(levels: GridLevel[]): number {
  let deployed = 0;
  for (const level of levels) {
    if (level.status === 'open' || level.status === 'filled') {
      deployed += level.quantity * level.triggerPrice;
    }
  }
  return deployed;
}
