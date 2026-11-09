import { botControlHandler } from './bot-control';
import type { BotControlAction } from './bot-detail-types';

export async function executeBotControl(
  botId: string,
  action: BotControlAction,
  userId?: string,
): Promise<{ ok: boolean; error?: string }> {
  return botControlHandler(botId, action, userId);
}
