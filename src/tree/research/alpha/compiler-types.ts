import type { DataWindow } from './experiment-spec';
import type { AlphaProvenance } from './provenance';

export interface CompilerContext {
  readonly dataWindow: DataWindow;
  readonly goalId?: string | null;
  readonly provenance?: AlphaProvenance | null;
  readonly supportedFeatures?: readonly string[];
  readonly nowIso?: string;
}
