import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateBot = vi.fn().mockResolvedValue({});
const mockGetBotManager = vi.fn().mockReturnValue({ createBot: mockCreateBot });

vi.mock('@/tree/bot', () => ({
  getBotManager: (...args: unknown[]) => mockGetBotManager(...args),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { botCreateHandler, type CreateBotPayload } from './bot-create';
import { RETAIL_SANDBOX_WARNING } from './bot-strategy-guard';

function paperPayload(overrides: Partial<CreateBotPayload> = {}): CreateBotPayload {
  return {
    id: 'test-bot',
    name: 'Test Bot',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'paper',
    capital: 1000,
    config: { gridSpacing: 0.01, gridSize: 10 },
    ...overrides,
  };
}

describe('botCreateHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateBot.mockResolvedValue({});
  });

  describe('live mode rejection', () => {
    it('rejects live mode with error message', async () => {
      const result = await botCreateHandler(paperPayload({ mode: 'live' }));
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Live trading not available in v1 — paper mode only');
    });
  });

  describe('successful creation', () => {
    it('returns ok with bot id and UNVERIFIED_RETAIL_SANDBOX warning for retail strategies', async () => {
      const result = await botCreateHandler(paperPayload());
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({
        id: 'test-bot',
        verificationTier: 'UNVERIFIED_RETAIL_SANDBOX',
        warning: RETAIL_SANDBOX_WARNING,
      });
    });

    it('calls manager.createBot with correct config', async () => {
      await botCreateHandler(paperPayload());
      expect(mockCreateBot).toHaveBeenCalledTimes(1);
      const req = mockCreateBot.mock.calls[0][0];
      expect(req.id).toBe('test-bot');
      expect(req.mode).toBe('paper');
      // strategyConfig has strategy-specific fields, not id/name
      expect(req.config).toMatchObject({
        strategy: 'grid',
        symbol: 'BTC/USDT',
        exchange: 'paper',
        capital: 1000,
      });
      expect(req.exchangeConfig).toMatchObject({
        apiKey: '',
        apiSecret: '',
        testnet: true,
        sandbox: true,
      });
    });

    it('builds mean_reversion config for mean_reversion strategy', async () => {
      await botCreateHandler(paperPayload({ strategy: 'mean_reversion', config: { lookbackPeriod: 20, zScoreThreshold: 2 } }));
      const req = mockCreateBot.mock.calls[0][0];
      expect(req.config.strategy).toBe('mean_reversion');
    });

    it('builds volatility_dca config for volatility_dca strategy', async () => {
      await botCreateHandler(paperPayload({
        strategy: 'volatility_dca',
        config: {
          priceDropStep: 2.0,
          maxSteps: 4,
          baseOrderSizePct: 15,
          volatilityWindow: 30,
          volBaseline: 45,
          reboundTarget: 1.5,
        },
      }));
      const req = mockCreateBot.mock.calls[0][0];
      expect(req.config.strategy).toBe('volatility_dca');
      expect(req.config).toMatchObject({
        priceDropStep: 2.0,
        maxSteps: 4,
        baseOrderSizePct: 15,
        volatilityWindow: 30,
        volBaseline: 45,
        reboundTarget: 1.5,
      });
    });

    it('honors wizard config values instead of hardcoded defaults', async () => {
      await botCreateHandler(paperPayload({
        config: { spacingPct: 0.5, gridLevels: 5, maxDrawdownPct: 5 },
      }));
      const req = mockCreateBot.mock.calls[0][0];
      expect(req.config).toMatchObject({
        gridSpacingPct: 0.5,
        gridLevels: 5,
        maxDrawdownPct: 5,
      });
    });

    it('falls back to defaults when config keys are missing', async () => {
      await botCreateHandler(paperPayload({ config: {} }));
      const req = mockCreateBot.mock.calls[0][0];
      expect(req.config).toMatchObject({
        gridSpacingPct: 1,
        gridLevels: 10,
        capitalPerLevelPct: 10,
        takeProfitPct: 2,
        stopLossPct: 5,
        maxDrawdownPct: 10,
      });
    });
    it('forwards userId to manager.createBot when provided so the bot is bound to the session user', async () => {
      const result = await botCreateHandler(paperPayload({ id: 'owned-bot' }), 'usr_tenant_a');
      expect(result.ok).toBe(true);
      expect(mockCreateBot).toHaveBeenCalledTimes(1);
      expect(mockCreateBot.mock.calls[0][1]).toBe('usr_tenant_a');
    });

    it('verifies signed spec and creates h3_maker bot with PAPER_FORWARD_ELIGIBLE tier', async () => {
      const result = await botCreateHandler(
        paperPayload({ id: 'h3-bot-1', strategy: 'h3_maker', config: {} }),
      );
      expect(result.ok).toBe(true);
      expect(result.data).toMatchObject({
        id: 'h3-bot-1',
        verificationTier: 'PAPER_FORWARD_ELIGIBLE',
        specSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(result.data?.warning).toBeUndefined();
      const req = mockCreateBot.mock.calls[0][0];
      expect(req.config).toMatchObject({
        strategy: 'h3_maker',
        lookbackDays: 30,
        entryAnnualBps: 800,
        exitAnnualBps: 150,
        maxGrossLeverage: 1.0,
        maxDrawdownPct: 12,
      });

      const customDd = await botCreateHandler(
        paperPayload({ id: 'h3-custom-dd', strategy: 'h3_maker', config: { maxDrawdownPct: 6 } }),
      );
      expect(customDd.ok).toBe(true);
      expect(customDd.data?.verificationTier).toBe('UNVERIFIED_RETAIL_SANDBOX');
      expect(customDd.data?.specSha256).toBeUndefined();
      expect(customDd.data?.warning).toBe(RETAIL_SANDBOX_WARNING);

      const outsideUniverse = await botCreateHandler(
        paperPayload({ id: 'h3-shib', strategy: 'h3_maker', pair: 'SHIB/USDT', config: {} }),
      );
      expect(outsideUniverse.ok).toBe(true);
      expect(outsideUniverse.data?.verificationTier).toBe('UNVERIFIED_RETAIL_SANDBOX');
      expect(outsideUniverse.data?.specSha256).toBeUndefined();
    });
  });

  describe('archived strategy & signed spec guards', () => {
    it.each(['H1', 'h2', 'H3', 'h1_g1', 'H2_G1'])('rejects archived falsified family %s with 403', async (family) => {
      const result = await botCreateHandler(
        paperPayload({ strategy: family as CreateBotPayload['strategy'] }),
      );
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
      expect(result.code).toBe('STRATEGY_ARCHIVED_FALSIFIED');
      expect(mockCreateBot).not.toHaveBeenCalled();
    });

    it('fails closed with 403 SPEC_VERIFICATION_FAILED when h3_maker spec is tampered or missing', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-spec-guard-'));
      try {
        const badSpecPath = path.join(tmpDir, 'tampered_spec.json');
        fs.writeFileSync(badSpecPath, JSON.stringify({ strategyId: 'H3_MAKER', payloadSha256: '0'.repeat(64) }), 'utf8');
        const tampered = await botCreateHandler(
          paperPayload({ strategy: 'h3_maker' }),
          undefined,
          { specPath: badSpecPath },
        );
        expect(tampered.ok).toBe(false);
        expect(tampered.status).toBe(403);
        expect(tampered.code).toBe('SPEC_VERIFICATION_FAILED');

        const missing = await botCreateHandler(
          paperPayload({ strategy: 'h3_maker' }),
          undefined,
          { specPath: path.join(tmpDir, 'nonexistent.json') },
        );
        expect(missing.ok).toBe(false);
        expect(missing.status).toBe(403);
        expect(missing.code).toBe('SPEC_VERIFICATION_FAILED');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('error handling', () => {
    it('returns error when createBot throws', async () => {
      mockCreateBot.mockRejectedValue(new Error('Bot already exists: dup'));
      const result = await botCreateHandler(paperPayload({ id: 'dup' }));
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Bot already exists: dup');
    });

    it('returns generic error for non-Error exceptions', async () => {
      mockCreateBot.mockRejectedValue('unexpected');
      const result = await botCreateHandler(paperPayload());
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to create bot');
    });
  });
});
