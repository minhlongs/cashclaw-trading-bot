import type { BotManagerDependencies } from './bot-manager-types';
import type { BotManager } from './bot-manager';

let manager: BotManager | null = null;

export function getBotManagerInstance(createFn: (deps?: BotManagerDependencies) => BotManager, deps?: BotManagerDependencies): BotManager {
  if (!manager) manager = createFn(deps);
  return manager;
}

export function resetBotManagerInstance(): void {
  manager?.destroy();
  manager = null;
}
