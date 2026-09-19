// Hypothesis lineage — pure research-graph operations.
// ID scheme: H001 → H001-A → H001-A-REGIME → H001-A-REGIME-CROSSSECTIONAL.
// A child id must extend its parent id with a "-SEGMENT" suffix.

export {
  LINEAGE_ID_PATTERN,
  TERMINAL_STATUSES,
  assertValidId,
  assertNotSelfParent,
  assertChildPrefix,
  findNode,
} from './lineage.assertions';
export {
  createNode,
  addChild,
  descendants,
  ancestors,
  isDeadEnd,
  lineageToRegistryEntries,
} from './lineage.core';
export type { HypothesisNode, HypothesisNodeStatus, RegistryBridgeEntry } from './lineage-types';
