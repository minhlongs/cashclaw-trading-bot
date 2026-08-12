import { Context } from 'hono';

export function authGuard() {
  return async (
    c: Context<{ Bindings: { ADMIN_TOKEN: string } }>,
    next: () => Promise<void>,
  ) => {
    const adminToken = c.env.ADMIN_TOKEN;
    if (!adminToken) {
      return c.json({ ok: false, error: 'Unauthorized — server misconfigured' }, 401);
    }
    if (!/^\S+$/.test(adminToken)) {
      return c.json({ ok: false, error: 'Unauthorized — server misconfigured' }, 401);
    }

    const authHeader = c.req.header('Authorization') ?? '';
    const [scheme, ...rest] = authHeader.split(' ');
    const rawToken = rest.join(' ');
    if (scheme !== 'Bearer' || !rawToken) {
      return c.json({ ok: false, error: 'Unauthorized — missing token' }, 401);
    }

    const expected = new TextEncoder().encode(adminToken);
    const received = new TextEncoder().encode(rawToken);
    if (expected.length !== received.length) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    let eq = 0;
    for (let i = 0; i < expected.length; i += 1) {
      eq |= expected[i] ^ received[i];
    }
    if (eq !== 0) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    await next();
  };
}
