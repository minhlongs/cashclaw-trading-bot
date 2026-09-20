// Field reference + number + ident readers for zoo formula tokenizer.

import { SUPPORTED_DATA_FIELDS, type SupportedDataField } from './zoo-metadata';
import { fail, type BinaryOp } from './operator-ast';
import { isDigit, isIdentPart, readSubscript } from './operator-tokenizer-subscript';

/** Try to read a data-field reference (optionally lagged) at position i. */
function readFieldRef(src: string, i: number): { tok: Tok; end: number } | null {
  for (const name of SUPPORTED_DATA_FIELDS) {
    if (!src.startsWith(name, i)) continue;
    const after = i + name.length;
    const next = src[after] ?? '';
    if (next === '(') return null; // call form → operator path
    if (next === '_') {
      const sub = readSubscript(src, after);
      return { tok: { t: 'field', name, lag: sub.lag }, end: sub.end };
    }
    if (isIdentPart(next)) return null; // longer identifier, not a field
    return { tok: { t: 'field', name, lag: 0 }, end: after };
  }
  return null;
}

export const PUNCT: Readonly<Record<string, Tok>> = {
  '(': { t: 'lparen' },
  ')': { t: 'rparen' },
  ',': { t: 'comma' },
  '|': { t: 'pipe' },
};

/** Read a numeric literal starting at i; returns token + end position. */
function readNumber(src: string, i: number): { tok: Tok; end: number } {
  let j = i;
  while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j += 1;
  const raw = src.slice(i, j);
  const v = Number(raw);
  if (!Number.isFinite(v)) throw fail(`EVAL_UNSUPPORTED_TOKEN:${raw}`);
  return { tok: { t: 'num', v }, end: j };
}

/** Read an identifier (or lagged field ref) starting at i; returns token + end. */
function readIdent(src: string, i: number): { tok: Tok; end: number } {
  const fieldRef = readFieldRef(src, i);
  if (fieldRef !== null) return fieldRef;
  let j = i;
  while (j < src.length && isIdentPart(src[j])) j += 1;
  return { tok: { t: 'ident', v: src.slice(i, j) }, end: j };
}

export const OPS = new Set(['+', '-', '*', '/']);

// Re-export Tok type so consumers can import from this module.
export type Tok =
  | { readonly t: 'num'; readonly v: number }
  | { readonly t: 'field'; readonly name: SupportedDataField; readonly lag: number }
  | { readonly t: 'ident'; readonly v: string }
  | { readonly t: 'op'; readonly v: BinaryOp }
  | { readonly t: 'lparen' }
  | { readonly t: 'rparen' }
  | { readonly t: 'comma' }
  | { readonly t: 'pipe' };

export { readNumber, readIdent };
