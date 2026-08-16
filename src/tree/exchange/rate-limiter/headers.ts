// Parse standard rate limit response headers from exchanges.

export interface RateLimitHeaders {
  remaining: number;
  resetAt: number;
  limit: number;
}

function toNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function normaliseResetAt(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value > 1e12 ? value : value * 1000;
}

function resetAtFromRetryAfter(headers: Headers): number | undefined {
  const retryAfter = toNumber(headers.get('retry-after'));
  if (retryAfter === undefined) return undefined;
  return Date.now() + retryAfter * 1000;
}

export function parseRateLimitHeaders(
  headers: Headers,
): RateLimitHeaders | null {
  const remaining = toNumber(headers.get('x-ratelimit-remaining'));
  const limit = toNumber(headers.get('x-ratelimit-limit'));
  const mbxUsed = toNumber(headers.get('x-mbx-used-weight-x') ?? headers.get('x-mbx-used-weight'));
  const reset = normaliseResetAt(toNumber(headers.get('x-ratelimit-reset')));
  const retryAfter = toNumber(headers.get('retry-after'));

  if (remaining === undefined && limit === undefined && mbxUsed === undefined && reset === undefined && retryAfter === undefined) {
    return null;
  }

  return {
    remaining: remaining ?? (limit !== undefined && mbxUsed !== undefined ? Math.max(0, limit - mbxUsed) : 0),
    resetAt: reset ?? resetAtFromRetryAfter(headers) ?? Date.now(),
    limit: limit ?? 0,
  };
}