// Operator vocabulary + formula normalizer — unit tests.
// Covers: alias vectors (gtja191 uppercase, qlib lowercase, academic LaTeX),
// placeholder rejection, non-causal forward references, unknown operators,
// conditional forms, idempotence, vocabulary completeness.

import { describe, expect, it } from 'vitest';
import {
  OPERATOR_ALIASES,
  SUPPORTED_OPERATORS,
  normalizeFormula,
} from './operator-vocabulary';

const GTJA191_001 =
  '(-1 * CORR(RANK(DELTA(LOG(VOLUME), 1)), RANK(((CLOSE - OPEN) / OPEN)), 6))';

describe('normalizeFormula — alias vectors', () => {
  it('gtja191_001 uppercase DSL: folds CORR/RANK/DELTA, flags LOG', () => {
    const result = normalizeFormula(GTJA191_001);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain('UNSUPPORTED_OPERATOR:LOG');
      expect(result.reasons).toHaveLength(1);
    }
  });

  it('uppercase-only formula folds operator tokens (data fields keep case)', () => {
    const result = normalizeFormula('(-1 * CORR(RANK(DELTA(VOLUME, 1)), CLOSE, 6))');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.normalizedFormula).toBe(
        '(-1 * ts_corr(rank(delta(VOLUME, 1)), CLOSE, 6))',
      );
      expect(result.value.recognizedOperators).toEqual(['rank', 'ts_corr', 'delta']);
      expect(result.value.normalizationsApplied.length).toBeGreaterThan(0);
    }
  });

  it('qlib lowercase form passes with zero case-fold normalizations', () => {
    const result = normalizeFormula('safe_div(delta(close, 5), ts_mean(volume, 20))');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.normalizedFormula).toBe('safe_div(delta(close, 5), ts_mean(volume, 20))');
      expect(result.value.recognizedOperators).toEqual(['ts_mean', 'delta', 'safe_div']);
      expect(
        result.value.normalizationsApplied.some((n) => n.startsWith('case-folded')),
      ).toBe(false);
    }
  });

  it('academic LaTeX form strips \\mathrm{} and folds aliases', () => {
    const result = normalizeFormula('\\mathrm{ZSCORE}(\\mathrm{CORRELATION}(close,\\,volume, 10))');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.normalizedFormula).toBe('zscore(ts_corr(close, volume, 10))');
      expect(result.value.recognizedOperators).toEqual(['zscore', 'ts_corr']);
      expect(result.value.normalizationsApplied).toContain('stripped latex decorations');
    }
  });

  it('DELAY alias maps to delta', () => {
    const result = normalizeFormula('-1 * DELAY(close, 3)');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.normalizedFormula).toBe('-1 * delta(close, 3)');
      expect(result.value.recognizedOperators).toEqual(['delta']);
    }
  });

  it('TSMIN/TSMAX/STDDEV/SIGNEDPOWER/DECAYLINEAR aliases fold', () => {
    const result = normalizeFormula('TSMAX(STDDEV(close, 5), 20) - TSMIN(SIGNEDPOWER(DECAYLINEAR(vwap, 3), 2), 10)');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.normalizedFormula).toBe(
        'ts_max(ts_std(close, 5), 20) - ts_min(signed_power(decay_linear(vwap, 3), 2), 10)',
      );
      expect(result.value.recognizedOperators).toEqual([
        'ts_std',
        'ts_max',
        'ts_min',
        'decay_linear',
        'signed_power',
      ]);
    }
  });
});

describe('normalizeFormula — placeholder / prose', () => {
  it("'see body' → FORMULA_UNPARSEABLE", () => {
    const result = normalizeFormula('see body');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('FORMULA_UNPARSEABLE');
  });

  it('empty and whitespace-only → FORMULA_UNPARSEABLE', () => {
    expect(normalizeFormula('').ok).toBe(false);
    const ws = normalizeFormula('   ');
    expect(ws.ok).toBe(false);
    if (!ws.ok) expect(ws.reasons).toContain('FORMULA_UNPARSEABLE');
  });

  it('prose with arithmetic but no recognized call still parses as arithmetic', () => {
    const result = normalizeFormula('close - open');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.recognizedOperators).toEqual([]);
  });
});

describe('normalizeFormula — non-causal forward references', () => {
  it('delta(close, -1) → NON_CAUSAL_FORWARD_REFERENCE', () => {
    const result = normalizeFormula('delta(close, -1)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('NON_CAUSAL_FORWARD_REFERENCE');
  });

  it('Ref(close, -5) → NON_CAUSAL_FORWARD_REFERENCE', () => {
    const result = normalizeFormula('Ref(close, -5)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('NON_CAUSAL_FORWARD_REFERENCE');
  });

  it('shift(x, -1) → NON_CAUSAL_FORWARD_REFERENCE', () => {
    const result = normalizeFormula('shift(x, -1)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('NON_CAUSAL_FORWARD_REFERENCE');
  });

  it('positive lag delta(close, 1) stays causal', () => {
    expect(normalizeFormula('delta(close, 1)').ok).toBe(true);
  });
});

describe('normalizeFormula — unsupported operators and forms', () => {
  it('SUM(...) → UNSUPPORTED_OPERATOR:SUM', () => {
    const result = normalizeFormula('SUM(close, 5)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('UNSUPPORTED_OPERATOR:SUM');
  });

  it('indneutralize → UNSUPPORTED_OPERATOR:INDNEUTRALIZE', () => {
    const result = normalizeFormula('indneutralize(rank(close), sector)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('UNSUPPORTED_OPERATOR:INDNEUTRALIZE');
  });

  it('ADV20 bare reference inside calls is flagged as unknown token', () => {
    const result = normalizeFormula('rank(close / ADV20(x))');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('UNSUPPORTED_OPERATOR:ADV20');
  });

  it('multiple unknown operators are all collected', () => {
    const result = normalizeFormula('WMA(LOG(close), 5)');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain('UNSUPPORTED_OPERATOR:WMA');
      expect(result.reasons).toContain('UNSUPPORTED_OPERATOR:LOG');
    }
  });

  it('(a<b)?c:d → UNSUPPORTED_EXPRESSION_FORM:conditional', () => {
    const result = normalizeFormula('(a<b)?c:d');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('UNSUPPORTED_EXPRESSION_FORM:conditional');
  });

  it('if(...) form → UNSUPPORTED_EXPRESSION_FORM:conditional', () => {
    const result = normalizeFormula('if(close > open, rank(volume), 0)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('UNSUPPORTED_EXPRESSION_FORM:conditional');
  });
});

describe('normalizeFormula — idempotence and vocabulary', () => {
  it('normalize is idempotent on the normalized formula string', () => {
    const first = normalizeFormula(GTJA191_001.replace('LOG(VOLUME)', 'VOLUME'));
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = normalizeFormula(first.value.normalizedFormula);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value.normalizedFormula).toBe(first.value.normalizedFormula);
        expect(second.value.recognizedOperators).toEqual(first.value.recognizedOperators);
      }
    }
  });

  it('SUPPORTED_OPERATORS has exactly the 17 base.py operators', () => {
    expect(SUPPORTED_OPERATORS).toHaveLength(17);
    expect(new Set(SUPPORTED_OPERATORS).size).toBe(17);
  });

  it('every alias maps to a supported operator; canonicals alias to themselves', () => {
    for (const canonical of Object.values(OPERATOR_ALIASES)) {
      expect(SUPPORTED_OPERATORS).toContain(canonical);
    }
    for (const op of SUPPORTED_OPERATORS) {
      expect(OPERATOR_ALIASES[op.toUpperCase()]).toBe(op);
    }
  });
});
