// Tokenizer for normalized zoo formula strings (Phase 3, decision D1).
// Thin backward-compatible facade — logic lives in co-located submodules.

import { fail, type BinaryOp } from './operator-ast';
import { isDigit, isIdentStart } from './operator-tokenizer-subscript';
import { OPS, PUNCT, readIdent, readNumber, type Tok } from './operator-tokenizer-readers';

export type { Tok };

/** D1 residue-strip: drop `\` before identifier-start and lone `\` by whitespace. */
export function stripResidue(text: string): string {
  let out = text.replace(/\\(?=[A-Za-z_])/g, '');
  out = out.replace(/\\\s+/g, ' ');
  out = out.replace(/\s+\\/g, ' ');
  return out;
}

/** Tokenize a residue-stripped formula string. Throws OperatorParseError. */
export function tokenize(src: string): readonly Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '\\') throw fail('EVAL_UNSUPPORTED_TOKEN:\\');
    const punct = PUNCT[c];
    if (punct !== undefined) {
      toks.push(punct);
      i += 1;
      continue;
    }
    if (OPS.has(c)) {
      toks.push({ t: 'op', v: c as BinaryOp });
      i += 1;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      const num = readNumber(src, i);
      toks.push(num.tok);
      i = num.end;
      continue;
    }
    if (isIdentStart(c)) {
      const ident = readIdent(src, i);
      toks.push(ident.tok);
      i = ident.end;
      continue;
    }
    throw fail(`EVAL_UNSUPPORTED_TOKEN:${c}`);
  }
  return toks;
}
