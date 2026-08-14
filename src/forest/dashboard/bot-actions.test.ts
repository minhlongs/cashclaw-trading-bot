import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBot = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
};

const mockManager = {
  getBot: vi.fn(),
  resumeBot: vi.fn(),
  manualHalt: vi.fn(),
  manualResume: vi.fn(),
};

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(() => mockManager),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockManager.getBot.mockReturnValue(mockBot);
  mockBot.start.mockResolvedValue(undefined);
  mockBot.stop.mockImplementation(() => {});
  mockBot.pause.mockImplementation(() => {});
  mockManager.resumeBot.mockImplementation(() => {});
});

describe('bot-actions', () => {
  describe('botActionStart', () => {
    it('returns ok when bot starts', async () => {
      const { botActionStart } = await import('./bot-actions');
      const result = await botActionStart('bot-1');
      expect(result.ok).toBe(true);
      expect(mockBot.start).toHaveBeenCalled();
    });

    it('returns error when bot not found', async () => {
      mockManager.getBot.mockReturnValue(undefined);
      const { botActionStart } = await import('./bot-actions');
      const result = await botActionStart('missing');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Bot not found in memory');
    });

    it('returns error on start failure', async () => {
      mockBot.start.mockImplementation(() => Promise.reject(new Error('Start failed')));
      const { botActionStart } = await import('./bot-actions');
      const result = await botActionStart('bot-1');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Start failed');
    });
  });

  describe('botActionStop', () => {
    it('returns ok when bot stops', async () => {
      const { botActionStop } = await import('./bot-actions');
      const result = await botActionStop('bot-1');
      expect(result.ok).toBe(true);
      expect(mockBot.stop).toHaveBeenCalled();
    });

    it('returns error when bot not found', async () => {
      mockManager.getBot.mockReturnValue(undefined);
      const { botActionStop } = await import('./bot-actions');
      const result = await botActionStop('missing');
      expect(result.ok).toBe(false);
    });
  });

  describe('botActionPause', () => {
    it('returns ok when bot pauses', async () => {
      const { botActionPause } = await import('./bot-actions');
      const result = await botActionPause('bot-1');
      expect(result.ok).toBe(true);
      expect(mockBot.pause).toHaveBeenCalled();
    });

    it('returns error when bot not found', async () => {
      mockManager.getBot.mockReturnValue(undefined);
      const { botActionPause } = await import('./bot-actions');
      const result = await botActionPause('missing');
      expect(result.ok).toBe(false);
    });
  });

  describe('botActionResume', () => {
    it('returns ok when bot resumes', async () => {
      const { botActionResume } = await import('./bot-actions');
      const result = await botActionResume('bot-1');
      expect(result.ok).toBe(true);
      expect(mockManager.resumeBot).toHaveBeenCalledWith('bot-1');
    });

    it('returns error when bot not found', async () => {
      mockManager.getBot.mockReturnValue(undefined);
      const { botActionResume } = await import('./bot-actions');
      const result = await botActionResume('missing');
      expect(result.ok).toBe(false);
    });

    it('returns error on resume failure', async () => {
      mockManager.resumeBot.mockImplementation(() => { throw new Error('Resume failed'); });
      const { botActionResume } = await import('./bot-actions');
      const result = await botActionResume('bot-1');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Resume failed');
    });
  });

  describe('killswitchActionHalt', () => {
    it('halts and returns ok', async () => {
      const { killswitchActionHalt } = await import('./bot-actions');
      const result = await killswitchActionHalt('emergency');
      expect(result.ok).toBe(true);
      expect(mockManager.manualHalt).toHaveBeenCalledWith('emergency');
    });
  });

  describe('killswitchActionResume', () => {
    it('resumes and returns ok', async () => {
      const { killswitchActionResume } = await import('./bot-actions');
      const result = await killswitchActionResume();
      expect(result.ok).toBe(true);
      expect(mockManager.manualResume).toHaveBeenCalled();
    });
  });
});
