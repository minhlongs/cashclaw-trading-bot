import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database } from './types';

// Mock D1 chain: prepare → bind → { first, all, run }
const mockFirst = vi.fn();
const mockAll = vi.fn();
const mockRun = vi.fn();
const mockBind = vi.fn(() => ({ first: mockFirst, all: mockAll, run: mockRun }));
const mockPrepare = vi.fn(() => ({ bind: mockBind, first: mockFirst, all: mockAll, run: mockRun }));
const mockDb = { prepare: mockPrepare } as unknown as D1Database;

beforeEach(() => {
  vi.clearAllMocks();
  mockFirst.mockResolvedValue(null);
  mockAll.mockResolvedValue({ results: [], meta: { duration: 1 } });
  mockRun.mockResolvedValue({ meta: { changes: 1, last_row_id: 1, duration: 1 } });
});

describe('findUserById', () => {
  it('returns user when found', async () => {
    const user = { id: 'u1', email: 'test@test.com' };
    mockFirst.mockResolvedValue(user);
    const { findUserById } = await import('./repo-users-bots');
    const result = await findUserById(mockDb, 'u1');
    expect(result).toEqual(user);
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('users'));
  });

  it('returns null when not found', async () => {
    const { findUserById } = await import('./repo-users-bots');
    const result = await findUserById(mockDb, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('upsertUser', () => {
  it('calls run with user data', async () => {
    const { upsertUser } = await import('./repo-users-bots');
    await upsertUser(mockDb, {
      id: 'u1', email: 'test@test.com', display_name: 'Test',
      locale: 'vi', created_at: 1000, updated_at: 2000,
    });
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('insertBot', () => {
  it('calls run with bot data', async () => {
    const { insertBot } = await import('./repo-users-bots');
    await insertBot(mockDb, {
      id: 'b1', user_id: 'u1', name: 'Bot', strategy: 'grid',
      pair: 'BTC/USDT', exchange: 'binance', status: 'draft',
      config_json: '{}', capital_allocated: 1000, capital_used: 0,
      total_pnl: 0, win_count: 0, loss_count: 0, max_drawdown: 0,
      total_trades: 0, started_at: null, stopped_at: null,
      last_error: null, last_tick_at: null, last_order_at: null,
      current_drawdown: 0, created_at: 1000, updated_at: 2000,
    });
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('updateBot', () => {
  it('calls run with bot patch', async () => {
    const { updateBot } = await import('./repo-users-bots');
    await updateBot(mockDb, 'b1', { status: 'live_running' });
    expect(mockRun).toHaveBeenCalledOnce();
    expect(mockBind).toHaveBeenCalled();
  });
});

describe('deleteBot', () => {
  it('calls run with bot id', async () => {
    const { deleteBot } = await import('./repo-users-bots');
    await deleteBot(mockDb, 'b1');
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('findBotsByUser', () => {
  it('returns bots for user', async () => {
    mockAll.mockResolvedValue({ results: [{ id: 'b1' }], meta: { duration: 1 } });
    const { findBotsByUser } = await import('./repo-users-bots');
    const result = await findBotsByUser(mockDb, 'u1');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when none found', async () => {
    const { findBotsByUser } = await import('./repo-users-bots');
    const result = await findBotsByUser(mockDb, 'u1');
    expect(result).toEqual([]);
  });
});

describe('findBotById', () => {
  it('returns bot when found', async () => {
    mockFirst.mockResolvedValue({ id: 'b1', name: 'Bot' });
    const { findBotById } = await import('./repo-users-bots');
    const result = await findBotById(mockDb, 'b1');
    expect(result?.id).toBe('b1');
  });

  it('returns null when not found', async () => {
    const { findBotById } = await import('./repo-users-bots');
    const result = await findBotById(mockDb, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('findAllBots', () => {
  it('returns all bots', async () => {
    mockAll.mockResolvedValue({ results: [{ id: 'b1' }, { id: 'b2' }], meta: { duration: 1 } });
    const { findAllBots } = await import('./repo-users-bots');
    const result = await findAllBots(mockDb);
    expect(result).toHaveLength(2);
  });
});

describe('findSettingsByUser', () => {
  it('returns settings when found', async () => {
    mockFirst.mockResolvedValue({ id: 's1', user_id: 'u1' });
    const { findSettingsByUser } = await import('./repositories');
    const result = await findSettingsByUser(mockDb, 'u1');
    expect(result?.id).toBe('s1');
  });

  it('returns null when not found', async () => {
    const { findSettingsByUser } = await import('./repositories');
    const result = await findSettingsByUser(mockDb, 'u1');
    expect(result).toBeNull();
  });
});

describe('upsertSettings', () => {
  it('calls run with settings data', async () => {
    const { upsertSettings } = await import('./repositories');
    await upsertSettings(mockDb, {
      id: 's1', user_id: 'u1', exchange_creds_json: '{}',
      risk_limits_json: '{}', killswitch_enabled: 0,
      killswitch_reason: null, killswitch_triggered_at: null,
      updated_at: 1000,
    });
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('insertTrade', () => {
  it('calls run with trade data', async () => {
    const { insertTrade } = await import('./repo-trades-credentials');
    await insertTrade(mockDb, {
      id: 't1', bot_id: 'b1', pair: 'BTC/USDT', side: 'buy',
      entry_price: 50000, exit_price: null, quantity: 0.1,
      pnl: null, fee: 5, status: 'open', exchange_order_id: null,
      error_message: null, opened_at: 1000, closed_at: null, created_at: 1000,
    });
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('findTradesByBot', () => {
  it('returns trades for bot', async () => {
    mockAll.mockResolvedValue({ results: [{ id: 't1' }], meta: { duration: 1 } });
    const { findTradesByBot } = await import('./repo-trades-credentials');
    const result = await findTradesByBot(mockDb, 'b1');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when none found', async () => {
    const { findTradesByBot } = await import('./repo-trades-credentials');
    const result = await findTradesByBot(mockDb, 'b1');
    expect(result).toEqual([]);
  });
});

describe('upsertCredential', () => {
  it('calls run with credential data', async () => {
    const { upsertCredential } = await import('./repo-trades-credentials');
    await upsertCredential(mockDb, {
      id: 'c1', user_id: 'u1', exchange: 'binance',
      api_key_encrypted: 'key', api_secret_encrypted: 'secret',
      is_testnet: 0, created_at: 1000, updated_at: 2000,
    });
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('insertTradeEvent', () => {
  it('calls run with event data', async () => {
    const { insertTradeEvent } = await import('./repo-trades-credentials');
    await insertTradeEvent(mockDb, {
      id: 'e1', bot_id: 'b1', event_type: 'order_placed',
      detail_json: '{}', created_at: 1000,
    });
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('insertCapitalSnapshot', () => {
  it('calls run with snapshot data', async () => {
    const { insertCapitalSnapshot } = await import('./repo-trades-credentials');
    await insertCapitalSnapshot(mockDb, {
      id: 'cs1', bot_id: 'b1', total_capital: 1000,
      realized_pnl: 0, unrealized_pnl: 0, max_drawdown_pct: 0,
      win_count: 0, loss_count: 0, total_trades: 0, created_at: 1000,
    });
    expect(mockRun).toHaveBeenCalledOnce();
  });
});

describe('insertAudit', () => {
  it('calls run with audit entry', async () => {
    const { insertAudit } = await import('./repo-trades-credentials');
    await insertAudit(mockDb, {
      id: 'a1', user_id: 'u1', bot_id: 'b1',
      action: 'bot_created', detail_json: '{}', created_at: 1000,
    });
    expect(mockRun).toHaveBeenCalledOnce();
  });
});
