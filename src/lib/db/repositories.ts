/**
 * D1 Repositories — typed data access layer (barrel re-export)
 * Split into repo-users-bots.ts and repo-trades-credentials.ts for size compliance.
 */

import type { D1Database, SettingsRow } from './types';

export type { SettingsRow };

export { findUserById, upsertUser, insertBot, updateBot, deleteBot, findBotsByUser, findBotById, findAllBots } from './repo-users-bots';
export { insertTrade, findTradesByBot, upsertCredential, insertTradeEvent, insertCapitalSnapshot, insertAudit } from './repo-trades-credentials';

export async function findSettingsByUser(db: D1Database, userId: string | null): Promise<SettingsRow | null> {
  const row = await db.prepare('SELECT * FROM settings WHERE user_id = ? OR user_id IS NULL ORDER BY user_id DESC LIMIT 1')
    .bind(userId).first<SettingsRow>();
  return row ?? null;
}

export async function upsertSettings(db: D1Database, row: SettingsRow): Promise<void> {
  await db.prepare(
    `INSERT INTO settings (id, user_id, exchange_creds_json, risk_limits_json, notification_json, killswitch_enabled, killswitch_reason, killswitch_triggered_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       exchange_creds_json = excluded.exchange_creds_json,
       risk_limits_json = excluded.risk_limits_json,
       notification_json = excluded.notification_json,
       killswitch_enabled = excluded.killswitch_enabled,
       killswitch_reason = excluded.killswitch_reason,
       killswitch_triggered_at = excluded.killswitch_triggered_at,
       updated_at = excluded.updated_at`
  ).bind(
    row.id, row.user_id, row.exchange_creds_json, row.risk_limits_json, row.notification_json,
    row.killswitch_enabled, row.killswitch_reason, row.killswitch_triggered_at, row.updated_at
  ).run();
}
