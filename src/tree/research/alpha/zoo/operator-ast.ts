// AST types, operator call signatures, and static lookback computation for
// the zoo operator parser (Phase 3, decisions D1/D2). Pure types + data —
// no parsing, no I/O. The signature table encodes each operator's literal
// parameter contract (window/lag minimums) used by parser validation and by
// the evaluator's parameter extraction.

import type { SupportedOperator } from './operator-vocabulary';
import type { SupportedDataField } from './zoo-metadata';

export type BinaryOp = '+' | '-' | '*' | '/';

export type AstNode =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'field'; readonly name: SupportedDataField; readonly lag: number }
  | { readonly kind: 'binary'; readonly op: BinaryOp; readonly left: AstNode; readonly right: AstNode }
  | { readonly kind: 'unary'; readonly operand: AstNode }
  | { readonly kind: 'abs'; readonly operand: AstNode }
  | { readonly kind: 'call'; readonly name: SupportedOperator; readonly args: readonly AstNode[] };

export interface ParsedFormula {
  readonly ast: AstNode;
  readonly maxLookback: number;
}

export type ParseFormulaResult =
  | { readonly ok: true; readonly value: ParsedFormula }
  | { readonly ok: false; readonly reason: string };

/** Literal-parameter kind: rolling window, causal lag, or plain number. */
export type ParamSpec =
  | { readonly kind: 'window'; readonly min: number }
  | { readonly kind: 'lag'; readonly min: number }
  | { readonly kind: 'numeric'; readonly optional?: boolean };

export interface OpSignature {
  readonly series: number;
  readonly params: readonly ParamSpec[];
}

/** Call signatures for the frozen 17-op vocabulary (D2 minimums). */
export const OP_SIGNATURES: Readonly<Record<SupportedOperator, OpSignature>> = {
  rank: { series: 1, params: [] },
  zscore: { series: 1, params: [] },
  scale: { series: 1, params: [{ kind: 'numeric', optional: true }] },
  ts_rank: { series: 1, params: [{ kind: 'window', min: 1 }] },
  ts_corr: { series: 2, params: [{ kind: 'window', min: 2 }] },
  ts_cov: { series: 2, params: [{ kind: 'window', min: 2 }] },
  ts_mean: { series: 1, params: [{ kind: 'window', min: 1 }] },
  ts_std: { series: 1, params: [{ kind: 'window', min: 2 }] },
  ts_max: { series: 1, params: [{ kind: 'window', min: 1 }] },
  ts_min: { series: 1, params: [{ kind: 'window', min: 1 }] },
  ts_argmax: { series: 1, params: [{ kind: 'window', min: 1 }] },
  ts_argmin: { series: 1, params: [{ kind: 'window', min: 1 }] },
  delta: { series: 1, params: [{ kind: 'lag', min: 1 }] },
  decay_linear: { series: 1, params: [{ kind: 'window', min: 1 }] },
  signed_power: { series: 1, params: [{ kind: 'numeric' }] },
  safe_div: { series: 2, params: [{ kind: 'numeric', optional: true }] },
  vwap: { series: 0, params: [] },
};

/** Typed fail-closed parse/eval error carrying a machine-readable reason. */
export class OperatorParseError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export const fail = (reason: string): OperatorParseError => new OperatorParseError(reason);

/** Extract a numeric literal, tolerating a leading unary minus (`-1`). */
export function literalNumber(node: AstNode): number | null {
  if (node.kind === 'number') return node.value;
  if (node.kind === 'unary' && node.operand.kind === 'number') return -node.operand.value;
  return null;
}

/**
 * Static warmup requirement of a formula: max over field lags and over all
 * window/lag literal arguments. Statically known from the AST — the
 * evaluator never needs to discover it at runtime.
 */
export function computeMaxLookback(ast: AstNode): number {
  let max = 0;
  const walk = (node: AstNode): void => {
    if (node.kind === 'number') return;
    if (node.kind === 'field') {
      max = Math.max(max, node.lag);
      return;
    }
    if (node.kind === 'unary' || node.kind === 'abs') {
      walk(node.operand);
      return;
    }
    if (node.kind === 'binary') {
      walk(node.left);
      walk(node.right);
      return;
    }
    const sig = OP_SIGNATURES[node.name];
    for (let k = 0; k < sig.params.length; k += 1) {
      const spec = sig.params[k];
      const arg = node.args[sig.series + k];
      if (arg === undefined || spec.kind === 'numeric') continue;
      const v = literalNumber(arg);
      if (v !== null) max = Math.max(max, v);
    }
    for (const a of node.args) walk(a);
  };
  walk(ast);
  return max;
}
