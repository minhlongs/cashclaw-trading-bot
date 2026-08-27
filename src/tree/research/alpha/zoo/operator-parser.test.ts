// Operator parser — unit tests (Phase 3 Step 1).
// Covers: EXACT seed vectors (alpha101_006, qlib158_beta5 verbatim normalized
// strings), residue-strip narrowness, subscript-lag grammar, implicit
// multiplication accept/reject matrix, fail-closed tokens/windows/lags,
// maxLookback computation, precedence, determinism.

import { describe, expect, it } from 'vitest';
import { parseFormula } from './operator-parser';
import type { AstNode } from './operator-ast';
import { normalizeFormula, type SupportedOperator } from './operator-vocabulary';
import seed from './seeds/phase-2-seed.json';
import type { SupportedDataField } from './zoo-metadata';

const num = (value: number): AstNode => ({ kind: 'number', value });
const field = (name: SupportedDataField, lag = 0): AstNode => ({ kind: 'field', name, lag });
const bin = (op: '+' | '-' | '*' | '/', left: AstNode, right: AstNode): AstNode => ({
  kind: 'binary',
  op,
  left,
  right,
});
const un = (operand: AstNode): AstNode => ({ kind: 'unary', operand });
const abs = (operand: AstNode): AstNode => ({ kind: 'abs', operand });
const call = (name: SupportedOperator, args: readonly AstNode[]): AstNode => ({
  kind: 'call',
  name,
  args,
});

const okAst = (formula: string): AstNode => {
  const r = parseFormula(formula);
  if (!r.ok) throw new Error(`expected parse ok for "${formula}", got ${r.reason}`);
  return r.value.ast;
};
const okLookback = (formula: string): number => {
  const r = parseFormula(formula);
  if (!r.ok) throw new Error(`expected parse ok for "${formula}", got ${r.reason}`);
  return r.value.maxLookback;
};
const errReason = (formula: string): string => {
  const r = parseFormula(formula);
  if (r.ok) throw new Error(`expected parse failure for "${formula}"`);
  return r.reason;
};

const seedFormula = (id: string): string => {
  const entry = seed.entries.find((e) => e.id === id);
  if (entry === undefined) throw new Error(`seed entry ${id} missing`);
  return entry.formula_latex;
};

describe('parseFormula — EXACT seed vectors', () => {
  it('alpha101_006 exact normalized string parses to expected AST', () => {
    expect(okAst('-1 * ts_corr(open, volume, 10)')).toEqual(
      bin('*', un(num(1)), call('ts_corr', [field('open'), field('volume'), num(10)])),
    );
  });

  it('alpha101_006 end-to-end: seed latex → normalizeFormula → parseFormula', () => {
    const normalized = normalizeFormula(seedFormula('alpha101_006'));
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(okAst(normalized.value.normalizedFormula)).toEqual(
        bin('*', un(num(1)), call('ts_corr', [field('open'), field('volume'), num(10)])),
      );
    }
  });

  it('qlib158_beta5 exact normalized string parses as (close_t - close_{t-5}) / (5·close)', () => {
    const beta5 = '(\\close_t - \\close_{{t-5}}) / (5\\ \\close)';
    expect(okAst(beta5)).toEqual(
      bin('/', bin('-', field('close', 0), field('close', 5)), bin('*', num(5), field('close', 0))),
    );
    expect(okLookback(beta5)).toBe(5);
  });

  it('qlib158_beta5 end-to-end: seed latex → normalizeFormula → parseFormula', () => {
    const normalized = normalizeFormula(seedFormula('qlib158_beta5'));
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(okAst(normalized.value.normalizedFormula)).toEqual(
        bin('/', bin('-', field('close', 0), field('close', 5)), bin('*', num(5), field('close', 0))),
      );
    }
  });

  it('vsump normalized string fails closed naming bare token sum', () => {
    expect(errReason('sum ts_max( Delta v, 0) / sum | Delta v|')).toBe(
      'EVAL_UNSUPPORTED_TOKEN:sum',
    );
  });
});

