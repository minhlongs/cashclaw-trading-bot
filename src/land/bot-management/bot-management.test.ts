import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotInstance } from '@/tree/bot/bot-instance';

const mockManager = {
  getAllBots: vi.fn(),
  getRunningBots: vi.fn(),
  getBot: vi.fn(),
  startBot: vi.fn(),
  stopBot: vi.fn(),
  pauseBot: vi.fn(),
  resumeBot: vi.fn(),
};

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(() => mockManager),
  resetBotManager: vi.fn(),
}));

function mockBot(id: string, status: string): BotInstance {
  return {
    getSnapshot: () => ({
      id,
      config: { symbol: 'BTCUSDT', exchange: 'paper', strategy: 'grid', capital: 1000 },
      status,
      createdAt: Date.now(),
      startedAt: status === 'running' ? Date.now() : null,
      stoppedAt: status === 'stopped' ? Date.now() : null,
      lastTickAt: null,
      lastOrderAt: null,
      totalPnl: 0,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      maxDrawdown: 0,
      error: null,
    }),
    getConfig: () => ({ symbol: 'BTCUSDT', exchange: 'paper', strategy: 'grid', capital: 1000 }),
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  } as unknown as BotInstance;
}

describe('bot-management orchestration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockManager.getAllBots.mockReturnValue([mockBot('b1', 'running'), mockBot('b2', 'stopped')]);
    mockManager.getRunningBots.mockReturnValue([mockBot('b1', 'running')]);
    mockManager.getBot.mockImplementation((id: string) => {
      if (id === 'b1') return mockBot('b1', 'running');
      return undefined;
    });
  });

  it('getAllBots returns list of BotInfo', async () => {
    const { getAllBots } = await import('./index');
    const bots = getAllBots();
    expect(bots).toHaveLength(2);
    expect(bots[0].id).toBe('b1');
    expect(bots[0].status).toBe('running');
  });

  it('getRunningBots filters to running only', async () => {
    const { getRunningBots } = await import('./index');
    const bots = getRunningBots();
    expect(bots).toHaveLength(1);
    expect(bots[0].id).toBe('b1');
  });

  it('getBot returns BotInfo when found', async () => {
    const { getBot } = await import('./index');
    const bot = getBot('b1');
    expect(bot).toBeDefined();
    expect(bot!.id).toBe('b1');
  });

  it('getBot returns undefined when not found', async () => {
    const { getBot } = await import('./index');
    const bot = getBot('nonexistent');
    expect(bot).toBeUndefined();
  });

  it('startBot delegates to manager', async () => {
    const { startBot } = await import('./index');
    mockManager.startBot.mockResolvedValue(undefined);
    const result = await startBot('b1');
    expect(result.ok).toBe(true);
    expect(mockManager.startBot).toHaveBeenCalledWith('b1');
  });

  it('startBot returns error on failure', async () => {
    const { startBot } = await import('./index');
    mockManager.startBot.mockRejectedValue(new Error('Start failed'));
    const result = await startBot('b1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Start failed');
  });

  it('stopBot returns ok', async () => {
    const { stopBot } = await import('./index');
    const result = stopBot('b1');
    expect(result.ok).toBe(true);
  });

  it('pauseBot returns ok', async () => {
    const { pauseBot } = await import('./index');
    const result = pauseBot('b1');
    expect(result.ok).toBe(true);
  });

  it('resumeBot returns error if killswitch halted', async () => {
    const { resumeBot } = await import('./index');
    mockManager.resumeBot.mockImplementation(() => { throw new Error('Cannot resume: killswitch is halted'); });
    const result = resumeBot('b1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Cannot resume: killswitch is halted');
  });
});
