// Bot Manager — singleton orchestrator for all bot instances
// Types extracted to bot-manager-types.ts, helpers to bot-manager-helpers.ts.

import type { ExchangeAdapter, ExchangeId } from '../exchange/types';
import { toD1Status, type ExchangeOrchestrator, type BotManagerDependencies, type CreateBotRequest } from './bot-manager-types';
export type { ExchangeOrchestrator, BotManagerDependencies, CreateBotRequest } from './bot-manager-types';

import type { TelemetryWriter, TradeEventType } from '../telemetry';
import { Killswitch } from './killswitch';
import { BotInstance } from './bot-instance';

import { patchBot } from '@/forest/bot/d1-adapter';
import { createD1Callbacks, persistNewBot, defaultConfigFromRow } from './bot-manager-helpers';
import { createLogger } from '@/lib/logger';
import { createPaperAdapter } from './paper-adapter';
import { RequestQueue, QueuedExchangeAdapter } from '../exchange/queue';
import { createServerClient } from '@/lib/db/client';
import { findBotById, findAllBots, findBotsByUser } from '@/lib/db/repositories';
import { restoreBotStateFromRow } from '@/forest/bot/d1-hydration';
import type { BotConfig } from './types';
import type { Bot } from '@/lib/db/types';

const log = createLogger('bot-manager');

// TTL for the in-memory bot cache. D1 is the source of truth; this cache is a
// short-lived hot-path optimization that survives Workers cold starts only
// for the lifetime of the current isolate.
const BOT_CACHE_TTL_MS = 30_000;

interface CachedBot {
  bot: BotInstance;
  expiresAt: number;
  userId?: string;
}

export class BotManager {
  private bots = new Map<string, CachedBot>();
  private exchanges = new Map<string, ExchangeAdapter>();
  private queues = new Map<string, RequestQueue>();
  private killswitch: Killswitch;
  private deps: Omit<Required<BotManagerDependencies>, 'telemetry' | 'userId' | 'getOrchestrator'> & { telemetry?: TelemetryWriter; userId?: string; getOrchestrator?: () => ExchangeOrchestrator | null };

  constructor(deps: BotManagerDependencies = {}) {
    this.deps = {
      onLog: deps.onLog ?? (() => {}),
      onError: deps.onError ?? (() => {}),
      onBotEvent: deps.onBotEvent ?? (() => {}),
      telemetry: deps.telemetry,
      userId: deps.userId,
      getOrchestrator: deps.getOrchestrator,
    };

    this.killswitch = new Killswitch(
      {
        onHalt: (reason) => {
          this.deps.onLog(`KILLSWITCH HALT: ${reason}`);
          this.emitTelemetry('halt', { reason });
          // Stop all cached bots synchronously (D1 is the source of truth;
          // onHalt must be synchronous and fire immediately).
          for (const [, cached] of this.bots) {
            cached.bot.stop();
          }
        },
        onResume: () => {
          this.deps.onLog('Killswitch resumed');
          this.emitTelemetry('resume', {});
        },
        onOrderPlaced: () => {},
        onOrderFilled: () => {},
        onError: (e, ctx) => this.deps.onError(e, ctx),
        onDailyStateChange: (daily) => {
          import('@/forest/settings/actions').then(({ saveKillswitchDailyState }) => {
            saveKillswitchDailyState(daily);
          }).catch((error) => {
            log.error('Failed to persist killswitch daily state', error instanceof Error ? error : new Error(String(error)), { action: 'onDailyStateChange' });
          });
        },
      },
      {
        maxDailyLossPct: 10,
        maxConsecutiveLosses: 5,
        maxDrawdownPct: 15,
        cooldownMinutes: 30,
      },
    );
  }

  getKillswitch(): Killswitch {
    return this.killswitch;
  }

  /**
   * Get a bot by ID. Checks the in-memory cache first (TTL 30s); on miss,
   * reads D1 directly. Returns undefined if not found in D1 or DB unavailable.
   * D1 is the source of truth — the cache is a hot-path optimization only.
   */
  getBot(id: string, userId?: string): BotInstance | undefined {
    const effectiveUserId = userId ?? this.deps.userId;
    const cached = this.bots.get(id);
    if (!cached) return undefined;
    if (effectiveUserId && cached.userId && cached.userId !== effectiveUserId) {
      return undefined;
    }
    if (cached.expiresAt > Date.now()) {
      return cached.bot;
    }
    return cached.bot;
  }

