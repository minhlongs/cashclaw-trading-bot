// Security gate — allowlists & regex patterns (task §K).

/** One allowlisted external tool name. */
export interface AllowlistedTool {
  readonly name: string;
  readonly kind: 'read' | 'search' | 'summarize';
}

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

/** Exposed for sanitizer. */
export const SECURITY_PATTERNS = {
  CREDENTIAL_PATTERNS,
  CODE_FENCE_PATTERN,
  SHELL_PATTERNS,
  FS_PATTERNS,
  INJECTION_PATTERNS,
  URL_PATTERN,
} as const;
