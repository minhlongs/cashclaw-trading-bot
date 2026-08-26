// Operator vocabulary + formula normalizer for zoo formula_latex strings.
// Pure string classification ONLY — no eval, no parser library, no
// execution. Recognition ≠ implementation: unknown tokens are reported,
// never interpreted (REIMPLEMENT backlog input for Phase 3+).

/** The 17 causal-by-construction operators from zoo base.py. */
export const SUPPORTED_OPERATORS = [
  'rank',
  'zscore',
  'scale',
  'ts_rank',
  'ts_corr',
  'ts_cov',
  'ts_mean',
  'ts_std',
  'ts_max',
  'ts_min',
  'ts_argmax',
  'ts_argmin',
  'delta',
  'decay_linear',
  'signed_power',
  'safe_div',
  'vwap',
] as const;
export type SupportedOperator = (typeof SUPPORTED_OPERATORS)[number];

/** Uppercase DSL / academic aliases → canonical operator (case-insensitive). */
export const OPERATOR_ALIASES: Readonly<Record<string, SupportedOperator>> = {
  RANK: 'rank',
  ZSCORE: 'zscore',
  SCALE: 'scale',
  TS_RANK: 'ts_rank',
  CORR: 'ts_corr',
  CORRELATION: 'ts_corr',
  CORRELATE: 'ts_corr',
  TS_CORR: 'ts_corr',
  COV: 'ts_cov',
  COVARIANCE: 'ts_cov',
  TS_COV: 'ts_cov',
  MEAN: 'ts_mean',
  SMA: 'ts_mean',
  TS_MEAN: 'ts_mean',
  STD: 'ts_std',
  STDDEV: 'ts_std',
  TS_STD: 'ts_std',
  MAX: 'ts_max',
  TSMAX: 'ts_max',
  TS_MAX: 'ts_max',
  MIN: 'ts_min',
  TSMIN: 'ts_min',
  TS_MIN: 'ts_min',
  ARGMAX: 'ts_argmax',
  TS_ARGMAX: 'ts_argmax',
  ARGMIN: 'ts_argmin',
  TS_ARGMIN: 'ts_argmin',
  DELTA: 'delta',
  DELAY: 'delta',
  DECAY_LINEAR: 'decay_linear',
  DECAYLINEAR: 'decay_linear',
  SIGNED_POWER: 'signed_power',
  SIGNEDPOWER: 'signed_power',
  SAFE_DIV: 'safe_div',
  VWAP: 'vwap',
};

/** Successful normalization output. */
export interface NormalizedFormula {
  readonly normalizedFormula: string;
  readonly recognizedOperators: readonly SupportedOperator[];
  readonly normalizationsApplied: readonly string[];
}

export type NormalizeFormulaResult =
  | { readonly ok: true; readonly value: NormalizedFormula }
  | { readonly ok: false; readonly reasons: readonly string[] };

const CALL_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const ARITHMETIC_PATTERN = /[+\-*/]/;
const CONDITIONAL_PATTERN = /\?|\bif\s*\(/i;
const NEGATIVE_LAG_PATTERN =
  /\b(?:delta|delay|ref|shift)\s*\([^()]*,\s*-\s*\d+(?:\.\d+)?\s*\)/i;

/** Strip LaTeX decorations: \mathrm{...}, \text{...}, \,, escaped backslashes. */
function stripLatex(raw: string): { text: string; stripped: boolean } {
  let text = raw.replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\text\s*\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\\s*,/g, ' ');
  text = text.replace(/\\\\/g, ' ');
  return { text, stripped: text !== raw };
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Case-fold every call token through the alias table; returns new text. */
function foldOperatorTokens(text: string, applied: string[]): string {
  return text.replace(CALL_PATTERN, (match, token: string) => {
    const canonical = OPERATOR_ALIASES[token.toUpperCase()];
    if (canonical === undefined || token === canonical) return match;
    applied.push(`case-folded ${token} → ${canonical}`);
    return `${canonical}(`;
  });
}

function collectUnknownOperators(text: string): readonly string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(CALL_PATTERN)) {
    const token = match[1];
    if (OPERATOR_ALIASES[token.toUpperCase()] === undefined) unknown.add(token.toUpperCase());
  }
  return [...unknown].sort().map((token) => `UNSUPPORTED_OPERATOR:${token}`);
}

function collectRecognizedOperators(text: string): readonly SupportedOperator[] {
  const recognized = new Set<SupportedOperator>();
  for (const match of text.matchAll(CALL_PATTERN)) {
    const canonical = OPERATOR_ALIASES[match[1].toUpperCase()];
    if (canonical !== undefined) recognized.add(canonical);
  }
  return SUPPORTED_OPERATORS.filter((op) => recognized.has(op));
}

/**
 * Normalize a raw formula_latex string into a canonical classification.
 * Fail-closed: placeholder/prose → FORMULA_UNPARSEABLE; conditionals →
 * UNSUPPORTED_EXPRESSION_FORM:conditional; unknown call tokens →
 * UNSUPPORTED_OPERATOR:<TOKEN>; forward references →
 * NON_CAUSAL_FORWARD_REFERENCE. Pure string work — never evaluates.
 */
export function normalizeFormula(raw: string): NormalizeFormulaResult {
  const { text: stripped, stripped: latexStripped } = stripLatex(raw);
  const collapsed = collapseWhitespace(stripped);
  if (collapsed === '') return { ok: false, reasons: ['FORMULA_UNPARSEABLE'] };

  const reasons: string[] = [];
  if (CONDITIONAL_PATTERN.test(collapsed)) {
    reasons.push('UNSUPPORTED_EXPRESSION_FORM:conditional');
  }
  if (NEGATIVE_LAG_PATTERN.test(collapsed)) reasons.push('NON_CAUSAL_FORWARD_REFERENCE');
  reasons.push(...collectUnknownOperators(collapsed));

  const applied: string[] = [];
  const normalizedFormula = foldOperatorTokens(collapsed, applied);
  if (latexStripped) applied.push('stripped latex decorations');
  if (normalizedFormula !== collapsed) applied.push('collapsed whitespace / case-folded tokens');

  const recognized = collectRecognizedOperators(normalizedFormula);
  const hasArithmetic = ARITHMETIC_PATTERN.test(normalizedFormula);
  if (recognized.length === 0 && !hasArithmetic) {
    return { ok: false, reasons: ['FORMULA_UNPARSEABLE', ...reasons] };
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    value: { normalizedFormula, recognizedOperators: recognized, normalizationsApplied: applied },
  };
}
