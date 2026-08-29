import { describe, it, expect, vi } from 'vitest';

// The committed phase-2 seed JSON is a golden audit artifact — it must NOT be
// edited by tests. Mock it so we can exercise the envelope-validation error
// path (seed-manifest.ts:32-35) without touching committed data.
vi.mock('./phase-2-seed.json', () => ({ default: {} }));

import { loadPhase2SeedManifest, seedEnvelopeSchema, PHASE2_SEED_MANIFEST } from './seed-manifest';

describe('seed-manifest — envelope validation', () => {
  it('PHASE2_SEED_MANIFEST is the raw inlined module', () => {
    expect(PHASE2_SEED_MANIFEST).toEqual({});
  });

  it('loadPhase2SeedManifest throws on envelope drift', () => {
    // An empty object fails the envelope schema (provenance fields required).
    expect(() => loadPhase2SeedManifest()).toThrow(
      /phase-2 seed manifest failed envelope validation/,
    );
  });

  it('seedEnvelopeSchema rejects an object with no provenance', () => {
    const parsed = seedEnvelopeSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      // The error must name the provenance path, not silently pass.
      expect(parsed.error.issues.length).toBeGreaterThan(0);
    }
  });
});