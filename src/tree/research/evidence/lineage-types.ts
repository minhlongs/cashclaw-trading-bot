export interface ResearchLineage {
  readonly parentOf: ReadonlyMap<string, string | null>;
  readonly childrenOf: ReadonlyMap<string, readonly string[]>;
  ancestorsOf(id: string): readonly string[];
  descendantsOf(id: string): readonly string[];
}

export type SpawnGuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };
