// Security gate — fail-closed sanitizer for untrusted agent output (task §K).

import { SECURITY_PATTERNS, ALLOWED_URL_HOSTS } from './security-gate-patterns';

/** Sanitization outcome: fail-closed with a reason. */
export type SanitizeResult =
  | { readonly ok: true; readonly cleaned: string }
  | { readonly ok: false; readonly reason: string };

/** Return the first blocking reason from a pattern list, or null if clean. */
export function firstPatternViolation(
  text: string,
  patterns: readonly RegExp[],
  label: string,
): string | null {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return `security gate: ${label} pattern '${pattern.source}' is rejected`;
    }
  }
  return null;
}

/** Return the first blocking reason from URL checks, or null if clean. */
export function firstUrlViolation(text: string): string | null {
  const urls = text.match(SECURITY_PATTERNS.URL_PATTERN);
  if (!urls) return null;
  for (const raw of urls) {
    try {
      const host = new URL(raw).hostname.toLowerCase();
      if (!ALLOWED_URL_HOSTS.has(host)) {
        return `security gate: arbitrary URL host '${host}' is not allowlisted`;
      }
    } catch {
      return `security gate: malformed URL '${raw.slice(0, 40)}' is rejected`;
    }
  }
  return null;
}

/**
 * Sanitize untrusted agent output. Runs before every Zod parse. Fail-closed:
 * returns the first blocking reason; the caller must treat any non-ok result
 * as a hard rejection (never partial, never padded).
 */
export function sanitizeUntrusted(text: string): SanitizeResult {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, reason: 'security gate: input must be a non-empty string' };
  }

  if (SECURITY_PATTERNS.CODE_FENCE_PATTERN.test(text)) {
    return { ok: false, reason: 'security gate: code fences / executable payloads are rejected' };
  }

  const checks: ReadonlyArray<readonly [readonly RegExp[], string]> = [
    [SECURITY_PATTERNS.SHELL_PATTERNS, 'shell command'],
    [SECURITY_PATTERNS.FS_PATTERNS, 'filesystem op'],
    [SECURITY_PATTERNS.CREDENTIAL_PATTERNS, 'credential-looking'],
    [SECURITY_PATTERNS.INJECTION_PATTERNS, 'prompt-injection'],
  ];
  for (const [patterns, label] of checks) {
    const violation = firstPatternViolation(text, patterns, label);
    if (violation) return { ok: false, reason: violation };
  }

  const urlViolation = firstUrlViolation(text);
  if (urlViolation) return { ok: false, reason: urlViolation };

  return { ok: true, cleaned: text };
}
