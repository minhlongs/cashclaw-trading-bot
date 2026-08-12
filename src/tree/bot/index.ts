// Bot Module — barrel export
export { Killswitch } from './killswitch';
export type { KillswitchCallbacks, KillswitchConfig, KillswitchState } from './killswitch';
export { BotInstance } from './bot-instance';
export type { BotCallbacks, BotDependencies } from './bot-instance';
export { BotManager, getBotManager, resetBotManager } from './bot-manager';
export type { CreateBotRequest, BotManagerDependencies } from './bot-manager';
export type {
  BotConfig, BotState, BotStatus, BotMode, StrategyType, BotEvent,
  BaseBotConfig, GridBotConfig, MeanRevBotConfig,
} from './types';
export { isGridConfig, isMeanRevConfig } from './types';
export { GridStrategy } from './strategies/grid';
export type { GridStrategyCallbacks } from './strategies/grid';
export { MeanRevStrategy } from './strategies/mean-reversion';
export type { MeanRevStrategyCallbacks } from './strategies/mean-reversion';
