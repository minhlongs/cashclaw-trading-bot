// Bot Instance — individual bot lifecycle + strategy execution
// Each bot runs its own state machine, owns its exchange adapter, and emits events.

import type {
  ExchangeAdapter,
  Ticker,
  OrderRequest,
  OrderResult,
} from '../exchange/types';
import { Killswitch } from './killswitch';
import type {
  BotState,
  BotTrade,
  BotConfig,
  GridBotConfig,
  MeanRevBotConfig,
  StrategyContext,
} from './types';
import { buildDefaultChain, type StrategyChain } from './strategy-chain';
import { GridStrategy } from './strategies/grid';
import { MeanRevStrategy } from './strategies/mean-reversion';
import type { TradeEventType } from '../telemetry/types';
import { TelemetryWriter } from '../telemetry/writer';

export interface BotCallbacks {
  onStateChange: (state: BotState) => void;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
  onError: (error: Error, context: string) => void;
}

export interface BotDependencies {
  exchange: ExchangeAdapter;
  killswitch: Killswitch;
  telemetry?: TelemetryWriter;
}

export class BotInstance {
  readonly id: string;
  private config: GridBotConfig | MeanRevBotConfig;
  private deps: BotDependencies;
  private callbacks: BotCallbacks;

  private state: BotState;
  private strategy: GridStrategy | MeanRevStrategy | null = null;
  private strategyChain: StrategyChain | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private orderCounter = 0;
  private lastTickPrice: number | null = null;

  constructor(
    id: string,
    config: GridBotConfig | MeanRevBotConfig,
    deps: BotDependencies,
    callbacks: BotCallbacks,
  ) {
    this.id = id;
    this.config = config;
    this.deps = deps;
    this.callbacks = callbacks;

    this.state = this.createInitialState(config);
    deps.killswitch.registerBot(id, config.capital);
  }

  private createInitialState(config: GridBotConfig | MeanRevBotConfig): BotState {
    return {
      id: this.id,
      config: config as BotConfig,
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalPnl: 0,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      startedAt: null,
      stoppedAt: null,
      lastTickAt: null,
      lastOrderAt: null,
      error: null,
    };
  }

  getSnapshot(): BotState {
    return { ...this.state };
  }

  /** Apply a partial patch to bot state — used by D1 hydration. */
  patchState(patch: Partial<BotState>): void {
    Object.assign(this.state, patch);
    this.state.updatedAt = Date.now();
  }

  getConfig(): GridBotConfig | MeanRevBotConfig {
    return { ...this.config };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state.status === 'running') return;

