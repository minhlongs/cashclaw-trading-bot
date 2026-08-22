// Hypothesis lineage — types for the research-provenance graph.
// Pure data contracts; no I/O, no imports from registry (avoids cycles).

/** Lifecycle status of a hypothesis node in the lineage graph. */
export type HypothesisNodeStatus =
  | 'PROPOSED'
  | 'RUNNING'
  | 'SURVIVED'
  | 'FALSIFIED'
  | 'ARCHIVED';

/** A single node in the hypothesis research graph. */
export interface HypothesisNode {
  /** Lineage id, e.g. H001 → H001-A → H001-A-REGIME. */
  id: string;
  /** Parent node id; null for root hypotheses. */
  parentId: string | null;
  /** Description of the mutation applied from the parent; null if none. */
  mutation: string | null;
  /** Evidence references supporting or falsifying this node. */
  evidence: readonly string[];
  /** Current lifecycle status. */
  status: HypothesisNodeStatus;
  /** Creation timestamp (epoch ms). */
  createdAt: number;
}

/** Minimal bridge shape consumed by the research registry. */
export interface RegistryBridgeEntry {
  /** Hypothesis id this registry entry tracks. */
  hypothesisId: string;
  /** Parent hypothesis id for lineage reconstruction. */
  parentId: string | null;
  /** Mutation description applied from the parent. */
  mutation: string | null;
}
