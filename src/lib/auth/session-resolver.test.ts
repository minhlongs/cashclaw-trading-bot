import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from '@/lib/db/client';
import type { D1Database } from '@/lib/db/types';
import { resolveServerSessionUser } from './session-resolver';

describe('resolveServerSessionUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns invalid for empty or whitespace-only sessionId', async () => {
    expect(await resolveServerSessionUser('')).toEqual({ status: 'invalid' });
    expect(await resolveServerSessionUser('   ')).toEqual({ status: 'invalid' });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('resolves valid unexpired D1 session and trims sessionId and userId', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const mockBind = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue({ results: [{ user_id: ' user_123 ', expires_at: future }] }),
    });
    const fakeDb = { prepare: vi.fn().mockReturnValue({ bind: mockBind }) } as unknown as D1Database;

    const res = await resolveServerSessionUser('  sess_abc  ', fakeDb);
    expect(res).toEqual({ status: 'valid', userId: 'user_123' });
    expect(mockBind).toHaveBeenCalledWith('sess_abc');
  });

  it('returns invalid for missing row, empty user_id, expired session, or D1 query error', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const makeDb = (impl: () => Promise<unknown>) =>
      ({
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ all: impl }) }),
      }) as unknown as D1Database;

    expect(await resolveServerSessionUser('s1', makeDb(async () => ({ results: [] })))).toEqual({
      status: 'invalid',
    });
    expect(
      await resolveServerSessionUser(
        's2',
        makeDb(async () => ({ results: [{ user_id: '   ', expires_at: past + 9999 }] })),
      ),
    ).toEqual({ status: 'invalid' });
    expect(
      await resolveServerSessionUser(
        's3',
        makeDb(async () => ({ results: [{ user_id: 'u1', expires_at: past }] })),
      ),
    ).toEqual({ status: 'invalid' });
    expect(
      await resolveServerSessionUser(
        's3_nan',
        makeDb(async () => ({ results: [{ user_id: 'u1', expires_at: Number.NaN }] })),
      ),
    ).toEqual({ status: 'invalid' });
    expect(
      await resolveServerSessionUser(
        's4',
        makeDb(async () => {
          throw new Error('D1 down');
        }),
      ),
    ).toEqual({ status: 'invalid' });
  });

  it.each(['production', 'staging', ''])(
    'fails closed with unavailable when D1 client is null under NODE_ENV="%s"',
    async (envVal) => {
      vi.mocked(createServerClient).mockReturnValue(null as never);
      vi.stubEnv('NODE_ENV', envVal);
      expect(await resolveServerSessionUser('sess_prod')).toEqual({ status: 'unavailable' });
      expect(await resolveServerSessionUser('sess_prod', null)).toEqual({ status: 'unavailable' });
    },
  );

  it.each(['development', 'test'])(
    'provides sanitized dev fallback userId under NODE_ENV="%s" when D1 client is null',
    async (envVal) => {
      vi.mocked(createServerClient).mockReturnValue(null as never);
      vi.stubEnv('NODE_ENV', envVal);
      expect(await resolveServerSessionUser('sess/unsafe$chars!')).toEqual({
        status: 'valid',
        userId: 'dev_sess_unsafe_chars_',
      });
    },
  );
});
