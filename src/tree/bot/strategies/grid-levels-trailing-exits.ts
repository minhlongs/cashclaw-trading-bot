import type { GridLevel } from '../types';
import type { CloseAction } from './grid-levels-types';

export function findTrailingExits(levels: GridLevel[], price: number): CloseAction[] {
  const closes: CloseAction[] = [];
  for (const level of levels) {
    if (!level.trailingActive || !level.currentTpPrice || !level.currentSlPrice || level.status !== 'filled') continue;
    if (level.trailingSkipExit) { level.trailingSkipExit = false; continue; }
    if (level.side === 'buy') {
      if (price >= level.currentTpPrice) closes.push({ level, closePrice: price, reason: 'take-profit' });
      else if (price <= level.currentSlPrice) closes.push({ level, closePrice: price, reason: 'stop-loss' });
    } else {
      if (price <= level.currentTpPrice) closes.push({ level, closePrice: price, reason: 'take-profit' });
      else if (price >= level.currentSlPrice) closes.push({ level, closePrice: price, reason: 'stop-loss' });
    }
  }
  return closes;
}
