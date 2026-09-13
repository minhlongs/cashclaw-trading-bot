// Killswitch audit logging adapter
// Isolates forest flight recorder and logger dependencies from tree layer

import { appendAudit } from '@/forest/flight-recorder/audit-ledger';
import { serializeDetail } from '@/forest/api/handlers/serialize-detail';
import { createLogger } from '@/lib/logger';

const log = createLogger('killswitch');

export interface KillswitchAuditPayload {
  action?: string;
  reason: string;
  dailyPnl: number;
  botId?: string;
}

export function recordKillswitchHaltAudit(payload: KillswitchAuditPayload): void {
  const action = payload.action ?? 'killswitch.halt';
  void appendAudit({
    action,
    botId: payload.botId,
    detailJson: serializeDetail({ reason: payload.reason, dailyPnl: payload.dailyPnl }),
  }).catch((auditError: unknown) => {
    const error = auditError instanceof Error ? auditError : new Error(String(auditError));
    log.warn('killswitch audit write failed', { action, detail: error.message });
  });
}
