import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { D1Database, User, Bot, Trade, ApiCredential, TradeEvent, CapitalSnapshot, AuditLog } from './types';

vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn() }));
const mockFirst: Mock = vi.fn();
const mockAll: Mock = vi.fn();
const mockRun: Mock = vi.fn();
const mockBind = vi.fn(() => ({ first: mockFirst, all: mockAll, run: mockRun }));
const mockPrepare = vi.fn(() => ({ bind: mockBind, first: mockFirst, all: mockAll, run: mockRun }));
const mockDb = { prepare: mockPrepare } as unknown as D1Database;

const sampleUser: User = { id: 'u1', email: 'a@b.com', display_name: 'Alice', locale: 'vi', created_at: 1000, updated_at: 2000 };
const sampleBot: Bot = {
  id: 'b1', user_id: 'u1', name: 'Bot 1', pair: 'BTC/USDT', exchange: 'binance', strategy: 'grid',
  status: 'live_running', config_json: '{}', capital_allocated: 10000, capital_used: 5000,
  total_pnl: 100, win_count: 5, loss_count: 2, max_drawdown: 0, current_drawdown: 0,
  total_trades: 7, started_at: null, stopped_at: null, last_error: null,
  last_tick_at: null, last_order_at: null, created_at: 1000, updated_at: 2000,
};
const sampleTrade: Trade = {
  id: 't1', bot_id: 'b1', pair: 'BTC/USDT', side: 'buy', entry_price: 50000,
  exit_price: null, quantity: 0.1, pnl: null, fee: 0.5, status: 'open',
  exchange_order_id: null, error_message: null, opened_at: 1000, closed_at: null, created_at: 1000,
};
const sampleCred: ApiCredential = {
  id: 'c1', user_id: 'u1', exchange: 'binance', api_key_encrypted: 'enc_key',
  api_secret_encrypted: 'enc_secret', is_testnet: 0, created_at: 1000, updated_at: 2000,
};
const sampleEvent: TradeEvent = { id: 'e1', bot_id: 'b1', event_type: 'entry', detail_json: '{}', created_at: 1000 };
const sampleSnap: CapitalSnapshot = {
  id: 's1', bot_id: 'b1', total_capital: 10000, realized_pnl: 0, unrealized_pnl: 0,
  max_drawdown_pct: 0, win_count: 0, loss_count: 0, total_trades: 0, created_at: 1000,
};
const sampleAudit: AuditLog = { id: 'a1', user_id: 'u1', bot_id: 'b1', action: 'bot_created', detail_json: '{}', created_at: 1000 };

beforeEach(() => {
  vi.clearAllMocks();
  mockFirst.mockResolvedValue(null);
  mockAll.mockResolvedValue({ results: [], meta: { duration: 1 } });
  mockRun.mockResolvedValue({ meta: { changes: 1, last_row_id: 1, duration: 1 } });
});

// --- repo-users-bots ---

