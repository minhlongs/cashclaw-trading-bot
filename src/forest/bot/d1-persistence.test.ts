import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GridBotConfig } from '@/tree/bot/types';

// Mock D1 database
const mockDb = { prepare: vi.fn().mockReturnThis(), bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null), run: vi.fn().mockResolvedValue({}), all: vi.fn().mockResolvedValue({ results: [] }) };

vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn(() => mockDb) }));

// Mock repository functions — capture calls
const mockInsertBot = vi.fn().mockResolvedValue(undefined);
const mockUpdateBot = vi.fn().mockResolvedValue(undefined);
const mockDeleteBot = vi.fn().mockResolvedValue(undefined);
const mockInsertTrade = vi.fn().mockResolvedValue(undefined);
const mockUpsertCredential = vi.fn().mockResolvedValue(undefined);
const mockInsertTradeEvent = vi.fn().mockResolvedValue(undefined);
const mockInsertCapitalSnapshot = vi.fn().mockResolvedValue(undefined);
const mockInsertAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db/repositories', () => ({
  insertBot: (...a: unknown[]) => mockInsertBot(...a),
  updateBot: (...a: unknown[]) => mockUpdateBot(...a),
  deleteBot: (...a: unknown[]) => mockDeleteBot(...a),
  insertTrade: (...a: unknown[]) => mockInsertTrade(...a),
  upsertCredential: (...a: unknown[]) => mockUpsertCredential(...a),
  insertTradeEvent: (...a: unknown[]) => mockInsertTradeEvent(...a),
  insertCapitalSnapshot: (...a: unknown[]) => mockInsertCapitalSnapshot(...a),
  insertAudit: (...a: unknown[]) => mockInsertAudit(...a),
}));

const { persistBot, patchBot, deleteBotRecord, persistTrade, persistCredential, persistEvent, persistSnapshot, persistAudit } = await import('./d1-persistence');

const gridCfg: GridBotConfig = {
  symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 10000,
  strategy: 'grid', gridSpacingPct: 2, gridLevels: 6, capitalPerLevelPct: 10,
  takeProfitPct: 3, stopLossPct: 5, maxDrawdownPct: 10, rebalanceOnFill: false,
};
const botInput = { id: 'bot_1', config: gridCfg, capital: 10000, name: 'Test', strategy: 'grid', pair: 'BTC/USDT', exchange: 'binance' };

beforeEach(() => { vi.clearAllMocks(); });