describe('parseFormula — subscript-lag grammar', () => {
  it('close_t → lag 0', () => {
    expect(okAst('close_t')).toEqual(field('close', 0));
  });
  it('close_{t-5} → lag 5', () => {
    expect(okAst('close_{t-5}')).toEqual(field('close', 5));
  });
  it('close_{{t-5}} double braces → lag 5', () => {
    expect(okAst('close_{{t-5}}')).toEqual(field('close', 5));
  });
  it('close_{t+5} → NON_CAUSAL_LAG', () => {
    expect(errReason('close_{t+5}')).toBe('NON_CAUSAL_LAG');
  });
  it('bad subscript content fails closed', () => {
    expect(errReason('close_{t*k}')).toBe('EVAL_PARSE_ERROR:subscript');
    expect(errReason('close_{x}')).toBe('EVAL_PARSE_ERROR:subscript');
    expect(errReason('close_{t-}')).toBe('EVAL_PARSE_ERROR:subscript');
    expect(errReason('close_5')).toBe('EVAL_PARSE_ERROR:subscript');
  });
});

describe('parseFormula — backslash residue-strip narrowness', () => {
  it('\\close strips to field close', () => {
    expect(okAst('\\close')).toEqual(field('close', 0));
  });
  it('lone backslash adjacent to whitespace is dropped (5\\ \\close)', () => {
    expect(okAst('5\\ \\close')).toEqual(bin('*', num(5), field('close', 0)));
  });
  it('\\foo with unknown identifier fails closed naming foo', () => {
    expect(errReason('\\foo')).toBe('EVAL_UNSUPPORTED_TOKEN:foo');
  });
  it('residual backslash not covered by the narrow rule fails closed', () => {
    // `\5` — backslash before a digit is neither identifier-start nor
    // whitespace-adjacent, so the narrow strip leaves it → fail closed.
    expect(errReason('\\5')).toBe('EVAL_UNSUPPORTED_TOKEN:\\');
  });
});

describe('parseFormula — implicit multiplication matrix', () => {
  it('number · identifier across whitespace: 5 close', () => {
    expect(okAst('5 close')).toEqual(bin('*', num(5), field('close', 0)));
  });
  it('number · identifier without whitespace: 5close', () => {
    expect(okAst('5close')).toEqual(bin('*', num(5), field('close', 0)));
  });
  it('number · paren-group: 5 (close + open)', () => {
    expect(okAst('5 (close + open)')).toEqual(
      bin('*', num(5), bin('+', field('close', 0), field('open', 0))),
    );
  });
  it('number · call: 2 ts_mean(close, 3)', () => {
    expect(okAst('2 ts_mean(close, 3)')).toEqual(
      bin('*', num(2), call('ts_mean', [field('close', 0), num(3)])),
    );
  });
  it('identifier · identifier juxtaposition rejected', () => {
    expect(errReason('close open')).toBe('EVAL_PARSE_ERROR:juxtaposition');
  });
  it('identifier · number juxtaposition rejected', () => {
    expect(errReason('close 5')).toBe('EVAL_PARSE_ERROR:juxtaposition');
  });
  it('number · number juxtaposition rejected', () => {
    expect(errReason('5 5')).toBe('EVAL_PARSE_ERROR:juxtaposition');
  });
});

describe('parseFormula — fail-closed tokens', () => {
  it('bare unknown identifier sum → EVAL_UNSUPPORTED_TOKEN:sum (never \\sum)', () => {
    expect(errReason('sum')).toBe('EVAL_UNSUPPORTED_TOKEN:sum');
  });
  it('bare unknown identifier Delta → EVAL_UNSUPPORTED_TOKEN:Delta', () => {
    expect(errReason('Delta')).toBe('EVAL_UNSUPPORTED_TOKEN:Delta');
  });
  it('unknown operator call → EVAL_UNKNOWN_OPERATOR', () => {
    expect(errReason('foo(close)')).toBe('EVAL_UNKNOWN_OPERATOR:foo');
  });
  it('conditional/comparison characters fail closed', () => {
    expect(errReason('close ? open')).toBe('EVAL_UNSUPPORTED_TOKEN:?');
    expect(errReason('close = open')).toBe('EVAL_UNSUPPORTED_TOKEN:=');
  });
  it('leftover tokens fail closed', () => {
    expect(errReason('close )')).toBe('EVAL_UNSUPPORTED_TOKEN:)');
    expect(errReason('close , open')).toBe('EVAL_UNSUPPORTED_TOKEN:,');
  });
  it('empty formula fails closed', () => {
    expect(errReason('')).toBe('EVAL_PARSE_ERROR:unexpected-end');
  });
});

