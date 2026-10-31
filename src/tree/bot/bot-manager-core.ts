import { BotManagerCache } from './bot-manager-cache';
import { BotManagerLifecycle } from './bot-manager-lifecycle';
import { BotManagerFactory } from './bot-manager-factory';
import { createManagerKillswitch } from './bot-manager-killswitch';
import { BotManagerLifecycleDelegate } from './bot-manager-lifecycle-delegate';
import type { Killswitch } from './killswitch';
import type { RequestQueue } from '../exchange/queue';
import type { BotConfig } from './types';
import type { BotInstance } from './bot-instance';
import type { BotManagerDependencies, CreateBotRequest, BotFactoryDelegate, BotEmitTelemetryFn } from './bot-manager-types';

export class BotManager implements BotFactoryDelegate {
  private killswitch: Killswitch; private cache: BotManagerCache;
  private factory: BotManagerFactory; private delegate: BotManagerLifecycleDelegate;
  private deps: Required<Omit<BotManagerDependencies, 'telemetry' | 'userId' | 'getOrchestrator'>> & {
    telemetry?: BotManagerDependencies['telemetry']; userId?: string; getOrchestrator?: BotManagerDependencies['getOrchestrator'];
  };

  constructor(deps: BotManagerDependencies = {}) {
    this.deps = {
      onLog: deps.onLog ?? (() => {}), onError: deps.onError ?? (() => {}), onBotEvent: deps.onBotEvent ?? (() => {}),
      telemetry: deps.telemetry, userId: deps.userId, getOrchestrator: deps.getOrchestrator,
    };
    this.cache = new BotManagerCache(this.deps.userId, (err, ctx) => this.deps.onError(err, ctx));
    const emit: BotEmitTelemetryFn = (t, d) => this.deps.telemetry && this.cache.getBotIds().forEach((id) => this.deps.telemetry!.emit(id, t, d));
    this.killswitch = createManagerKillswitch(this.deps, () => this.cache.stopAll(), emit);
    this.factory = new BotManagerFactory(this.cache, this.killswitch, this.deps, emit);
    this.cache.setFactory(this);
    this.delegate = new BotManagerLifecycleDelegate(new BotManagerLifecycle(this.cache, this.killswitch, this.deps.userId), this.killswitch, this.deps.onLog);
  }
  get queues(): Map<string, RequestQueue> { return this.factory.queues; }
  getKillswitch(): Killswitch { return this.killswitch; }
  getBot(id: string, userId?: string): BotInstance | undefined { return this.cache.getBot(id, userId); }
  getAllBots(userId?: string): Promise<BotInstance[]> { return this.cache.getAllBots(userId); }
  getRunningBots(userId?: string): Promise<BotInstance[]> { return this.cache.getRunningBots(userId); }
  getOrCreateBot(id: string, userId?: string): Promise<BotInstance | null> { return this.cache.getOrCreateBot(id, userId); }
  createBotSync(req: { id: string; config: BotConfig }, userId?: string): BotInstance { return this.factory.createBotSync(req, userId); }
  createBot(req: CreateBotRequest, userId?: string, workspaceId?: string): Promise<BotInstance> { return this.factory.createBot(req, userId, workspaceId); }
  startBot(id: string, userId?: string): Promise<void> { return this.delegate.startBot(id, userId); }
  pauseBot(id: string, userId?: string): void { this.delegate.pauseBot(id, userId); }
  resumeBot(id: string, userId?: string): void { this.delegate.resumeBot(id, userId); }
  stopBot(id: string, userId?: string): void { this.delegate.stopBot(id, userId); }
  removeBot(id: string, userId?: string): void { this.delegate.removeBot(id, userId); }
  resetKillswitch(): void { this.delegate.resetKillswitch(); }
  manualHalt(reason: string = 'Manual halt requested'): void { this.delegate.manualHalt(reason); }
  manualResume(): void { this.delegate.manualResume(); }
  destroy(): void { this.cache.destroy(); this.factory.destroy(); }
  drainQueues(): Promise<Record<string, { processed: number; skipped: number; pending: number }>> { return this.factory.drainQueues(); }
}