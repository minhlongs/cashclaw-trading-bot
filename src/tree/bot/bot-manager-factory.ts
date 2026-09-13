// Bot Manager Factory — exchange adapter pool, queues, and bot creation
// Extracted from bot-manager.ts for size and responsibility compliance.

import type { ExchangeAdapter, ExchangeId } from '../exchange/types';
import type { TradeEventType } from '../telemetry';
import { RequestQueue, QueuedExchangeAdapter } from '../exchange/queue';
import { createPaperAdapter } from './paper-adapter';
import { BotInstance } from './bot-instance';
import type { Killswitch } from './killswitch';
import type { BotConfig } from './types';
import type { CreateBotRequest, BotFactoryDelegate, ExchangeOrchestrator } from './bot-manager-types';
import { createD1Callbacks, persistNewBot } from './bot-manager-helpers';
import type { BotManagerCache } from './bot-manager-cache';

export interface BotFactoryDeps {
  onLog: (msg: string) => void;
  onError: (error: Error, context: string) => void;
  onBotEvent?: (botId: string, event: string, data: Record<string, unknown>) => void;
  userId?: string;
  getOrchestrator?: () => ExchangeOrchestrator | null;
}

export class BotManagerFactory implements BotFactoryDelegate {
  private exchanges = new Map<string, ExchangeAdapter>();
  readonly queues = new Map<string, RequestQueue>();

  constructor(
    private cache: BotManagerCache,
    private killswitch: Killswitch,
    private deps: BotFactoryDeps,
    private emitTelemetry: (type: TradeEventType, details: Record<string, unknown>) => void,
  ) {}

  private getOrCreateQueuedExchange(exchangeId: ExchangeId, mode: 'paper' | 'live', capital: number): ExchangeAdapter {
    const modeKey = `${mode}:${exchangeId}`;
    let exchange = this.exchanges.get(modeKey);
    if (!exchange) {
      if (mode !== 'paper') {
        throw new Error('Live trading not available — this system is paper/backtest only. See docs/DEPLOYMENT-SAFETY.md');
      }
      const paperRaw = createPaperAdapter(capital);
      const raw = Object.assign(paperRaw, { id: exchangeId, name: `${exchangeId}-paper` });
      let queue = this.queues.get(exchangeId);
      if (!queue) {
        queue = new RequestQueue();
        this.queues.set(exchangeId, queue);
      }
      exchange = new QueuedExchangeAdapter({ inner: raw, queue });
      this.exchanges.set(modeKey, exchange);
    }
    return exchange;
  }

  createBotSync(req: { id: string; config: BotConfig }, userId?: string): BotInstance {
    const cached = this.cache.get(req.id);
    if (cached && cached.expiresAt > Date.now()) return cached.bot;

    const exchange = this.getOrCreateQueuedExchange((req.config.exchange ?? 'binance') as ExchangeId, 'paper', req.config.capital);
    return new BotInstance(
      req.id, req.config,
      { exchange, killswitch: this.killswitch, exchangeOrchestrator: this.deps.getOrchestrator?.() ?? undefined },
      createD1Callbacks({
        botId: req.id, userId: userId ?? this.deps.userId ?? '', config: req.config, capital: req.config.capital,
        onLog: this.deps.onLog, onError: this.deps.onError, onBotEvent: this.deps.onBotEvent,
        emitTelemetry: (type, details) => this.emitTelemetry(type, details),
      }),
    );
  }

  async createBot(req: CreateBotRequest, userId?: string): Promise<BotInstance> {
    if (this.cache.has(req.id)) throw new Error(`Bot already exists: ${req.id}`);
    const effectiveUserId = userId ?? this.deps.userId;
    const exchange = this.getOrCreateQueuedExchange((req.config.exchange ?? 'binance') as ExchangeId, req.mode, req.config.capital);
    const callbacks = createD1Callbacks({
      botId: req.id, userId: effectiveUserId ?? '', config: req.config, capital: req.config.capital,
      onLog: this.deps.onLog, onError: this.deps.onError, onBotEvent: this.deps.onBotEvent,
      emitTelemetry: (type, details) => this.emitTelemetry(type, details),
    });
    const bot = new BotInstance(
      req.id, req.config,
      { exchange, killswitch: this.killswitch, exchangeOrchestrator: this.deps.getOrchestrator?.() ?? undefined },
      callbacks,
    );
    this.cache.cacheBot(bot, effectiveUserId);
    if (effectiveUserId) {
      persistNewBot({ botId: req.id, userId: effectiveUserId, config: req.config, capital: req.config.capital, onLog: this.deps.onLog, onError: this.deps.onError });
    }
    this.deps.onLog(`Bot ${req.id} created (${req.config.strategy}, ${req.config.symbol}, ${req.mode})`);
    return bot;
  }

  async drainQueues(): Promise<Record<string, { processed: number; skipped: number; pending: number }>> {
    const results: Record<string, { processed: number; skipped: number; pending: number }> = {};
    for (const [exchange, queue] of this.queues) {
      const drainResult = await queue.drain(exchange as ExchangeId, async (item) => {
        try { await item.execute(); return true; } catch { return false; }
      });
      results[exchange] = { processed: drainResult.processed, skipped: drainResult.skipped, pending: drainResult.pending };
    }
    return results;
  }

  destroy(): void {
    this.exchanges.clear();
    this.queues.clear();
  }
}
