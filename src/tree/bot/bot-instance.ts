// Bot Instance — individual bot lifecycle + strategy execution
// Each bot runs its own state machine, owns its exchange adapter, and emits events.

import type { OrderRequest, OrderResult } from '../exchange/types';
import type { BotState, BotTrade, BotConfig, BotCallbacks, BotDependencies } from './types';
import type { StrategyChain } from './strategy-chain';
import type { GridStrategy } from './strategies/grid';
import type { MeanRevStrategy } from './strategies/mean-reversion';
import type { VolatilityDcaStrategy } from './strategies/volatility-dca';
import type { TradeEventType } from '../telemetry/types';
import { createInitialState } from './bot-state';
import { executeOrder as execOrder } from './bot-order-executor';
import { tick as execTick } from './bot-tick';
import { startBotLifecycle } from './bot-instance-lifecycle';
import {
  emitBotStateChange, emitBotTelemetry, destroyBotInstance,
  buildTickContext, buildOrderContext, buildLifecycleContext,
  startBotTicking, stopBotTicking,
} from './bot-instance-events';
export type { BotCallbacks, BotDependencies } from './types';

export class BotInstance {
  readonly id: string;
  private config: BotConfig;
  private deps: BotDependencies;
  private callbacks: BotCallbacks;
  private state: BotState;
  private strategy: GridStrategy | MeanRevStrategy | VolatilityDcaStrategy | null = null;
  private strategyChain: StrategyChain | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private orderCounter = 0;
  private lastTickPrice: number | null = null;

  constructor(id: string, config: BotConfig, deps: BotDependencies, callbacks: BotCallbacks) {
    this.id = id;
    this.config = config;
    this.deps = deps;
    this.callbacks = callbacks;
    this.state = createInitialState(id, config);
    deps.killswitch.registerBot(id, config.capital);
  }

  getSnapshot(): BotState { return { ...this.state }; }
  patchState(patch: Partial<BotState>): void { Object.assign(this.state, patch); this.state.updatedAt = Date.now(); }
  getConfig(): BotConfig { return { ...this.config }; }
  updateConfig(patch: Partial<BotConfig>): void {
    this.config = { ...this.config, ...patch } as BotConfig;
    this.state.config = { ...this.config };
    this.state.updatedAt = Date.now();
  }
  hasStrategy(): boolean { return this.strategy !== null; }
  async start(): Promise<void> {
    const res = await startBotLifecycle(buildLifecycleContext(
      this.id, this.config, this.deps, this.callbacks, this.state,
      (req) => this.placeOrder(req), (type, details) => this.emitTelemetry(type, details),
      () => this.emitState(), () => this.startTicking(),
    ));
    if (res.strategy) { this.strategy = res.strategy; this.strategyChain = res.strategyChain; }
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

  private startTicking(): void { this.tickInterval = startBotTicking(this.tickInterval, () => this.tick()); }
  private stopTicking(): void { this.tickInterval = stopBotTicking(this.tickInterval); }

  async tick(): Promise<void> {
    const ctx = buildTickContext(
      this.id, this.config, this.deps, this.callbacks, this.state,
      this.strategy, this.strategyChain, this.lastTickPrice,
      (req) => this.placeOrder(req), () => this.pause(),
      (type, details) => this.emitTelemetry(type, details), () => this.emitState(),
    );
    const result = await execTick(ctx);
    this.lastTickPrice = result.lastTickPrice;
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    if (!this.deps.killswitch.isTradingEnabled()) throw new Error('Trading halted by killswitch');
    const ctx = buildOrderContext(
      this.deps, this.config, this.state, this.id, (t: BotTrade) => this.callbacks.onTrade(t),
      (type, details) => this.emitTelemetry(type, details), () => this.emitState(),
    );
    const { result, orderCounter } = await execOrder(ctx, req, this.orderCounter);
    this.orderCounter = orderCounter;
    return result;
  }

  private emitState(): void { emitBotStateChange(this.callbacks, () => this.getSnapshot()); }
  private emitTelemetry(type: TradeEventType, details: Record<string, unknown> = {}): void { emitBotTelemetry(this.deps, this.id, type, details); }
  destroy(): void { destroyBotInstance(this.id, () => this.stop(), this.deps); }
}
