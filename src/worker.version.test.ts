import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';

type VersionEnv = { VERSION?: string };
type VersionBindings = { Bindings: VersionEnv };

function makeApp(env: VersionEnv = {}) {
  const app = new Hono<VersionBindings>();
  app.get('/api/version', (c) => {
    try {
      const version = c.env.VERSION ?? env.VERSION;
      if (version) {
        const shortSha = version.slice(0, 7);
        return c.json({ ok: true, data: { version, shortSha } });
      }
      return c.json(
        { ok: true, data: { version: '0.0.0-dev', shortSha: '0000000' } },
        200,
      );
    } catch {
      return c.json({ ok: true, data: { version: '0.0.0-dev', shortSha: '0000000' } }, 200);
    }
  });
  return app;
}

describe('/api/version', () => {
  it('returns injected env version with shortSha', async () => {
    const app = makeApp({ VERSION: 'abc1234def5678' });
    const res = await app.fetch(new Request('http://localhost/api/version'), {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { version: string; shortSha: string } };
    expect(body).toEqual({ ok: true, data: { version: 'abc1234def5678', shortSha: 'abc1234' } });
  });

  it('falls back to env VERSION when c.env is absent', async () => {
    const app = makeApp({ VERSION: 'deadbeef' });
    const res = await app.fetch(new Request('http://localhost/api/version'), {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { version: string; shortSha: string } };
    expect(body.ok).toBe(true);
    expect(body.data.version).toBe('deadbeef');
  });

  it('returns default when env has no VERSION', async () => {
    const app = makeApp();
    const res = await app.fetch(new Request('http://localhost/api/version'), {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { version: string; shortSha: string } };
    expect(body).toEqual({ ok: true, data: { version: '0.0.0-dev', shortSha: '0000000' } });
  });

  it('handles short version strings', async () => {
    const app = makeApp({ VERSION: 'a1b2c3d' });
    const res = await app.fetch(new Request('http://localhost/api/version'), {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { version: string; shortSha: string } };
    expect(body.data.shortSha).toBe('a1b2c3d');
  });
});
