import { type SupportedOperator } from './operator-vocabulary';
import { OP_SIGNATURES, fail, literalNumber, type AstNode } from './operator-ast';

export function buildCall(name: SupportedOperator, args: AstNode[]): AstNode {
  const sig = OP_SIGNATURES[name];
  const required = sig.series + sig.params.filter((p) => p.kind !== 'numeric' || !p.optional).length;
  const maximum = sig.series + sig.params.length;
  if (args.length < required || args.length > maximum) {
    throw fail(`EVAL_PARSE_ERROR:${name}-arity`);
  }
  for (let k = 0; k < sig.params.length; k += 1) {
    const arg = args[sig.series + k];
    if (arg === undefined) break;
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
