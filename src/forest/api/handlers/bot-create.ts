/**
 * POST /api/bots — create a new bot
 * Persists bot config to D1 and creates BotInstance in memory.
 */

import { getBotManager, type CreateBotRequest } from '@/tree/bot';

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
    const manager = getBotManager();

    // Map payload to CreateBotRequest
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
      mode: payload.mode ?? 'paper',
    };

    await manager.createBot(botConfig);

    return { ok: true, data: { id: payload.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create bot' };
  }
}