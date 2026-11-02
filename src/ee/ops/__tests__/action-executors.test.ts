import { describe, expect, it } from 'vitest';
import { executeAction, parseActionPayload, resolveActionTargetDescriptor } from '@/ee/ops/action-executors';
import type { AlertSenders } from '@/ee/alerts/alert-channel-senders';

function senders(overrides: AlertSenders = {}): AlertSenders {
  return overrides;
}

function fakeSender(channel: 'TELEGRAM' | 'WEBHOOK' | 'EMAIL', target: string, impl: (input: { eventId: string; message: string }) => Promise<{ delivered: boolean; kind: 'provider_accepted' | 'failed_retryable' | 'failed_terminal' | 'unknown'; providerRef?: string; httpStatus?: number; error?: string }>) {
  return { channel, targetDescriptor: target, send: impl };
}

describe('action executors', () => {
  it('parses typed payloads and rejects malformed ones', () => {
    expect(parseActionPayload('record_only', {})).toEqual({ ok: true });
    expect(parseActionPayload('outbound_message', { channel: 'EMAIL', message: 'hello' })).toEqual({ ok: true });
    expect(parseActionPayload('outbound_message', { channel: 'SMS', message: 'hello' })).toMatchObject({ ok: false });
    expect(parseActionPayload('outbound_message', { channel: 'EMAIL', message: '   ' })).toMatchObject({ ok: false });
    expect(parseActionPayload('outbound_message', null)).toMatchObject({ ok: false });
    expect(parseActionPayload('outbound_message', { channel: 'EMAIL', message: 'x'.repeat(4001) })).toMatchObject({ ok: false });
  });

  it('record_only always records without side effects and exposes a stable target', async () => {
    const outcome = await executeAction({ itemId: 'i1', actionType: 'record_only', payload: {}, senders: senders() });
    expect(outcome).toEqual({ kind: 'recorded', detail: 'recorded' });
    expect(resolveActionTargetDescriptor('record_only', {}, senders())).toBe('record:internal-ledger');
  });

  it('outbound_message reports channel-not-configured instead of claiming delivery', async () => {
    const outcome = await executeAction({
      itemId: 'i2', actionType: 'outbound_message',
      payload: { channel: 'TELEGRAM', message: 'ping' }, senders: senders(),
    });
    expect(outcome).toMatchObject({ kind: 'failed_terminal', detail: 'channel-not-configured:TELEGRAM' });
    expect(resolveActionTargetDescriptor('outbound_message', { channel: 'TELEGRAM' }, senders())).toBeNull();
  });

  it('outbound_message dispatches through the configured sender with a stable event id', async () => {
    const calls: Array<{ eventId: string; message: string }> = [];
    const outcome = await executeAction({
      itemId: 'i3', actionType: 'outbound_message',
      payload: { channel: 'EMAIL', message: 'invoice ready' },
      senders: senders({
        EMAIL: fakeSender('EMAIL', 'email:ops@example.test', async (input) => {
          calls.push({ eventId: input.eventId, message: input.message });
          return { delivered: true, kind: 'provider_accepted', providerRef: 'email:ops@example.test' };
        }),
      }),
    });
    expect(outcome).toMatchObject({ kind: 'provider_accepted', detail: 'provider_accepted', providerRef: 'email:ops@example.test' });
    expect(calls).toEqual([{ eventId: 'ops-action-i3', message: 'invoice ready' }]);
    expect(resolveActionTargetDescriptor('outbound_message', { channel: 'EMAIL' }, senders({
      EMAIL: fakeSender('EMAIL', 'email:ops@example.test', async () => ({ delivered: true, kind: 'provider_accepted' })),
    }))).toBe('email:ops@example.test');
  });

  it('surfaces provider failures and unsupported types with honest outcome kinds', async () => {
    const failed = await executeAction({
      itemId: 'i4', actionType: 'outbound_message', payload: { channel: 'WEBHOOK', message: 'x' },
      senders: senders({ WEBHOOK: fakeSender('WEBHOOK', 'webhook:hooks.example.test', async () => ({ delivered: false, kind: 'failed_retryable', httpStatus: 502, error: 'provider responded 502' })) }),
    });
    expect(failed).toMatchObject({ kind: 'failed_retryable', detail: 'provider responded 502', httpStatus: 502 });
    const ambiguous = await executeAction({
      itemId: 'i6', actionType: 'outbound_message', payload: { channel: 'WEBHOOK', message: 'x' },
      senders: senders({ WEBHOOK: fakeSender('WEBHOOK', 'webhook:hooks.example.test', async () => ({ delivered: false, kind: 'unknown', error: 'request timed out; provider may have received it' })) }),
    });
    expect(ambiguous).toMatchObject({ kind: 'unknown' });
    const unsupported = await executeAction({ itemId: 'i5', actionType: 'crm_update', payload: {}, senders: senders() });
    expect(unsupported).toMatchObject({ kind: 'failed_terminal', detail: 'unsupported-action-type:crm_update' });
  });
});
