// Approved-execution action executors.
// Executors run ONLY for approved work items (the route checks the approval machine and the DB
// trigger enforces it). An executor either performs the external effect through a configured
// channel sender or reports an honest failure — it never claims success it did not achieve.
// Delivery is at-least-once: a crash between the provider call and the audit insert can re-send on
// retry, which is the documented semantics for email/telegram-style channels.

import type { AlertSender, AlertSenders } from '../alerts/alert-channel-senders';

export type OutboundChannel = 'TELEGRAM' | 'WEBHOOK' | 'EMAIL';
export type ActionKind = 'outbound_message' | 'record_only';

export interface OutboundMessagePayload {
  readonly channel: OutboundChannel;
  readonly message: string;
}

export interface ActionExecutionOutcome {
  readonly ok: boolean;
  readonly detail: string;
  readonly providerRef?: string;
}

const OUTBOUND_CHANNELS: readonly OutboundChannel[] = ['TELEGRAM', 'WEBHOOK', 'EMAIL'];

export function isActionKind(value: unknown): value is ActionKind {
  return value === 'outbound_message' || value === 'record_only';
}

export function parseActionPayload(actionType: ActionKind, payload: unknown): { ok: true } | { ok: false; error: string } {
  if (actionType === 'record_only') return { ok: true };
  const candidate = payload as Partial<OutboundMessagePayload> | null | undefined;
  if (!candidate || typeof candidate !== 'object') return { ok: false, error: 'outbound_message payload must be an object' };
  const { channel, message } = candidate;
  if (!channel || !OUTBOUND_CHANNELS.includes(channel)) return { ok: false, error: 'outbound_message requires channel TELEGRAM, WEBHOOK or EMAIL' };
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) return { ok: false, error: 'outbound_message requires a message of 1-4000 characters' };
  return { ok: true };
}

export async function executeAction(input: {
  itemId: string;
  actionType: string;
  payload: unknown;
  senders: AlertSenders;
}): Promise<ActionExecutionOutcome> {
  if (input.actionType === 'record_only') {
    return { ok: true, detail: 'recorded' };
  }
  if (input.actionType !== 'outbound_message') {
    return { ok: false, detail: `unsupported-action-type:${input.actionType}` };
  }
  const parsed = parseActionPayload('outbound_message', input.payload);
  if (!parsed.ok) return { ok: false, detail: parsed.error };
  const { channel, message } = input.payload as OutboundMessagePayload;
  const sender: AlertSender | undefined = input.senders[channel];
  if (!sender) return { ok: false, detail: `channel-not-configured:${channel}` };
  const outcome = await sender.send({
    eventId: `ops-action-${input.itemId}`,
    message,
    timestampMs: Date.now(),
  });
  return outcome.delivered
    ? { ok: true, detail: `sent:${channel}`, providerRef: outcome.providerRef }
    : { ok: false, detail: outcome.error ?? 'delivery-failed' };
}
