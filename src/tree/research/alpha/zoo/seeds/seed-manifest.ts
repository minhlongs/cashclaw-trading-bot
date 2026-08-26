// Static build-time import of the phase-2 representative zoo seed manifest.
// resolveJsonModule inlines the JSON at build time — no fs, no fetch,
// Workers-safe (tree-layer purity preserved).
//
// The loader validates at ENVELOPE level (mirroring the adapter's own
// precondition): the phase-2 seed deliberately contains one schema-invalid
// entry (fund_roe, unsupported data field 'fund:roe') so the golden audit
// exercises the validation-error bucket end-to-end from committed data.
// Per-entry validity therefore belongs to the import pipeline's fail-closed
// report, not to a build-time throw.

import { z } from 'zod';
import rawSeed from './phase-2-seed.json';
import { alphaZooManifestSchema } from '../zoo-metadata';

/** Envelope-level contract: provenance fields validated, entries deferred. */
export const seedEnvelopeSchema = alphaZooManifestSchema
  .omit({ entries: true })
  .extend({ entries: z.array(z.unknown()) });
export type Phase2SeedEnvelope = z.infer<typeof seedEnvelopeSchema>;

/** The committed phase-2 seed manifest (raw JSON module, typed by TS). */
export const PHASE2_SEED_MANIFEST = rawSeed;

/**
 * Load + envelope-validate the committed seed manifest. Throws if the
 * committed provenance fields ever drift out of contract — envelope drift
 * is a build failure; per-entry failures are report rows, never silent.
 */
export function loadPhase2SeedManifest(): Phase2SeedEnvelope {
  const parsed = seedEnvelopeSchema.safeParse(rawSeed);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`phase-2 seed manifest failed envelope validation: ${reasons.join('; ')}`);
  }
  return parsed.data;
}
