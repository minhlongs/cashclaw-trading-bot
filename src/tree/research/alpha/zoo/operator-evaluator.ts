// Operator evaluator — walks the parser AST over a symbol×time OHLCV panel
// and produces a numeric feature matrix ([symbol][time]). Pure: no I/O, no
// eval, deterministic. Warmup bars are null (never fabricated); insufficient
// panel length or a missing field fails closed. Unknown operators at eval
// time are a typed defense-in-depth error (the parser already rejects them).

import { parseFormula } from './operator-parser';
import {
  OP_SIGNATURES,
  OperatorParseError,
  literalNumber,
  type AstNode,
} from './operator-ast';
import {
  decayLinear,
  delta,
  signedPower,
  tsArgmax,
  tsArgmin,
  tsMax,
  tsMean,
  tsMin,
  tsRank,
  tsStd,
  type Matrix,
  type Series,
} from './operator-kernels';
import { safeDiv, tsCorr, tsCov } from './operator-kernels-pair';
import { rankCross, scaleCross, zscoreCross } from './operator-kernels-cross';
import type { SupportedOperator } from './operator-vocabulary';

export interface SymbolPanel {
  readonly symbols: readonly string[];
  readonly fields: Readonly<Record<string, Matrix>>;
}

export type EvalResult =
  | { readonly ok: true; readonly value: Matrix }
  | { readonly ok: false; readonly reason: string };

const fail = (reason: string): OperatorParseError => new OperatorParseError(reason);

function panelLength(panel: SymbolPanel): number | null {
  let len: number | null = null;
  for (const field of Object.keys(panel.fields)) {
    for (const series of panel.fields[field]) {
      if (len === null) len = series.length;
      else if (series.length !== len) return null;
    }
  }
  return len ?? 0;
}

function validatePanel(panel: SymbolPanel): number {
  if (panel.symbols.length === 0) throw fail('EVAL_EMPTY_PANEL');
  const len = panelLength(panel);
  if (len === null) throw fail('EVAL_PANEL_RAGGED');
  return len;
}

function lagSeries(s: Series, lag: number): (number | null)[] {
  const out: (number | null)[] = new Array(s.length).fill(null);
  for (let t = lag; t < s.length; t += 1) out[t] = s[t - lag];
  return out;
}

const map2 = (a: Matrix, b: Matrix, f: (x: number, y: number) => number): Matrix =>
  a.map((row, s) =>
    row.map((v, t) => {
      const w = b[s][t];
      return v === null || w === null ? null : f(v, w);
    }),
  );

function evalNode(node: AstNode, panel: SymbolPanel, len: number): Matrix {
  if (node.kind === 'number') {
    return panel.symbols.map(() => new Array<number>(len).fill(node.value));
  }
  if (node.kind === 'field') {
    const matrix = panel.fields[node.name];
    if (matrix === undefined) throw fail(`EVAL_MISSING_FIELD:${node.name}`);
    return node.lag === 0 ? matrix : matrix.map((s) => lagSeries(s, node.lag));
  }
  if (node.kind === 'binary') {
    const l = evalNode(node.left, panel, len);
    const r = evalNode(node.right, panel, len);
    if (node.op === '+') return map2(l, r, (x, y) => x + y);
    if (node.op === '-') return map2(l, r, (x, y) => x - y);
    if (node.op === '*') return map2(l, r, (x, y) => x * y);
    return map2(l, r, (x, y) => x / y);
  }
  if (node.kind === 'unary') {
    return evalNode(node.operand, panel, len).map((row) => row.map((v) => (v === null ? null : -v)));
  }
  if (node.kind === 'abs') {
    return evalNode(node.operand, panel, len).map((row) =>
      row.map((v) => (v === null ? null : Math.abs(v))),
    );
  }
  return dispatchCall(node.name, node.args, panel, len);
}

function param(args: readonly AstNode[], index: number, fallback: number): number {
  const arg = args[index];
  if (arg === undefined) return fallback;
  const v = literalNumber(arg);
  if (v === null) throw fail('EVAL_INVALID_WINDOW:param');
  return v;
}

