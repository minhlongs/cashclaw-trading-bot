import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalD1Database } from '@/ee/billing/__tests__/local-d1-adapter';
import { createAlertDispatchService, createD1DispatchLogStore, createMemoryDispatchLogStore, type AlertDispatchEvent } from '../alert-dispatch-service';
import { createEmailSender, createTelegramSender, createWebhookSender } from '../alert-channel-senders';

function event(overrides: Partial<AlertDispatchEvent> = {}): AlertDispatchEvent {
  return { eventId: 'evt-1', workspaceId: 'ws-1', botId: 'bot-1', channel: 'TELEGRAM', message: 'paper tick halted', timestampMs: 1_700_000_000_000, ...overrides };
}

function jsonResponse(status = 200, body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status });
}

describe('alert channel senders (injected fetch — no provider calls)', () => {
  it('telegram sender posts chat message with the bot token in the URL path and never leaks it elsewhere', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const sender = createTelegramSender({
      token: 'test-bot-token', chatId: '42',
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: String(init?.body ?? '') });
        return jsonResponse();
      },
    });
    const outcome = await sender.send({ eventId: 'evt-9', message: 'hello', timestampMs: 1 });
    expect(outcome).toMatchObject({ delivered: true, providerRef: 'telegram:42' });
    expect(calls[0].url).toBe('https://api.telegram.org/bottest-bot-token/sendMessage');
    expect(JSON.parse(calls[0].body)).toMatchObject({ chat_id: '42', text: '[evt-9] hello' });
  });

  it('webhook and email senders shape the request and report provider failures', async () => {
    const webhookCalls: RequestInit[] = [];
    const webhook = createWebhookSender({
      targetUrl: 'https://hooks.example.test/abc',
      fetchImpl: async (_url, init) => { webhookCalls.push(init ?? {}); return jsonResponse(502); },
    });
    const failed = await webhook.send({ eventId: 'evt-10', message: 'm', timestampMs: 2 });
    expect(failed).toMatchObject({ delivered: false, error: 'provider responded 502' });
    expect(webhookCalls[0].method).toBe('POST');
    const headers = webhookCalls[0].headers as Record<string, string>;
    expect(headers['x-cashclaw-event-id']).toBe('evt-10');

    let emailBody = '';
    const email = createEmailSender({
      apiUrl: 'https://mail.example.test/send', apiKey: 'key-1', from: 'bot@example.test', to: 'ops@example.test',
      fetchImpl: async (_url, init) => { emailBody = String(init?.body ?? ''); return jsonResponse(); },
    });
    const sent = await email.send({ eventId: 'evt-11', message: 'invoice ready', timestampMs: 3 });
    expect(sent).toMatchObject({ delivered: true, providerRef: 'email:ops@example.test' });
    expect(JSON.parse(emailBody)).toMatchObject({ from: 'bot@example.test', to: ['ops@example.test'], text: 'invoice ready' });

    const offline = createTelegramSender({
      token: 't', chatId: 'c',
      fetchImpl: async () => { throw new Error('network down'); },
    });
    expect(await offline.send({ eventId: 'e', message: 'm', timestampMs: 1 })).toMatchObject({ delivered: false, error: /network down/ });
  });
});

describe('alert dispatch service (memory log)', () => {
  it('suppresses duplicate event ids, retries only failed ones, and reports unconfigured channels', async () => {
    let deliveredCount = 0;
    const service = createAlertDispatchService({
      senders: { TELEGRAM: { channel: 'TELEGRAM', async send() { deliveredCount += 1; return { delivered: true, providerRef: 'tg' }; } } },
      logStore: createMemoryDispatchLogStore(),
    });
    const first = await service.dispatch(event());
    expect(first).toMatchObject({ dispatched: true, delivered: true, deliveryStatus: 'sent', attempts: 1 });
    const duplicate = await service.dispatch(event());
    expect(duplicate).toMatchObject({ dispatched: false, delivered: false, deliveryStatus: 'suppressed' });
    expect(deliveredCount).toBe(1);

    let attempts = 0;
    const flaky = createAlertDispatchService({
      senders: { EMAIL: { channel: 'EMAIL', async send() { attempts += 1; return attempts === 1 ? { delivered: false, error: 'boom' } : { delivered: true }; } } },
      logStore: createMemoryDispatchLogStore(),
    });
    const failed = await flaky.dispatch(event({ eventId: 'evt-flaky', channel: 'EMAIL' }));
    expect(failed).toMatchObject({ deliveryStatus: 'failed', attempts: 1, error: 'boom' });
    const retried = await flaky.dispatch(event({ eventId: 'evt-flaky', channel: 'EMAIL' }));
    expect(retried).toMatchObject({ deliveryStatus: 'sent', attempts: 2 });

    const unconfigured = createAlertDispatchService({ senders: {}, logStore: createMemoryDispatchLogStore() });
    const bare = await unconfigured.dispatch(event({ eventId: 'evt-bare' }));
    expect(bare).toMatchObject({ dispatched: true, delivered: false, deliveryStatus: 'unconfigured', error: 'channel-not-configured' });
  });
});

describe('alert dispatch service (durable D1 log)', () => {
  let db: LocalD1Database;
  beforeAll(async () => {
    db = new LocalD1Database(path.join(mkdtempSync(path.join(tmpdir(), 'pr35-alert-')), 'alert.db'));
    const migrationsDir = path.join(process.cwd(), 'migrations');
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
  });

  it('persists dedup and retry state so a fresh service instance keeps suppression', async () => {
    const store = createD1DispatchLogStore(db);
    let sends = 0;
    const service = createAlertDispatchService({
      senders: { TELEGRAM: { channel: 'TELEGRAM', async send() { sends += 1; return { delivered: true, providerRef: 'tg:1' }; } } },
      logStore: store,
    });
    expect(await service.dispatch(event({ eventId: 'evt-durable' }))).toMatchObject({ deliveryStatus: 'sent', attempts: 1 });
    expect(await service.dispatch(event({ eventId: 'evt-durable' }))).toMatchObject({ deliveryStatus: 'suppressed' });
    expect(sends).toBe(1);

    const restarted = createAlertDispatchService({
      senders: { TELEGRAM: { channel: 'TELEGRAM', async send() { sends += 1; return { delivered: true }; } } },
      logStore: createD1DispatchLogStore(db),
    });
    expect(await restarted.dispatch(event({ eventId: 'evt-durable' }))).toMatchObject({ deliveryStatus: 'suppressed' });

    const flaky = createAlertDispatchService({
      senders: { EMAIL: { channel: 'EMAIL', async send() { sends += 1; return { delivered: false, error: 'smtp down' }; } } },
      logStore: createD1DispatchLogStore(db),
    });
    expect(await flaky.dispatch(event({ eventId: 'evt-retry', channel: 'EMAIL' }))).toMatchObject({ deliveryStatus: 'failed', error: 'smtp down' });
    const row = await db.prepare(`SELECT status, attempts, last_error FROM saas_alert_dispatch_log WHERE event_id = 'evt-retry'`)
      .first<{ status: string; attempts: number; last_error: string }>();
    expect(row).toMatchObject({ status: 'failed', attempts: 1, last_error: 'smtp down' });
    expect(await flaky.dispatch(event({ eventId: 'evt-retry', channel: 'EMAIL' }))).toMatchObject({ deliveryStatus: 'failed', attempts: 2 });
    expect(sends).toBe(3);
  });
});
