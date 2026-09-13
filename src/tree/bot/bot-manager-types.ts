// Bot Manager — types and interfaces
// Extracted from bot-manager.ts for size compliance.

import type { BotConfig, BotStatus } from './types';
import type { ExchangeConfig } from '../exchange/types';
import type { TelemetryWriter } from '../telemetry';
import type { ExchangeOrchestrator } from '@/land/exchange-orchestration';
import type { BotInstance } from './bot-instance';
export type { ExchangeOrchestrator };

export interface BotManagerDependencies {
  onLog?: (msg: string) => void;
  onError?: (error: Error, context: string) => void;
  onBotEvent?: (botId: string, event: string, data: Record<string, unknown>) => void;
  telemetry?: TelemetryWriter;
  userId?: string;
  getOrchestrator?: () => ExchangeOrchestrator | null;
}

export interface CreateBotRequest {
  id: string;
  config: BotConfig;
  exchangeConfig: ExchangeConfig;
  mode: 'paper' | 'live';
}

export interface CachedBot {
  bot: BotInstance;
  expiresAt: number;
  userId?: string;
}

export interface BotFactoryDelegate {
  createBotSync(req: { id: string; config: BotConfig }, userId?: string): BotInstance;
  createBot(req: CreateBotRequest, userId?: string): Promise<BotInstance>;
}

export type D1BotStatus = 'draft' | 'paper_test' | 'live_running' | 'paused' | 'error' | 'stopped';

export const toD1Status = (status: BotStatus): D1BotStatus => {
  switch (status) {
    case 'running': return 'paper_test';
    case 'paused': return 'paused';
    case 'stopped': return 'stopped';
    case 'error': return 'error';
    case 'idle': return 'draft';
  }
};
