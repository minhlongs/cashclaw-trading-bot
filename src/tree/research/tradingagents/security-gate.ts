// Security gate — fail-closed sanitizer for untrusted agent output (task §K).
// Runs BEFORE every Zod parse. Rejects: code fences / executable payloads,
// shell commands, filesystem paths/ops, arbitrary URLs (allowlist-only),
// credential-looking strings, prompt-injection markers.
// No execution privilege: this module exposes no eval / new Function /
// child_process / dynamic import / fetch. All external tools are allowlisted.

/** One allowlisted external tool name. */
export interface AllowlistedTool {
  readonly name: string;
  readonly kind: 'read' | 'search' | 'summarize';
}

/** Sanitization outcome: fail-closed with a reason. */
export type SanitizeResult =
  | { readonly ok: true; readonly cleaned: string }
  | { readonly ok: false; readonly reason: string };

/** The only external tools the adapter may call (task §K). */
export const ALLOWED_TOOLS: readonly AllowlistedTool[] = [
  { name: 'market-data-read', kind: 'read' },
  { name: 'news-read', kind: 'read' },
  { name: 'regime-read', kind: 'read' },
  { name: 'evidence-search', kind: 'search' },
  { name: 'paper-summarize', kind: 'summarize' },
];

const ALLOWED_TOOL_NAMES = new Set(ALLOWED_TOOLS.map((t) => t.name));

/** URL allowlist — only these hosts may appear in agent output. */
export const ALLOWED_URL_HOSTS = new Set<string>([
  'github.com',
  'raw.githubusercontent.com',
  'data.cashclaw.local',
]);

/** Credential-looking patterns — reject outright. */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /sk-[A-Za-z0-9]{16,}/i,
  /AKIA[0-9A-Z]{16}/i,
];

/** Code fences or executable payloads. */
const CODE_FENCE_PATTERN = /```[\s\S]*?```/;

/** Shell-command patterns (pipe-to-shell, rm, curl|sh, backtick execution). */
const SHELL_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bcurl\b[^|\n]*\|\s*(?:sh|bash|zsh)\b/i,
  /\bwget\b[^|\n]*\|\s*(?:sh|bash|zsh)\b/i,
  /\b(?:sh|bash|zsh)\s+-c\b/i,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /`[^`]*`/, // backtick command substitution
];

/** Filesystem path / op patterns. */
const FS_PATTERNS: readonly RegExp[] = [
  /(?:^|\s)\/etc\/passwd(?:\s|$)/i,
  /(?:^|\s)\/root(?:\s|$)/i,
  /(?:^|\s)~\/\.ssh/i,
  /\bchmod\s+\+x\b/i,
  /\bsudo\b/i,
  /\brmdir\b/i,
  /\bmove\s+file\b/i,
  /\bdelete\s+file\b/i,
  /\bwrite\s+(?:to|file)\b/i,
];

/** Prompt-injection markers. */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /system\s+prompt\s*:/i,
  /you\s+are\s+now\s+(?:a\s+)?(?:hacker|attacker)/i,
  /disregard\s+(?:the|all)\s+(?:above|previous)/i,
];

/** Arbitrary-URL pattern (anything not on the allowlist). */
const URL_PATTERN = /https?:\/\/[^\s)'"<>]+/gi;

/**
 * Check whether a tool name is allowlisted. Fail-closed: unknown tools are
 * rejected before any call is made.
 */
export function isAllowlistedTool(toolName: string): boolean {
  return ALLOWED_TOOL_NAMES.has(toolName);
}

/** Return the first blocking reason from a pattern list, or null if clean. */
function firstPatternViolation(
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
function firstUrlViolation(text: string): string | null {
  const urls = text.match(URL_PATTERN);
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

  if (CODE_FENCE_PATTERN.test(text)) {
    return { ok: false, reason: 'security gate: code fences / executable payloads are rejected' };
  }

  const checks: ReadonlyArray<readonly [readonly RegExp[], string]> = [
    [SHELL_PATTERNS, 'shell command'],
    [FS_PATTERNS, 'filesystem op'],
    [CREDENTIAL_PATTERNS, 'credential-looking'],
    [INJECTION_PATTERNS, 'prompt-injection'],
  ];
  for (const [patterns, label] of checks) {
    const violation = firstPatternViolation(text, patterns, label);
    if (violation) return { ok: false, reason: violation };
  }

  const urlViolation = firstUrlViolation(text);
  if (urlViolation) return { ok: false, reason: urlViolation };

  return { ok: true, cleaned: text };
}