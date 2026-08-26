// Zoo metadata schemas — unit tests.
// Covers: valid entry/manifest parse, per-field fail-closed rejection with
// path-naming reasons, unknown enum values, defaults, placeholder passthrough.

import { describe, expect, it } from 'vitest';
import {
  alphaZooEntrySchema,
  alphaZooManifestSchema,
  parseAlphaZooEntry,
  parseAlphaZooManifest,
} from './zoo-metadata';

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'alpha101_006',
    nickname: 'open-volume correlation',
    theme: ['volume', 'microstructure'],
    formula_latex: '-1 * correlation(open, volume, 10)',
    columns_required: ['open', 'volume'],
    extras_required: [],
    requires_sector: false,
    universe: ['equity_us'],
    frequency: ['1D'],
    decay_horizon: 5,
    min_warmup_bars: 10,
    notes: 'ranked negative open/volume correlation',
    ...overrides,
  };
}

function makeManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceRepository: 'github.com/example/vibe-trading (local reference clone, read-only)',
    sourceVersion: 'a20d234',
    extractedAt: '2026-08-26T00:00:00.000Z',
    entries: [makeEntry()],
    ...overrides,
  };
}

describe('parseAlphaZooEntry', () => {
  it('accepts a fully valid entry', () => {
    const result = parseAlphaZooEntry(makeEntry());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('alpha101_006');
      expect(result.value.theme).toEqual(['volume', 'microstructure']);
    }
  });

  it('applies defaults for extras_required, requires_sector, notes', () => {
    const input = makeEntry();
    delete input.extras_required;
    delete input.requires_sector;
    delete input.notes;
    const result = parseAlphaZooEntry(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.extras_required).toEqual([]);
      expect(result.value.requires_sector).toBe(false);
      expect(result.value.notes).toBe('');
    }
  });

  it('nickname is optional', () => {
    const input = makeEntry();
    delete input.nickname;
    expect(parseAlphaZooEntry(input).ok).toBe(true);
  });

  it('missing/empty id → rejected with path-naming reason', () => {
    const result = parseAlphaZooEntry(makeEntry({ id: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('id:'))).toBe(true);
  });

  it('empty theme array → rejected at theme path', () => {
    const result = parseAlphaZooEntry(makeEntry({ theme: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('theme:'))).toBe(true);
  });

  it('unknown theme → rejected naming the theme path', () => {
    const result = parseAlphaZooEntry(makeEntry({ theme: ['astrology'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('theme.0:'))).toBe(true);
  });

  it('unknown market tag → rejected naming the universe path', () => {
    const result = parseAlphaZooEntry(makeEntry({ universe: ['equity_jp'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('universe.0:'))).toBe(true);
  });

  it('unknown column → rejected naming the columns_required path', () => {
    const result = parseAlphaZooEntry(makeEntry({ columns_required: ['amount'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((r) => r.startsWith('columns_required.0:'))).toBe(true);
    }
  });

  it('unknown frequency → rejected naming the frequency path', () => {
    const result = parseAlphaZooEntry(makeEntry({ frequency: ['1h'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('frequency.0:'))).toBe(true);
  });

  it('non-positive decay_horizon → rejected', () => {
    const result = parseAlphaZooEntry(makeEntry({ decay_horizon: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('decay_horizon:'))).toBe(true);
  });

  it('negative min_warmup_bars → rejected; zero accepted', () => {
    const bad = parseAlphaZooEntry(makeEntry({ min_warmup_bars: -1 }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reasons.some((r) => r.startsWith('min_warmup_bars:'))).toBe(true);
    }
    expect(parseAlphaZooEntry(makeEntry({ min_warmup_bars: 0 })).ok).toBe(true);
  });

  it("placeholder formula 'see body' still passes the schema (string is valid)", () => {
    const result = parseAlphaZooEntry(makeEntry({ formula_latex: 'see body' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.formula_latex).toBe('see body');
  });

  it('collects ALL malformed-field reasons in one pass', () => {
    const result = parseAlphaZooEntry(
      makeEntry({ id: '', theme: [], universe: [], decay_horizon: -3 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });
});

describe('parseAlphaZooManifest', () => {
  it('accepts a fully valid manifest', () => {
    const result = parseAlphaZooManifest(makeManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1);
      expect(result.value.entries).toHaveLength(1);
    }
  });

  it('sourceVersion null is accepted', () => {
    expect(parseAlphaZooManifest(makeManifest({ sourceVersion: null })).ok).toBe(true);
  });

  it('wrong schemaVersion → rejected', () => {
    const result = parseAlphaZooManifest(makeManifest({ schemaVersion: 2 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('schemaVersion:'))).toBe(true);
  });

  it('empty sourceRepository → rejected', () => {
    const result = parseAlphaZooManifest(makeManifest({ sourceRepository: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((r) => r.startsWith('sourceRepository:'))).toBe(true);
    }
  });

  it('invalid extractedAt → rejected', () => {
    const result = parseAlphaZooManifest(makeManifest({ extractedAt: 'not-a-date' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('extractedAt:'))).toBe(true);
  });

  it('bad nested entry surfaces entry-indexed path', () => {
    const result = parseAlphaZooManifest(makeManifest({ entries: [makeEntry({ id: '' })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.startsWith('entries.0.id:'))).toBe(true);
  });

  it('empty entries array is schema-valid (zero-entry manifest)', () => {
    expect(parseAlphaZooManifest(makeManifest({ entries: [] })).ok).toBe(true);
  });
});

describe('schema type inference', () => {
  it('inferred types carry snake_case keys verbatim', () => {
    const entry = alphaZooEntrySchema.parse(makeEntry());
    const manifest = alphaZooManifestSchema.parse(makeManifest());
    expect(entry.formula_latex).toBe('-1 * correlation(open, volume, 10)');
    expect(manifest.entries[0].columns_required).toEqual(['open', 'volume']);
  });
});