  /**
   * Get all bots. Reads D1 directly (source of truth), then merges any
   * in-memory cached instances that haven't expired.
   * Returns D1-hydrated bots; full BotInstance objects come from the cache.
   */
  async getAllBots(userId?: string): Promise<BotInstance[]> {
    const effectiveUserId = userId ?? this.deps.userId;
    const db = createServerClient();
    if (!db) return this.getCachedBots(effectiveUserId);
    try {
      const rows = effectiveUserId
        ? await findBotsByUser(db, effectiveUserId)
        : await findAllBots(db);
      return rows.map((row) => this.hydrateFromRowIfNeeded(row));
    } catch (error) {
      log.warn('D1 read failed for getAllBots, falling back to cache', { action: 'getAllBots', error: error instanceof Error ? error : new Error(String(error)) });
      return this.getCachedBots(effectiveUserId);
    }
  }

  /**
   * Get all running bots. Reads D1 directly for rows with running status,
   * then hydrates each into a BotInstance (using cache when fresh).
   */
  async getRunningBots(userId?: string): Promise<BotInstance[]> {
    const effectiveUserId = userId ?? this.deps.userId;
    const db = createServerClient();
    if (!db) return this.getCachedRunningBots(effectiveUserId);
    try {
      const rows = effectiveUserId
        ? await findBotsByUser(db, effectiveUserId)
        : await findAllBots(db);
      const runningRows = rows.filter((r) => r.status === 'paper_test' || r.status === 'live_running');
      return runningRows.map((row) => this.hydrateFromRowIfNeeded(row));
    } catch (error) {
      log.warn('D1 read failed for getRunningBots, falling back to cache', { action: 'getRunningBots', error: error instanceof Error ? error : new Error(String(error)) });
      return this.getCachedRunningBots(effectiveUserId);
    }
  }

  /** Get all cached bots (only unexpired entries, scoped to user if provided). */
  private getCachedBots(userId?: string): BotInstance[] {
    const now = Date.now();
    const result: BotInstance[] = [];
    for (const [, cached] of this.bots) {
      if (userId && cached.userId && cached.userId !== userId) continue;
      if (cached.expiresAt > now) result.push(cached.bot);
    }
    return result;
  }

  /** Get cached running bots (only unexpired entries, scoped to user if provided). */
  private getCachedRunningBots(userId?: string): BotInstance[] {
    return this.getCachedBots(userId).filter((b) => b.getSnapshot().status === 'running');
  }

  /**
   * Hydrate a D1 row into a BotInstance if not already cached (or expired).
   * Returns the cached instance when fresh, otherwise creates + caches a new one.
   */
  private hydrateFromRowIfNeeded(row: Bot): BotInstance {
    const cached = this.bots.get(row.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.bot;
    }
    try {
      const config = JSON.parse(row.config_json) as BotConfig;
      const instance = this.createBotSync({ id: row.id, config }, row.user_id);
      this.cacheBot(instance, row.user_id);
      restoreBotStateFromRow(instance, row);
      return instance;
    } catch (error) {
      log.warn('Failed to hydrate bot from D1 row', { action: 'hydrateFromRowIfNeeded', botId: row.id, error: error instanceof Error ? error : new Error(String(error)) });
      const fallback = cached?.bot ?? this.createBotSync({ id: row.id, config: defaultConfigFromRow(row) }, row.user_id);
      this.cacheBot(fallback, row.user_id);
      return fallback;
    }
  }

  /** Add/update a bot in the in-memory cache with TTL. */
  private cacheBot(bot: BotInstance, userId?: string): void {
    this.bots.set(bot.id, {
      bot,
      expiresAt: Date.now() + BOT_CACHE_TTL_MS,
      userId: userId ?? this.deps.userId,
    });
  }

