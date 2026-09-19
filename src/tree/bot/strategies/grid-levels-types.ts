// Grid Levels — Shared types for grid computation, trailing TP/SL, and metrics.

import type { GridLevel } from '../types';

/** Action returned when a trailing exit triggers. */
export interface CloseAction {
  level: GridLevel;
  closePrice: number;
  reason: 'take-profit' | 'stop-loss';
}
