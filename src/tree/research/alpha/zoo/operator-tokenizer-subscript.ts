// Subscript-lag notation reader for zoo formula tokenizer.
// `_t`, `_{t-k}`, `{{t-k}}` → lagged field tokens. Pure: no I/O.

import { fail } from './operator-ast';

export const isDigit = (c: string): boolean => c >= '0' && c <= '9';
export const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c);
export const isIdentPart = (c: string): boolean => /[A-Za-z0-9_]/.test(c);

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

/** Parse `_t` / `_{t-k}` / `{{t-k}}` at `src[i] === '_'`; returns lag + end. */
export function readSubscript(src: string, i: number): { lag: number; end: number } {
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