describe('persistBot', () => {
  it('inserts bot with correct fields', async () => {
    await persistBot('user_1', botInput);
    expect(mockInsertBot).toHaveBeenCalledOnce();
    const row = mockInsertBot.mock.calls[0][1];
    expect(row.id).toBe('bot_1');
    expect(row.user_id).toBe('user_1');
    expect(row.status).toBe('draft');
    expect(row.capital_allocated).toBe(10000);
    expect(row.config_json).toContain('grid');
  });
  it('no-ops when db is null', async () => {
    const mod = await import('@/lib/db/client');
    (mod.createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await persistBot('user_1', botInput);
    expect(mockInsertBot).not.toHaveBeenCalled();
  });
});

describe('patchBot', () => {
  it('updates with merged fields and updated_at', async () => {
    await patchBot('bot_1', { status: 'live_running', total_pnl: 50 });
    expect(mockUpdateBot).toHaveBeenCalledOnce();
    const [, id, data] = mockUpdateBot.mock.calls[0] as unknown[];
    expect(id).toBe('bot_1');
    expect(data).toMatchObject({ status: 'live_running', total_pnl: 50 });
    expect(data).toHaveProperty('updated_at');
  });
  it('no-ops when db is null', async () => {
    const mod = await import('@/lib/db/client');
    (mod.createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await patchBot('bot_1', { status: 'live_running' });
    expect(mockUpdateBot).not.toHaveBeenCalled();
  });
});

describe('deleteBotRecord', () => {
  it('calls deleteBot', async () => {
    await deleteBotRecord('bot_1');
    expect(mockDeleteBot).toHaveBeenCalledWith(mockDb, 'bot_1');
  });
  it('no-ops when db is null', async () => {
    const mod = await import('@/lib/db/client');
    (mod.createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await deleteBotRecord('bot_1');
    expect(mockDeleteBot).not.toHaveBeenCalled();
  });
});

describe('persistTrade', () => {
  it('inserts open trade without exit fields', async () => {
    await persistTrade('bot_1', { side: 'buy', entryPrice: 50000, quantity: 0.1, status: 'open' });
    expect(mockInsertTrade).toHaveBeenCalledOnce();
    const row = mockInsertTrade.mock.calls[0][1];
    expect(row.bot_id).toBe('bot_1');
    expect(row.side).toBe('buy');
    expect(row.entry_price).toBe(50000);
    expect(row.exit_price).toBeNull();
    expect(row.pnl).toBeNull();
    expect(row.closed_at).toBeNull();
  });
  it('sets closed_at and pnl when exitPrice present', async () => {
    await persistTrade('bot_1', { side: 'sell', entryPrice: 50000, exitPrice: 51000, quantity: 0.1, pnl: 100, status: 'filled' });
    const row = mockInsertTrade.mock.calls[0][1];
    expect(row.exit_price).toBe(51000);
    expect(row.pnl).toBe(100);
    expect(row.closed_at).toBeTypeOf('number');
  });
  it('no-ops when db is null', async () => {
    const mod = await import('@/lib/db/client');
    (mod.createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await persistTrade('bot_1', { side: 'buy', entryPrice: 50000, quantity: 0.1, status: 'open' });
    expect(mockInsertTrade).not.toHaveBeenCalled();
  });
});

describe('persistCredential', () => {
  it('upserts credential with encrypted fields', async () => {
    await persistCredential('user_1', { exchange: 'binance', apiKeyEncrypted: 'enc_k', apiSecretEncrypted: 'enc_s', isTestnet: true });
    expect(mockUpsertCredential).toHaveBeenCalledOnce();
    const row = mockUpsertCredential.mock.calls[0][1];
    expect(row.user_id).toBe('user_1');
    expect(row.exchange).toBe('binance');
    expect(row.api_key_encrypted).toBe('enc_k');
    expect(row.is_testnet).toBe(1);
  });
  it('sets is_testnet to 0 when false', async () => {
    await persistCredential('user_1', { exchange: 'bybit', apiKeyEncrypted: 'k', apiSecretEncrypted: 's', isTestnet: false });
    expect(mockUpsertCredential.mock.calls[0][1].is_testnet).toBe(0);
  });
  it('no-ops when db is null', async () => {
    const mod = await import('@/lib/db/client');
    (mod.createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await persistCredential('user_1', { exchange: 'binance', apiKeyEncrypted: 'k', apiSecretEncrypted: 's', isTestnet: false });
    expect(mockUpsertCredential).not.toHaveBeenCalled();
  });
});

describe('persistEvent', () => {
  it('inserts trade event', async () => {
    await persistEvent('bot_1', 'tick', { price: 50000 });
    expect(mockInsertTradeEvent).toHaveBeenCalledOnce();
    const row = mockInsertTradeEvent.mock.calls[0][1];
    expect(row.bot_id).toBe('bot_1');
    expect(row.event_type).toBe('tick');
    expect(JSON.parse(row.detail_json)).toEqual({ price: 50000 });
  });
  it('uses default empty detail', async () => {
    await persistEvent('bot_1', 'start');
    const row = mockInsertTradeEvent.mock.calls[0][1];
    expect(row.detail_json).toBe('{}');
  });
  it('no-ops when db is null', async () => {
    const mod = await import('@/lib/db/client');
    (mod.createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await persistEvent('bot_1', 'tick');
    expect(mockInsertTradeEvent).not.toHaveBeenCalled();
  });
});

describe('persistSnapshot', () => {
  it('inserts capital snapshot with all fields', async () => {
    await persistSnapshot('bot_1', {
      totalCapital: 12000, realizedPnl: 2000, unrealizedPnl: 500,
      maxDrawdownPct: 5, winCount: 10, lossCount: 2, totalTrades: 12,
    });
    expect(mockInsertCapitalSnapshot).toHaveBeenCalledOnce();
    const row = mockInsertCapitalSnapshot.mock.calls[0][1];
    expect(row.bot_id).toBe('bot_1');
    expect(row.total_capital).toBe(12000);
    expect(row.realized_pnl).toBe(2000);
    expect(row.unrealized_pnl).toBe(500);
    expect(row.win_count).toBe(10);
  });
  it('defaults unrealizedPnl to 0', async () => {
    await persistSnapshot('bot_1', {
      totalCapital: 10000, realizedPnl: 0, maxDrawdownPct: 2,
      winCount: 0, lossCount: 0, totalTrades: 0,
    });
    expect(mockInsertCapitalSnapshot.mock.calls[0][1].unrealized_pnl).toBe(0);
  });
  it('no-ops when db is null', async () => {
    const mod = await import('@/lib/db/client');
    (mod.createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await persistSnapshot('bot_1', { totalCapital: 10000, realizedPnl: 0, maxDrawdownPct: 0, winCount: 0, lossCount: 0, totalTrades: 0 });
    expect(mockInsertCapitalSnapshot).not.toHaveBeenCalled();
  });
});

describe('persistAudit', () => {
  it('inserts audit log with action and detail', async () => {
    await persistAudit('user_1', 'bot_1', 'bot.created', { reason: 'manual' });
    expect(mockInsertAudit).toHaveBeenCalledOnce();
    const row = mockInsertAudit.mock.calls[0][1];
    expect(row.user_id).toBe('user_1');
    expect(row.bot_id).toBe('bot_1');
    expect(row.action).toBe('bot.created');
    expect(JSON.parse(row.detail_json)).toEqual({ reason: 'manual' });
  });
  it('uses default empty detail', async () => {
    await persistAudit(null, null, 'system.init');
    const row = mockInsertAudit.mock.calls[0][1];
    expect(row.detail_json).toBe('{}');
  });
  it('no-ops when db is null', async () => {
    const mod = await import('@/lib/db/client');
    (mod.createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await persistAudit('user_1', 'bot_1', 'test');
    expect(mockInsertAudit).not.toHaveBeenCalled();
  });
});
