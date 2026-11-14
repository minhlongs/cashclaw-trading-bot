// Security gate — allowlists & regex patterns (task §K + Gate G12 Red-Team Hardening).
// Pure tree-layer rules: zero I/O, zero execution surface, zero order authority.

/** One allowlisted external tool name. */
export interface AllowlistedTool {
  readonly name: string;
  readonly kind: 'read' | 'search' | 'summarize';
}

/** The only external tools the deliberation adapter may call (read/search/summarize only). */
export const ALLOWED_TOOLS: readonly AllowlistedTool[] = [
  { name: 'market-data-read', kind: 'read' },
  { name: 'news-read', kind: 'read' },
  { name: 'regime-read', kind: 'read' },
  { name: 'evidence-search', kind: 'search' },
  { name: 'paper-summarize', kind: 'summarize' },
];

const ALLOWED_TOOL_NAMES = new Set(ALLOWED_TOOLS.map((t) => t.name));

/** URL allowlist — only these hosts may appear in untrusted or synthesized text. */
export const ALLOWED_URL_HOSTS = new Set<string>([
  'github.com',
  'raw.githubusercontent.com',
  'data.cashclaw.local',
]);

/** Zero-width & bidirectional Unicode control characters (Trojan Source / invisible smuggling). */
const UNICODE_CONTROL_PATTERNS: readonly RegExp[] = [
  /[​-‏‪-‮⁦-⁩﻿]/,
];

/** Credential-looking patterns — reject outright. */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /api[_-]?key/i,
  /ipn[_-]?secret/i,
  /secret/i,
  /password/i,
  /token\s*[:=]/i,
  /bearer\s+[A-Za-z0-9._-]{12,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /sk-[A-Za-z0-9]{16,}/i,
  /AKIA[0-9A-Z]{16}/i,
  /\b(?:mnemonic|seed\s+phrase)\b/i,
];

/** Code fences or executable payloads. */
const CODE_FENCE_PATTERN = /```[\s\S]*?```/;

/** Shell-command patterns (pipe-to-shell, rm, curl|sh, backtick substitution). */
const SHELL_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bcurl\b[^|\n]*\|\s*(?:sh|bash|zsh)\b/i,
  /\bwget\b[^|\n]*\|\s*(?:sh|bash|zsh)\b/i,
  /\b(?:sh|bash|zsh)\s+-c\b/i,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /`[^`]*`/,
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

/** Role / chat-template delimiter spoofing. */
const ROLE_DELIMITER_PATTERNS: readonly RegExp[] = [
  /<\|(?:im_start|im_end|system|user|assistant|endoftext|tool_call)\|>/i,
  /\[\/?INST\]/i,
  /<<\/?SYS>>/i,
  /(?:^|\n)\s*###\s*(?:System|Instruction|Developer|Assistant|Human)\s*:/i,
  /<\/?(?:system|instruction|tool_call|tool_result|function_call|developer)>/i,
  /\b(?:developer|system|admin)\s+override\s*:/i,
];

/** Direct or indirect order-placement, fund-transfer, and risk-override smuggling. */
const ORDER_AND_RISK_SMUGGLING_PATTERNS: readonly RegExp[] = [
  /\b(?:place_order|create_?order|submit_?order|execute_?order|send_?order|cancel_?all_?orders)\b/i,
  /\b(?:market_?buy|market_?sell|limit_?buy|limit_?sell)\s*\(/i,
  /\bbypass\s+(?:kill\s*switch|risk|gate|guard|limit|quarantine)/i,
  /\b(?:disable|override|turn\s+off|deactivate)\s+(?:kill\s*switch|risk|stop[\s_-]?loss|drawdown|circuit[\s_-]?breaker)/i,
  /\bset[\s_]+leverage\b/i,
  /\b(?:transfer[\s_]+funds|withdraw[\s_]+(?:funds|all|usdt|usdc|btc|eth|crypto)|drain[\s_]+wallet)\b/i,
];

/** Encoded payload directives (base64, charCode, hex/unicode escape chains). */
const ENCODED_PAYLOAD_PATTERNS: readonly RegExp[] = [
  /\bbase64\s*:/i,
  /\batob\s*\(/i,
  /\bBuffer\.from\s*\(/i,
  /\bfromCharCode\b/i,
  /(?:\\x[0-9a-fA-F]{2}){4,}/,
  /(?:\\u[0-9a-fA-F]{4}){4,}/,
];

/** Markdown image/link exfiltration beacons & dangerous URI schemes. */
const EXFILTRATION_PATTERNS: readonly RegExp[] = [
  /!\[[^\]]*\]\(\s*(?:https?:|data:|javascript:)/i,
  /\b(?:javascript|vbscript|data:text\/html)\s*:/i,
];

/** Multilingual (EN + VI + ZH) prompt-injection & override phrases. */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions|rules|directives|prompts)/i,
  /forget\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|rules|constraints)/i,
  /system\s+prompt\s*:/i,
  /you\s+are\s+now\s+(?:a\s+|an\s+)?(?:hacker|attacker|unrestricted|autonomous\s+execution|live\s+trader)/i,
  /disregard\s+(?:the|all)\s+(?:above|previous|safety|prior)/i,
  /bỏ\s+qua\s+(?:mọi|tất\s+cả|các)\s+(?:hướng\s+dẫn|chỉ\s+thị|quy\s+tắc)\s*(?:trước)?/i,
  /bo\s+qua\s+(?:moi|tat\s+ca)\s+(?:huong\s+dan|chi\s+thi)\s*(?:truoc)?/i,
  /đặt\s+lệnh\s+(?:mua|bán)\s+ngay/i,
  /tắt\s+(?:công\s+tắc\s+khẩn\s+cấp|kill\s*switch|giới\s+hạn\s+rủi\s+ro)/i,
  /忽略(?:之前|以前|上述|所有)(?:的)?(?:所有)?(?:指令|指示|规则|限制)/,
  /无视(?:之前|上述|所有)(?:的)?(?:指令|规则|风控)/,
  /立即(?:下单|买入|卖出|执行交易|转出资金)/,
  /关闭(?:风控|止损|熔断)/,
];

/** Query-parameter keys indicating URL exfiltration over allowlisted hosts. */
const URL_EXFIL_QUERY_PATTERN = /[?&](?:secret|token|key|api_key|session|cookie|exfil|leak|dump|cred)=/i;

/** Arbitrary-URL pattern (anything not on the allowlist). */
const URL_PATTERN = /https?:\/\/[^\s)'"<>]+/gi;

/** Check whether a tool name is allowlisted. Fail-closed on unknown tools. */
export function isAllowlistedTool(toolName: string): boolean {
  return ALLOWED_TOOL_NAMES.has(toolName);
}

/** Exposed for sanitizer. */
export const SECURITY_PATTERNS = {
  UNICODE_CONTROL_PATTERNS,
  CREDENTIAL_PATTERNS,
  CODE_FENCE_PATTERN,
  SHELL_PATTERNS,
  FS_PATTERNS,
  ROLE_DELIMITER_PATTERNS,
  ORDER_AND_RISK_SMUGGLING_PATTERNS,
  ENCODED_PAYLOAD_PATTERNS,
  EXFILTRATION_PATTERNS,
  INJECTION_PATTERNS,
  URL_EXFIL_QUERY_PATTERN,
  URL_PATTERN,
} as const;
