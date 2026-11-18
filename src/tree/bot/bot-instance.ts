import type { OrderRequest, OrderResult } from '../exchange/types';
import type { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import type { D1AtomicLedgerBatcher } from '../ledger';
import type { CapitalProtectionEngine } from '../protection';
import type { BotState, BotConfig, BotCallbacks, BotDependencies } from './types';
import type { TradeEventType } from '../telemetry/types';
import { createInitialState } from './bot-state';
import { patchBotState, updateBotConfig } from './bot-instance-config';
import { emitBotStateChange, emitBotTelemetry, startBotTicking, stopBotTicking, buildOrderContext } from './bot-instance-events';
import { handleBotPause, handleBotResume, handleBotStop, handleBotDestroy } from './bot-instance-handlers';
import { executeStrategyCancelOrder } from './bot-instance-lifecycle';
import { runBotStart, runBotTick, runBotOrder, type BotContext } from './bot-instance-methods';
export type { BotCallbacks, BotDependencies } from './types';

export class BotInstance {
  readonly id: string; private config: BotConfig; private deps: BotDependencies; private callbacks: BotCallbacks;
  private c: BotContext; private tickInterval: ReturnType<typeof setInterval> | null = null;
  constructor(id: string, config: BotConfig, deps: BotDependencies, callbacks: BotCallbacks) {
    this.id = id; this.config = config; this.deps = deps; this.callbacks = callbacks;
    this.c = { id, config, deps, callbacks, state: createInitialState(id, config), strategy: null, strategyChain: null, lastTickPrice: null, lastTickTimestampMs: null, orderCounter: 0 };
    deps.killswitch.registerBot(id, config.capital);
  }
  getSnapshot(): BotState { return { ...this.c.state }; }
  patchState(p: Partial<BotState>): void { patchBotState(this.c.state, p); }
  getConfig(): BotConfig { return { ...this.c.config }; }
  updateConfig(p: Partial<BotConfig>): void { this.config = this.c.config = updateBotConfig(this.c.config, p, this.c.state); }
  hasStrategy(): boolean { return this.c.strategy !== null; }
  getLastTickPrice(): number | null { return this.c.lastTickPrice; }
  getLastTickTimestampMs(): number | null { return this.c.lastTickTimestampMs ?? null; }
  getProtectionEngine(): CapitalProtectionEngine | undefined { return this.deps.protectionEngine; }
  getLifecycleEngine(): PaperOrderLifecycleEngine | undefined { return this.deps.lifecycleEngine; }
  getLedgerBatcher(): D1AtomicLedgerBatcher | undefined { return this.deps.ledgerBatcher; }
  async start(): Promise<void> { await runBotStart(this.c, (r) => this.placeOrder(r), (t, d) => this.emitTelemetry(t, d), () => this.emitState(), () => this.startTicking()); }
  pause(): void { handleBotPause(this.c.state, this.id, this.callbacks, () => this.stopTicking(), (t, d) => this.emitTelemetry(t, d), () => this.emitState()); }
  resume(): void { handleBotResume(this.c.state, this.id, this.callbacks, () => this.startTicking(), (t, d) => this.emitTelemetry(t, d), () => this.emitState()); }
  stop(): void { handleBotStop(this.c.state, this.id, this.callbacks, () => this.stopTicking(), (t, d) => this.emitTelemetry(t, d), () => this.emitState()); this.c.strategy = null; }
  private startTicking(): void { this.tickInterval = startBotTicking(this.tickInterval, () => this.tick()); }
  private stopTicking(): void { this.tickInterval = stopBotTicking(this.tickInterval); }
  async tick(): Promise<void> { await runBotTick(this.c, (r) => this.placeOrder(r), () => this.pause(), (t, d) => this.emitTelemetry(t, d), () => this.emitState()); }
  async placeOrder(req: OrderRequest): Promise<OrderResult> { return runBotOrder(this.c, req, (t, d) => this.emitTelemetry(t, d), () => this.emitState()); }
  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    const orderCtx = buildOrderContext(this.deps, this.c.config, this.c.state, this.id, (t) => this.callbacks.onTrade(t), (t, d) => this.emitTelemetry(t, d), () => this.emitState());
    return executeStrategyCancelOrder(this.deps, this.c.config, orderCtx, orderId, symbol);
  }
  private emitState(): void { emitBotStateChange(this.callbacks, () => this.getSnapshot()); }
  private emitTelemetry(t: TradeEventType, d: Record<string, unknown> = {}): void { emitBotTelemetry(this.deps, this.id, t, d); }
  destroy(): void { handleBotDestroy(this.id, () => this.stop(), this.deps); }
}
