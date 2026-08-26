// AlphaProvenance — unit tests.
// Covers: deterministic SHA-256 via WebCrypto (fixed NIST vector),
// fail-closed validation (empty fields, bad hash format), canonical
// representation stability. No Node-only crypto.

import { describe, expect, it } from 'vitest';
import {
  buildNormalizedRepresentation,
  computeFormulaHash,
  validateProvenance,
  type AlphaProvenance,
} from './provenance';

// NIST FIPS 180-2 test vector: SHA-256("abc")
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

async function makeProvenance(
  overrides: Partial<AlphaProvenance> = {},
): Promise<AlphaProvenance> {
  return {
    sourceZoo: 'vibe-trading-zoo',
    sourceAlphaId: 'alpha-0042-funding-fade',
    sourceRepository: 'https://github.com/vibe-trading/alpha-zoo',
    sourceVersion: 'v1.3.0',
    formulaHash: await computeFormulaHash('rank(-funding_rate) * sign(oi_change)'),
    importTimestamp: '2026-08-26T00:00:00.000Z',
    importerVersion: 'cashclaw-importer@1.0.0',
    normalizedRepresentation: buildNormalizedRepresentation({
      formula: 'rank(-funding_rate) * sign(oi_change)',
      lookback: 24,
    }),
    ...overrides,
  };
}

describe('computeFormulaHash', () => {
  it('matches the fixed NIST vector for "abc"', async () => {
    expect(await computeFormulaHash('abc')).toBe(SHA256_ABC);
  });

  it('is deterministic: same input → same hash across calls', async () => {
    const formula = 'rank(-funding_rate) * sign(oi_change)';
    const first = await computeFormulaHash(formula);
    const second = await computeFormulaHash(formula);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different formulas produce different hashes', async () => {
    const a = await computeFormulaHash('rank(momentum_20)');
    const b = await computeFormulaHash('rank(momentum_21)');
    expect(a).not.toBe(b);
  });
});

describe('buildNormalizedRepresentation', () => {
  it('is stable across key insertion order', () => {
    const a = buildNormalizedRepresentation({ formula: 'x', lookback: 10 });
    const b = buildNormalizedRepresentation({ lookback: 10, formula: 'x' });
    expect(a).toBe(b);
  });
});

describe('validateProvenance', () => {
  it('accepts a fully valid provenance record', async () => {
    const result = validateProvenance(await makeProvenance());
    expect(result.ok).toBe(true);
  });

  it('accepts null sourceVersion (unversioned import)', async () => {
    const result = validateProvenance(await makeProvenance({ sourceVersion: null }));
    expect(result.ok).toBe(true);
  });

  it('rejects empty sourceZoo / sourceAlphaId / sourceRepository', async () => {
    const result = validateProvenance(
      await makeProvenance({ sourceZoo: '', sourceAlphaId: '  ', sourceRepository: '' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain('sourceZoo must be non-empty');
      expect(result.reasons).toContain('sourceAlphaId must be non-empty');
      expect(result.reasons).toContain('sourceRepository must be non-empty');
    }
  });

  it('rejects empty sourceVersion when present', async () => {
    const result = validateProvenance(await makeProvenance({ sourceVersion: ' ' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain('sourceVersion must be non-empty when present');
    }
  });

  it('rejects bad formulaHash formats', async () => {
    for (const bad of ['xyz', 'ABCDEF', 'a'.repeat(63), 'g'.repeat(64), '']) {
      const result = validateProvenance(await makeProvenance({ formulaHash: bad }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.some((r) => r.includes('formulaHash'))).toBe(true);
      }
    }
  });

  it('rejects non-ISO importTimestamp', async () => {
    const result = validateProvenance(await makeProvenance({ importTimestamp: 'not-a-date' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain('importTimestamp must be an ISO-8601 timestamp');
    }
  });

  it('rejects non-canonical or invalid normalizedRepresentation', async () => {
    const nonCanonical = '{"lookback":10,"formula":"x"}'; // keys not sorted
    const result = validateProvenance(
      await makeProvenance({ normalizedRepresentation: nonCanonical }),
    );
    expect(result.ok).toBe(false);

    const invalid = validateProvenance(
      await makeProvenance({ normalizedRepresentation: '{not json' }),
    );
    expect(invalid.ok).toBe(false);
  });

  it('collects all reasons at once (fail-closed)', async () => {
    const result = validateProvenance(
      await makeProvenance({
        sourceZoo: '',
        formulaHash: 'bad',
        importTimestamp: 'nope',
        importerVersion: '',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });
});
