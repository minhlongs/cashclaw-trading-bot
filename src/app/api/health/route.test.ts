// route.test.ts — tests for /api/health route handler
import { describe, it, expect } from 'vitest';
const { GET } = await import('./route');
describe('/api/health route', () => {
  it('returns health status', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
  });
});
