import type { BotManagerLifecycle } from './bot-manager-lifecycle';
import type { Killswitch } from './killswitch';

export class BotManagerLifecycleDelegate {
  constructor(private lifecycle: BotManagerLifecycle, private killswitch: Killswitch, private onLog: (msg: string) => void) {}
  async startBot(id: string, userId?: string): Promise<void> { return this.lifecycle.startBot(id, userId); }
  pauseBot(id: string, userId?: string): void { this.lifecycle.pauseBot(id, userId); }
  resumeBot(id: string, userId?: string): void { this.lifecycle.resumeBot(id, userId); }
  stopBot(id: string, userId?: string): void { this.lifecycle.stopBot(id, userId); }
  removeBot(id: string, userId?: string): void { this.lifecycle.removeBot(id, userId); }
  resetKillswitch(): void { this.killswitch.reset(); this.onLog('Killswitch reset'); }
  manualHalt(reason: string = 'Manual halt requested'): void { this.killswitch.manualHalt(reason); }
  manualResume(): void { this.killswitch.manualResume(); }
}