describe('parseFormula — window/lag validation', () => {
  it('ts_corr n=1 → EVAL_INVALID_WINDOW', () => {
    expect(errReason('ts_corr(open, volume, 1)')).toBe('EVAL_INVALID_WINDOW:ts_corr');
  });
  it('ts_std n=1 → EVAL_INVALID_WINDOW', () => {
    expect(errReason('ts_std(close, 1)')).toBe('EVAL_INVALID_WINDOW:ts_std');
  });
  it('ts_mean n=0 → EVAL_INVALID_WINDOW', () => {
    expect(errReason('ts_mean(close, 0)')).toBe('EVAL_INVALID_WINDOW:ts_mean');
  });
  it('delta d=0 → NON_CAUSAL_LAG', () => {
    expect(errReason('delta(close, 0)')).toBe('NON_CAUSAL_LAG');
  });
  it('delta d=-1 → NON_CAUSAL_LAG', () => {
    expect(errReason('delta(close, -1)')).toBe('NON_CAUSAL_LAG');
  });
  it('non-literal window argument fails closed', () => {
    expect(errReason('ts_mean(close, n)')).toBe('EVAL_UNSUPPORTED_TOKEN:n');
    expect(errReason('ts_mean(close, 2.5)')).toBe('EVAL_INVALID_WINDOW:ts_mean');
  });
  it('arity violations fail closed', () => {
    expect(errReason('ts_mean(close)')).toBe('EVAL_PARSE_ERROR:ts_mean-arity');
    expect(errReason('ts_corr(open, volume)')).toBe('EVAL_PARSE_ERROR:ts_corr-arity');
    expect(errReason('rank(close, 2)')).toBe('EVAL_PARSE_ERROR:rank-arity');
  });
  it('optional params accepted: scale(close), scale(close, 2), safe_div(a, b[, eps])', () => {
    expect(okAst('scale(close)')).toEqual(call('scale', [field('close', 0)]));
    expect(okAst('scale(close, 2)')).toEqual(call('scale', [field('close', 0), num(2)]));
    expect(okAst('safe_div(close, open)')).toEqual(
      call('safe_div', [field('close', 0), field('open', 0)]),
    );
    expect(okAst('safe_div(close, open, 0.001)')).toEqual(
      call('safe_div', [field('close', 0), field('open', 0), num(0.001)]),
    );
  });
});

describe('parseFormula — structure, precedence, maxLookback', () => {
  it('unary minus and absolute value', () => {
    expect(okAst('-close')).toEqual(un(field('close', 0)));
    expect(okAst('|close - open|')).toEqual(abs(bin('-', field('close', 0), field('open', 0))));
  });
  it('vwap parses as field (bare) and as zero-arg call', () => {
    expect(okAst('vwap')).toEqual(field('vwap', 0));
    expect(okAst('vwap()')).toEqual(call('vwap', []));
  });
  it('multiplication binds tighter than addition', () => {
    expect(okAst('close + open * volume')).toEqual(
      bin('+', field('close', 0), bin('*', field('open', 0), field('volume', 0))),
    );
    expect(okAst('(close + open) * volume')).toEqual(
      bin('*', bin('+', field('close', 0), field('open', 0)), field('volume', 0)),
    );
  });
  it('nested calls parse', () => {
    expect(okAst('rank(ts_mean(close, 5))')).toEqual(
      call('rank', [call('ts_mean', [field('close', 0), num(5)])]),
    );
  });
  it('maxLookback = max over lags and window/lag literals', () => {
    expect(okLookback('-1 * ts_corr(open, volume, 10)')).toBe(10);
    expect(okLookback('delta(close, 5)')).toBe(5);
    expect(okLookback('ts_mean(close, 20)')).toBe(20);
    expect(okLookback('close_{t-21}')).toBe(21);
    expect(okLookback('ts_corr(delta(close, 1), volume, 10)')).toBe(10);
    expect(okLookback('close + open')).toBe(0);
  });
  it('deterministic: same formula twice → deep-equal results', () => {
    const formula = '(\\close_t - \\close_{{t-5}}) / (5\\ \\close)';
    expect(parseFormula(formula)).toEqual(parseFormula(formula));
  });
});
