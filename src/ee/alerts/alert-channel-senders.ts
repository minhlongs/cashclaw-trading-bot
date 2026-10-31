// Outbound alert channel senders — the real send seam behind alert dispatch.
// Each sender posts to its provider through an injected fetch so tests exercise the exact request
// shape without any provider call. Secrets (bot token, API key) come from environment bindings and
// are never logged or echoed in responses. Nothing here is a test hook: unconfigured channels are
// reported as unconfigured and never silently "delivered".

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface AlertSendInput {
  readonly eventId: string;
  readonly message: string;
  readonly timestampMs: number;
}

export interface AlertSendOutcome {
  readonly delivered: boolean;
  readonly providerRef?: string;
  readonly error?: string;
}

export interface AlertSender {
  readonly channel: 'TELEGRAM' | 'WEBHOOK' | 'EMAIL';
  send(input: AlertSendInput): Promise<AlertSendOutcome>;
}

function outcomeFromResponse(response: Response, providerRef?: string): AlertSendOutcome {
  if (response.ok) return { delivered: true, providerRef };
  return { delivered: false, error: `provider responded ${response.status}` };
}

export function createTelegramSender(options: {
  token: string;
  chatId: string;
  fetchImpl?: FetchLike;
}): AlertSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    channel: 'TELEGRAM',
    async send(input) {
      try {
        // Telegram bot token travels in the URL path and must never be logged.
        const response = await fetchImpl(`https://api.telegram.org/bot${options.token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: options.chatId, text: `[${input.eventId}] ${input.message}` }),
        });
        return outcomeFromResponse(response, `telegram:${options.chatId}`);
      } catch (error) {
        return { delivered: false, error: `telegram send failed: ${String(error instanceof Error ? error.message : error)}` };
      }
    },
  };
}

export function createWebhookSender(options: {
  targetUrl: string;
  fetchImpl?: FetchLike;
}): AlertSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    channel: 'WEBHOOK',
    async send(input) {
      try {
        const response = await fetchImpl(options.targetUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-cashclaw-event-id': input.eventId,
            'x-cashclaw-timestamp': String(input.timestampMs),
          },
          body: JSON.stringify({ eventId: input.eventId, message: input.message, timestampMs: input.timestampMs }),
        });
        return outcomeFromResponse(response, `webhook:${new URL(options.targetUrl).host}`);
      } catch (error) {
        return { delivered: false, error: `webhook send failed: ${String(error instanceof Error ? error.message : error)}` };
      }
    },
  };
}

export function createEmailSender(options: {
  apiUrl: string;
  apiKey: string;
  from: string;
  to: string;
  fetchImpl?: FetchLike;
}): AlertSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    channel: 'EMAIL',
    async send(input) {
      try {
        const response = await fetchImpl(options.apiUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            from: options.from,
            to: [options.to],
            subject: `CashClaw alert ${input.eventId}`,
            text: input.message,
          }),
        });
        return outcomeFromResponse(response, `email:${options.to}`);
      } catch (error) {
        return { delivered: false, error: `email send failed: ${String(error instanceof Error ? error.message : error)}` };
      }
    },
  };
}

export type AlertSenders = Partial<Record<'TELEGRAM' | 'WEBHOOK' | 'EMAIL', AlertSender>>;

type EnvLike = Record<string, string | undefined>;

// Production channels are configured via environment bindings (values live in production secrets).
// An operator-level single-destination setup matches the one-person operation target; per-workspace
// destinations are intentionally deferred (YAGNI).
export function createSendersFromEnv(env: EnvLike, fetchImpl?: FetchLike): AlertSenders {
  const senders: AlertSenders = {};
  const token = env.CASHCLAW_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.CASHCLAW_TELEGRAM_CHAT_ID?.trim();
  if (token && chatId) senders.TELEGRAM = createTelegramSender({ token, chatId, fetchImpl });
  const targetUrl = env.CASHCLAW_ALERT_WEBHOOK_TARGET_URL?.trim();
  if (targetUrl) senders.WEBHOOK = createWebhookSender({ targetUrl, fetchImpl });
  const apiUrl = env.CASHCLAW_EMAIL_API_URL?.trim();
  const apiKey = env.CASHCLAW_EMAIL_API_KEY?.trim();
  const from = env.CASHCLAW_EMAIL_FROM?.trim();
  const to = env.CASHCLAW_EMAIL_TO?.trim();
  if (apiUrl && apiKey && from && to) senders.EMAIL = createEmailSender({ apiUrl, apiKey, from, to, fetchImpl });
  return senders;
}
