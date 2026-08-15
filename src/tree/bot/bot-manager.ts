// Bot Manager — singleton orchestrator for all bot instances
// Types extracted to bot-manager-types.ts, helpers to bot-manager-helpers.ts.

import type { ExchangeAdapter, ExchangeConfig, ExchangeId } from '../exchange/types';
import type { BotConfig, BotStatus } from './types';
import type { TradeEventType } from '../telemetry/types';
import { Killswitch } from './killswitch';
import { BotInstance } from './bot-instance';
import type { TelemetryWriter } from '../telemetry';
import { patchBot } from '@/forest/bot/d1-adapter';
import { createD1Callbacks, persistNewBot } from './bot-manager-helpers';
import { createServerClient } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import { createPaperAdapter } from './paper-adapter';
import { RequestQueue, QueuedExchangeAdapter } from '../exchange/queue';
import { LiveExchange } from '../exchange/live';

const log = createLogger('bot-manager');
import { toD1Status, type BotManagerDependencies, type CreateBotRequest, type D1BotStatus } from './bot-manager-types';
export type { BotManagerDependencies, CreateBotRequest, D1BotStatus } from './bot-manager-types';

export class BotManager {
  private bots = new Map<string, BotInstance>();
  private exchanges = new Map<string, ExchangeAdapter>();
  private queues = new Map<string, RequestQueue>();
  private killswitch: Killswitch;
  private deps: Omit<Required<BotManagerDependencies>, 'telemetry' | 'userId'> & { telemetry?: TelemetryWriter; userId?: string };

  constructor(deps: BotManagerDependencies = {}) {
    this.deps = {
      onLog: deps.onLog ?? (() => {}),
      onError: deps.onError ?? (() => {}),
      onBotEvent: deps.onBotEvent ?? (() => {}),
      telemetry: deps.telemetry,
      userId: deps.userId,
    };

    this.killswitch = new Killswitch(
      {
        onHalt: (reason) => {
          this.deps.onLog(`KILLSWITCH HALT: ${reason}`);
          this.emitTelemetry('halt', { reason });
          this.getAllBots().forEach(bot => bot.stop());
        },
        onResume: () => {
          this.deps.onLog('Killswitch resumed');
          this.emitTelemetry('resume', {});
        },
        onOrderPlaced: () => {},
        onOrderFilled: () => {},
        onError: (e, ctx) => this.deps.onError(e, ctx),
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

  getBot(id: string): BotInstance | undefined {
    return this.bots.get(id);
  }

  getAllBots(): BotInstance[] {
    return Array.from(this.bots.values());
  }

  getRunningBots(): BotInstance[] {
    return this.getAllBots().filter((b) => b.getSnapshot().status === 'running');
  }

  async createBot(req: CreateBotRequest): Promise<BotInstance> {
    if (this.bots.has(req.id)) {
      throw new Error(`Bot already exists: ${req.id}`);
    }

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
        raw = new LiveExchange(exchangeId, req.exchangeConfig, {
          isTradingEnabled: () => this.killswitch.isTradingEnabled(),
          onOrderPlaced: (order) => this.killswitch.onOrderPlaced(order),
          onOrderFilled: (order) => this.killswitch.onOrderFilled(order),
          onError: (error, context) => this.deps.onError(error, context),
        });
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
      userId: this.deps.userId ?? '',
      config: req.config,
      capital: req.config.capital,
      onLog: this.deps.onLog,
      onError: this.deps.onError,
      onBotEvent: this.deps.onBotEvent,
      emitTelemetry: (type, details) => this.emitTelemetry(type, details),
    });

    const bot = new BotInstance(req.id, req.config, { exchange, killswitch: this.killswitch }, callbacks);
    this.bots.set(req.id, bot);

    if (this.deps.userId) {
      persistNewBot({
        botId: req.id,
        userId: this.deps.userId,
        config: req.config,
        capital: req.config.capital,
        onLog: this.deps.onLog,
        onError: this.deps.onError,
      });
    }

    this.deps.onLog(`Bot ${req.id} created (${req.config.strategy}, ${req.config.symbol}, ${req.mode})`);
    return bot;
  }

  async startBot(id: string): Promise<void> {
    const bot = this.bots.get(id);
    if (!bot) throw new Error(`Bot not found: ${id}`);
    await bot.start();
  }

  pauseBot(id: string): void {
    const bot = this.bots.get(id);
    if (!bot) throw new Error(`Bot not found: ${id}`);
    bot.pause();
    // Persist status to D1
    if (this.deps.userId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  resumeBot(id: string): void {
    const bot = this.bots.get(id);
    if (!bot) throw new Error(`Bot not found: ${id}`);
    if (!this.killswitch.isTradingEnabled()) {
      throw new Error('Cannot resume: killswitch is halted');
    }
    bot.resume();
    // Persist status to D1
    if (this.deps.userId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  stopBot(id: string): void {
    const bot = this.bots.get(id);
    if (!bot) throw new Error(`Bot not found: ${id}`);
    bot.stop();
    // Persist status to D1
    if (this.deps.userId) {
      const state = bot.getSnapshot();
      this.patchBotSafe(id, { status: toD1Status(state.status), total_pnl: state.totalPnl });
    }
  }

  removeBot(id: string): void {
    const bot = this.bots.get(id);
    if (bot) {
      bot.destroy();
      this.bots.delete(id);
      // Persist status to D1 (mark as stopped/deleted)
      if (this.deps.userId) {
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
    for (const [, bot] of this.bots) {
      bot.destroy();
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

