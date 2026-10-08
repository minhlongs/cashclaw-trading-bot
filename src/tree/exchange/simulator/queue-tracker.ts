// L2 Queue Priority Tracker
// Simulates order queue position within an order book level using public market trades

import type { PublicTrade, QueuePositionState } from './l2-types';

export class QueuePositionTracker {
  private readonly queueMap = new Map<string, QueuePositionState>();

  public registerLimitOrder(
    orderId: string,
    price: number,
    depthAheadSize: number,
  ): QueuePositionState {
    const state: QueuePositionState = {
      orderId,
      price,
      initialAheadVolume: Math.max(0, depthAheadSize),
      remainingAheadVolume: Math.max(0, depthAheadSize),
      isFilled: depthAheadSize <= 0,
    };
    this.queueMap.set(orderId, state);
    return state;
  }

  public onTrade(trade: PublicTrade): Map<string, QueuePositionState> {
    const updated = new Map<string, QueuePositionState>();

    for (const [orderId, state] of this.queueMap.entries()) {
      if (state.isFilled) continue;

      // When trades happen at our price or better, volume ahead drains
      const priceMatches = Math.abs(trade.price - state.price) < 1e-8;
      if (priceMatches) {
        state.remainingAheadVolume = Math.max(0, state.remainingAheadVolume - trade.size);
        if (state.remainingAheadVolume <= 0) {
          (state as { isFilled: boolean }).isFilled = true;
        }
        updated.set(orderId, state);
      }
    }

    return updated;
  }

  public getPosition(orderId: string): QueuePositionState | null {
    return this.queueMap.get(orderId) ?? null;
  }

  public removeOrder(orderId: string): boolean {
    return this.queueMap.delete(orderId);
  }
}
