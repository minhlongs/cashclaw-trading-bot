import { fail, type AstNode } from './operator-ast';
import type { Tok } from './operator-tokenizer';
import { describe } from './operator-parser-tokens';
import { SUPPORTED_OPERATORS, type SupportedOperator } from './operator-vocabulary';
import { buildCall } from './operator-parser-call';

export class ParserBase {
  protected pos = 0;
  constructor(protected readonly toks: readonly Tok[]) {}

  atEnd(): boolean { return this.pos >= this.toks.length; }
  leftover(): string {
    const tok = this.toks[this.pos];
    return tok === undefined ? '' : describe(tok);
  }
  protected peek(): Tok | undefined { return this.toks[this.pos]; }
  protected next(): Tok {
    const tok = this.toks[this.pos];
    if (tok === undefined) throw fail('EVAL_PARSE_ERROR:unexpected-end');
    this.pos += 1;
    return tok;
  }
  protected peekIs(t: Tok['t']): boolean { return this.peek()?.t === t; }
  protected expect(t: Tok['t']): void {
    if (!this.peekIs(t)) throw fail(`EVAL_PARSE_ERROR:expected-${t}`);
    this.pos += 1;
  }
  protected parseCall(name: string, parseExpr: () => AstNode): AstNode {
    if (!this.peekIs('lparen')) throw fail(`EVAL_UNSUPPORTED_TOKEN:${name}`);
    if (!(SUPPORTED_OPERATORS as readonly string[]).includes(name)) throw fail(`EVAL_UNKNOWN_OPERATOR:${name}`);
    this.expect('lparen');
    const args: AstNode[] = [];
    if (!this.peekIs('rparen')) {
      args.push(parseExpr());
      while (this.peekIs('comma')) { this.next(); args.push(parseExpr()); }
    }
    this.expect('rparen');
    return buildCall(name as SupportedOperator, args);
  }
}
