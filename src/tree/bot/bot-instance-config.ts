import type { BotState, BotConfig } from './types';

export function patchBotState(state: BotState, patch: Partial<BotState>): void {
  Object.assign(state, patch);
  state.updatedAt = Date.now();
}

export function updateBotConfig(
  current: BotConfig,
  patch: Partial<BotConfig>,
  state: BotState,
): BotConfig {
  const updated = { ...current, ...patch } as BotConfig;
  state.config = { ...updated };
  state.updatedAt = Date.now();
  return updated;
}
