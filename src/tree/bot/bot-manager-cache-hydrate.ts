// Bot Manager Cache — row-to-BotInstance hydration and state restore
// Extracted from bot-manager-cache.ts for size and responsibility compliance.

import { createLogger } from '@/lib/logger';
import { restoreBotStateFromRow } from '@/forest/bot/d1-hydration';
import type { Bot } from '@/lib/db/types';
import type { BotConfig } from './types';
import type { BotInstance } from './bot-instance';
import type { BotFactoryDelegate } from './bot-manager-types';
import { defaultConfigFromRow } from './bot-manager-helpers';
import type { BotManagerCacheState } from './bot-manager-cache-state';

const log = createLogger('bot-manager-cache');

export function hydrateFromRowIfNeeded(
  row: Bot,
  state: BotManagerCacheState,
  factory: BotFactoryDelegate,
): BotInstance {
  const cached = state.get(row.id);
  if (cached && cached.expiresAt > Date.now()) return cached.bot;
  try {
    const config = JSON.parse(row.config_json) as BotConfig;
    const instance = factory.createBotSync({ id: row.id, config }, row.user_id);
    state.cacheBot(instance, row.user_id);
    restoreBotStateFromRow(instance, row);
    return instance;
  } catch (error) {
    log.warn('Failed to hydrate bot from D1 row', {
      action: 'hydrateFromRowIfNeeded',
      botId: row.id,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    const fallback =
      cached?.bot ??
      factory.createBotSync({ id: row.id, config: defaultConfigFromRow(row) }, row.user_id);
    state.cacheBot(fallback, row.user_id);
    return fallback;
  }
}
