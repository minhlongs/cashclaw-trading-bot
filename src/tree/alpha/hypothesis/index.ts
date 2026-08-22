// Hypothesis Engine — barrel export

export type {
  AlphaHypothesis,
  HypothesisTemplate,
  HypothesisEvaluation,
  IndicatorPreset,
  RegimePerf,
} from './types';

export { HypothesisGenerator } from './generator';
export { evaluateHypothesis } from './evaluator';

export type {
  HypothesisNode,
  HypothesisNodeStatus,
  RegistryBridgeEntry,
} from './lineage-types';
export {
  addChild,
  ancestors,
  createNode,
  descendants,
  isDeadEnd,
  lineageToRegistryEntries,
} from './lineage';