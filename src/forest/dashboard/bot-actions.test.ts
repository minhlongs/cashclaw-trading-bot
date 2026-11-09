import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBot = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
};

const mockManager = {
  getBot: vi.fn(),
  getBotOwnerId: vi.fn((): string | undefined => undefined),
  resumeBot: vi.fn(),
  manualHalt: vi.fn(),
  manualResume: vi.fn(),
};

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(() => mockManager),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => null),
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
      expect(result.error).toBe('Bot not found');
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
    it('halts and returns ok while syncing D1 settings', async () => {
      const settingsActions = await import('@/forest/settings/actions');
      const spyHalt = vi.spyOn(settingsActions, 'emergencyHalt');
      const { killswitchActionHalt } = await import('./bot-actions');
      const result = await killswitchActionHalt('emergency', 'usr_owner');
      expect(result.ok).toBe(true);
      expect(mockManager.manualHalt).toHaveBeenCalledWith('emergency');
      expect(spyHalt).toHaveBeenCalledWith('emergency', 'usr_owner');
    });
  });

  describe('killswitchActionResume', () => {
    it('resumes and returns ok while syncing D1 settings', async () => {
      const settingsActions = await import('@/forest/settings/actions');
      const spyResume = vi.spyOn(settingsActions, 'resumeFromHalt');
      const { killswitchActionResume } = await import('./bot-actions');
      const result = await killswitchActionResume('usr_owner');
      expect(result.ok).toBe(true);
      expect(mockManager.manualResume).toHaveBeenCalled();
      expect(spyResume).toHaveBeenCalledWith('usr_owner');
    });
  });

  describe('multi-tenant userId scoping', () => {
    it('blocks cross-tenant start/stop/pause/resume and forwards userId on resume', async () => {
      mockManager.getBotOwnerId.mockReturnValue('usr_owner');
      const { botActionStart, botActionStop, botActionPause, botActionResume } = await import('./bot-actions');

      expect(await botActionStart('bot-1', 'usr_attacker')).toEqual({ ok: false, error: 'Bot not found' });
      expect(await botActionStop('bot-1', 'usr_attacker')).toEqual({ ok: false, error: 'Bot not found' });
      expect(await botActionPause('bot-1', 'usr_attacker')).toEqual({ ok: false, error: 'Bot not found' });
      expect(await botActionResume('bot-1', 'usr_attacker')).toEqual({ ok: false, error: 'Bot not found' });
      expect(mockBot.start).not.toHaveBeenCalled();
      expect(mockBot.stop).not.toHaveBeenCalled();
      expect(mockBot.pause).not.toHaveBeenCalled();
      expect(mockManager.resumeBot).not.toHaveBeenCalled();

      expect(await botActionResume('bot-1', 'usr_owner')).toEqual({ ok: true });
      expect(mockManager.resumeBot).toHaveBeenCalledWith('bot-1', 'usr_owner');
    });

    it('enforces D1 api_credentials preflight when starting a bot via botActionStart', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      const mockFirst = vi.fn().mockResolvedValue(null);
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      vi.mocked(createServerClient).mockReturnValueOnce({ prepare: mockPrepare } as unknown as ReturnType<typeof createServerClient>);

      const { botActionStart } = await import('./bot-actions');
      const result = await botActionStart('bot-1', 'usr_owner');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Missing exchange credentials');
      expect(mockBot.start).not.toHaveBeenCalled();
    });
  });
});
