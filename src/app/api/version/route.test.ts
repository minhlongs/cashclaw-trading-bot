import { describe, it, expect } from 'vitest';

type Json = Record<string, unknown>;

describe('GET /api/version', () => {
  it('returns platform name', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(json.name).toBe('CashClaw AI Trading Bot Platform');
  });

  it('includes version string', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.version).toBe('string');
  });

  it('includes shortSha and fullSha', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.shortSha).toBe('string');
    expect(typeof json.fullSha).toBe('string');
    expect((json.shortSha as string).length).toBeLessThanOrEqual(8);
  });

  it('includes buildTime', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.buildTime).toBe('string');
    expect((json.buildTime as string).length).toBeGreaterThan(0);
  });

  it('includes environment and region', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.environment).toBe('string');
    expect(typeof json.region).toBe('string');
  });
});
