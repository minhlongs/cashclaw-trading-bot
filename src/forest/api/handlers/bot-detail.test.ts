import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSnapshot = {
  id: 'bot-1', status: 'running', totalPnl: 150.5, totalTrades: 20,
  winCount: 12, lossCount: 8, maxDrawdown: 5.2, currentDrawdown: 1.1,
  startedAt: 1000, stoppedAt: null, lastTickAt: 2000, lastOrderAt: 1500, error: null,
};

const mockGridConfig = {
  strategy: 'grid', symbol: 'BTC/USDT', exchange: 'binance', capital: 1000,
  gridSpacingPct: 2, gridLevels: 10, capitalPerLevelPct: 10,
  takeProfitPct: 3, stopLossPct: 5, rebalanceOnFill: true,
};

const mockDcaConfig = {
  strategy: 'dca', symbol: 'ETH/USDT', exchange: 'binance', capital: 500,
  gridSpacingPct: 0, gridLevels: 0, capitalPerLevelPct: 0,
  takeProfitPct: 3, stopLossPct: 5, rebalanceOnFill: false,
};

const mockBot = {
  getSnapshot: vi.fn(() => mockSnapshot),
  getConfig: vi.fn(() => mockGridConfig),
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  pause: vi.fn(),
};

const mockManager = {
  getBot: vi.fn((): typeof mockBot | undefined => mockBot),
  getOrCreateBot: vi.fn(async (): Promise<typeof mockBot | null> => mockBot),
  getBotOwnerId: vi.fn((): string | undefined => undefined),
  resumeBot: vi.fn(),
};

vi.mock('@/tree/bot', () => ({
  getBotManager: () => mockManager,
}));

vi.mock('@/forest/dashboard/trade-events', () => ({
  getRecentEvents: vi.fn(async () => []),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => null),
}));

async function getDetail(id: string, userId?: string) {
  const { botDetailHandler } = await import('./bot-detail');
  return botDetailHandler(id, userId);
}

async function control(botId: string, action: string, userId?: string) {
  const { botControlHandler } = await import('./bot-detail');
  return botControlHandler(botId, action as 'start' | 'stop' | 'pause' | 'resume', userId);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockManager.getBot.mockReturnValue(mockBot);
  mockManager.getOrCreateBot.mockResolvedValue(mockBot);
  mockManager.getBotOwnerId.mockReturnValue(undefined);
  mockBot.getConfig.mockReturnValue(mockGridConfig);
  mockBot.getSnapshot.mockReturnValue(mockSnapshot);
});

describe('botDetailHandler', () => {
  it('returns bot detail on success', async () => {
    const result = await getDetail('bot-1');
    expect(result.ok).toBe(true);
    expect(result.data?.id).toBe('bot-1');
    expect(result.data?.strategy).toBe('grid');
    expect(result.data?.pair).toBe('BTC/USDT');
    expect(result.data?.exchange).toBe('binance');
    expect(result.data?.capital).toBe(1000);
    expect(result.data?.gridConfig).toBeDefined();
    expect(result.data?.gridConfig?.gridSpacingPct).toBe(2);
  });

  it('returns error when bot not found', async () => {
    mockManager.getBot.mockReturnValue(undefined);
    mockManager.getOrCreateBot.mockResolvedValue(null);
    const result = await getDetail('missing');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Bot not found');
  });

  it('omits gridConfig for non-grid strategy', async () => {
    mockBot.getConfig.mockReturnValue(mockDcaConfig);
    const result = await getDetail('bot-1');
    expect(result.ok).toBe(true);
    expect(result.data?.gridConfig).toBeUndefined();
  });

  it('returns error on exception', async () => {
    mockManager.getBot.mockImplementation(() => {
      throw new Error('d1 down');
    });
    const result = await getDetail('bot-1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('d1 down');
  });

  it('denies cross-user access when the bot is owned by another userId', async () => {
    // BotInstance carries no owner field; the manager returns the owner from the
    // bot's cache entry, and the handler must refuse on that identity alone.
    mockManager.getBot.mockReturnValue(undefined);
    mockManager.getOrCreateBot.mockResolvedValue(null);
    mockManager.getBotOwnerId.mockReturnValue('usr_owner');

    const denied = await getDetail('bot-1', 'usr_attacker');

    expect(denied.ok).toBe(false);
    expect(denied.error).toBe('Bot not found: bot-1');
    expect(mockManager.getBot).toHaveBeenCalledWith('bot-1', 'usr_attacker');
  });
});

describe('botControlHandler', () => {
  it('starts a bot', async () => {
    const result = await control('bot-1', 'start');
    expect(result.ok).toBe(true);
    expect(mockBot.start).toHaveBeenCalledOnce();
  });

  it('stops a bot', async () => {
    const result = await control('bot-1', 'stop');
    expect(result.ok).toBe(true);
    expect(mockBot.stop).toHaveBeenCalledOnce();
  });

  it('pauses a bot', async () => {
    const result = await control('bot-1', 'pause');
    expect(result.ok).toBe(true);
    expect(mockBot.pause).toHaveBeenCalledOnce();
  });

  it('resumes a bot', async () => {
    const result = await control('bot-1', 'resume');
    expect(result.ok).toBe(true);
    expect(mockManager.resumeBot).toHaveBeenCalledWith('bot-1');
  });

  it('returns error when bot not found', async () => {
    mockManager.getBot.mockReturnValue(undefined);
    mockManager.getOrCreateBot.mockResolvedValue(null);
    const result = await control('missing', 'start');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Bot not found');
  });

  it('returns error when action throws', async () => {
    mockBot.start.mockRejectedValue(new Error('exchange down'));
    const result = await control('bot-1', 'start');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('exchange down');
  });

  it('denies control action when the bot is owned by another userId and forwards userId on resume', async () => {
    mockManager.getBot.mockReturnValue(undefined);
    mockManager.getOrCreateBot.mockResolvedValue(null);
    mockManager.getBotOwnerId.mockReturnValue('usr_owner');

    const denied = await control('bot-1', 'stop', 'usr_attacker');

    expect(denied.ok).toBe(false);
    expect(denied.error).toBe('Bot not found: bot-1');
    expect(mockBot.stop).not.toHaveBeenCalled();

    mockManager.getBot.mockReturnValue(mockBot);
    mockManager.getOrCreateBot.mockResolvedValue(mockBot);
    mockManager.getBotOwnerId.mockReturnValue('usr_owner');
    const ownerResume = await control('bot-1', 'resume', 'usr_owner');
    expect(ownerResume.ok).toBe(true);
    expect(mockManager.resumeBot).toHaveBeenCalledWith('bot-1', 'usr_owner');
  });

  it('enforces credential preflight on start via unified botControlHandler', async () => {
    const { createServerClient } = await import('@/lib/db/client');
    const mockFirst = vi.fn().mockResolvedValue(null);
    const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    vi.mocked(createServerClient).mockReturnValueOnce({ prepare: mockPrepare } as unknown as ReturnType<typeof createServerClient>);

    const result = await control('bot-1', 'start', 'usr_owner');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Missing exchange credentials for binance');
    expect(mockBot.start).not.toHaveBeenCalled();
  });
});
