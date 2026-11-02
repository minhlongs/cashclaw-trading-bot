// Outbound alert/action channel senders — the real send seam behind alert dispatch and approved
// outbound_message execution. Each sender posts to its provider through an injected fetch so tests
// exercise the exact request shape without any provider call. Secrets (bot token, API key) come
// from environment bindings and are never logged, echoed, hashed into snapshots, or audited.
//
// Outcome semantics: `delivered` (kept for API compatibility) means PROVIDER ACCEPTED the request
// (HTTP 2xx). It is never proof that an end user received or read the message. Timeouts after the
// request may have left the client are classified 'unknown' (ambiguous), never 'failed'.

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface AlertSendInput {
  readonly eventId: string;
  readonly message: string;
  readonly timestampMs: number;
  readonly timeoutMs?: number;
}

export type SendOutcomeKind = 'provider_accepted' | 'failed_retryable' | 'failed_terminal' | 'unknown';

export interface AlertSendOutcome {
  /** @deprecated Name kept for API compatibility. True = provider accepted (HTTP 2xx), NOT end-user delivery. */
  readonly delivered: boolean;
  readonly kind: SendOutcomeKind;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  readonly providerRef?: string;
  readonly error?: string;
}

export interface AlertSender {
  readonly channel: 'TELEGRAM' | 'WEBHOOK' | 'EMAIL';
  /** Non-secret destination identifier (e.g. 'telegram:<chatId>', 'webhook:<host>', 'email:<to>'). */
  readonly targetDescriptor: string;
  send(input: AlertSendInput): Promise<AlertSendOutcome>;
}

const DEFAULT_SEND_TIMEOUT_MS = 10_000;

function parseRetryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 300_000);
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) return Math.min(Math.max(0, dateMs - Date.now()), 300_000);
  return undefined;
}

export function classifyHttpOutcome(response: Response): AlertSendOutcome {
  const retryAfterMs = parseRetryAfterMs(response);
  if (response.ok) return { delivered: true, kind: 'provider_accepted', httpStatus: response.status };
  if (response.status === 408 || response.status === 429) {
    return { delivered: false, kind: 'failed_retryable', httpStatus: response.status, retryAfterMs, error: `provider responded ${response.status}` };
  }
  if (response.status >= 500) {
    return { delivered: false, kind: 'failed_retryable', httpStatus: response.status, retryAfterMs, error: `provider responded ${response.status}` };
  }
  // Other 4xx = configuration / auth / invalid input: human intervention, never auto-retried.
  return { delivered: false, kind: 'failed_terminal', httpStatus: response.status, error: `provider responded ${response.status}` };
}

function classifySendError(error: unknown): AlertSendOutcome {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  // AbortError = the request timed out; the provider MAY have received it. Ambiguous, retryable
  // under the owner's accepted-duplicates policy. Connection failures are treated as retryable.
  if (name === 'AbortError' || /aborted|timeout/i.test(message)) {
    return { delivered: false, kind: 'unknown', error: 'request timed out; provider may have received it' };
  }
  return { delivered: false, kind: 'failed_retryable', error: `send failed: ${message}` };
}

async function sendWithTimeout(
  fetchImpl: FetchLike,
  url: string | URL,
  init: RequestInit,
  timeoutMs: number,
  providerRef: string,
): Promise<AlertSendOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'manual' });
    const outcome = classifyHttpOutcome(response);
    if (response.status >= 300 && response.status < 400) {
      return { delivered: false, kind: 'failed_terminal', httpStatus: response.status, error: 'redirects are not followed' };
    }
    return { ...outcome, providerRef: outcome.providerRef ?? providerRef };
  } catch (error) {
    return classifySendError(error);
  } finally {
    clearTimeout(timer);
  }
}

// --- SSRF / destination validation for user-configurable outbound URLs ----------------------------
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^metadata\.google\.internal$/i,
  /^169\.254\.169\.254$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
];

