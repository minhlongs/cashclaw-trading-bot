// Bot State — standalone initial state creation
// Pure function extracted from BotInstance for size compliance.

import type {
  BotState,
  BotConfig,
  GridBotConfig,
  MeanRevBotConfig,
} from './types';

export function createInitialState(
  id: string,
  config: GridBotConfig | MeanRevBotConfig,
): BotState {
  return {
    id,
    config: config as BotConfig,
    status: 'idle',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalPnl: 0,
    totalTrades: 0,
    winCount: 0,
    lossCount: 0,
    maxDrawdown: 0,
    currentDrawdown: 0,
    startedAt: null,
    stoppedAt: null,
    lastTickAt: null,
    lastOrderAt: null,
    error: null,
  };
}
