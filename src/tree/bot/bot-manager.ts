import { BotManager } from './bot-manager-core';
import { getBotManagerInstance, resetBotManagerInstance } from './bot-manager-singleton';
import type { BotManagerDependencies } from './bot-manager-types';

export { BotManager } from './bot-manager-core';
export type { ExchangeOrchestrator, BotManagerDependencies, CreateBotRequest } from './bot-manager-types';

export function getBotManager(deps?: BotManagerDependencies): BotManager {
  return getBotManagerInstance((d) => new BotManager(d), deps);
}

export function resetBotManager(): void {
  resetBotManagerInstance();
}
