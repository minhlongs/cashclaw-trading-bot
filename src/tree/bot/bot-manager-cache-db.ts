// Bot Manager Cache — D1 queries with anti-IDOR scoping and cache fallback
// Extracted from bot-manager-cache.ts for size and responsibility compliance.

import { createLogger } from '@/lib/logger';
import { createServerClient } from '@/lib/db/client';
import { findBotById, findAllBots, findBotsByUser } from '@/lib/db/repositories';
import { restoreBotStateFromRow } from '@/forest/bot/d1-hydration';
import type { BotConfig } from './types';
import type { BotInstance } from './bot-instance';
import type { BotFactoryDelegate } from './bot-manager-types';
import { hydrateFromRowIfNeeded } from './bot-manager-cache-hydrate';
import type { BotManagerCacheState } from './bot-manager-cache-state';

const log = createLogger('bot-manager-cache');

export class BotManagerCacheDb {
  constructor(
    private state: BotManagerCacheState,
    private factory: BotFactoryDelegate,
    private onError?: (error: Error, context: string) => void,
  ) {}

  async getAllBots(userId?: string): Promise<BotInstance[]> {
    const effectiveUserId = userId ?? this.state.effectiveDefaultUserId;
    const db = createServerClient();
    if (!db) return this.state.getCachedBots(effectiveUserId);
    try {
      const rows = effectiveUserId ? await findBotsByUser(db, effectiveUserId) : await findAllBots(db);
      return rows.map((row) => hydrateFromRowIfNeeded(row, this.state, this.factory));
    } catch (error) {
      log.warn('D1 read failed for getAllBots, falling back to cache', {
        action: 'getAllBots',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return this.state.getCachedBots(effectiveUserId);
    }
  }

  async getRunningBots(userId?: string): Promise<BotInstance[]> {
    const effectiveUserId = userId ?? this.state.effectiveDefaultUserId;
    const db = createServerClient();
    if (!db) return this.state.getCachedRunningBots(effectiveUserId);
    try {
      const rows = effectiveUserId ? await findBotsByUser(db, effectiveUserId) : await findAllBots(db);
      return rows
        .filter((r) => r.status === 'paper_test' || r.status === 'live_running')
        .map((row) => hydrateFromRowIfNeeded(row, this.state, this.factory));
    } catch (error) {
      log.warn('D1 read failed for getRunningBots, falling back to cache', {
        action: 'getRunningBots',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return this.state.getCachedRunningBots(effectiveUserId);
    }
  }

  async getOrCreateBot(id: string, userId?: string): Promise<BotInstance | null> {
    const effectiveUserId = userId ?? this.state.effectiveDefaultUserId;
    const cached = this.state.get(id);
    if (effectiveUserId && cached && cached.userId && cached.userId !== effectiveUserId) return null;
    if (cached && cached.expiresAt > Date.now()) return cached.bot;

    const db = createServerClient();
    if (!db) return null;
    const row = await findBotById(db, id);
    if (!row) return null;
    if (effectiveUserId && row.user_id !== effectiveUserId) {
      log.warn('Unauthorized bot access attempt blocked', {
        action: 'getOrCreateBot',
        botId: id,
        ownerId: row.user_id,
        requestingUser: effectiveUserId,
      });
      return null;
    }
    try {
      const config = JSON.parse(row.config_json) as BotConfig;
      const bot = await this.factory.createBot(
        {
          id: row.id,
          config,
          exchangeConfig: { apiKey: '', apiSecret: '', testnet: true, sandbox: true, rateLimitMs: 100 },
          mode: 'paper',
        },
        row.user_id,
      );
      restoreBotStateFromRow(bot, row);
      return bot;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.onError?.(error, `bot-manager:getOrCreateBot:${id}`);
      return null;
    }
  }
}