export function validateWebhookTarget(rawUrl: string, options: { allowLoopback?: boolean } = {}): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false, error: 'webhook target is not a valid URL' }; }
  if (url.username || url.password) return { ok: false, error: 'webhook target must not embed credentials' };
  const isLoopback = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[?::1\]?)$/i.test(url.hostname);
  if (url.protocol === 'http:') {
    if (!(options.allowLoopback && isLoopback)) return { ok: false, error: 'webhook target must use https (http only for loopback test harness)' };
  } else if (url.protocol !== 'https:') {
    return { ok: false, error: 'webhook target scheme must be https' };
  }
  if (isLoopback && !options.allowLoopback) return { ok: false, error: 'webhook target must not point at loopback' };
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(url.hostname)) {
      if (isLoopback && options.allowLoopback) continue;
      return { ok: false, error: 'webhook target resolves to a blocked internal address' };
    }
  }
  return { ok: true, url };
}

// --- Channel senders -----------------------------------------------------------------------------

export function createTelegramSender(options: {
  token: string;
  chatId: string;
  fetchImpl?: FetchLike;
}): AlertSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    channel: 'TELEGRAM',
    targetDescriptor: `telegram:${options.chatId}`,
    async send(input) {
      // Telegram bot token travels in the URL path and must never be logged or hashed.
      return sendWithTimeout(fetchImpl, `https://api.telegram.org/bot${options.token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: options.chatId, text: `[${input.eventId}] ${input.message}` }),
      }, input.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS, `telegram:${options.chatId}`);
    },
  };
}

export function createWebhookSender(options: {
  targetUrl: string;
  fetchImpl?: FetchLike;
  allowLoopback?: boolean;
}): AlertSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const validated = validateWebhookTarget(options.targetUrl, { allowLoopback: options.allowLoopback ?? false });
  const descriptor = validated.ok ? `webhook:${validated.url.host}` : 'webhook:invalid-target';
  return {
    channel: 'WEBHOOK',
    targetDescriptor: descriptor,
    async send(input) {
      if (!validated.ok) return { delivered: false, kind: 'failed_terminal', error: validated.error };
      return sendWithTimeout(fetchImpl, validated.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cashclaw-event-id': input.eventId,
          'x-cashclaw-timestamp': String(input.timestampMs),
        },
        body: JSON.stringify({ eventId: input.eventId, message: input.message, timestampMs: input.timestampMs }),
      }, input.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS, descriptor);
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
    targetDescriptor: `email:${options.to}`,
    async send(input) {
      return sendWithTimeout(fetchImpl, options.apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
          'idempotency-key': input.eventId,
        },
        body: JSON.stringify({
          from: options.from,
          to: [options.to],
          subject: `CashClaw alert ${input.eventId}`,
          text: input.message,
        }),
      }, input.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS, `email:${options.to}`);
    },
  };
}

export type AlertSenders = Partial<Record<'TELEGRAM' | 'WEBHOOK' | 'EMAIL', AlertSender>>;

type EnvLike = Record<string, string | undefined>;

// Production channels are configured via environment bindings (values live in production secrets).
// Single-destination operator setup matches the one-person operation target; per-workspace
// destinations are intentionally deferred (YAGNI) and the UI/API must not advertise multi-tenant
// notifications. CASHCLAW_WEBHOOK_ALLOW_LOOPBACK is server test-harness configuration, never
// caller input; it only relaxes the loopback rule for the local fake receiver.
export function createSendersFromEnv(env: EnvLike, fetchImpl?: FetchLike): AlertSenders {
  const senders: AlertSenders = {};
  const token = env.CASHCLAW_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.CASHCLAW_TELEGRAM_CHAT_ID?.trim();
  if (token && chatId) senders.TELEGRAM = createTelegramSender({ token, chatId, fetchImpl });
  const targetUrl = env.CASHCLAW_ALERT_WEBHOOK_TARGET_URL?.trim();
  if (targetUrl) {
    senders.WEBHOOK = createWebhookSender({
      targetUrl,
      fetchImpl,
      allowLoopback: env.CASHCLAW_WEBHOOK_ALLOW_LOOPBACK === 'true',
    });
  }
  const apiUrl = env.CASHCLAW_EMAIL_API_URL?.trim();
  const apiKey = env.CASHCLAW_EMAIL_API_KEY?.trim();
  const from = env.CASHCLAW_EMAIL_FROM?.trim();
  const to = env.CASHCLAW_EMAIL_TO?.trim();
  if (apiUrl && apiKey && from && to) senders.EMAIL = createEmailSender({ apiUrl, apiKey, from, to, fetchImpl });
  return senders;
}
