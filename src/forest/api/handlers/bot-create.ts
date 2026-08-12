/**
 * POST /api/bots — create a new bot
 * Persists bot config to D1 and creates BotInstance in memory.
 * v1: paper mode only — 'live' is rejected at the API level.
 */

import { getBotManager, type CreateBotRequest } from '@/tree/bot';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';

export interface CreateBotPayload {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  capital: number;
  config: Record<string, number>;
  mode?: 'paper' | 'live';
}

export async function botCreateHandler(
  payload: CreateBotPayload
): Promise<{ ok: boolean; data?: { id: string }; error?: string }> {
  try {
    // v1: hard-block live trading — paper mode only
    if (payload.mode === 'live') {
      return {
        ok: false,
        error: 'Live trading not available in v1 — paper mode only',
      };
    }

    await loadAllBotsFromD1();
    const manager = getBotManager();

    // Map payload to CreateBotRequest — always paper in v1
    const botConfig: CreateBotRequest = {
      id: payload.id,
      config: {
        strategy: payload.strategy,
        symbol: payload.pair,
        exchange: payload.exchange,
        capital: payload.capital,
        params: payload.config,
      } as any,
      exchangeConfig: {
        apiKey: '',
        apiSecret: '',
        passphrase: '',
        testnet: true,
        sandbox: true,
        rateLimitMs: 100,
      },
      mode: 'paper',
    };

    await manager.createBot(botConfig);

    return { ok: true, data: { id: payload.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create bot' };
  }
}