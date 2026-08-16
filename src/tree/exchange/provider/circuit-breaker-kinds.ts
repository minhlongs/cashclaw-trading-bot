export type FailureKind = 'timeout' | 'rate_limit' | 'server_error' | 'network' | 'unknown';

export const FAILURE_KIND_THRESHOLDS: Record<FailureKind, { threshold: number; cooldownMs: number }> = {
  timeout:      { threshold: 3,  cooldownMs: 5_000 },
  rate_limit:   { threshold: 5,  cooldownMs: 10_000 },
  server_error: { threshold: 5,  cooldownMs: 30_000 },
  network:      { threshold: 2,  cooldownMs: 15_000 },
  unknown:      { threshold: 3,  cooldownMs: 10_000 },
};


function classifyFromMessage(message: string): FailureKind {
  const m = message.toLowerCase();
  if (/timeout|etimedout|esockettimedout/.test(m)) return 'timeout';
  if (/429|rate.limit|too many requests/.test(m)) return 'rate_limit';
  if (/5[0-9]{2}|service.unavailable|bad.gateway/.test(m)) return 'server_error';
  if (/enotfound|ehostunreach|econnrefused|network|dns|fetch.failed/.test(m)) return 'network';
  return 'unknown';
}

const unknown = 'unknown' as const;
export function classifyFailure(err: unknown): FailureKind {
  if (err instanceof Error) {
    if (err.message) return classifyFromMessage(err.message);
    // TS narrows kind to FailureKind below.
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : '';
    if (message) return classifyFromMessage(message);
  }
  return unknown;
}