  /**
   * Synchronous bot creation (no D1 persistence) for cache hydration.
   * The async createBot() is the public API that also persists.
   */
  private createBotSync(req: { id: string; config: BotConfig }, userId?: string): BotInstance {
    if (this.bots.has(req.id)) {
      const cached = this.bots.get(req.id);
      if (cached && cached.expiresAt > Date.now()) return cached.bot;
    }
    const exchangeId = (req.config.exchange ?? 'binance') as ExchangeId;
    const modeKey = `paper:${exchangeId}`;
    let exchange = this.exchanges.get(modeKey);
    if (!exchange) {
      const paperRaw = createPaperAdapter(req.config.capital);
      const raw = Object.assign(paperRaw, { id: exchangeId, name: `${exchangeId}-paper` });
      let queue = this.queues.get(exchangeId);
      if (!queue) {
        queue = new RequestQueue();
        this.queues.set(exchangeId, queue);
      }
      exchange = new QueuedExchangeAdapter({ inner: raw, queue });
      this.exchanges.set(modeKey, exchange);
    }
    const bot = new BotInstance(req.id, req.config, {
      exchange,
      killswitch: this.killswitch,
      exchangeOrchestrator: this.deps.getOrchestrator?.() ?? undefined,
    }, createD1Callbacks({
      botId: req.id,
      userId: userId ?? this.deps.userId ?? '',
      config: req.config,
      capital: req.config.capital,
      onLog: this.deps.onLog,
      onError: this.deps.onError,
      onBotEvent: this.deps.onBotEvent,
      emitTelemetry: (type, details) => this.emitTelemetry(type, details),
    }));
    return bot;
  }

