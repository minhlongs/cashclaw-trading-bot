// Security gate — fail-closed sanitizer for untrusted agent & feed inputs (task §K + Gate G12).

import { SECURITY_PATTERNS, ALLOWED_URL_HOSTS } from './security-gate-patterns';

/** Sanitization outcome: fail-closed with a deterministic blocking reason. */
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

/** Return the first blocking reason from URL host & query exfiltration checks, or null if clean. */
export function firstUrlViolation(text: string): string | null {
  const urls = text.match(SECURITY_PATTERNS.URL_PATTERN);
  if (!urls) return null;
  for (const raw of urls) {
    try {
      const parsedUrl = new URL(raw);
      const host = parsedUrl.hostname.toLowerCase();
      if (!ALLOWED_URL_HOSTS.has(host)) {
        return `security gate: arbitrary URL host '${host}' is not allowlisted`;
      }
      if (SECURITY_PATTERNS.URL_EXFIL_QUERY_PATTERN.test(parsedUrl.search)) {
        return `security gate: URL query exfiltration parameter on '${host}' is rejected`;
      }
    } catch {
      return `security gate: malformed URL '${raw.slice(0, 40)}' is rejected`;
    }
  }
  return null;
}

const ORDERED_PATTERN_CHECKS: ReadonlyArray<readonly [readonly RegExp[], string]> = [
  [SECURITY_PATTERNS.UNICODE_CONTROL_PATTERNS, 'unicode-control'],
  [SECURITY_PATTERNS.ROLE_DELIMITER_PATTERNS, 'role-delimiter spoofing'],
  [SECURITY_PATTERNS.EXFILTRATION_PATTERNS, 'markdown/uri exfiltration'],
  [SECURITY_PATTERNS.SHELL_PATTERNS, 'shell command'],
  [SECURITY_PATTERNS.FS_PATTERNS, 'filesystem op'],
  [SECURITY_PATTERNS.CREDENTIAL_PATTERNS, 'credential-looking'],
  [SECURITY_PATTERNS.ORDER_AND_RISK_SMUGGLING_PATTERNS, 'order/risk smuggling'],
  [SECURITY_PATTERNS.ENCODED_PAYLOAD_PATTERNS, 'encoded payload'],
  [SECURITY_PATTERNS.INJECTION_PATTERNS, 'prompt-injection'],
];

/**
 * Sanitize untrusted input or agent output. Runs before every Zod parse.
 * Fail-closed: returns the first blocking reason; callers treat any non-ok
 * result as a hard rejection (never partial, never padded).
 */
export function sanitizeUntrusted(text: string): SanitizeResult {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, reason: 'security gate: input must be a non-empty string' };
  }

  if (SECURITY_PATTERNS.CODE_FENCE_PATTERN.test(text)) {
    return { ok: false, reason: 'security gate: code fences / executable payloads are rejected' };
  }

  for (const [patterns, label] of ORDERED_PATTERN_CHECKS) {
    const violation = firstPatternViolation(text, patterns, label);
    if (violation) return { ok: false, reason: violation };
  }

  const urlViolation = firstUrlViolation(text);
  if (urlViolation) return { ok: false, reason: urlViolation };

  return { ok: true, cleaned: text };
}
