// Bot Instance — individual bot lifecycle + strategy execution
// Each bot runs its own state machine, owns its exchange adapter, and emits events.

import type {
  OrderRequest,
  OrderResult,
} from '../exchange/types';
import type {
  BotState,
  BotTrade,
  BotConfig,
  GridBotConfig,
  MeanRevBotConfig,
  BotCallbacks,
  BotDependencies,
} from './types';
import type { StrategyChain } from './strategy-chain';
import { GridStrategy } from './strategies/grid';
import { MeanRevStrategy } from './strategies/mean-reversion';
import type { TradeEventType } from '../telemetry/types';
import { TelemetryWriter } from '../telemetry/writer';
import { createInitialState } from './bot-state';
import { initializeStrategy } from './bot-strategy';
import { executeOrder as execOrder, type OrderContext } from './bot-order-executor';
import { tick as execTick, type TickContext } from './bot-tick';

export type { BotCallbacks, BotDependencies } from './types';

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
    this.state = createInitialState(id, config);
    deps.killswitch.registerBot(id, config.capital);
  }

  // ── Snapshot / patch ────────────────────────────────────────

  getSnapshot(): BotState { return { ...this.state }; }

  patchState(patch: Partial<BotState>): void {
    Object.assign(this.state, patch);
    this.state.updatedAt = Date.now();
  }

  getConfig(): GridBotConfig | MeanRevBotConfig { return { ...this.config }; }

  // ── Lifecycle ──────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state.status === 'running') return;
    try {
      const ticker = await this.deps.exchange.fetchTicker(this.config.symbol);
      const price = ticker.last;
      if (price <= 0) {
        throw new Error(`Invalid price for ${this.config.symbol}: ${price}`);
      }
      const bundle = initializeStrategy({
        config: this.config, price, botId: this.id,
        placeOrder: (req: OrderRequest) => this.placeOrder(req),
        onTrade: (trade: BotTrade) => this.callbacks.onTrade(trade),
        onLog: (msg: string) => this.callbacks.onLog(`[${this.id}] ${msg}`),
      });
      this.strategy = bundle.strategy;
      this.strategyChain = bundle.strategyChain;
      this.state.status = 'running';
      this.state.startedAt = this.state.updatedAt = Date.now();
      this.emitTelemetry('start', { strategy: this.config.strategy, symbol: this.config.symbol, price });
      this.emitState();
      this.startTicking();
      this.callbacks.onLog(`Bot ${this.id} started (${this.config.strategy}) @ ${price.toFixed(2)}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.state.status = 'error';
      this.state.error = msg;
      this.state.updatedAt = Date.now();
      this.emitTelemetry('error', { error: msg, context: 'bot.start' });
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
    if (this.state.status === 'stopped') return;
    this.state.status = 'stopped';
    this.state.stoppedAt = this.state.updatedAt = Date.now();
    this.stopTicking();
    this.strategy = null;
    this.emitTelemetry('stop', { reason: 'manual' });
    this.emitState();
    this.callbacks.onLog(`Bot ${this.id} stopped`);
  }

  // ── Tick loop ──────────────────────────────────────────────

  private startTicking(): void {
    this.stopTicking();
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
    const ctx: TickContext = {
      id: this.id, config: this.config, deps: this.deps, callbacks: this.callbacks,
      state: this.state, strategy: this.strategy, strategyChain: this.strategyChain,
      lastTickPrice: this.lastTickPrice,
      placeOrder: (req: OrderRequest) => this.placeOrder(req),
      pause: () => this.pause(),
      emitTelemetry: (type: TradeEventType, details: Record<string, unknown>) =>
        this.emitTelemetry(type, details),
      emitState: () => this.emitState(),
    };
    const result = await execTick(ctx);
    this.lastTickPrice = result.lastTickPrice;
  }

  // ── Order execution ────────────────────────────────────────

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    if (!this.deps.killswitch.isTradingEnabled()) {
      throw new Error('Trading halted by killswitch');
    }
    const ctx: OrderContext = {
      deps: this.deps,
      config: { capital: this.config.capital, symbol: this.config.symbol },
      state: this.state, botId: this.id,
      onTrade: (trade: BotTrade) => this.callbacks.onTrade(trade),
      emitTelemetry: (type: TradeEventType, details: Record<string, unknown>) =>
        this.emitTelemetry(type, details),
      emitState: () => this.emitState(),
    };
    const { result, orderCounter } = await execOrder(ctx, req, this.orderCounter);
    this.orderCounter = orderCounter;
    return result;
  }

  // ── Event emission ──────────────────────────────────────────

  private emitState(): void {
    this.callbacks.onStateChange(this.getSnapshot());
  }

  private emitTelemetry(eventType: TradeEventType, details: Record<string, unknown> = {}): void {
    this.deps.telemetry?.emit(this.id, eventType, details);
  }

  destroy(): void {
    this.stop();
    this.deps.killswitch.unregisterBot(this.id);
  }
}
