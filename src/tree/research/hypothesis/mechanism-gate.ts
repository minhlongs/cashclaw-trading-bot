// Mechanism gate — deterministic heuristic floor for expectedMechanism.
// Pure logic: no I/O, no LLM. This is a FLOOR, not semantic judgment —
// it rejects vacuous claims ("LLM thinks price will go up") while any
// real semantic review stays human (Phase 7).

/** Minimum trimmed length for an expectedMechanism string. */
export const MECHANISM_MIN_LENGTH = 40;

/** Vacuous patterns rejected outright, regardless of length or tokens. */
const BLOCKLIST_PATTERNS: readonly RegExp[] = [
  /llm thinks/i,
  /price will go (up|down)/i,
  /ai predicts/i,
  /model says/i,
  /because i said so/i,
];

/** Causal connectives — one occurrence is sufficient. */
const CAUSAL_CONNECTIVES: readonly string[] = [
  'may indicate',
  'leads to',
  'causes',
  'drives',
  'results in',
  'due to',
  'implies',
];

/** Domain tokens — two distinct occurrences are sufficient. */
const DOMAIN_TOKENS: readonly string[] = [
  'funding',
  'open interest',
  'oi',
  'liquidation',
  'volume',
  'volatility',
  'spread',
  'momentum',
  'reversal',
  'positioning',
  'imbalance',
  'dislocation',
];

/** Result of a mechanism-gate check. */
export interface MechanismGateResult {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

function containsConnective(text: string): boolean {
  return CAUSAL_CONNECTIVES.some((c) => text.includes(c));
}

/** Count distinct domain tokens present (word-bounded, case-insensitive). */
function distinctDomainTokenCount(text: string): number {
  let count = 0;
  for (const token of DOMAIN_TOKENS) {
    const pattern = new RegExp(`\\b${token}\\b`, 'i');
    if (pattern.test(text)) count += 1;
  }
  return count;
}

/**
 * Gate an expectedMechanism string. Fail-closed: every failed check
 * contributes a reason; empty reasons means accepted.
 *
 * Checks:
 * 1. Non-empty and ≥ MECHANISM_MIN_LENGTH chars after trim.
 * 2. No blocklisted vacuous pattern.
 * 3. ≥ 1 causal connective OR ≥ 2 distinct domain tokens.
 */
export function checkMechanism(mechanism: string): MechanismGateResult {
  const reasons: string[] = [];
  const trimmed = mechanism.trim();

  if (trimmed.length === 0) {
    reasons.push('mechanism gate: expectedMechanism must be non-empty');
  } else if (trimmed.length < MECHANISM_MIN_LENGTH) {
    reasons.push(
      `mechanism gate: expectedMechanism must be at least ${MECHANISM_MIN_LENGTH} chars after trim`,
    );
  }

  for (const pattern of BLOCKLIST_PATTERNS) {
    if (pattern.test(trimmed)) {
      reasons.push(`mechanism gate: vacuous pattern '${pattern.source}' is blocked`);
    }
  }

  if (trimmed.length > 0 && !containsConnective(trimmed) && distinctDomainTokenCount(trimmed) < 2) {
    reasons.push(
      'mechanism gate: requires at least one causal connective or two distinct domain tokens',
    );
  }

  return { ok: reasons.length === 0, reasons };
}
