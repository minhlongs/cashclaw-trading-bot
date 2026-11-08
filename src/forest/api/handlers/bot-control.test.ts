import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBot = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  pause: vi.fn(),
  getConfig: vi.fn(() => ({ id: 'bot-1', exchange: 'binance' })),
  id: 'bot-1',
  exchange: 'binance',
};

const mockManager = {
  getBot: vi.fn((): typeof mockBot | undefined => mockBot),
  getOrCreateBot: vi.fn(async (): Promise<typeof mockBot | null> => mockBot),
  getBotOwnerId: vi.fn((): string | undefined => undefined),
  resumeBot: vi.fn(),
  getAllBots: vi.fn(async () => []),
  createBot: vi.fn(),
  removeBot: vi.fn(),
};

vi.mock('@/tree/bot', () => ({ getBotManager: () => mockManager }));
vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn(() => null) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockManager.getBot.mockReturnValue(mockBot);
  mockManager.getOrCreateBot.mockResolvedValue(mockBot);
  mockManager.getBotOwnerId.mockReturnValue(undefined);
});

async function control(id: string, action: string, userId?: string) {
  const { botControlHandler } = await import('./bot-control');
  return botControlHandler(id, action as 'start' | 'stop' | 'pause' | 'resume', userId);
}

describe('botControlHandler', () => {
  it('starts a bot', async () => {
    const result = await control('bot-1', 'start');
    expect(result).toEqual({ ok: true });
    expect(mockBot.start).toHaveBeenCalledOnce();
  });

  it('stops a bot', async () => {
    const result = await control('bot-1', 'stop');
    expect(result).toEqual({ ok: true });
    expect(mockBot.stop).toHaveBeenCalledOnce();
  });

  it('pauses a bot', async () => {
    const result = await control('bot-1', 'pause');
    expect(result).toEqual({ ok: true });
    expect(mockBot.pause).toHaveBeenCalledOnce();
  });

  it('resumes a bot', async () => {
    const result = await control('bot-1', 'resume');
    expect(result).toEqual({ ok: true });
    expect(mockManager.resumeBot).toHaveBeenCalledWith('bot-1');
  });

  it('returns error for unknown bot', async () => {
    mockManager.getBot.mockReturnValue(undefined);
    mockManager.getOrCreateBot.mockResolvedValue(null);
    const result = await control('nonexistent', 'start');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Bot not found');
  });

  it('returns error for unknown action', async () => {
    const result = await control('bot-1', 'explode');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('returns error when start throws', async () => {
    mockBot.start.mockRejectedValue(new Error('exchange down'));
    const result = await control('bot-1', 'start');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('exchange down');
  });

  it('scopes bot lookup and resume to userId and blocks cross-tenant control', async () => {
    // BotInstance carries no owner field; ownership comes from the bot's cache
    // entry via getBotOwnerId, so a foreign owner must block the action.
    mockManager.getBot.mockReturnValue(undefined);
    mockManager.getOrCreateBot.mockResolvedValue(null);
    mockManager.getBotOwnerId.mockReturnValue('usr_owner');

    const crossTenant = await control('bot-1', 'stop', 'usr_attacker');
    expect(crossTenant).toEqual({ ok: false, error: 'Bot not found: bot-1' });
    expect(mockBot.stop).not.toHaveBeenCalled();

    mockManager.getBot.mockReturnValue(mockBot);
    mockManager.getOrCreateBot.mockResolvedValue(mockBot);
    const ownerResume = await control('bot-1', 'resume', 'usr_owner');
    expect(ownerResume).toEqual({ ok: true });
    expect(mockManager.resumeBot).toHaveBeenCalledWith('bot-1', 'usr_owner');
  });

  it('reads the exchange from the resolved config so a preflight re-read cannot race the cache TTL', async () => {
    // The start preflight must use the already-resolved bot's config rather than
    // looking the bot up a second time, which could miss on cache expiry.
    mockBot.start.mockResolvedValue(undefined);
    mockManager.getBotOwnerId.mockReturnValue('usr_owner');

    const result = await control('bot-1', 'start', 'usr_owner');

    expect(result).toEqual({ ok: true });
    expect(mockBot.getConfig).toHaveBeenCalled();
    expect(mockManager.getBot).toHaveBeenCalledTimes(1);
    expect(mockBot.start).toHaveBeenCalledOnce();
  });

  it('refuses to start when the preflight bot belongs to another user', async () => {
    mockManager.getBot.mockReturnValue(mockBot);
    mockManager.getBotOwnerId.mockReturnValue('usr_victim');

    const result = await control('bot-1', 'start', 'usr_attacker');

    expect(result).toEqual({ ok: false, error: 'Bot not found: bot-1' });
    expect(mockBot.start).not.toHaveBeenCalled();
  });
});
