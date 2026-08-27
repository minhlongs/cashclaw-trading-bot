// Operator parser — hand-written Pratt parser over the tokenizer's token
// stream (Phase 3, decision D1). Pure: no dynamic code execution, no parser
// library, no I/O. Grammar:
//   * implicit multiplication ONLY numeric-literal · (identifier | paren-group)
//   * calls restricted to the frozen 17-op vocabulary with literal params
//   * fail-closed: unknown/bare tokens, bad windows, non-causal lags → typed err
// Emits a typed AST plus a static `maxLookback` (warmup bars required).

import { SUPPORTED_OPERATORS, type SupportedOperator } from './operator-vocabulary';
import {
  OP_SIGNATURES,
  OperatorParseError,
  computeMaxLookback,
  fail,
  literalNumber,
  type AstNode,
  type ParseFormulaResult,
} from './operator-ast';
import { stripResidue, tokenize, type Tok } from './operator-tokenizer';

const IMPLICIT_PREC = 3;

const PUNCT: Readonly<Partial<Record<Tok['t'], string>>> = {
  lparen: '(',
  rparen: ')',
  comma: ',',
  pipe: '|',
};
const describe = (tok: Tok): string =>
  tok.t === 'num'
    ? String(tok.v)
    : tok.t === 'ident'
      ? tok.v
      : tok.t === 'op'
        ? tok.v
        : (PUNCT[tok.t] ?? tok.t);

class Parser {
  private pos = 0;
  constructor(private readonly toks: readonly Tok[]) {}

  atEnd(): boolean {
    return this.pos >= this.toks.length;
  }
  leftover(): string {
    const tok = this.toks[this.pos];
    return tok === undefined ? '' : describe(tok);
  }
  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private next(): Tok {
    const tok = this.toks[this.pos];
    if (tok === undefined) throw fail('EVAL_PARSE_ERROR:unexpected-end');
    this.pos += 1;
    return tok;
  }
  private peekIs(t: Tok['t']): boolean {
    const p = this.peek();
    return p !== undefined && p.t === t;
  }
  private expect(t: Tok['t']): void {
    if (!this.peekIs(t)) throw fail(`EVAL_PARSE_ERROR:expected-${t}`);
    this.pos += 1;
  }

  parseExpression(minPrec: number): AstNode {
    let left = this.parsePrefix();
    for (;;) {
      const tok = this.peek();
      if (tok === undefined) break;
      if (tok.t === 'op') {
        const prec = tok.v === '*' || tok.v === '/' ? 2 : 1;
        if (prec < minPrec) break;
        this.next();
        left = { kind: 'binary', op: tok.v, left, right: this.parseExpression(prec + 1) };
        continue;
      }
      const startsPrimary = tok.t === 'field' || tok.t === 'ident' || tok.t === 'lparen';
      if (startsPrimary && left.kind === 'number' && IMPLICIT_PREC >= minPrec) {
        left = { kind: 'binary', op: '*', left, right: this.parseExpression(IMPLICIT_PREC + 1) };
        continue;
      }
      if (startsPrimary || tok.t === 'num') throw fail('EVAL_PARSE_ERROR:juxtaposition');
      break;
    }
    return left;
  }

  private parsePrefix(): AstNode {
    const tok = this.next();
    if (tok.t === 'num') return { kind: 'number', value: tok.v };
    if (tok.t === 'field') return { kind: 'field', name: tok.name, lag: tok.lag };
    if (tok.t === 'lparen') {
      const inner = this.parseExpression(0);
      this.expect('rparen');
      return inner;
    }
    if (tok.t === 'pipe') {
      const inner = this.parseExpression(0);
      this.expect('pipe');
      return { kind: 'abs', operand: inner };
    }
    if (tok.t === 'op') {
      if (tok.v === '-') return { kind: 'unary', operand: this.parsePrefix() };
      throw fail(`EVAL_UNSUPPORTED_TOKEN:${tok.v}`);
    }
    if (tok.t === 'ident') return this.parseCall(tok.v);
    throw fail(`EVAL_UNSUPPORTED_TOKEN:${describe(tok)}`);
  }

  private parseCall(name: string): AstNode {
    if (!this.peekIs('lparen')) throw fail(`EVAL_UNSUPPORTED_TOKEN:${name}`);
    if (!(SUPPORTED_OPERATORS as readonly string[]).includes(name)) {
      throw fail(`EVAL_UNKNOWN_OPERATOR:${name}`);
    }
    const op = name as SupportedOperator;
    this.expect('lparen');
    const args: AstNode[] = [];
    if (!this.peekIs('rparen')) {
      args.push(this.parseExpression(0));
      while (this.peekIs('comma')) {
        this.next();
        args.push(this.parseExpression(0));
      }
    }
    this.expect('rparen');
    return this.buildCall(op, args);
  }

  private buildCall(name: SupportedOperator, args: AstNode[]): AstNode {
    const sig = OP_SIGNATURES[name];
    const required =
      sig.series + sig.params.filter((p) => p.kind !== 'numeric' || !p.optional).length;
    const maximum = sig.series + sig.params.length;
    if (args.length < required || args.length > maximum) {
      throw fail(`EVAL_PARSE_ERROR:${name}-arity`);
    }
    for (let k = 0; k < sig.params.length; k += 1) {
      const arg = args[sig.series + k];
      if (arg === undefined) break; // optional numeric omitted
      const spec = sig.params[k];
      const value = literalNumber(arg);
      if (value === null) throw fail(`EVAL_INVALID_WINDOW:${name}`);
      if (spec.kind === 'window' || spec.kind === 'lag') {
        if (!Number.isInteger(value)) throw fail(`EVAL_INVALID_WINDOW:${name}`);
        if (value < spec.min) {
          throw fail(spec.kind === 'lag' ? 'NON_CAUSAL_LAG' : `EVAL_INVALID_WINDOW:${name}`);
        }
      }
    }
    return { kind: 'call', name, args };
  }
}

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
