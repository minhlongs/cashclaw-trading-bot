export type LobEventType = 'market-order' | 'limit-in-spread' | 'limit-at-best' | 'cancellation';

export interface BiaisLobDynamicsConfig {
  eventSequence: readonly LobEventType[];
}

export interface BiaisLobDynamicsResult {
  transitionMatrix: Record<LobEventType, Record<LobEventType, number>>;
  diagonalPersistence: number;
  flowClusteringScore: number;
  totalEvents: number;
}
