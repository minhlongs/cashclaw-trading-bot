import type { AlphaSignal, AlphaDirection } from '@/tree/alpha/types';
import type { AlphaPosition, AlphaPositionDirection } from './types';

let _counter = 0;
export const nextPositionId = (): string => `ap_${Date.now()}_${++_counter}`;
export const toPositionDirection = (dir: AlphaDirection): AlphaPositionDirection => (dir === 'buy' ? 'long' : 'short');
export const isoNow = (): string => new Date().toISOString();

export function makePosition(signal: AlphaSignal): AlphaPosition {
  return {
    id: nextPositionId(),
    symbol: signal.features.symbol,
    direction: toPositionDirection(signal.direction),
    entryPrice: 0,
    quantity: 0,
    alphaName: signal.name,
    confidence: signal.confidence,
    pnl: 0,
    openedAt: isoNow(),
  };
}

export function applyFill(pos: AlphaPosition, price: number, quantity: number): void {
  (pos as AlphaPosition & { entryPrice?: number; quantity?: number }).entryPrice = price;
  (pos as AlphaPosition & { entryPrice?: number; quantity?: number }).quantity = quantity;
}

export function computePnl(pos: AlphaPosition, exitPrice: number): number {
  const mult = pos.direction === 'long' ? 1 : -1;
  return (exitPrice - pos.entryPrice) * mult * pos.quantity;
}
