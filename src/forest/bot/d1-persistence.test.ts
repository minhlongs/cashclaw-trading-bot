import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  insertBot: vi.fn(),
  updateBot: vi.fn(),
  deleteBot: vi.fn(),
  insertTrade: vi.fn(),
  upsertCredential: vi.fn(),
  insertTradeEvent: vi.fn(),
  insertCapitalSnapshot: vi.fn(),
  insertAudit: vi.fn(),
}));

const mockDb = { prepare: vi.fn() };

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-establish createServerClient mock return (clearAllMocks resets implementations)
  const { createServerClient } = await import('@/lib/db/client');
  vi.mocked(createServerClient).mockReturnValue(mockDb as any);
});

async function repo(name: string) {
  const mod = await import('@/lib/db/repositories');
  return vi.mocked((mod as Record<string, unknown>)[name] as (...a: unknown[]) => unknown);
}

describe('d1-persistence', () => {
  describe('persistBot', () => {
    it('returns early when DB unavailable', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(null as any);
      const { persistBot } = await import('./d1-persistence');
      await persistBot('user-1', {
        id: 'bot-1', config: { strategy: 'grid' } as any, capital: 10000,
        name: 'test', strategy: 'grid', pair: 'BTCUSDT', exchange: 'paper',
      });
      const insertBot = await repo('insertBot');
      expect(insertBot).not.toHaveBeenCalled();
    });

    it('inserts bot with correct fields', async () => {
      const { persistBot } = await import('./d1-persistence');
      await persistBot('user-1', {
        id: 'bot-1', config: { strategy: 'grid', gridLevels: 5 } as any, capital: 10000,
        name: 'GridBot', strategy: 'grid', pair: 'BTCUSDT', exchange: 'paper',
      });
      const insertBot = await repo('insertBot');
      expect(insertBot).toHaveBeenCalledTimes(1);
      const call = insertBot.mock.calls[0];
      expect(call[0]).toBe(mockDb);
      const bot = call[1] as Record<string, unknown>;
      expect(bot.user_id).toBe('user-1');
      expect(bot.name).toBe('GridBot');
      expect(bot.strategy).toBe('grid');
      expect(bot.pair).toBe('BTCUSDT');
      expect(bot.exchange).toBe('paper');
      expect(bot.status).toBe('draft');
      expect(bot.config_json).toBeDefined();
      expect(typeof bot.created_at).toBe('number');
    });
  });

  describe('patchBot', () => {
    it('updates bot fields', async () => {
      const { patchBot } = await import('./d1-persistence');
      await patchBot('bot-1', { status: 'paper_test', total_pnl: 150.5 });
      const updateBot = await repo('updateBot');
      expect(updateBot).toHaveBeenCalledTimes(1);
      const call = updateBot.mock.calls[0];
      expect(call[0]).toBe(mockDb);
      expect(call[1]).toBe('bot-1');
      expect((call[2] as Record<string, unknown>).status).toBe('paper_test');
      expect((call[2] as Record<string, unknown>).total_pnl).toBe(150.5);
      expect(typeof (call[2] as Record<string, unknown>).updated_at).toBe('number');
    });
  });

  describe('deleteBotRecord', () => {
    it('deletes bot by ID', async () => {
      const { deleteBotRecord } = await import('./d1-persistence');
      await deleteBotRecord('bot-1');
      const deleteBot = await repo('deleteBot');
      expect(deleteBot).toHaveBeenCalledWith(mockDb, 'bot-1');
    });
  });

  describe('persistTrade', () => {
    it('returns early when DB unavailable', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(null as any);
      const { persistTrade } = await import('./d1-persistence');
      await persistTrade('bot-1', {
        side: 'buy', entryPrice: 50000, exitPrice: undefined,
        quantity: 0.1, pnl: undefined, status: 'filled',
      });
      const insertTrade = await repo('insertTrade');
      expect(insertTrade).not.toHaveBeenCalled();
    });

    it('inserts trade with correct fields', async () => {
      const { persistTrade } = await import('./d1-persistence');
      await persistTrade('bot-1', {
        side: 'buy', entryPrice: 50000, exitPrice: undefined,
        quantity: 0.1, pnl: undefined, status: 'filled',
      });
      const insertTrade = await repo('insertTrade');
      expect(insertTrade).toHaveBeenCalledTimes(1);
      const trade = insertTrade.mock.calls[0][1] as Record<string, unknown>;
      expect(trade.bot_id).toBe('bot-1');
      expect(trade.side).toBe('buy');
      expect(trade.entry_price).toBe(50000);
      expect(trade.exit_price).toBeNull();
      expect(trade.quantity).toBe(0.1);
      expect(trade.pnl).toBeNull();
      expect(trade.status).toBe('filled');
    });
  });

  describe('persistCredential', () => {
    it('upserts credential', async () => {
      const { persistCredential } = await import('./d1-persistence');
      await persistCredential('user-1', {
        exchange: 'binance', apiKeyEncrypted: 'abc', apiSecretEncrypted: 'xyz',
        isTestnet: false,
      });
      const upsertCredential = await repo('upsertCredential');
      expect(upsertCredential).toHaveBeenCalledTimes(1);
      const cred = upsertCredential.mock.calls[0][1] as Record<string, unknown>;
      expect(cred.user_id).toBe('user-1');
      expect(cred.exchange).toBe('binance');
      expect(cred.api_key_encrypted).toBe('abc');
      expect(cred.api_secret_encrypted).toBe('xyz');
    });
  });

  describe('persistEvent', () => {
    it('returns early when DB unavailable', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(null as any);
      const { persistEvent } = await import('./d1-persistence');
      await persistEvent('bot-1', 'start', { price: 50000 });
      const insertTradeEvent = await repo('insertTradeEvent');
      expect(insertTradeEvent).not.toHaveBeenCalled();
    });

    it('inserts trade event', async () => {
      const { persistEvent } = await import('./d1-persistence');
      await persistEvent('bot-1', 'tick', { price: 51000 });
      const insertTradeEvent = await repo('insertTradeEvent');
      expect(insertTradeEvent).toHaveBeenCalledTimes(1);
      const event = insertTradeEvent.mock.calls[0][1] as Record<string, unknown>;
      expect(event.bot_id).toBe('bot-1');
      expect(event.event_type).toBe('tick');
      expect(JSON.parse(event.detail_json as string)).toEqual({ price: 51000 });
    });
  });

  describe('persistSnapshot', () => {
    it('inserts capital snapshot', async () => {
      const { persistSnapshot } = await import('./d1-persistence');
      await persistSnapshot('bot-1', {
        totalCapital: 10000, realizedPnl: 200, unrealizedPnl: 50,
        maxDrawdownPct: 5, winCount: 3, lossCount: 1, totalTrades: 4,
      });
      const insertCapitalSnapshot = await repo('insertCapitalSnapshot');
      expect(insertCapitalSnapshot).toHaveBeenCalledTimes(1);
      const snap = insertCapitalSnapshot.mock.calls[0][1] as Record<string, unknown>;
      expect(snap.bot_id).toBe('bot-1');
      expect(snap.total_capital).toBe(10000);
      expect(snap.realized_pnl).toBe(200);
      expect(snap.unrealized_pnl).toBe(50);
      expect(snap.win_count).toBe(3);
      expect(snap.loss_count).toBe(1);
      expect(snap.total_trades).toBe(4);
    });
  });

  describe('persistAudit', () => {
    it('returns early when DB unavailable', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(null as any);
      const { persistAudit } = await import('./d1-persistence');
      await persistAudit('user-1', 'bot-1', 'start', { action: 'start' });
      const insertAudit = await repo('insertAudit');
      expect(insertAudit).not.toHaveBeenCalled();
    });

    it('inserts audit log entry', async () => {
      const { persistAudit } = await import('./d1-persistence');
      await persistAudit('user-1', 'bot-1', 'start', { reason: 'manual' });
      const insertAudit = await repo('insertAudit');
      expect(insertAudit).toHaveBeenCalledTimes(1);
      const audit = insertAudit.mock.calls[0][1] as Record<string, unknown>;
      expect(audit.user_id).toBe('user-1');
      expect(audit.bot_id).toBe('bot-1');
      expect(audit.action).toBe('start');
      expect(JSON.parse(audit.detail_json as string)).toEqual({ reason: 'manual' });
    });
  });
});