  /**
   * Get or create a bot instance with lazy single-bot hydration from D1.
   * Returns existing bot from memory if present, otherwise queries D1 and hydrates.
   * Returns null if bot not found in D1 or DB unavailable.
   */
  async getOrCreateBot(id: string, userId?: string): Promise<BotInstance | null> {
    const effectiveUserId = userId ?? this.deps.userId;
    // Return existing bot from cache if fresh and matching user
    const cached = this.bots.get(id);
    if (effectiveUserId && cached && cached.userId && cached.userId !== effectiveUserId) {
      return null;
    }
    if (cached && cached.expiresAt > Date.now()) return cached.bot;

    // Query D1 for the bot row
    const db = createServerClient();
    if (!db) return null;

    const row = await findBotById(db, id);
    if (!row) return null;

    // IDOR defense: reject cross-user access if manager/call is user-scoped
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
      const bot = await this.createBot({
        id: row.id,
        config,
        exchangeConfig: {
          apiKey: '',
          apiSecret: '',
          testnet: true,
          sandbox: true,
          rateLimitMs: 100,
        },
        mode: 'paper',
      }, row.user_id);

      // Restore state from D1 row
      restoreBotStateFromRow(bot, row);
      return bot;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.onError?.(error, `bot-manager:getOrCreateBot:${id}`);
      return null;
    }
  }

  async createBot(req: CreateBotRequest, userId?: string): Promise<BotInstance> {
    if (this.bots.has(req.id)) {
      throw new Error(`Bot already exists: ${req.id}`);
    }

    const effectiveUserId = userId ?? this.deps.userId;
    const exchangeId = (req.config.exchange ?? 'binance') as ExchangeId;
    const modeKey = `${req.mode}:${exchangeId}`;
    let exchange = this.exchanges.get(modeKey);

    if (!exchange) {
      // Create base adapter based on mode
      let raw: ExchangeAdapter;
      if (req.mode === 'paper') {
        const paperRaw = createPaperAdapter(req.config.capital);
        raw = Object.assign(paperRaw, { id: exchangeId, name: `${exchangeId}-paper` });
      } else {
        throw new Error(
          'Live trading not available — this system is paper/backtest only. ' +
          'See docs/DEPLOYMENT-SAFETY.md',
        );
      }

      // Wrap with cost-aware queue for budget tracking
      let queue = this.queues.get(exchangeId);
      if (!queue) {
        queue = new RequestQueue();
        this.queues.set(exchangeId, queue);
      }
      exchange = new QueuedExchangeAdapter({ inner: raw, queue });
      this.exchanges.set(modeKey, exchange);
    }

    const callbacks = createD1Callbacks({
      botId: req.id,
      userId: effectiveUserId ?? '',
      config: req.config,
      capital: req.config.capital,
      onLog: this.deps.onLog,
      onError: this.deps.onError,
      onBotEvent: this.deps.onBotEvent,
      emitTelemetry: (type, details) => this.emitTelemetry(type, details),
    });

    const bot = new BotInstance(req.id, req.config, {
      exchange,
      killswitch: this.killswitch,
      exchangeOrchestrator: this.deps.getOrchestrator?.() ?? undefined,
    }, callbacks);
    this.cacheBot(bot, effectiveUserId);

    if (effectiveUserId) {
      persistNewBot({
        botId: req.id,
        userId: effectiveUserId,
        config: req.config,
        capital: req.config.capital,
        onLog: this.deps.onLog,
        onError: this.deps.onError,
      });
    }

    this.deps.onLog(`Bot ${req.id} created (${req.config.strategy}, ${req.config.symbol}, ${req.mode})`);
    return bot;
  }

  /** Get a cached BotInstance or throw. Used by synchronous lifecycle methods. */
  private getCachedBotOrThrow(id: string, userId?: string): BotInstance {
    const effectiveUserId = userId ?? this.deps.userId;
    const cached = this.bots.get(id);
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
    const effectiveUserId = userId ?? this.deps.userId;
    const bot = this.getCachedBotOrThrow(id, effectiveUserId);
    bot.pause();
    // Persist status to D1
    if (effectiveUserId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  resumeBot(id: string, userId?: string): void {
    const effectiveUserId = userId ?? this.deps.userId;
    const bot = this.getCachedBotOrThrow(id, effectiveUserId);
    if (!this.killswitch.isTradingEnabled()) {
      throw new Error('Cannot resume: killswitch is halted');
    }
    bot.resume();
    // Persist status to D1
    if (effectiveUserId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  stopBot(id: string, userId?: string): void {
    const effectiveUserId = userId ?? this.deps.userId;
    const bot = this.getCachedBotOrThrow(id, effectiveUserId);
    bot.stop();
    // Persist status to D1
    if (effectiveUserId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  removeBot(id: string, userId?: string): void {
    const effectiveUserId = userId ?? this.deps.userId;
    const cached = this.bots.get(id);
    if (cached) {
      if (effectiveUserId && cached.userId && cached.userId !== effectiveUserId) {
        throw new Error(`Unauthorized access to bot: ${id}`);
      }
      cached.bot.destroy();
      this.bots.delete(id);
      // Persist status to D1 (mark as stopped/deleted)
      if (effectiveUserId) {
        this.patchBotSafe(id, { status: 'stopped', total_pnl: 0 });
      }
    }
  }

  resetKillswitch(): void {
    this.killswitch.reset();
    this.deps.onLog('Killswitch reset');
  }

  private patchBotSafe(id: string, fields: Record<string, unknown>): void {
    patchBot(id, fields).catch((error) => {
      log.error(`D1 persist failed for ${id}`, error instanceof Error ? error : new Error(String(error)), { action: 'patchBot' });
    });
  }

  private emitTelemetry(eventType: TradeEventType, details: Record<string, unknown> = {}): void {
    // emit for all bots on global killswitch events
    for (const [botId] of this.bots) {
      this.deps.telemetry?.emit(botId, eventType, details);
    }
  }

  manualHalt(reason: string): void {
    this.killswitch.manualHalt(reason);
  }

  manualResume(): void {
    this.killswitch.manualResume();
  }

  destroy(): void {
    for (const [, cached] of this.bots) {
      cached.bot.destroy();
    }
    this.bots.clear();
    this.exchanges.clear();
    this.queues.clear();
  }

  /** Drain all exchange queues — called by Scheduler after tick cycle */
  async drainQueues(): Promise<Record<string, { processed: number; skipped: number; pending: number }>> {
    const results: Record<string, { processed: number; skipped: number; pending: number }> = {};
    for (const [exchange, queue] of this.queues) {
      const drainResult = await queue.drain(exchange as ExchangeId, async (item) => {
        try {
          await item.execute();
          return true;
        } catch {
          return false;
        }
      });
      results[exchange] = {
        processed: drainResult.processed,
        skipped: drainResult.skipped,
        pending: drainResult.pending,
      };
    }
    return results;
  }
}

// Singleton
let manager: BotManager | null = null;
export function getBotManager(deps?: BotManagerDependencies): BotManager {
  if (!manager) {
    manager = new BotManager(deps);
  }
  return manager;
}

export function resetBotManager(): void {
  manager?.destroy();
  manager = null;
}