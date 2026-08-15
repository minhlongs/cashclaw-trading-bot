/**
 * Exchange error normalization — classify raw exchange errors into typed categories.
 *
 * OmniRoute pattern: 3-layer pipeline
 *   1. upstreamError  — shape detection (is it an Error? HTTP response? string?)
 *   2. fetchError     — message normalization / sanitization
 *   3. classify429    — kind assignment (rate_limit, exchange_down, …)
 *
 * Feed into circuit breaker `recordFailure(error.kind)` when breaker is wired.
 */

export type ExchangeErrorKind =
  | 'rate_limit'
  | 'exchange_down'
  | 'invalid_order'
  | 'insufficient_balance'
  | 'transient'
  | 'unknown';

export interface ExchangeError {
  kind: ExchangeErrorKind;
  message: string;
  retryable: boolean;
  upstream?: unknown;
}

const RetryableKinds = new Set<ExchangeErrorKind>(['rate_limit', 'exchange_down', 'transient']);

function sanitizeMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Unknown exchange error';
  return trimmed;
}

function classifyFromMessage(message: string): ExchangeErrorKind {
  const m = message.toLowerCase();
  if (/\brate[_\s-]?limit\b|429|tooman|throttl|exceeded/.test(m)) return 'rate_limit';
  if (/\bdown\b|maintenance|service unavailable|timeout|etimedout|econnreset|econnrefused/.test(m)) return 'exchange_down';
  if (/invalid.?order|order.?not.?found|already.?filled|rejected|unknown.?order/.test(m)) return 'invalid_order';
  if (/insufficient|balance|not.?enough|margin|free.?amount/.test(m)) return 'insufficient_balance';
  if (/network|dns|fetch failed|socket hang up|ENOTFOUND|EHOSTUNREACH/.test(m)) return 'transient';
  return 'unknown';
}

export function normalizeExchangeError(raw: unknown): ExchangeError {
  let message: string;
  let upstream: unknown | undefined;

  if (raw instanceof Error) {
    message = raw.message;
    upstream = raw;
  } else if (typeof raw === 'string') {
    message = raw;
    upstream = raw;
  } else if (raw && typeof raw === 'object' && 'message' in (raw as Record<string, unknown>)) {
    message = String((raw as Record<string, unknown>).message);
    upstream = raw;
  } else {
    message = String(raw);
    upstream = raw;
  }

  const sanitized = sanitizeMessage(message);
  const kind = classifyFromMessage(sanitized);

  return {
    kind,
    message: sanitized,
    retryable: RetryableKinds.has(kind),
    upstream,
  };
}