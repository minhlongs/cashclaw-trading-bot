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
} from './operator-kernels';
import { safeDiv, tsCorr, tsCov } from './operator-kernels-pair';
import { rankCross, scaleCross, zscoreCross } from './operator-kernels-cross';
import type { SupportedOperator } from './operator-vocabulary';
import type { SymbolPanel } from './operator-evaluator';

const fail = (reason: string): OperatorParseError => new OperatorParseError(reason);

export function param(args: readonly AstNode[], index: number, fallback: number): number {
  const arg = args[index];
  if (arg === undefined) return fallback;
  const v = literalNumber(arg);
  if (v === null) throw fail('EVAL_INVALID_WINDOW:param');
  return v;
}

export type Kernel = (series: Matrix[], args: readonly AstNode[]) => Matrix;

/** Per-operator dispatch table (D2). Each entry maps evaluated series + literal
 * params to a result matrix. Unknown names fall through to a typed error. */
export const DISPATCH: Readonly<Partial<Record<SupportedOperator, Kernel>>> = {
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

export function safeDivMatrix(a: Matrix, b: Matrix): Matrix {
  return a.map((row, s) =>
    row.map((v, t) => {
      const w = b[s][t];
      if (v === null || w === null || w === 0) return null;
      const r = v / w;
      return Number.isFinite(r) ? r : null;
    }),
  );
}

export function evalVwap(
  panel: SymbolPanel,
  len: number,
  evalNodeFn: (node: AstNode, panel: SymbolPanel, len: number) => Matrix,
  map2Fn: (a: Matrix, b: Matrix, f: (x: number, y: number) => number) => Matrix,
): Matrix {
  const field = (name: 'high' | 'low' | 'close' | 'volume'): Matrix =>
    evalNodeFn({ kind: 'field', name, lag: 0 }, panel, len);
  const typical = map2Fn(
    map2Fn(field('high'), field('low'), (x, y) => x + y),
    field('close'),
    (x, y) => (x + y) / 3,
  );
  return safeDivMatrix(
    map2Fn(typical, field('volume'), (x, y) => x * y),
    field('volume'),
  );
}

export function dispatchCall(
  name: SupportedOperator,
  args: readonly AstNode[],
  panel: SymbolPanel,
  len: number,
  evalNodeFn: (node: AstNode, panel: SymbolPanel, len: number) => Matrix,
  map2Fn: (a: Matrix, b: Matrix, f: (x: number, y: number) => number) => Matrix,
): Matrix {
  if (name === 'vwap') return evalVwap(panel, len, evalNodeFn, map2Fn);
  const kernel = DISPATCH[name];
  if (kernel === undefined) throw fail(`EVAL_UNKNOWN_OPERATOR:${name}`);
  const sig = OP_SIGNATURES[name];
  const series = args.slice(0, sig.series).map((a) => evalNodeFn(a, panel, len));
  return kernel(series, args);
}
