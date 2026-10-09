import { fail, type AstNode } from './operator-ast';
import { describe } from './operator-parser-tokens';
import { ParserBase } from './operator-parser-base';

export class Parser extends ParserBase {
  parseExpression(minPrec: number): AstNode {
    let left = this.parsePrefix();
    for (;;) {
      const tok = this.peek();
      if (!tok) break;
      if (tok.t === 'op') {
        const prec = tok.v === '*' || tok.v === '/' ? 2 : 1;
        if (prec < minPrec) break;
        this.next();
        left = { kind: 'binary', op: tok.v, left, right: this.parseExpression(prec + 1) };
        continue;
      }
      const prim = tok.t === 'field' || tok.t === 'ident' || tok.t === 'lparen';
      if (prim && left.kind === 'number' && 3 >= minPrec) {
        left = { kind: 'binary', op: '*', left, right: this.parseExpression(4) };
        continue;
      }
      if (prim || tok.t === 'num') throw fail('EVAL_PARSE_ERROR:juxtaposition');
      break;
    }
    return left;
  }

  private parsePrefix(): AstNode {
    const tok = this.next();
    if (tok.t === 'num') return { kind: 'number', value: tok.v };
    if (tok.t === 'field') return { kind: 'field', name: tok.name, lag: tok.lag };
    if (tok.t === 'lparen' || tok.t === 'pipe') {
      const inner = this.parseExpression(0);
      this.expect(tok.t === 'lparen' ? 'rparen' : 'pipe');
      return tok.t === 'pipe' ? { kind: 'abs', operand: inner } : inner;
    }
    if (tok.t === 'op' && tok.v === '-') return { kind: 'unary', operand: this.parsePrefix() };
    if (tok.t === 'ident') return this.parseCall(tok.v, () => this.parseExpression(0));
    throw fail(`EVAL_UNSUPPORTED_TOKEN:${tok.t === 'op' ? tok.v : describe(tok)}`);
  }
}
