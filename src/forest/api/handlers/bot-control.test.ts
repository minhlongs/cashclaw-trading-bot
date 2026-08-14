import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBot = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  pause: vi.fn(),
  id: 'bot-1',
};

const mockManager = {
  getBot: vi.fn(() => mockBot),
  resumeBot: vi.fn(),
  getAllBots: vi.fn(() => []),
  createBot: vi.fn(),
  removeBot: vi.fn(),
};

vi.mock('@/tree/bot', () => ({ getBotManager: () => mockManager }));
vi.mock('@/forest/bot/d1-adapter', () => ({ loadAllBotsFromD1: vi.fn(async () => {}) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockManager.getBot.mockReturnValue(mockBot);
});

async function control(id: string, action: string) {
  const { botControlHandler } = await import('./bot-control');
  return botControlHandler(id, action as 'start' | 'stop' | 'pause' | 'resume');
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
    mockManager.getBot.mockReturnValue(undefined as any);
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
});
