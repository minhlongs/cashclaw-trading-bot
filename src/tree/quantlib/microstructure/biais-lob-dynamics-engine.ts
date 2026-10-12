import type { BiaisLobDynamicsConfig, BiaisLobDynamicsResult, LobEventType } from './biais-lob-dynamics-types';

const TYPES: LobEventType[] = ['market-order', 'limit-in-spread', 'limit-at-best', 'cancellation'];

export class BiaisLobDynamicsEngine {
  public static analyzeTransitions(config: BiaisLobDynamicsConfig): BiaisLobDynamicsResult {
    const { eventSequence: seq } = config;
    if (seq.length < 2) throw new Error('Requires at least 2 events in sequence');
    const counts = Object.fromEntries(TYPES.map(i => [i, Object.fromEntries(TYPES.map(j => [j, 0]))])) as Record<LobEventType, Record<LobEventType, number>>;
    for (let k = 0; k < seq.length - 1; k++) counts[seq[k]][seq[k + 1]]++;
    const matrix = {} as Record<LobEventType, Record<LobEventType, number>>;
    let diagSum = 0;
    TYPES.forEach(i => {
      matrix[i] = {} as Record<LobEventType, number>;
      const rowSum = Object.values(counts[i]).reduce((a, b) => a + b, 0);
      TYPES.forEach(j => {
        const prob = rowSum > 0 ? counts[i][j] / rowSum : 0;
        matrix[i][j] = prob;
        if (i === j) diagSum += prob;
      });
    });
    return { transitionMatrix: matrix, diagonalPersistence: diagSum / 4, flowClusteringScore: diagSum, totalEvents: seq.length };
  }
}