type Kernel = (series: Matrix[], args: readonly AstNode[]) => Matrix;

/** Per-operator dispatch table (D2). Each entry maps evaluated series + literal
 * params to a result matrix. Unknown names fall through to a typed error. */
const DISPATCH: Readonly<Partial<Record<SupportedOperator, Kernel>>> = {
  rank: (s) => rankCross(s[0]),
  zscore: (s) => zscoreCross(s[0]),
  scale: (s, a) => scaleCross(s[0], param(a, 1, 1)),
  ts_rank: (s, a) => s[0].map((x) => tsRank(x, param(a, 1, 0))),
  ts_corr: (s, a) => s[0].map((x, i) => tsCorr(x, s[1][i], param(a, 2, 0))),
  ts_cov: (s, a) => s[0].map((x, i) => tsCov(x, s[1][i], param(a, 2, 0))),
  ts_mean: (s, a) => s[0].map((x) => tsMean(x, param(a, 1, 0))),
  ts_std: (s, a) => s[0].map((x) => tsStd(x, param(a, 1, 0))),
  ts_max: (s, a) => s[0].map((x) => tsMax(x, param(a, 1, 0))),
  ts_min: (s, a) => s[0].map((x) => tsMin(x, param(a, 1, 0))),
  ts_argmax: (s, a) => s[0].map((x) => tsArgmax(x, param(a, 1, 0))),
  ts_argmin: (s, a) => s[0].map((x) => tsArgmin(x, param(a, 1, 0))),
  delta: (s, a) => s[0].map((x) => delta(x, param(a, 1, 0))),
  decay_linear: (s, a) => s[0].map((x) => decayLinear(x, param(a, 1, 0))),
  signed_power: (s, a) => s[0].map((x) => signedPower(x, param(a, 1, 0))),
  safe_div: (s, a) => s[0].map((x, i) => safeDiv(x, s[1][i], param(a, 2, 1e-12))),
};

function evalVwap(panel: SymbolPanel, len: number): Matrix {
  const field = (name: 'high' | 'low' | 'close' | 'volume'): Matrix =>
    evalNode({ kind: 'field', name, lag: 0 }, panel, len);
  const typical = map2(map2(field('high'), field('low'), (x, y) => x + y), field('close'), (x, y) => (x + y) / 3);
  return safeDivMatrix(map2(typical, field('volume'), (x, y) => x * y), field('volume'));
}

function dispatchCall(name: SupportedOperator, args: readonly AstNode[], panel: SymbolPanel, len: number): Matrix {
  if (name === 'vwap') return evalVwap(panel, len);
  const kernel = DISPATCH[name];
  if (kernel === undefined) throw fail(`EVAL_UNKNOWN_OPERATOR:${name}`);
  const sig = OP_SIGNATURES[name];
  const series = args.slice(0, sig.series).map((a) => evalNode(a, panel, len));
  return kernel(series, args);
}

function safeDivMatrix(a: Matrix, b: Matrix): Matrix {
  return a.map((row, s) => row.map((v, t) => {
    const w = b[s][t];
    if (v === null || w === null || w === 0) return null;
    const r = v / w;
    return Number.isFinite(r) ? r : null;
  }));
}

/** Public boundary: NaN/±Inf → null (fail-closed, never fabricated). */
const sanitize = (m: Matrix): Matrix =>
  m.map((row) => row.map((v) => (v === null || !Number.isFinite(v) ? null : v)));

/** Evaluate a normalized formula over a panel. Fail-closed; deterministic. */
export function evaluateFormula(normalizedFormula: string, panel: SymbolPanel): EvalResult {
  try {
    const len = validatePanel(panel);
    const parsed = parseFormula(normalizedFormula);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    if (len < parsed.value.maxLookback + 1) return { ok: false, reason: 'EVAL_INSUFFICIENT_PANEL' };
    return { ok: true, value: sanitize(evalNode(parsed.value.ast, panel, len)) };
  } catch (e) {
    if (e instanceof OperatorParseError) return { ok: false, reason: e.reason };
    throw e;
  }
}