describe('findUserById', () => {
  it('returns user when found', async () => {
    const { findUserById } = await import('./repo-users-bots');
    mockFirst.mockResolvedValue(sampleUser);
    expect(await findUserById(mockDb, 'u1')).toEqual(sampleUser);
    expect(mockPrepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?');
    expect(mockBind).toHaveBeenCalledWith('u1');
  });

  it('returns null when not found', async () => {
    const { findUserById } = await import('./repo-users-bots');
    expect(await findUserById(mockDb, 'missing')).toBeNull();
  });
});

describe('upsertUser', () => {
  it('calls run with user values', async () => {
    const { upsertUser } = await import('./repo-users-bots');
    await upsertUser(mockDb, sampleUser);
    expect(mockRun).toHaveBeenCalledOnce();
    const firstSql = (mockPrepare.mock.calls as unknown[][][])[0][0];
    expect(firstSql).toContain('ON CONFLICT');
  });
});

describe('insertBot', () => {
  it('calls run with bot values', async () => {
    const { insertBot } = await import('./repo-users-bots');
    await insertBot(mockDb, sampleBot);
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('updateBot', () => {
  it('builds SET clause and calls run', async () => {
    const { updateBot } = await import('./repo-users-bots');
    await updateBot(mockDb, 'b1', { status: 'paused' });
    expect(mockRun).toHaveBeenCalledOnce();
    const firstSql = (mockPrepare.mock.calls as unknown[][][])[0][0] as unknown as string;
    expect(firstSql).toContain('UPDATE bots SET');
    expect(firstSql).toContain('WHERE id = ?');
  });

  it('skips run when patch is empty', async () => {
    const { updateBot } = await import('./repo-users-bots');
    await updateBot(mockDb, 'b1', {});
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe('deleteBot', () => {
  it('calls run with bot id', async () => {
    const { deleteBot } = await import('./repo-users-bots');
    await deleteBot(mockDb, 'b1');
    expect(mockRun).toHaveBeenCalledOnce();
    expect(mockBind).toHaveBeenCalledWith('b1');
  });
});

describe('findBotsByUser', () => {
  it('returns bots array', async () => {
    const { findBotsByUser } = await import('./repo-users-bots');
    mockAll.mockResolvedValue({ results: [sampleBot], meta: { duration: 1 } });
    const result = await findBotsByUser(mockDb, 'u1');
    expect(result).toEqual([sampleBot]);
    expect(mockBind).toHaveBeenCalledWith('u1');
  });

  it('returns empty array when none found', async () => {
    const { findBotsByUser } = await import('./repo-users-bots');
    expect(await findBotsByUser(mockDb, 'u1')).toEqual([]);
  });
});

describe('findBotById', () => {
  it('returns bot when found', async () => {
    const { findBotById } = await import('./repo-users-bots');
    mockFirst.mockResolvedValue(sampleBot);
    expect(await findBotById(mockDb, 'b1')).toEqual(sampleBot);
  });

  it('returns null when not found', async () => {
    const { findBotById } = await import('./repo-users-bots');
    expect(await findBotById(mockDb, 'missing')).toBeNull();
  });
});

describe('findAllBots', () => {
  it('returns all bots', async () => {
    const { findAllBots } = await import('./repo-users-bots');
    mockAll.mockResolvedValue({ results: [sampleBot], meta: { duration: 1 } });
    expect(await findAllBots(mockDb)).toEqual([sampleBot]);
  });

  it('returns empty array when no bots exist', async () => {
    const { findAllBots } = await import('./repo-users-bots');
    expect(await findAllBots(mockDb)).toEqual([]);
  });
});

// --- repo-trades-credentials ---

describe('insertTrade', () => {
  it('calls run with trade values', async () => {
    const { insertTrade } = await import('./repo-trades-credentials');
    await insertTrade(mockDb, sampleTrade);
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('findTradesByBot', () => {
  it('returns trades ordered by created_at DESC', async () => {
    const { findTradesByBot } = await import('./repo-trades-credentials');
    mockAll.mockResolvedValue({ results: [sampleTrade], meta: { duration: 1 } });
    expect(await findTradesByBot(mockDb, 'b1')).toEqual([sampleTrade]);
    expect(mockBind).toHaveBeenCalledWith('b1', 50);
  });

  it('respects custom limit', async () => {
    const { findTradesByBot } = await import('./repo-trades-credentials');
    await findTradesByBot(mockDb, 'b1', 10);
    expect(mockBind).toHaveBeenCalledWith('b1', 10);
  });
});

describe('upsertCredential', () => {
  it('calls run with credential values and ON CONFLICT', async () => {
    const { upsertCredential } = await import('./repo-trades-credentials');
    await upsertCredential(mockDb, sampleCred);
    expect(mockRun).toHaveBeenCalledOnce();
    const firstSql = (mockPrepare.mock.calls as unknown[][][])[0][0];
    expect(firstSql).toContain('ON CONFLICT');
  });
});

describe('insertTradeEvent', () => {
  it('calls run with event values', async () => {
    const { insertTradeEvent } = await import('./repo-trades-credentials');
    await insertTradeEvent(mockDb, sampleEvent);
    expect(mockRun).toHaveBeenCalledOnce();
  });
});
describe('insertCapitalSnapshot', () => {
  it('calls run with snapshot values', async () => {
    const { insertCapitalSnapshot } = await import('./repo-trades-credentials');
    await insertCapitalSnapshot(mockDb, sampleSnap);
    expect(mockRun).toHaveBeenCalledOnce();
  });
});
describe('insertAudit', () => {
  it('calls run with audit entry', async () => {
    const { insertAudit } = await import('./repo-trades-credentials');
    await insertAudit(mockDb, sampleAudit);
    expect(mockRun).toHaveBeenCalledOnce();
  });
});
