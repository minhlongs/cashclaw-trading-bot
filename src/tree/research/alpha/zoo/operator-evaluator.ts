// Operator evaluator — walks the parser AST over a symbol×time OHLCV panel
// and produces a numeric feature matrix ([symbol][time]). Pure: no I/O, no
// eval, deterministic. Warmup bars are null (never fabricated); insufficient
// panel length or a missing field fails closed. Unknown operators at eval
// time are a typed defense-in-depth error (the parser already rejects them).

import { parseFormula } from './operator-parser';
import { OperatorParseError } from './operator-ast';
import type { Matrix } from './operator-kernels';
import {
  evalNode,
  lagSeries,
  map2,
  param,
} from './operator-evaluator-ast';
import {
  dispatchCall,
  DISPATCH,
  evalVwap,
  safeDivMatrix,
} from './operator-evaluator-dispatch';

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

// Re-export for backward compatibility and facade access
export { lagSeries, map2, param };
export { dispatchCall, DISPATCH, evalVwap, safeDivMatrix };
