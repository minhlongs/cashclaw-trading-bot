// Operator parser — hand-written Pratt parser over the tokenizer's token
// stream (Phase 3, decision D1). Pure: no dynamic code execution, no parser
// library, no I/O. Logic lives in co-located submodules:
//   * operator-parser-tokens.ts — PUNCT map + token describer
//   * operator-parser-core.ts   — Pratt Parser class
// This file is the fail-closed parseFormula entrypoint + thin re-exports.

import { OperatorParseError, computeMaxLookback, fail, type ParseFormulaResult } from './operator-ast';
import { stripResidue, tokenize } from './operator-tokenizer';
import { Parser } from './operator-parser-core';

export { PUNCT, describe } from './operator-parser-tokens';
export { Parser };

/** Parse a normalized formula string into an AST + maxLookback. Fail-closed. */
export function parseFormula(normalizedFormula: string): ParseFormulaResult {
  try {
    const parser = new Parser(tokenize(stripResidue(normalizedFormula)));
    const ast = parser.parseExpression(0);
    if (!parser.atEnd()) throw fail(`EVAL_UNSUPPORTED_TOKEN:${parser.leftover()}`);
    return { ok: true, value: { ast, maxLookback: computeMaxLookback(ast) } };
  } catch (e) {
    if (e instanceof OperatorParseError) return { ok: false, reason: e.reason };
    throw e;
  }
}
