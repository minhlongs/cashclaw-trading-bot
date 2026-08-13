// Bot Manager — singleton orchestrator for all bot instances

import type {
  ExchangeAdapter,
  ExchangeId,
  ExchangeConfig,
  OrderRequest,
  OrderResult,
  Ticker,
  OrderBook,
  Balance,
} from '../exchange/types';
import type { BotConfig, BotStatus } from './types';
import type { TradeEventType } from '../telemetry/types';
import { Killswitch } from './killswitch';
import { BotInstance, type BotCallbacks } from './bot-instance';
import type { TelemetryWriter } from '../telemetry';
import { persistBot, hydrateFromD1, patchBot, persistTrade } from '@/forest/bot/d1-adapter';
import { createServerClient } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'bot-manager' });

type D1BotStatus = 'draft' | 'paper_test' | 'live_running' | 'paused' | 'error' | 'stopped';

function toD1Status(status: BotStatus): D1BotStatus {
  switch (status) {
    case 'running': return 'paper_test';
    case 'paused': return 'paused';
    case 'stopped': return 'stopped';
    case 'error': return 'error';
    case 'idle': return 'draft';
  }
}

export interface CreateBotRequest {
  id: string;
  config: BotConfig;
  exchangeConfig: ExchangeConfig;
  mode: 'paper' | 'live';
}

export interface BotManagerDependencies {
  onLog?: (msg: string) => void;
  onError?: (error: Error, context: string) => void;
  onBotEvent?: (botId: string, event: string, data: Record<string, unknown>) => void;
  telemetry?: TelemetryWriter;
  userId?: string; // for D1 persistence
}

export class BotManager {
  private bots = new Map<string, BotInstance>();
  private exchanges = new Map<string, ExchangeAdapter>();
  private killswitch: Killswitch;
  private deps: Omit<Required<BotManagerDependencies>, 'telemetry' | 'userId'> & { telemetry?: TelemetryWriter; userId?: string };
  private initialized = false;

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

  /** Initialize BotManager - load bots from D1 and start them */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.deps.userId) {
      try {
        await hydrateFromD1(this.deps.userId);
      } catch (error) {
        this.deps.onError(error instanceof Error ? error : new Error(String(error)), 'BotManager.initialize');
      }
    }
    this.initialized = true;
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

    // v1: paper-only lockdown — force paper mode at BotManager level
    if (req.mode !== 'paper') {
      this.deps.onLog('Live mode blocked — Paper-only v1');
      req.mode = 'paper';
    }

    const modeKey = 'paper';
    let exchange = this.exchanges.get(modeKey);

    if (!exchange) {
      exchange = createPaperAdapter(req.config.capital);
      this.exchanges.set(modeKey, exchange);
    }

    const callbacks: BotCallbacks = {
      onStateChange: (state) => {
        this.deps.onBotEvent(req.id, 'state_change', { status: state.status, pnl: state.totalPnl });
        // Persist full BotState to D1 — map BotStatus to D1 Bot status
        if (this.deps.userId) {
          patchBot(req.id, {
            status: toD1Status(state.status),
            total_pnl: state.totalPnl,
            total_trades: state.totalTrades,
            win_count: state.winCount,
            loss_count: state.lossCount,
            max_drawdown: state.maxDrawdown,
            current_drawdown: state.currentDrawdown,
            started_at: state.startedAt,
            stopped_at: state.stoppedAt,
            last_error: state.error,
            last_tick_at: state.lastTickAt,
            last_order_at: state.lastOrderAt,
          }).catch((error) => {
            log.error(`D1 persist state failed for ${req.id}`, error instanceof Error ? error : new Error(String(error)), { action: 'patchBot:state' });
          });
        }
      },
      onTrade: (trade) => {
        this.deps.onBotEvent(req.id, 'trade', { side: trade.side, price: trade.price });
        this.emitTelemetry('fill', { botId: req.id, trade });
        // Persist trade to D1
        if (this.deps.userId) {
          persistTrade(req.id, {
            side: trade.side,
            entryPrice: trade.price,
            exitPrice: trade.filled > 0 && trade.side === 'sell' ? trade.price : undefined,
            quantity: trade.quantity,
            pnl: trade.pnl,
            status: trade.status === 'filled' ? 'filled' : 'open',
            exchangeOrderId: trade.id,
          }).catch((error) => {
            log.error(`D1 persist trade failed for ${req.id}`, error instanceof Error ? error : new Error(String(error)), { action: 'persistTrade' });
          });
        }
      },
      onLog: (msg) => this.deps.onLog(`[${req.id}] ${msg}`),
      onError: (error, ctx) => this.deps.onError(error, `${req.id}:${ctx}`),
    };

    const bot = new BotInstance(req.id, req.config, { exchange, killswitch: this.killswitch }, callbacks);
    this.bots.set(req.id, bot);

    // Persist new bot to D1
    if (this.deps.userId) {
      persistBot(this.deps.userId, {
        id: req.id,
        config: req.config,
        capital: req.config.capital,
        name: req.id,
        strategy: req.config.strategy,
        pair: req.config.symbol,
        exchange: req.config.exchange,
      }).catch((error) => {
        log.error(`D1 persist bot failed for ${req.id}`, error instanceof Error ? error : new Error(String(error)), { action: 'persistBot' });
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

// ── In-memory paper exchange factory ─────────────────────────

function createPaperAdapter(capital: number): ExchangeAdapter {
  const balances = new Map<string, { free: number; used: number }>();
  const orders = new Map<string, OrderResult>();
  let orderCounter = 0;

  balances.set('USDT', { free: capital, used: 0 });

  const adapter: ExchangeAdapter = {
    id: 'paper' as ExchangeId,
    name: 'Paper Trading',

    async fetchTicker(symbol: string): Promise<Ticker> {
      return { symbol, last: 0, bid: 0, ask: 0, high24h: 0, low24h: 0, volume24h: 0, timestamp: Date.now() };
    },

    async fetchOrderBook(symbol: string, _depth = 20): Promise<OrderBook> {
      return { symbol, bids: [], asks: [], timestamp: Date.now() };
    },

    async fetchBalances(): Promise<Balance[]> {
      return Array.from(balances.entries()).map(([currency, { free, used }]) => ({
        currency, free, used, total: free + used,
      }));
    },

    async placeOrder(request: OrderRequest): Promise<OrderResult> {
      const orderId = `paper_${++orderCounter}_${Date.now()}`;
      const trade: OrderResult = {
        id: orderId,
        exchangeId: 'paper',
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        price: request.price ?? 0,
        quantity: request.quantity,
        filled: request.type === 'market' ? request.quantity : 0,
        status: request.type === 'market' ? 'filled' : 'open',
        fee: request.quantity * 0.001,
        timestamp: Date.now(),
        pnl: 0,
      };
      orders.set(orderId, trade);
      return trade;
    },

    async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
      const trade = orders.get(orderId);
      if (!trade || trade.status !== 'open') return false;
      trade.status = 'cancelled';
      orders.set(orderId, trade);
      return true;
    },

    async fetchOrder(orderId: string, _symbol: string): Promise<OrderResult> {
      const trade = orders.get(orderId);
      if (!trade) throw new Error(`Order not found: ${orderId}`);
      return trade;
    },

    async fetchOpenOrders(_symbol?: string): Promise<OrderResult[]> {
      return Array.from(orders.values()).filter((t) => t.status === 'open');
    },

    async ping(): Promise<boolean> {
      return true;
    },

    async getServerTime(): Promise<number> {
      return Date.now();
    },
  };

  return adapter;
}
