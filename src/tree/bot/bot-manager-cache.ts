// Bot Manager Cache — in-memory bot caching with TTL and D1 hydration
// Facade composing bot-manager-cache-state, bot-manager-cache-db, bot-manager-cache-hydrate.

import type { Bot } from '@/lib/db/types';
import type { BotInstance } from './bot-instance';
import type { CachedBot, BotFactoryDelegate } from './bot-manager-types';
import { BotManagerCacheState } from './bot-manager-cache-state';
import { BotManagerCacheDb } from './bot-manager-cache-db';
import { hydrateFromRowIfNeeded } from './bot-manager-cache-hydrate';

export type { CachedBot, BotFactoryDelegate };

export class BotManagerCache {
  private state: BotManagerCacheState;
  private db: BotManagerCacheDb;
  private factory!: BotFactoryDelegate;

  constructor(defaultUserId?: string, onError?: (error: Error, context: string) => void) {
    this.state = new BotManagerCacheState(defaultUserId, onError);
    this.db = new BotManagerCacheDb(this.state, this.factoryProxy, onError);
  }

  private factoryProxy: BotFactoryDelegate = {
    createBotSync: (req, userId) => this.factory.createBotSync(req, userId),
    createBot: (req, userId) => this.factory.createBot(req, userId),
  };

  setFactory(factory: BotFactoryDelegate): void {
    this.factory = factory;
    this.state.setFactory(factory);
  }

  getBot(id: string, userId?: string): BotInstance | undefined {
    const effectiveUserId = userId ?? this.state.effectiveDefaultUserId;
    const cached = this.state.get(id);
    if (!cached || (effectiveUserId && cached.userId && cached.userId !== effectiveUserId)) return undefined;
    return cached.bot;
  }

  async getAllBots(userId?: string): Promise<BotInstance[]> {
    return this.db.getAllBots(userId);
  }

  async getRunningBots(userId?: string): Promise<BotInstance[]> {
    return this.db.getRunningBots(userId);
  }

  getCachedBots(userId?: string): BotInstance[] {
    return this.state.getCachedBots(userId);
  }

  getCachedRunningBots(userId?: string): BotInstance[] {
    return this.state.getCachedRunningBots(userId);
  }

  hydrateFromRowIfNeeded(row: Bot): BotInstance {
    return hydrateFromRowIfNeeded(row, this.state, this.factoryProxy);
  }

  async getOrCreateBot(id: string, userId?: string): Promise<BotInstance | null> {
    return this.db.getOrCreateBot(id, userId);
  }

  cacheBot(bot: BotInstance, userId?: string): void {
    this.state.cacheBot(bot, userId);
  }

  has(id: string): boolean { return this.state.has(id); }
  get(id: string): CachedBot | undefined { return this.state.get(id); }
  delete(id: string): boolean { return this.state.delete(id); }
  getBotIds(): string[] { return this.state.getBotIds(); }
  stopAll(): void { this.state.stopAll(); }
  destroy(): void { this.state.destroy(); }
}