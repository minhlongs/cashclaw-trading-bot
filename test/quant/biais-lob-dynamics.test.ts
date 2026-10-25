import { describe, it, expect } from 'vitest';
import { BiaisLobDynamicsEngine } from '@/tree/quantlib/microstructure/biais-lob-dynamics-engine';
import type { LobEventType } from '@/tree/quantlib/microstructure/biais-lob-dynamics-engine';

describe('BiaisLobDynamicsEngine', () => {
  it('analyzes transition matrix and diagonal persistence', () => {
    const eventSequence: LobEventType[] = [
      'market-order',
      'market-order',
      'cancellation',
      'cancellation',
      'limit-at-best',
      'limit-at-best',
      'limit-in-spread',
      'market-order',
    ];
    const res = BiaisLobDynamicsEngine.analyzeTransitions({ eventSequence });
    expect(res.totalEvents).toBe(8);
    expect(res.diagonalPersistence).toBeGreaterThan(0);
    expect(res.flowClusteringScore).toBeGreaterThan(0);
    expect(res.transitionMatrix['market-order']['market-order']).toBeGreaterThan(0);
  });

  it('handles isolated alternating events with zero diagonal persistence', () => {
    const eventSequence: LobEventType[] = [
      'market-order',
      'cancellation',
      'market-order',
      'cancellation',
    ];
    const res = BiaisLobDynamicsEngine.analyzeTransitions({ eventSequence });
    expect(res.diagonalPersistence).toBe(0);
    expect(res.transitionMatrix['market-order']['cancellation']).toBe(1);
    expect(res.transitionMatrix['cancellation']['market-order']).toBe(1);
  });

  it('throws on sequence length less than 2', () => {
    expect(() => BiaisLobDynamicsEngine.analyzeTransitions({
      eventSequence: ['market-order'],
    })).toThrow('Requires at least 2 events in sequence');
  });
});
