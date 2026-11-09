import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockManager = {
  manualHalt: vi.fn(),
  manualResume: vi.fn(),
};

vi.mock('@/tree/bot', () => ({
  getBotManager: () => mockManager,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => null),
}));

vi.mock('./serialize-detail', () => ({
  serializeDetail: (v: unknown) => JSON.stringify(v),
}));

const mockEmergencyHalt = vi.fn().mockResolvedValue({ ok: true });
const mockResumeFromHalt = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@/forest/settings/actions', () => ({
  emergencyHalt: (...args: unknown[]) => mockEmergencyHalt(...args),
  resumeFromHalt: (...args: unknown[]) => mockResumeFromHalt(...args),
}));

import { killswitchHaltHandler, killswitchResumeHandler } from './killswitch';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('killswitchHaltHandler', () => {
  it('returns ok when given a valid reason and syncs D1 settings with userId', async () => {
    const result = await killswitchHaltHandler('Emergency stop', 'usr_owner');
    expect(result.ok).toBe(true);
    expect(mockManager.manualHalt).toHaveBeenCalledWith('Emergency stop');
    expect(mockEmergencyHalt).toHaveBeenCalledWith('Emergency stop', 'usr_owner');
  });

  it('returns error when reason is empty', async () => {
    const result = await killswitchHaltHandler('');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Reason is required');
    expect(mockManager.manualHalt).not.toHaveBeenCalled();
  });

  it('returns error when reason is whitespace only', async () => {
    const result = await killswitchHaltHandler('   ');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Reason is required');
  });

  it('returns error when manualHalt throws', async () => {
    mockManager.manualHalt.mockImplementation(() => {
      throw new Error('halt failed');
    });
    const result = await killswitchHaltHandler('test');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Killswitch halt failed');
  });
});

describe('killswitchResumeHandler', () => {
  it('returns ok on success and syncs D1 settings with userId', async () => {
    const result = await killswitchResumeHandler('usr_owner');
    expect(result.ok).toBe(true);
    expect(mockManager.manualResume).toHaveBeenCalled();
    expect(mockResumeFromHalt).toHaveBeenCalledWith('usr_owner');
  });

  it('returns error when manualResume throws', async () => {
    mockManager.manualResume.mockImplementation(() => {
      throw new Error('resume failed');
    });
    const result = await killswitchResumeHandler();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Killswitch resume failed');
  });

  it('handles non-Error throw from manualHalt', async () => {
    mockManager.manualHalt.mockImplementation(() => {
      throw 'string error';
    });
    const result = await killswitchHaltHandler('emergency');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Killswitch halt failed');
  });

  it('handles non-Error throw from manualResume', async () => {
    mockManager.manualResume.mockImplementation(() => {
      throw 42;
    });
    const result = await killswitchResumeHandler();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Killswitch resume failed');
  });
});
