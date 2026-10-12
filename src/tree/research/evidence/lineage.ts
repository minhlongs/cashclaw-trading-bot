import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { ResearchLineage, SpawnGuardResult } from './lineage-types';
import { buildAdjacency } from './lineage-graph-builder';
import { makeTraversers } from './lineage-traversal';
import { spawnFromFalsified } from './lineage-spawn-guard';

export type { ResearchLineage, SpawnGuardResult };
export { spawnFromFalsified };

export function buildLineage(hypotheses: readonly ResearchHypothesis[]): ResearchLineage {
  const { parentOf, children } = buildAdjacency(hypotheses);
  const { ancestorsOf, descendantsOf } = makeTraversers(parentOf, children);
  return { parentOf, childrenOf: children, ancestorsOf, descendantsOf };
}
