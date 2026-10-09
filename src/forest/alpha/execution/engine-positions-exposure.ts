import type { RegimeLabel } from '@/tree/regime/types';
import type { AlphaPosition, AlphaPortfolio } from './types';

export function positionExposure(pos: AlphaPosition): number {
  return Math.abs(pos.entryPrice * pos.quantity);
}

export function totalExposure(positions: readonly AlphaPosition[]): number {
  return positions.reduce((sum, p) => sum + positionExposure(p), 0);
}

export function isTimedOut(pos: AlphaPosition, cutoffMs: number): boolean {
  return new Date(pos.openedAt).getTime() < cutoffMs;
}

export function totalRealisedPnl(positions: readonly AlphaPosition[]): number {
  return positions.filter((p) => p.closedAt).reduce((sum, p) => sum + p.pnl, 0);
}

export function buildAlphaPortfolio(positions: readonly AlphaPosition[], regime: RegimeLabel): AlphaPortfolio {
  const open = positions.filter((p) => !p.closedAt);
  return {
    positions: [...positions],
    totalExposure: totalExposure(open),
    regime,
    openCount: open.length,
    totalRealisedPnl: totalRealisedPnl(positions),
  };
}
