import type { GridLevel } from '../types';

export function seedTrailing(level: GridLevel, tpOff: number, slOff: number): void {
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

export function ratchetBuyTrailing(level: GridLevel, price: number, tpOff: number, slOff: number): void {
  const tpTarget = price - tpOff;
  if (tpTarget > (level.currentTpPrice ?? -Infinity)) level.currentTpPrice = tpTarget;
  if (price > level.filledPrice!) {
    const raw = price - slOff;
    const clamped = Math.min(Math.max(raw, level.filledPrice! - slOff * 2), level.filledPrice!);
    if (clamped > (level.currentSlPrice ?? -Infinity)) level.currentSlPrice = clamped;
  }
}

export function ratchetSellTrailing(level: GridLevel, price: number, tpOff: number, slOff: number): void {
  const tpTarget = price + tpOff;
  if (tpTarget < (level.currentTpPrice ?? Infinity)) level.currentTpPrice = tpTarget;
  if (price < level.filledPrice!) {
    const raw = price + slOff;
    const clamped = Math.max(Math.min(raw, level.filledPrice! + slOff * 2), level.filledPrice!);
    if (clamped < (level.currentSlPrice ?? Infinity)) level.currentSlPrice = clamped;
  }
}
