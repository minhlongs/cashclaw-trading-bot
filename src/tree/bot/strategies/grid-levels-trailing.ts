import type { GridLevel } from '../types';
import type { CloseAction } from './grid-levels-types';
import { seedTrailing, ratchetBuyTrailing, ratchetSellTrailing } from './grid-levels-trailing-ratchet';
import { findTrailingExits } from './grid-levels-trailing-exits';
export { findTrailingExits };
export type { CloseAction };

export function updateTrailingLevels(levels: GridLevel[], price: number, takeProfitPct: number, stopLossPct: number): void {
  for (const level of levels) {
    if (level.status !== 'filled' || !level.filledPrice) continue;
    const tpOff = level.filledPrice * (takeProfitPct / 100), slOff = level.filledPrice * (stopLossPct / 100);
    if (!level.trailingActive) { seedTrailing(level, tpOff, slOff); continue; }
    if (level.side === 'buy') ratchetBuyTrailing(level, price, tpOff, slOff);
    else ratchetSellTrailing(level, price, tpOff, slOff);
  }
}
