// Durable alert dispatch service — dedup and retry state live in D1 (saas_alert_dispatch_log) so
// suppression survives worker restarts and coordinates across isolates. Delivery is attempted
// through configured channel senders; every outcome is recorded honestly (sent / failed /
// unconfigured / suppressed). A claimed event is retried only from the 'failed' state.

import type { D1Database } from '@/lib/db/types';
import type { AlertSender, AlertSenders } from './alert-channel-senders';

export interface AlertDispatchEvent {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly botId: string;
  readonly channel: 'TELEGRAM' | 'WEBHOOK' | 'EMAIL';
  readonly message: string;
  readonly timestampMs: number;
}

export type AlertDeliveryStatus = 'sent' | 'failed' | 'unconfigured' | 'suppressed';

export interface AlertDispatchRecord {
  readonly eventId: string;
  readonly dispatched: boolean;
  readonly delivered: boolean;
  readonly deliveryStatus: AlertDeliveryStatus;
  readonly attempts: number;
  readonly providerRef?: string;
  readonly error?: string;
}

export interface AlertDispatchLogStore {
  /** Claim the event for a delivery attempt. Returns false when a prior attempt already exists
   *  (sent/pending/suppressed) — only 'failed' events are retryable. */
  claim(event: AlertDispatchEvent, nowMs: number): Promise<boolean>;
  record(eventId: string, status: 'sent' | 'failed', nowMs: number, detail: { providerRef?: string; error?: string }): Promise<void>;
  attempts(eventId: string): Promise<number>;
}

export function createMemoryDispatchLogStore(): AlertDispatchLogStore {
  const rows = new Map<string, { status: 'pending' | 'sent' | 'failed' | 'suppressed'; attempts: number }>();
  return {
    async claim(event, nowMs) {
      void nowMs;
      const existing = rows.get(event.eventId);
      if (!existing) {
        rows.set(event.eventId, { status: 'pending', attempts: 1 });
        return true;
      }
      if (existing.status === 'failed') {
        existing.status = 'pending';
        existing.attempts += 1;
        return true;
      }
      return false;
    },
    async record(eventId, status, nowMs, detail) {
      void nowMs; void detail;
      const existing = rows.get(eventId);
      if (existing) existing.status = status;
    },
    async attempts(eventId) {
      return rows.get(eventId)?.attempts ?? 0;
    },
  };
}

export function createD1DispatchLogStore(db: D1Database): AlertDispatchLogStore {
  return {
    async claim(event, nowMs) {
      // INSERT ... ON CONFLICT ... RETURNING: a returned row means the claim was taken (new event
      // or retry from 'failed'); no row means the event is already pending/sent/suppressed. This
      // "rows changed" detection works on D1, the local adapter and the wrangler CLI alike.
      const claimed = await db.prepare(
        `INSERT INTO saas_alert_dispatch_log
           (event_id, workspace_id, bot_id, channel, status, attempts, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, 'pending', 1, ?, ?)
         ON CONFLICT(event_id) DO UPDATE SET
           status = 'pending', attempts = saas_alert_dispatch_log.attempts + 1, updated_at_ms = excluded.updated_at_ms
         WHERE saas_alert_dispatch_log.status = 'failed'
           AND saas_alert_dispatch_log.channel = excluded.channel
         RETURNING event_id`,
      ).bind(event.eventId, event.workspaceId, event.botId, event.channel, nowMs, nowMs).first<{ event_id: string }>();
      return claimed !== null;
    },
    async record(eventId, status, nowMs, detail) {
      await db.prepare(
        `UPDATE saas_alert_dispatch_log
         SET status = ?, provider_ref = ?, last_error = ?, updated_at_ms = ?
         WHERE event_id = ?`,
      ).bind(status, detail.providerRef ?? null, detail.error ?? null, nowMs, eventId).run();
    },
    async attempts(eventId) {
      const row = await db.prepare(`SELECT attempts FROM saas_alert_dispatch_log WHERE event_id = ?`)
        .bind(eventId).first<{ attempts: number }>();
      return row?.attempts ?? 0;
    },
  };
}

export interface AlertDispatchService {
  dispatch(event: AlertDispatchEvent): Promise<AlertDispatchRecord>;
}

export function createAlertDispatchService(options: {
  senders: AlertSenders;
  logStore: AlertDispatchLogStore;
  now?: () => number;
}): AlertDispatchService {
  const now = options.now ?? Date.now;
  return {
    async dispatch(event) {
      const nowMs = now();
      const claimed = await options.logStore.claim(event, nowMs);
      const attempts = await options.logStore.attempts(event.eventId);
      if (!claimed) {
        return { eventId: event.eventId, dispatched: false, delivered: false, deliveryStatus: 'suppressed', attempts };
      }
      const sender: AlertSender | undefined = options.senders[event.channel];
      if (!sender) {
        await options.logStore.record(event.eventId, 'failed', nowMs, { error: 'channel-not-configured' });
        return {
          eventId: event.eventId, dispatched: true, delivered: false,
          deliveryStatus: 'unconfigured', attempts, error: 'channel-not-configured',
        };
      }
      const outcome = await sender.send({ eventId: event.eventId, message: event.message, timestampMs: event.timestampMs });
      if (outcome.delivered) {
        await options.logStore.record(event.eventId, 'sent', nowMs, { providerRef: outcome.providerRef });
        return {
          eventId: event.eventId, dispatched: true, delivered: true,
          deliveryStatus: 'sent', attempts, providerRef: outcome.providerRef,
        };
      }
      await options.logStore.record(event.eventId, 'failed', nowMs, { error: outcome.error ?? 'delivery-failed' });
      return {
        eventId: event.eventId, dispatched: true, delivered: false,
        deliveryStatus: 'failed', attempts, error: outcome.error ?? 'delivery-failed',
      };
    },
  };
}
