import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockManager = {
  manualHalt: vi.fn(),
  manualResume: vi.fn(),
};

vi.mock('@/tree/bot', () => ({
  getBotManager: () => mockManager,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { killswitchHaltHandler, killswitchResumeHandler } from './killswitch';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('killswitchHaltHandler', () => {
  it('returns ok when given a valid reason', async () => {
    const result = await killswitchHaltHandler('Emergency stop');
    expect(result.ok).toBe(true);
    expect(mockManager.manualHalt).toHaveBeenCalledWith('Emergency stop');
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
    expect(result.error).toBe('halt failed');
  });
});

describe('killswitchResumeHandler', () => {
  it('returns ok on success', async () => {
    const result = await killswitchResumeHandler();
    expect(result.ok).toBe(true);
    expect(mockManager.manualResume).toHaveBeenCalled();
  });

  it('returns error when manualResume throws', async () => {
    mockManager.manualResume.mockImplementation(() => {
      throw new Error('resume failed');
    });
    const result = await killswitchResumeHandler();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Killswitch resume failed');
  });
});
