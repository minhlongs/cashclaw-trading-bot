// Security gate — fail-closed sanitizer for untrusted agent output (task §K).
// Runs BEFORE every Zod parse. Rejects: code fences / executable payloads,
// shell commands, filesystem paths/ops, arbitrary URLs (allowlist-only),
// credential-looking strings, prompt-injection markers.
// No execution privilege: this module exposes no eval / new Function /
// child_process / dynamic import / fetch. All external tools are allowlisted.

export type { AllowlistedTool } from './security-gate-patterns';
export type { SanitizeResult } from './security-gate-sanitizer';
export { ALLOWED_TOOLS, ALLOWED_URL_HOSTS, isAllowlistedTool } from './security-gate-patterns';
export { firstPatternViolation, firstUrlViolation, sanitizeUntrusted } from './security-gate-sanitizer';
