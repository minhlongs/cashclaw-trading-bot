// Bot Manager Cache — state primitives (in-memory Map + TTL)
// Extracted from bot-manager-cache.ts for size and responsibility compliance.

import type { BotInstance } from './bot-instance';
import type { CachedBot, BotFactoryDelegate } from './bot-manager-types';

const BOT_CACHE_TTL_MS = 30_000;

export class BotManagerCacheState {
  protected bots = new Map<string, CachedBot>();
  protected defaultUserId?: string;
  protected factory!: BotFactoryDelegate;
  protected onError?: (error: Error, context: string) => void;

  constructor(defaultUserId?: string, onError?: (error: Error, context: string) => void) {
    this.defaultUserId = defaultUserId;
    this.onError = onError;
  }

  setFactory(factory: BotFactoryDelegate): void { this.factory = factory; }

  get effectiveDefaultUserId(): string | undefined { return this.defaultUserId; }

  cacheBot(bot: BotInstance, userId?: string): void {
    this.bots.set(bot.id, {
      bot,
      expiresAt: Date.now() + BOT_CACHE_TTL_MS,
      userId: userId ?? this.defaultUserId,
    });
  }

  has(id: string): boolean { return this.bots.has(id); }

  get(id: string): CachedBot | undefined { return this.bots.get(id); }

  delete(id: string): boolean { return this.bots.delete(id); }

  getBotIds(): string[] { return Array.from(this.bots.keys()); }

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

  stopAll(): void { for (const [, c] of this.bots) c.bot.stop(); }

  destroy(): void {
    for (const [, c] of this.bots) c.bot.destroy();
    this.bots.clear();
  }
}
