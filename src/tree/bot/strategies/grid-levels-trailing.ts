// Grid Levels — Trailing take-profit / stop-loss updates and exit detection.
// Mutates levels in-place (seeds on first call, ratchets on subsequent).

import type { GridLevel } from '../types';
import type { CloseAction } from './grid-levels-types';

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
      seedTrailing(level, tpOff, slOff);
      continue;
    }

    if (level.side === 'buy') {
      ratchetBuyTrailing(level, price, tpOff, slOff);
    } else {
      ratchetSellTrailing(level, price, tpOff, slOff);
    }
  }
}

function seedTrailing(level: GridLevel, tpOff: number, slOff: number): void {
  if (level.side === 'buy') {
    level.currentTpPrice = level.filledPrice! + tpOff;
    level.currentSlPrice = level.filledPrice! - slOff * 2;
  } else {
    level.currentTpPrice = level.filledPrice! - tpOff;
    level.currentSlPrice = level.filledPrice! + slOff * 2;
  }
  level.trailingActive = true;
  level.trailingSkipExit = true;
}

function ratchetBuyTrailing(level: GridLevel, price: number, tpOff: number, slOff: number): void {
  const tpTarget = price - tpOff;
  if (tpTarget > (level.currentTpPrice ?? -Infinity)) {
    level.currentTpPrice = tpTarget;
  }
  // filledPrice! is safe: caller checks !level.filledPrice before calling
  if (price > level.filledPrice!) {
    const raw = price - slOff;
    const clamped = Math.min(Math.max(raw, level.filledPrice! - slOff * 2), level.filledPrice!);
    if (clamped > (level.currentSlPrice ?? -Infinity)) {
      level.currentSlPrice = clamped;
    }
  }
}

function ratchetSellTrailing(level: GridLevel, price: number, tpOff: number, slOff: number): void {
  const tpTarget = price + tpOff;
  if (tpTarget < (level.currentTpPrice ?? Infinity)) {
    level.currentTpPrice = tpTarget;
  }
  // filledPrice! is safe: caller checks !level.filledPrice before calling
  if (price < level.filledPrice!) {
    const raw = price + slOff;
    const clamped = Math.max(Math.min(raw, level.filledPrice! + slOff * 2), level.filledPrice!);
    if (clamped < (level.currentSlPrice ?? Infinity)) {
      level.currentSlPrice = clamped;
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
