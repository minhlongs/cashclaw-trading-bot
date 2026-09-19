// Operator parser — hand-written Pratt parser over the tokenizer's token
// stream (Phase 3, decision D1). Pure: no dynamic code execution, no parser
// library, no I/O. Grammar:
//   * implicit multiplication ONLY numeric-literal · (identifier | paren-group)
//   * calls restricted to the frozen 17-op vocabulary with literal params
//   * fail-closed: unknown/bare tokens, bad windows, non-causal lags → typed err
// Emits a typed AST plus a static `maxLookback` (warmup bars required).

export { parseFormula, Parser, PUNCT, describe } from './operator-parser.impl';
export type { AstNode, ParseFormulaResult } from './operator-ast';
export type { Tok } from './operator-tokenizer';
