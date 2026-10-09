// Hypothesis lineage — pure research-graph operations facade.
export { createNode, addChild } from './lineage-node';
export {
  descendants,
  ancestors,
  isDeadEnd,
  lineageToRegistryEntries,
} from './lineage-queries';
