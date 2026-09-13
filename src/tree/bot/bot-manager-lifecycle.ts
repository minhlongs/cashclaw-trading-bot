// Bot Manager Lifecycle — state transitions and fail-safe D1 persistence
// Extracted from bot-manager.ts for size and responsibility compliance.

import { createLogger } from '@/lib/logger';
import { patchBot } from '@/forest/bot/d1-adapter';
import type { BotInstance } from './bot-instance';
import type { Killswitch } from './killswitch';
import type { BotManagerCache } from './bot-manager-cache';
import { toD1Status } from './bot-manager-types';

const log = createLogger('bot-manager-lifecycle');

export class BotManagerLifecycle {
  constructor(
    private cache: BotManagerCache,
    private killswitch: Killswitch,
    private defaultUserId?: string,
  ) {}

  getCachedBotOrThrow(id: string, userId?: string): BotInstance {
    const effectiveUserId = userId ?? this.defaultUserId;
    const cached = this.cache.get(id);
    if (!cached) throw new Error(`Bot not found: ${id}`);
    if (effectiveUserId && cached.userId && cached.userId !== effectiveUserId) {
      throw new Error(`Unauthorized access to bot: ${id}`);
    }
    return cached.bot;
  }

  async startBot(id: string, userId?: string): Promise<void> {
    const bot = this.getCachedBotOrThrow(id, userId);
    await bot.start();
  }

  pauseBot(id: string, userId?: string): void {
    const effectiveUserId = userId ?? this.defaultUserId;
    const bot = this.getCachedBotOrThrow(id, effectiveUserId);
    bot.pause();
    if (effectiveUserId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  resumeBot(id: string, userId?: string): void {
    const effectiveUserId = userId ?? this.defaultUserId;
    const bot = this.getCachedBotOrThrow(id, effectiveUserId);
    if (!this.killswitch.isTradingEnabled()) {
      throw new Error('Cannot resume: killswitch is halted');
    }
    bot.resume();
    if (effectiveUserId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  stopBot(id: string, userId?: string): void {
    const effectiveUserId = userId ?? this.defaultUserId;
    const bot = this.getCachedBotOrThrow(id, effectiveUserId);
    bot.stop();
    if (effectiveUserId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  removeBot(id: string, userId?: string): void {
    const effectiveUserId = userId ?? this.defaultUserId;
    const cached = this.cache.get(id);
    if (cached) {
      if (effectiveUserId && cached.userId && cached.userId !== effectiveUserId) {
        throw new Error(`Unauthorized access to bot: ${id}`);
      }
      cached.bot.destroy();
      this.cache.delete(id);
      if (effectiveUserId) {
        this.patchBotSafe(id, { status: 'stopped', total_pnl: 0 });
      }
    }
  }

  private patchBotSafe(id: string, fields: Record<string, unknown>): void {
    patchBot(id, fields).catch((error) => {
      log.error(`D1 persist failed for ${id}`, error instanceof Error ? error : new Error(String(error)), { action: 'patchBot' });
    });
  }
}
