import type { BotConfig } from './types';
import { persistBot } from '@/forest/bot/d1-adapter';
import type { TradeEventType } from '../telemetry/types';

export type D1BotStatus = 'draft' | 'paper_test' | 'live_running' | 'paused' | 'error' | 'stopped';

export function toD1Status(status: string): D1BotStatus {
  switch (status) {
    case 'running': return 'paper_test';
    case 'paused': return 'paused';
    case 'stopped': return 'stopped';
    case 'error': return 'error';
    default: return 'draft';
  }
}

export interface D1CallbackDeps {
  botId: string;
  userId: string;
  config: BotConfig;
  capital: number;
  onLog: (msg: string) => void;
  onError: (error: Error, context: string) => void;
  onBotEvent?: (botId: string, event: string, data: Record<string, unknown>) => void;
  emitTelemetry?: (type: TradeEventType, details: Record<string, unknown>) => void;
}

export async function persistNewBot(deps: D1CallbackDeps): Promise<void> {
  persistBot(deps.userId, {
    id: deps.botId,
    config: deps.config,
    capital: deps.capital,
    name: deps.botId,
    strategy: deps.config.strategy,
    pair: deps.config.symbol,
    exchange: deps.config.exchange,
  });
}
