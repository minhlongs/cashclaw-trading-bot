// Approved-execution action executors.
// Executors run ONLY for approved work items and ONLY through the execution module's claim
// machinery. An executor either performs the external effect through a configured channel sender
// or reports an honest outcome classification:
//   provider_accepted — provider accepted the request (NOT proof of end-user delivery)
//   failed_retryable  — transient failure, safe to retry within the approved attempt budget
//   failed_terminal   — configuration/auth/input error, needs a human, never auto-retried
//   unknown           — timeout after the request may have left the client (ambiguous; the
//                       owner's accepted-duplicates policy allows retrying, which may duplicate)
// Delivery is at-least-once: a crash between the provider call and the outcome record can re-send
// on retry. This is the documented semantics the owner accepted.

import type { AlertSender, AlertSenders, SendOutcomeKind } from '../alerts/alert-channel-senders';

export type OutboundChannel = 'TELEGRAM' | 'WEBHOOK' | 'EMAIL';
export type ActionKind = 'outbound_message' | 'record_only';

export interface OutboundMessagePayload {
  readonly channel: OutboundChannel;
  readonly message: string;
}

export interface ActionExecutionOutcome {
  readonly kind: SendOutcomeKind | 'recorded';
  readonly detail: string;
  readonly providerRef?: string;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
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

export function resolveActionTargetDescriptor(actionType: string, payload: unknown, senders: AlertSenders): string | null {
  if (actionType === 'record_only') return 'record:internal-ledger';
  if (actionType !== 'outbound_message') return null;
  const { channel } = (payload ?? {}) as OutboundMessagePayload;
  const sender: AlertSender | undefined = senders[channel];
  return sender ? sender.targetDescriptor : null;
}

export async function executeAction(input: {
  itemId: string;
  actionType: string;
  payload: unknown;
  senders: AlertSenders;
  timeoutMs?: number;
}): Promise<ActionExecutionOutcome> {
  if (input.actionType === 'record_only') {
    return { kind: 'recorded', detail: 'recorded' };
  }
  if (input.actionType !== 'outbound_message') {
    return { kind: 'failed_terminal', detail: `unsupported-action-type:${input.actionType}` };
  }
  const parsed = parseActionPayload('outbound_message', input.payload);
  if (!parsed.ok) return { kind: 'failed_terminal', detail: parsed.error };
  const { channel, message } = input.payload as OutboundMessagePayload;
  const sender: AlertSender | undefined = input.senders[channel];
  if (!sender) return { kind: 'failed_terminal', detail: `channel-not-configured:${channel}` };
  const outcome = await sender.send({
    eventId: `ops-action-${input.itemId}`,
    message,
    timestampMs: Date.now(),
    timeoutMs: input.timeoutMs,
  });
  return {
    kind: outcome.kind,
    detail: outcome.error ?? outcome.kind,
    providerRef: outcome.providerRef,
    httpStatus: outcome.httpStatus,
    retryAfterMs: outcome.retryAfterMs,
  };
}
