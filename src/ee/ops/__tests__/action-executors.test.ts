import { describe, expect, it } from 'vitest';
import { executeAction, parseActionPayload } from '@/ee/ops/action-executors';
import type { AlertSenders } from '@/ee/alerts/alert-channel-senders';

function senders(overrides: AlertSenders = {}): AlertSenders {
  return overrides;
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

  it('record_only always records without side effects', async () => {
    const outcome = await executeAction({ itemId: 'i1', actionType: 'record_only', payload: {}, senders: senders() });
    expect(outcome).toEqual({ ok: true, detail: 'recorded' });
  });

  it('outbound_message reports channel-not-configured instead of claiming delivery', async () => {
    const outcome = await executeAction({
      itemId: 'i2', actionType: 'outbound_message',
      payload: { channel: 'TELEGRAM', message: 'ping' }, senders: senders(),
    });
    expect(outcome).toMatchObject({ ok: false, detail: 'channel-not-configured:TELEGRAM' });
  });

  it('outbound_message dispatches through the configured sender with a stable event id', async () => {
    const calls: Array<{ eventId: string; message: string }> = [];
    const outcome = await executeAction({
      itemId: 'i3', actionType: 'outbound_message',
      payload: { channel: 'EMAIL', message: 'invoice ready' },
      senders: senders({
        EMAIL: {
          channel: 'EMAIL',
          async send(input) { calls.push({ eventId: input.eventId, message: input.message }); return { delivered: true, providerRef: 'email:ops@example.test' }; },
        },
      }),
    });
    expect(outcome).toMatchObject({ ok: true, detail: 'sent:EMAIL', providerRef: 'email:ops@example.test' });
    expect(calls).toEqual([{ eventId: 'ops-action-i3', message: 'invoice ready' }]);
  });

  it('surfaces provider failures and unsupported types honestly', async () => {
    const failed = await executeAction({
      itemId: 'i4', actionType: 'outbound_message', payload: { channel: 'WEBHOOK', message: 'x' },
      senders: senders({ WEBHOOK: { channel: 'WEBHOOK', async send() { return { delivered: false, error: 'provider responded 502' }; } } }),
    });
    expect(failed).toEqual({ ok: false, detail: 'provider responded 502' });
    const unsupported = await executeAction({ itemId: 'i5', actionType: 'crm_update', payload: {}, senders: senders() });
    expect(unsupported).toMatchObject({ ok: false, detail: 'unsupported-action-type:crm_update' });
  });
});
