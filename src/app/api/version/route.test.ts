// route.test.ts — tests for /api/version route handler
import { describe, it, expect } from 'vitest';
const { GET } = await import('./route');
describe('/api/version route', () => {
  it('returns version info', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('shortSha');
  });
});
