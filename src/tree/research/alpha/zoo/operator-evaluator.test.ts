// Operator evaluator — end-to-end tests (Phase 3 Step 2).
// Verifies the AST walker over a symbol×time panel: exact seed vectors
// (beta5, alpha101_006), causal warmup nulls, fail-closed typed errors,
// determinism, and append-invariance (adding later bars never changes
// already-emitted values). Pure; no I/O.

import { describe, expect, it } from 'vitest';
import { evaluateFormula, type SymbolPanel } from './operator-evaluator';
import { normalizeFormula } from './operator-vocabulary';

// Deterministic pseudo-random generator (mulberry32) — no Math.random.
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makePanel = (
  symbols: readonly string[],
  len: number,
  seed: number,
  fields: readonly string[] = ['open', 'high', 'low', 'close', 'volume'],
): SymbolPanel => {
  const rand = rng(seed);
  const out: Record<string, (number | null)[][]> = {};
  for (const f of fields) {
    out[f] = symbols.map(() => {
      const row: number[] = [];
      let v = 10 + rand() * 90;
      for (let t = 0; t < len; t += 1) {
        v += (rand() - 0.5) * 2;
        row.push(Number(v.toFixed(4)));
      }
      return row;
    });
  }
  return { symbols, fields: out };
};

const normalized = (raw: string): string => {
  const r = normalizeFormula(raw);
  if (!r.ok) throw new Error(`normalize failed: ${r.reasons.join(',')}`);
  return r.value.normalizedFormula;
};

/** Truncate every series in a panel to `len` bars (prefix-preserving slice). */
const slicePanel = (panel: SymbolPanel, len: number): SymbolPanel => ({
  symbols: panel.symbols,
  fields: Object.fromEntries(
    Object.entries(panel.fields).map(([f, m]) => [f, m.map((row) => row.slice(0, len))]),
  ),
});

describe('evaluator end-to-end seed vectors', () => {
  it('beta5: (close_t - close_{t-5}) / (5*close) — first 5 bars null', () => {
    const formula = normalized('(\\close_t - \\close_{{t-5}}) / (5\\ \\close)');
    const panel = makePanel(['AAA', 'BBB'], 12, 7);
    const r = evaluateFormula(formula, panel);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const close = panel.fields.close;
    for (let s = 0; s < panel.symbols.length; s += 1) {
      for (let t = 0; t < 5; t += 1) expect(r.value[s][t]).toBeNull();
      for (let t = 5; t < 12; t += 1) {
        const c = close[s];
        const expected = ((c[t] as number) - (c[t - 5] as number)) / (5 * (c[t] as number));
        expect(r.value[s][t]).toBeCloseTo(expected, 9);
      }
    }
  });

  it('alpha101_006: -1 * ts_corr(open, volume, 10) — first 9 null, values in [-1,1]', () => {
    const formula = normalized('-1 * correlation(open, volume, 10)');
    const panel = makePanel(['AAA', 'BBB', 'CCC'], 20, 11);
    const r = evaluateFormula(formula, panel);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (let s = 0; s < panel.symbols.length; s += 1) {
      for (let t = 0; t < 9; t += 1) expect(r.value[s][t]).toBeNull();
      for (let t = 9; t < 20; t += 1) {
        const v = r.value[s][t];
        expect(v).not.toBeNull();
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(-1);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('evaluator causal warmup and fail-closed', () => {
  it('warmup bars are null, never fabricated', () => {
    const panel = makePanel(['AAA'], 6, 3);
    const r = evaluateFormula('ts_mean(close, 3)', panel);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0][0]).toBeNull();
    expect(r.value[0][1]).toBeNull();
    expect(r.value[0][2]).not.toBeNull();
  });

  it('insufficient panel length → EVAL_INSUFFICIENT_PANEL', () => {
    const panel = makePanel(['AAA'], 3, 5); // len 3 < maxLookback(10)+1
    const r = evaluateFormula('ts_corr(open, volume, 10)', panel);
    expect(r).toEqual({ ok: false, reason: 'EVAL_INSUFFICIENT_PANEL' });
  });

  it('missing field → EVAL_MISSING_FIELD', () => {
    const panel = makePanel(['AAA'], 10, 9, ['open', 'close']); // no volume
    const r = evaluateFormula('ts_corr(open, volume, 5)', panel);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EVAL_MISSING_FIELD:volume');
  });

  it('empty panel → EVAL_EMPTY_PANEL', () => {
    const r = evaluateFormula('close', { symbols: [], fields: {} });
    expect(r).toEqual({ ok: false, reason: 'EVAL_EMPTY_PANEL' });
  });

  it('ragged panel → EVAL_PANEL_RAGGED', () => {
    const panel: SymbolPanel = {
      symbols: ['AAA'],
      fields: { close: [[1, 2, 3], [1, 2]] },
    };
    const r = evaluateFormula('close', panel);
    expect(r).toEqual({ ok: false, reason: 'EVAL_PANEL_RAGGED' });
  });

  it('unknown token surfaces typed parse error via evaluateFormula', () => {
    const panel = makePanel(['AAA'], 10, 4);
    const r = evaluateFormula('sum ts_max(delta(close, 1), 0)', panel);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EVAL_UNSUPPORTED_TOKEN:sum');
  });

  it('non-causal lag rejected', () => {
    const panel = makePanel(['AAA'], 10, 4);
    const r = evaluateFormula('delta(close, -1)', panel);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NON_CAUSAL_LAG');
  });
});

describe('evaluator determinism and append-invariance', () => {
  it('same formula + panel → identical output (deterministic)', () => {
    const panel = makePanel(['AAA', 'BBB'], 15, 21);
    const formula = normalized('-1 * correlation(open, volume, 10)');
    const a = evaluateFormula(formula, panel);
    const b = evaluateFormula(formula, panel);
    expect(a).toEqual(b);
  });

  it('appending later bars never changes already-emitted values', () => {
    const formula = normalized('(\\close_t - \\close_{{t-5}}) / (5\\ \\close)');
    const long = makePanel(['AAA', 'BBB'], 20, 31);
    const short = slicePanel(long, 12); // identical first 12 bars, fewer tail bars
    const a = evaluateFormula(formula, short);
    const b = evaluateFormula(formula, long);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    for (let s = 0; s < short.symbols.length; s += 1) {
      for (let t = 0; t < 12; t += 1) {
        expect(b.value[s][t]).toEqual(a.value[s][t]);
      }
    }
  });

  it('rolling kernel output is append-invariant (ts_corr)', () => {
    const formula = normalized('-1 * correlation(open, volume, 10)');
    const long = makePanel(['AAA'], 22, 41);
    const short = slicePanel(long, 14);
    const a = evaluateFormula(formula, short);
    const b = evaluateFormula(formula, long);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    for (let t = 0; t < 14; t += 1) expect(b.value[0][t]).toEqual(a.value[0][t]);
  });
});