    try {
      const ticker = await this.deps.exchange.fetchTicker(this.config.symbol);
      const price = ticker.last;
      if (price <= 0) {
        throw new Error(`Invalid price for ${this.config.symbol}: ${price}`);
      }

      this.initializeStrategy(price);
      this.state.status = 'running';
      this.state.startedAt = Date.now();
      this.state.updatedAt = Date.now();
      this.emitTelemetry('start', { strategy: this.config.strategy, symbol: this.config.symbol, price });
      this.emitState();
      this.startTicking();

      this.callbacks.onLog(`Bot ${this.id} started (${this.config.strategy}) @ ${price.toFixed(2)}`);
    } catch (error) {
      this.state.status = 'error';
      this.state.error = error instanceof Error ? error.message : 'unknown';
      this.state.updatedAt = Date.now();
      this.emitTelemetry('error', { error: this.state.error, context: 'bot.start' });
      this.emitState();
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)), 'bot.start');
    }
  }

  pause(): void {
    if (this.state.status !== 'running') return;
    this.state.status = 'paused';
    this.state.updatedAt = Date.now();
    this.stopTicking();
    this.emitTelemetry('pause', {});
    this.emitState();
    this.callbacks.onLog(`Bot ${this.id} paused`);
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.state.status = 'running';
    this.state.updatedAt = Date.now();
    this.startTicking();
    this.emitTelemetry('resume', {});
    this.emitState();
    this.callbacks.onLog(`Bot ${this.id} resumed`);
  }

  stop(): void {
    this.state.status = 'stopped';
    this.state.stoppedAt = Date.now();
    this.state.updatedAt = Date.now();
    this.stopTicking();
    this.strategy = null;
    this.emitTelemetry('stop', { reason: 'manual' });
    this.emitState();
    this.callbacks.onLog(`Bot ${this.id} stopped`);
  }

  // ── Tick loop ──────────────────────────────────────────────

  private startTicking(): void {
    this.stopTicking();
    // In production: use CF Cron or Durable Object alarm, not setInterval
    this.tickInterval = setInterval(() => this.tick(), 1000);
  }

  private stopTicking(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /** Single evaluation cycle — called by BotScheduler (CF Cron). */
  async tick(): Promise<void> {
    if (this.state.status !== 'running') return;
    if (!this.deps.killswitch.isTradingEnabled()) {
      this.callbacks.onLog(`Bot ${this.id} halted by killswitch: ${this.deps.killswitch.haltReason}`);
      this.pause();
      return;
    }

    try {
      const ticker = await this.deps.exchange.fetchTicker(this.config.symbol);
      const price = ticker.last;
      if (price <= 0) return;

      this.lastTickPrice = price;
      this.state.lastTickAt = Date.now();
      this.state.updatedAt = Date.now();

      // Evaluate StrategyChain first if configured
      const chainOrder = this.evaluateChain(price);
      if (chainOrder) {
        this.callbacks.onLog(`[${this.id}] Chain signal: ${chainOrder.side} ${chainOrder.quantity} @ market`);
        try {
          await this.executeOrder(chainOrder);
        } catch (error) {
          // Chain order failure is non-fatal — continue tick
          this.emitTelemetry('error', { error: error instanceof Error ? error.message : 'unknown', context: 'bot.chainOrder' });
        }
      }

      if (this.strategy) {
        this.strategy.onTicker(ticker);
      }

      // Emit tick telemetry (non-blocking)
      this.emitTelemetry('tick', { price, pnl: this.state.totalPnl });

      this.emitState();
    } catch (error) {
      this.emitTelemetry('error', { error: error instanceof Error ? error.message : 'unknown', context: 'bot.tick' });
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)), 'bot.tick');
    }
  }

  // ── Strategy factory ───────────────────────────────────────

  private initializeStrategy(price: number): void {
    // Build StrategyChain if configured
    if (this.config.strategyChain) {
      this.strategyChain = buildDefaultChain(this.config);
    }

    const placeOrder = async (req: OrderRequest): Promise<OrderResult> => {
      return this.executeOrder(req);
    };

    const onTrade = (trade: BotTrade) => this.callbacks.onTrade(trade);
    const onLog = (msg: string) => this.callbacks.onLog(`[${this.id}] ${msg}`);

    switch (this.config.strategy) {
      case 'grid': {
        const gridConfig = this.config as GridBotConfig;
        this.strategy = new GridStrategy(gridConfig, { placeOrder, onTrade, onLog });
        this.strategy.start(price);
        break;
      }
      case 'mean_reversion': {
        const mrConfig = this.config as MeanRevBotConfig;
        this.strategy = new MeanRevStrategy(mrConfig, { placeOrder, onTrade, onLog });
        this.strategy.start(price);
        break;
      }
    }
  }

  private evaluateChain(price: number): OrderRequest | null {
    if (!this.strategyChain || this.strategyChain.length === 0) {
      return null;
    }

    const ctx: StrategyContext = {
      symbol: this.config.symbol,
      balance: this.config.capital + this.state.totalPnl,
      openPositions: this.state.totalTrades - this.state.winCount - this.state.lossCount,
      lastPrice: price,
    };

    for (const node of this.strategyChain) {
      const signal = node.strategy.evaluate(ctx);
      if (signal) {
        return {
          symbol: this.config.symbol,
          side: signal.side,
          type: 'market',
          quantity: signal.qty,
        };
      }
    }

    return null;
  }

  // ── Helpers ────────────────────────────────────────────────

  /**
   * Execute an order placement with killswitch check, exchange call, and telemetry.
   * Single source of truth for all order placement in BotInstance.
   */
  private async executeOrder(req: OrderRequest): Promise<OrderResult> {
    if (!this.deps.killswitch.isTradingEnabled()) {
      throw new Error('Trading halted by killswitch');
    }

    const result = await this.deps.exchange.placeOrder(req);
    this.state.lastOrderAt = Date.now();
    this.orderCounter++;
    this.state.totalTrades++;

    const trade = this.orderResultToTrade(result);
    this.callbacks.onTrade(trade);
    this.deps.killswitch.onOrderFilled(result);

    const pnl = result.pnl ?? 0;
    this.state.totalPnl += pnl;
    if (pnl >= 0) this.state.winCount++;
    else this.state.lossCount++;

    this.deps.killswitch.updateDailyPnl(pnl);
    this.deps.killswitch.updatePeakCapital(this.config.capital + this.state.totalPnl);

    this.emitTelemetry('fill', {
      orderId: result.id,
      side: result.side,
      price: result.price,
      quantity: result.quantity,
      pnl,
    });

    this.state.updatedAt = Date.now();
    this.emitState();

    return result;
  }

  /**
   * Place an order externally (e.g. from Telegram bot or API).
   * Throws on killswitch, returns result on success.
   */
  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    return this.executeOrder(req);
  }

  private orderResultToTrade(result: OrderResult): BotTrade {
    return {
      id: `trade_${this.id}_${++this.orderCounter}`,
      botId: this.id,
      exchangeId: result.exchangeId,
      symbol: result.symbol,
      side: result.side,
      type: result.type,
      price: result.price,
      quantity: result.quantity,
      filled: result.filled,
      fee: result.fee ?? 0,
      pnl: result.pnl ?? 0,
      status: result.status as BotTrade['status'],
      timestamp: result.timestamp,
    };
  }

  private emitState(): void {
    this.callbacks.onStateChange(this.getSnapshot());
  }

  private emitTelemetry(eventType: TradeEventType, details: Record<string, unknown> = {}): void {
    if (this.deps.telemetry) {
      this.deps.telemetry.emit(this.id, eventType, details);
    }
  }

  destroy(): void {
    this.stop();
    this.deps.killswitch.unregisterBot(this.id);
  }
}
