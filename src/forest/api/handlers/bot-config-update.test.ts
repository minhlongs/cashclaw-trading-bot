import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotConfig } from '@/tree/bot';

const mockPatchBot = vi.fn();
vi.mock('@/forest/bot/d1-adapter', () => ({
  patchBot: (...args: unknown[]) => mockPatchBot(...args),
}));

const mockBot = {
  id: 'bot-1',
  userId: 'user-1',
  getConfig: vi.fn((): BotConfig => ({
    strategy: 'grid',
    symbol: 'BTC/USDT',
    exchange: 'binance',
    mode: 'paper',
    capital: 1000,
    maxDrawdownPct: 20,
    gridSpacingPct: 1,
    gridLevels: 10,
    capitalPerLevelPct: 10,
    takeProfitPct: 2,
    stopLossPct: 5,
    rebalanceOnFill: true,
  })),
  updateConfig: vi.fn(),
};

const mockManager = {
  getBot: vi.fn(),
  getOrCreateBot: vi.fn(),
};

vi.mock('@/tree/bot', () => ({
  getBotManager: () => mockManager,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPatchBot.mockResolvedValue(undefined);
  mockManager.getBot.mockReturnValue(mockBot);
  mockManager.getOrCreateBot.mockResolvedValue(mockBot);
});

describe('botUpdateConfigHandler', () => {
  it('updates valid config and persists to D1 and in-memory bot', async () => {
    const { botUpdateConfigHandler } = await import('./bot-config-update');
    const result = await botUpdateConfigHandler('bot-1', {
      gridSpacingPct: 2.5,
      gridLevels: 8,
    });

    expect(result.ok).toBe(true);
    expect(result.data?.id).toBe('bot-1');
    expect((result.data?.config as { gridSpacingPct?: number })?.gridSpacingPct).toBe(2.5);
    expect((result.data?.config as { gridLevels?: number })?.gridLevels).toBe(8);
    expect(mockPatchBot).toHaveBeenCalledWith('bot-1', {
      config_json: expect.stringContaining('"gridSpacingPct":2.5'),
    });
    expect(mockBot.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ gridSpacingPct: 2.5, gridLevels: 8, mode: 'paper' }),
    );
  });

  it('rejects non-object or array configPatch', async () => {
    const { botUpdateConfigHandler } = await import('./bot-config-update');
    const res1 = await botUpdateConfigHandler('bot-1', null as unknown as Record<string, number>);
    expect(res1.ok).toBe(false);
    expect(res1.error).toBe('Invalid configuration values');

    const res2 = await botUpdateConfigHandler('bot-1', [123] as unknown as Record<string, number>);
    expect(res2.ok).toBe(false);
  });

  it('rejects negative numbers and NaN / Infinity values', async () => {
    const { botUpdateConfigHandler } = await import('./bot-config-update');
    const res1 = await botUpdateConfigHandler('bot-1', { gridSpacingPct: -1 });
    expect(res1.ok).toBe(false);
    expect(res1.error).toBe('Invalid configuration values');

    const res2 = await botUpdateConfigHandler('bot-1', { gridSpacingPct: Number.NaN });
    expect(res2.ok).toBe(false);

    const res3 = await botUpdateConfigHandler('bot-1', { gridSpacingPct: Infinity });
    expect(res3.ok).toBe(false);
  });

  it('returns error when bot is not found in manager or D1', async () => {
    mockManager.getBot.mockReturnValue(undefined);
    mockManager.getOrCreateBot.mockResolvedValue(null);

    const { botUpdateConfigHandler } = await import('./bot-config-update');
    const result = await botUpdateConfigHandler('missing-bot', { gridLevels: 5 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Bot not found: missing-bot');
  });

  it('enforces anti-IDOR check on userId mismatch', async () => {
    const { botUpdateConfigHandler } = await import('./bot-config-update');
    const result = await botUpdateConfigHandler('bot-1', { gridLevels: 5 }, 'wrong-user');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Bot not found: bot-1');
  });

  it('clamps values within strategy bounds and coerces integers', async () => {
    const { botUpdateConfigHandler } = await import('./bot-config-update');
    const result = await botUpdateConfigHandler('bot-1', {
      gridSpacingPct: 999, // clamped to max 50
      gridLevels: 1.8, // clamped to min 2, rounded to 2
      capitalPerLevelPct: 0.1, // clamped to min 1
      bbPeriod: 150.2, // clamped to max 100, integer 100
    });

    expect(result.ok).toBe(true);
    const cfg = result.data?.config as unknown as Record<string, number>;
    expect(cfg.gridSpacingPct).toBe(50);
    expect(cfg.gridLevels).toBe(2);
    expect(cfg.capitalPerLevelPct).toBe(1);
    expect(cfg.bbPeriod).toBe(100);
  });

  it('preserves mode as paper (ADR-001 paper-only invariant)', async () => {
    const { botUpdateConfigHandler } = await import('./bot-config-update');
    const result = await botUpdateConfigHandler('bot-1', { gridSpacingPct: 2 });
    expect(result.ok).toBe(true);
    expect(result.data?.config.mode).toBe('paper');
  });

  it('catches and returns error when D1 patch fails', async () => {
    mockPatchBot.mockRejectedValue(new Error('D1 write timeout'));
    const { botUpdateConfigHandler } = await import('./bot-config-update');
    const result = await botUpdateConfigHandler('bot-1', { gridSpacingPct: 2 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('D1 write timeout');
  });
});
