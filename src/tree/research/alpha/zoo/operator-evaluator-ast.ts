import { OperatorParseError, type AstNode } from './operator-ast';
import type { Matrix, Series } from './operator-kernels';
import type { SupportedOperator } from './operator-vocabulary';
import type { SymbolPanel } from './operator-evaluator';
import {
  dispatchCall,
  param,
} from './operator-evaluator-dispatch';

const fail = (reason: string): OperatorParseError => new OperatorParseError(reason);

export function lagSeries(s: Series, lag: number): (number | null)[] {
  const out: (number | null)[] = new Array(s.length).fill(null);
  for (let t = lag; t < s.length; t += 1) out[t] = s[t - lag];
  return out;
}

export function map2(a: Matrix, b: Matrix, f: (x: number, y: number) => number): Matrix {
  return a.map((row, s) =>
    row.map((v, t) => {
      const w = b[s][t];
      return v === null || w === null ? null : f(v, w);
    }),
  );
}

export function evalNode(node: AstNode, panel: SymbolPanel, len: number): Matrix {
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
  return dispatchCall(node.name as SupportedOperator, node.args, panel, len, evalNode, map2);
}

// Re-export helpers so facade has single source
export { param };
