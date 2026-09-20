// Operator parser — PUNCT token-key → label map and token describer
// (Phase 3, decision D1). Pure: no parsing, no I/O. Relocated from
// operator-parser.impl.ts to keep the parser facade thin.

import type { Tok } from './operator-tokenizer';

export const PUNCT: Readonly<Partial<Record<Tok['t'], string>>> = {
  lparen: '(',
  rparen: ')',
  comma: ',',
  pipe: '|',
};
export const describe = (tok: Tok): string =>
  tok.t === 'num'
    ? String(tok.v)
    : tok.t === 'ident'
      ? tok.v
      : tok.t === 'op'
        ? tok.v
        : (PUNCT[tok.t] ?? tok.t);
