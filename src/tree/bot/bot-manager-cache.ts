// Bot Manager Cache — in-memory bot caching with TTL and D1 hydration
// Extracted from bot-manager.ts for size and responsibility compliance.

import { createLogger } from '@/lib/logger';
import { createServerClient } from '@/lib/db/client';
import { findBotById, findAllBots, findBotsByUser } from '@/lib/db/repositories';
import { restoreBotStateFromRow } from '@/forest/bot/d1-hydration';
import type { Bot } from '@/lib/db/types';
import type { BotConfig } from './types';
import type { BotInstance } from './bot-instance';
import type { CachedBot, BotFactoryDelegate } from './bot-manager-types';
import { defaultConfigFromRow } from './bot-manager-helpers';

const log = createLogger('bot-manager-cache');
const BOT_CACHE_TTL_MS = 30_000;

export class BotManagerCache {
  private bots = new Map<string, CachedBot>();
  private defaultUserId?: string;
  private factory!: BotFactoryDelegate;
  private onError?: (error: Error, context: string) => void;

  constructor(defaultUserId?: string, onError?: (error: Error, context: string) => void) {
    this.defaultUserId = defaultUserId;
    this.onError = onError;
  }

  setFactory(factory: BotFactoryDelegate): void { this.factory = factory; }

  getBot(id: string, userId?: string): BotInstance | undefined {
    const effectiveUserId = userId ?? this.defaultUserId;
    const cached = this.bots.get(id);
    if (!cached || (effectiveUserId && cached.userId && cached.userId !== effectiveUserId)) return undefined;
    return cached.bot;
  }

  async getAllBots(userId?: string): Promise<BotInstance[]> {
    const effectiveUserId = userId ?? this.defaultUserId;
    const db = createServerClient();
    if (!db) return this.getCachedBots(effectiveUserId);
    try {
      const rows = effectiveUserId ? await findBotsByUser(db, effectiveUserId) : await findAllBots(db);
      return rows.map((row) => this.hydrateFromRowIfNeeded(row));
    } catch (error) {
      log.warn('D1 read failed for getAllBots, falling back to cache', { action: 'getAllBots', error: error instanceof Error ? error : new Error(String(error)) });
      return this.getCachedBots(effectiveUserId);
    }
  }

  async getRunningBots(userId?: string): Promise<BotInstance[]> {
    const effectiveUserId = userId ?? this.defaultUserId;
    const db = createServerClient();
    if (!db) return this.getCachedRunningBots(effectiveUserId);
    try {
      const rows = effectiveUserId ? await findBotsByUser(db, effectiveUserId) : await findAllBots(db);
      return rows.filter((r) => r.status === 'paper_test' || r.status === 'live_running').map((row) => this.hydrateFromRowIfNeeded(row));
    } catch (error) {
      log.warn('D1 read failed for getRunningBots, falling back to cache', { action: 'getRunningBots', error: error instanceof Error ? error : new Error(String(error)) });
      return this.getCachedRunningBots(effectiveUserId);
    }
  }

  getCachedBots(userId?: string): BotInstance[] {
    const now = Date.now();
    const result: BotInstance[] = [];
    for (const [, cached] of this.bots) {
      if (userId && cached.userId && cached.userId !== userId) continue;
      if (cached.expiresAt > now) result.push(cached.bot);
    }
    return result;
  }

  getCachedRunningBots(userId?: string): BotInstance[] {
    return this.getCachedBots(userId).filter((b) => b.getSnapshot().status === 'running');
  }

  hydrateFromRowIfNeeded(row: Bot): BotInstance {
    const cached = this.bots.get(row.id);
    if (cached && cached.expiresAt > Date.now()) return cached.bot;
    try {
      const config = JSON.parse(row.config_json) as BotConfig;
      const instance = this.factory.createBotSync({ id: row.id, config }, row.user_id);
      this.cacheBot(instance, row.user_id);
      restoreBotStateFromRow(instance, row);
      return instance;
    } catch (error) {
      log.warn('Failed to hydrate bot from D1 row', { action: 'hydrateFromRowIfNeeded', botId: row.id, error: error instanceof Error ? error : new Error(String(error)) });
      const fallback = cached?.bot ?? this.factory.createBotSync({ id: row.id, config: defaultConfigFromRow(row) }, row.user_id);
      this.cacheBot(fallback, row.user_id);
      return fallback;
    }
  }

  async getOrCreateBot(id: string, userId?: string): Promise<BotInstance | null> {
    const effectiveUserId = userId ?? this.defaultUserId;
    const cached = this.bots.get(id);
    if (effectiveUserId && cached && cached.userId && cached.userId !== effectiveUserId) return null;
    if (cached && cached.expiresAt > Date.now()) return cached.bot;

    const db = createServerClient();
    if (!db) return null;
    const row = await findBotById(db, id);
    if (!row) return null;
    if (effectiveUserId && row.user_id !== effectiveUserId) {
      log.warn('Unauthorized bot access attempt blocked', { action: 'getOrCreateBot', botId: id, ownerId: row.user_id, requestingUser: effectiveUserId });
      return null;
    }
    try {
      const config = JSON.parse(row.config_json) as BotConfig;
      const bot = await this.factory.createBot({
        id: row.id, config,
        exchangeConfig: { apiKey: '', apiSecret: '', testnet: true, sandbox: true, rateLimitMs: 100 },
        mode: 'paper',
      }, row.user_id);
      restoreBotStateFromRow(bot, row);
      return bot;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.onError?.(error, `bot-manager:getOrCreateBot:${id}`);
      return null;
    }
  }

  cacheBot(bot: BotInstance, userId?: string): void {
    this.bots.set(bot.id, { bot, expiresAt: Date.now() + BOT_CACHE_TTL_MS, userId: userId ?? this.defaultUserId });
  }

  has(id: string): boolean { return this.bots.has(id); }
  get(id: string): CachedBot | undefined { return this.bots.get(id); }
  delete(id: string): boolean { return this.bots.delete(id); }
  getBotIds(): string[] { return Array.from(this.bots.keys()); }
  stopAll(): void { for (const [, c] of this.bots) c.bot.stop(); }
  destroy(): void {
    for (const [, c] of this.bots) c.bot.destroy();
    this.bots.clear();
  }
}
