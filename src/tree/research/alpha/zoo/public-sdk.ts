// Public Apache-2.0 SDK Barrel for @cashclaw/alpha-zoo (Step 7)
// Pure causal formula parsing, operator evaluation, and manifest ingestion.

export const ALPHA_ZOO_OSS_VERSION = '1.3.0-open-core' as const;
export const ALPHA_ZOO_LICENSE = 'Apache-2.0' as const;

export {
  importAlphaZooManifest,
  type AlphaZooImportReport,
  type RegisteredAlpha,
} from './zoo-adapter';

export {
  alphaZooManifestSchema,
  alphaZooEntrySchema,
  type AlphaZooManifest,
  type AlphaZooEntry,
} from './zoo-metadata';

export {
  SUPPORTED_OPERATORS,
  OPERATOR_ALIASES,
  normalizeFormula,
  type SupportedOperator,
  type NormalizedFormula,
  type NormalizeFormulaResult,
} from './operator-vocabulary';

export { parseOperatorFormula } from './operator-parser';
export { evaluateOperatorAst } from './operator-evaluator';
