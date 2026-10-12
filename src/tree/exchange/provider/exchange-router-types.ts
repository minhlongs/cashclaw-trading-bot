import type { ExchangeId } from '../types';

export interface ExchangeRouteHealth {
  score: number;
  circuitOpen: boolean;
}

export interface RouteContext {
  health: Map<ExchangeId, ExchangeRouteHealth>;
}
