import { describe, it, expect, beforeEach } from 'vitest';
import { QueuePositionTracker } from './queue-tracker';

describe('QueuePositionTracker', () => {
  let tracker: QueuePositionTracker;

  beforeEach(() => {
    tracker = new QueuePositionTracker();
  });

  it('registers limit orders and initializes queue position correctly', () => {
    const pos = tracker.registerLimitOrder('order-1', 50000, 2.5);
    expect(pos.orderId).toBe('order-1');
    expect(pos.remainingAheadVolume).toBe(2.5);
    expect(pos.isFilled).toBe(false);

    const instantFill = tracker.registerLimitOrder('order-2', 50000, 0);
    expect(instantFill.isFilled).toBe(true);
  });

  it('drains queue volume when trades occur at the same price', () => {
    tracker.registerLimitOrder('order-1', 50000, 2.0);

    // Trade with size 1.2
    tracker.onTrade({
      price: 50000,
      size: 1.2,
      side: 'sell',
      timestampMs: 1700000000,
    });

    const pos = tracker.getPosition('order-1');
    expect(pos?.remainingAheadVolume).toBeCloseTo(0.8);
    expect(pos?.isFilled).toBe(false);

    // Trade with size 1.0 (exceeds remaining 0.8)
    tracker.onTrade({
      price: 50000,
      size: 1.0,
      side: 'sell',
      timestampMs: 1700000001,
    });

    expect(pos?.remainingAheadVolume).toBe(0);
    expect(pos?.isFilled).toBe(true);
  });

  it('ignores trades at different prices and supports removal', () => {
    tracker.registerLimitOrder('order-1', 50000, 2.0);

    tracker.onTrade({
      price: 50050, // Different price
      size: 5.0,
      side: 'buy',
      timestampMs: 1700000000,
    });

    expect(tracker.getPosition('order-1')?.remainingAheadVolume).toBe(2.0);
    expect(tracker.removeOrder('order-1')).toBe(true);
    expect(tracker.getPosition('order-1')).toBeNull();
  });
});
