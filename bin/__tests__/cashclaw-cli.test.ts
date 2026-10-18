import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { parseArgs, main, VERSION } from '../cashclaw.js';
import { runQuickstartSimulation, runQuantitativeEval, generateSyncBundle } from '../lib/commands.js';

describe('CashClaw CLI Suite (Apache-2.0 Open-Core)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('parseArgs', () => {
    it('parses default arguments correctly', () => {
      const parsed = parseArgs(['node', 'cashclaw.js']);
      expect(parsed.command).toBeNull();
      expect(parsed.json).toBe(false);
      expect(parsed.symbol).toBe('BTC/USDT');
      expect(parsed.help).toBe(false);
    });

    it('parses flags and commands properly', () => {
      const parsed = parseArgs([
        'node',
        'cashclaw.js',
        'quickstart',
        '--json',
        '--symbol',
        'ETH/USDT',
        '--name',
        'CustomBot',
      ]);
      expect(parsed.command).toBe('quickstart');
      expect(parsed.json).toBe(true);
      expect(parsed.symbol).toBe('ETH/USDT');
      expect(parsed.name).toBe('CustomBot');
    });

    it('parses help and version short flags', () => {
      expect(parseArgs(['node', 'cashclaw.js', '-h']).help).toBe(true);
      expect(parseArgs(['node', 'cashclaw.js', '-v']).version).toBe(true);
    });
  });

  describe('Core Command Handlers', () => {
    it('generates deterministic paper simulation stats', () => {
      const sim = runQuickstartSimulation('SOL/USDT', 5000);
      expect(sim.symbol).toBe('SOL/USDT');
      expect(sim.safetyMode).toBe('PAPER_ONLY');
      expect(sim.initialCapital).toBe(5000);
      expect(sim.totalOrders).toBeGreaterThan(0);
      expect(sim.winRatePct).toBeGreaterThan(0);
    });

    it('calculates quantitative diagnostics', () => {
      const ev = runQuantitativeEval('BTC/USDT');
      expect(ev.symbol).toBe('BTC/USDT');
      expect(ev.garmanKlassVolAnnualized).toBeGreaterThan(0);
      expect(ev.corwinSchultzSpreadBps).toBeGreaterThan(0);
      expect(ev.hamiltonCrisisProb).toBeGreaterThan(0);
      expect(ev.hrpDiversificationRatio).toBeGreaterThan(1);
      expect(ev.dupireAtmLocalVol).toBeGreaterThan(0);
      expect(ev.motCorridorWidthBps).toBeGreaterThan(0);
      expect(typeof ev.roughPathLevyArea12).toBe('number');
      expect(ev.regime).toBeDefined();
    });

    it('generates valid cloud sync bundle with verified sha256 checksum', () => {
      const bundle = generateSyncBundle('GridBot', 'AVAX/USDT');
      expect(bundle.schemaVersion).toBe('1.0');
      expect(bundle.safetyMode).toBe('PAPER_ONLY');
      expect(bundle.payload.botName).toBe('GridBot');

      const expectedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(bundle.payload))
        .digest('hex');
      expect(bundle.sha256Checksum).toBe(expectedHash);
    });
  });

  describe('CLI main dispatch', () => {
    it('outputs version on -v', async () => {
      const code = await main(['node', 'cashclaw.js', '-v']);
      expect(code).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(`cashclaw v${VERSION}`);
    });

    it('outputs help on --help or missing command', async () => {
      const code = await main(['node', 'cashclaw.js', '--help']);
      expect(code).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('executes quickstart with JSON output', async () => {
      const code = await main(['node', 'cashclaw.js', 'quickstart', '--json']);
      expect(code).toBe(0);
      const output = JSON.parse(String(consoleLogSpy.mock.calls[0][0]));
      expect(output.safetyMode).toBe('PAPER_ONLY');
      expect(output.totalOrders).toBeGreaterThan(0);
    });

    it('executes eval with JSON output', async () => {
      const code = await main(['node', 'cashclaw.js', 'eval', '--symbol', 'DOGE/USDT', '--json']);
      expect(code).toBe(0);
      const output = JSON.parse(String(consoleLogSpy.mock.calls[0][0]));
      expect(output.symbol).toBe('DOGE/USDT');
      expect(output.garmanKlassVolAnnualized).toBeGreaterThan(0);
    });

    it('executes export-sync with formatted output and cta', async () => {
      const code = await main(['node', 'cashclaw.js', 'export-sync', '--name', 'MyGrid']);
      expect(code).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('executes steps audit command', async () => {
      const code = await main(['node', 'cashclaw.js', 'steps', '--json']);
      expect(code).toBe(0);
      const output = JSON.parse(String(consoleLogSpy.mock.calls[0][0]));
      expect(output.totalSteps).toBe(25);
      expect(output.apacheSteps).toBe(14);
      expect(output.commercialSteps).toBe(11);
      expect(output.apacheSteps + output.commercialSteps).toBe(25);
      expect(output.status).toBe('ALL_25_STEPS_VERIFIED');
    });

    it('returns error code 1 on unknown command', async () => {
      const code = await main(['node', 'cashclaw.js', 'unknown-cmd']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
    });
  });
});
