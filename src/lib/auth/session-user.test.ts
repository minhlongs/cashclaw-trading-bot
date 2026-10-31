import { describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@/lib/db/types';
import { resolveSessionUser } from './session-user';

function mockDb(row: { user_id: string } | null) {
  const first = vi.fn().mockResolvedValue(row);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  const db = { prepare } as unknown as D1Database;
  return { db, bind, first, prepare };
}

describe('resolveSessionUser', () => {
  it('requires the session cookie and never accepts a user header as identity', async () => {
    const { db } = mockDb({ user_id: 'user-a' });
    const missing = await resolveSessionUser(new Request('https://example.test/api', { headers: { 'x-user-id': 'user-a' } }), db, 100);
    expect(missing).toEqual({ userId: null, errorStatus: 401 });
  });

  it('uses the session primary key and strict epoch-second expiry predicate', async () => {
    const { db, bind, prepare } = mockDb({ user_id: 'user-a' });
    const result = await resolveSessionUser(new Request('https://example.test/api', { headers: { cookie: 'session_id=sess-fixture-a' } }), db, 123);
    expect(result).toEqual({ userId: 'user-a', errorStatus: null });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('JOIN users u ON u.id = s.user_id'));
    expect(bind).toHaveBeenCalledWith('sess-fixture-a', 123);
  });

  it('rejects orphan session rows because identity must still exist in users', async () => {
    const { db, prepare } = mockDb(null);
    const result = await resolveSessionUser(new Request('https://example.test/api', { headers: { cookie: 'session_id=orphan-session' } }), db, 100);
    expect(result).toEqual({ userId: null, errorStatus: 401 });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('JOIN users u ON u.id = s.user_id'));
  });

  it('rejects missing, expired, empty-owner and oversized sessions', async () => {
    const request = (cookie: string) => new Request('https://example.test/api', { headers: { cookie } });
    expect(await resolveSessionUser(request('session_id=s1'), mockDb(null).db, 1)).toMatchObject({ userId: null, errorStatus: 401 });
    expect(await resolveSessionUser(request('session_id=s1'), mockDb({ user_id: '' }).db, 1)).toMatchObject({ userId: null, errorStatus: 401 });
    expect(await resolveSessionUser(request(`session_id=${'s'.repeat(129)}`), mockDb({ user_id: 'user-a' }).db, 1)).toMatchObject({ userId: null, errorStatus: 401 });
  });

  it('fails closed with service unavailable when the session query throws', async () => {
    const db = { prepare: () => ({ bind: () => ({ first: vi.fn().mockRejectedValue(new Error('database detail')) }) }) } as unknown as D1Database;
    await expect(resolveSessionUser(new Request('https://example.test', { headers: { cookie: 'session_id=s1' } }), db, 1))
      .resolves.toEqual({ userId: null, errorStatus: 503 });
  });
});
