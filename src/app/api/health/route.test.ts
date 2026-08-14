import { describe, it, expect } from 'vitest';

type Json = Record<string, unknown>;

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(json.status).toBe('ok');
  });

  it('includes timestamp', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.timestamp).toBe('number');
    expect(json.timestamp as number).toBeGreaterThan(0);
  });

  it('includes version', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(json.version).toBeDefined();
  });

  it('includes environment', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.environment).toBe('string');
  });
});
