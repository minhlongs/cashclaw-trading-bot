// Tokenizer for normalized zoo formula strings (Phase 3, decision D1).
// Applies the narrow backslash-residue strip pre-tokenization, then emits a
// flat token stream. Subscript-lag notation (`field_t`, `field_{t-k}`,
// `field_{{t-k}}`) is resolved here into lagged field tokens. Pure: no I/O.

import { SUPPORTED_DATA_FIELDS, type SupportedDataField } from './zoo-metadata';
import { fail, type BinaryOp } from './operator-ast';

export type Tok =
  | { readonly t: 'num'; readonly v: number }
  | { readonly t: 'field'; readonly name: SupportedDataField; readonly lag: number }
  | { readonly t: 'ident'; readonly v: string }
  | { readonly t: 'op'; readonly v: BinaryOp }
  | { readonly t: 'lparen' }
  | { readonly t: 'rparen' }
  | { readonly t: 'comma' }
  | { readonly t: 'pipe' };

/** D1 residue-strip: drop `\` before identifier-start and lone `\` by whitespace. */
export function stripResidue(text: string): string {
  let out = text.replace(/\\(?=[A-Za-z_])/g, '');
  out = out.replace(/\\\s+/g, ' ');
  out = out.replace(/\s+\\/g, ' ');
  return out;
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string): boolean => /[A-Za-z0-9_]/.test(c);

/** Consume exactly `opens` closing braces at `p`; returns the new position. */
function checkCloses(src: string, p: number, opens: number): number {
  let closes = 0;
  while (src[p] === '}') {
    closes += 1;
    p += 1;
  }
  if (closes !== opens) throw fail('EVAL_PARSE_ERROR:subscript');
  return p;
}

/** A bare `_t` must not be followed by identifier/brace characters. */
function checkBareEnd(src: string, p: number): void {
  const next = src[p] ?? '';
  if (isIdentPart(next) || next === '{' || next === '}') {
    throw fail('EVAL_PARSE_ERROR:subscript');
  }
}

/** Parse `_t` / `_{t-k}` / `_{{t-k}}` at `src[i] === '_'`; returns lag + end. */
function readSubscript(src: string, i: number): { lag: number; end: number } {
  let p = i + 1;
  let opens = 0;
  while (src[p] === '{') {
    opens += 1;
    p += 1;
  }
  if (src[p] !== 't') throw fail('EVAL_PARSE_ERROR:subscript');
  p += 1;
  let lag = 0;
  if (src[p] === '-' || src[p] === '+') {
    const sign = src[p] === '-' ? 1 : -1;
    p += 1;
    const start = p;
    while (isDigit(src[p])) p += 1;
    if (p === start) throw fail('EVAL_PARSE_ERROR:subscript');
    lag = sign * Number(src.slice(start, p));
  }
  if (opens > 0) p = checkCloses(src, p, opens);
  else checkBareEnd(src, p);
  if (lag < 0) throw fail('NON_CAUSAL_LAG');
  return { lag, end: p };
}

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

const PUNCT: Readonly<Record<string, Tok>> = {
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

const OPS = new Set(['+', '-', '*', '/']);

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
