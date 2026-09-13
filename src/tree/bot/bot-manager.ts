// Bot Manager — singleton orchestrator and facade for all bot instances
// Decomposed into Cache, Lifecycle, and Factory modules for LOC and SRP compliance.

import { createLogger } from '@/lib/logger';
import { Killswitch } from './killswitch';
import { BotManagerCache } from './bot-manager-cache';
import { BotManagerLifecycle } from './bot-manager-lifecycle';
import { BotManagerFactory } from './bot-manager-factory';
import type { TradeEventType } from '../telemetry';
import type { RequestQueue } from '../exchange/queue';
import type { BotConfig } from './types';
import type { BotInstance } from './bot-instance';
import type {
  BotManagerDependencies,
  CreateBotRequest,
  BotFactoryDelegate,
} from './bot-manager-types';

export type { ExchangeOrchestrator, BotManagerDependencies, CreateBotRequest } from './bot-manager-types';

const log = createLogger('bot-manager');

export class BotManager implements BotFactoryDelegate {
  private killswitch: Killswitch;
  private cache: BotManagerCache;
  private factory: BotManagerFactory;
  private lifecycle: BotManagerLifecycle;
  private deps: Required<Omit<BotManagerDependencies, 'telemetry' | 'userId' | 'getOrchestrator'>> & {
    telemetry?: BotManagerDependencies['telemetry'];
    userId?: string;
    getOrchestrator?: BotManagerDependencies['getOrchestrator'];
  };

  constructor(deps: BotManagerDependencies = {}) {
    this.deps = {
      onLog: deps.onLog ?? (() => {}),
      onError: deps.onError ?? (() => {}),
      onBotEvent: deps.onBotEvent ?? (() => {}),
      telemetry: deps.telemetry,
      userId: deps.userId,
      getOrchestrator: deps.getOrchestrator,
    };

    this.cache = new BotManagerCache(this.deps.userId, (err, ctx) => this.deps.onError(err, ctx));
    this.killswitch = new Killswitch(
      {
        onHalt: (reason) => {
          this.deps.onLog(`KILLSWITCH HALT: ${reason}`);
          this.emitTelemetry('halt', { reason });
          this.cache.stopAll();
        },
        onResume: () => {
          this.deps.onLog('Killswitch resumed');
          this.emitTelemetry('resume', {});
        },
        onOrderPlaced: () => {},
        onOrderFilled: () => {},
        onError: (e, ctx) => this.deps.onError(e, ctx),
        onDailyStateChange: (daily) => {
          import('@/forest/settings/actions')
            .then(({ saveKillswitchDailyState }) => saveKillswitchDailyState(daily))
            .catch((error) =>
              log.error('Failed to persist killswitch daily state', error instanceof Error ? error : new Error(String(error)), { action: 'onDailyStateChange' }),
            );
        },
      },
      { maxDailyLossPct: 10, maxConsecutiveLosses: 5, maxDrawdownPct: 15, cooldownMinutes: 30 },
    );

    this.factory = new BotManagerFactory(this.cache, this.killswitch, this.deps, (type, details) =>
      this.emitTelemetry(type, details),
    );
    this.cache.setFactory(this);
    this.lifecycle = new BotManagerLifecycle(this.cache, this.killswitch, this.deps.userId);
  }

  get queues(): Map<string, RequestQueue> { return this.factory.queues; }
  getKillswitch(): Killswitch { return this.killswitch; }
  getBot(id: string, userId?: string): BotInstance | undefined { return this.cache.getBot(id, userId); }
  getAllBots(userId?: string): Promise<BotInstance[]> { return this.cache.getAllBots(userId); }
  getRunningBots(userId?: string): Promise<BotInstance[]> { return this.cache.getRunningBots(userId); }
  getOrCreateBot(id: string, userId?: string): Promise<BotInstance | null> { return this.cache.getOrCreateBot(id, userId); }

  createBotSync(req: { id: string; config: BotConfig }, userId?: string): BotInstance {
    return this.factory.createBotSync(req, userId);
  }
  async createBot(req: CreateBotRequest, userId?: string): Promise<BotInstance> {
    return this.factory.createBot(req, userId);
  }

  async startBot(id: string, userId?: string): Promise<void> { return this.lifecycle.startBot(id, userId); }
  pauseBot(id: string, userId?: string): void { this.lifecycle.pauseBot(id, userId); }
  resumeBot(id: string, userId?: string): void { this.lifecycle.resumeBot(id, userId); }
  stopBot(id: string, userId?: string): void { this.lifecycle.stopBot(id, userId); }
  removeBot(id: string, userId?: string): void { this.lifecycle.removeBot(id, userId); }

  resetKillswitch(): void {
    this.killswitch.reset();
    this.deps.onLog('Killswitch reset');
  }
  manualHalt(reason: string = 'Manual halt requested'): void { this.killswitch.manualHalt(reason); }
  manualResume(): void { this.killswitch.manualResume(); }
  destroy(): void {
    this.cache.destroy();
    this.factory.destroy();
  }

  async drainQueues(): Promise<Record<string, { processed: number; skipped: number; pending: number }>> {
    return this.factory.drainQueues();
  }

  private emitTelemetry(type: TradeEventType, details: Record<string, unknown> = {}): void {
    if (!this.deps.telemetry) return;
    const botIds = this.cache.getBotIds();
    for (const botId of botIds) {
      this.deps.telemetry.emit(botId, type, details);
    }
  }
}

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
