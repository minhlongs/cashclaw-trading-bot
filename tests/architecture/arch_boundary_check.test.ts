import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ResearchAgent } from '@/forest/alpha/research-agent/agent';
import { LiveExchange } from '@/tree/exchange/live';
import {
  G13TrackingArtifactSchema,
  SignedStrategySpecSchema,
  StrategyLifecycleRegistrySchema,
  signLifecycleRegistryPayload,
  signStrategySpecPayload,
  validateSignedStrategySpec,
  validateStrategyLifecycleRegistry,
} from '@/tree/paper-forward';

const REPO_ROOT = path.resolve(__dirname, '../..');

function collectProdTsFiles(relDir: string): string[] {
  const absDir = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(absDir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectProdTsFiles(path.relative(REPO_ROOT, full)));
    } else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const EE_LEAK_PATTERNS: readonly RegExp[] = [
  /import\s+[\s\S]*?\s+from\s+['"](?:@\/ee(?:\/|$)|(?:\.\.?\/)+ee(?:\/|$))/,
  /export\s+[\s\S]*?\s+from\s+['"](?:@\/ee(?:\/|$)|(?:\.\.?\/)+ee(?:\/|$))/,
  /import\s*\(\s*['"](?:@\/ee(?:\/|$)|(?:\.\.?\/)+ee(?:\/|$))/,
  /require\s*\(\s*['"](?:@\/ee(?:\/|$)|(?:\.\.?\/)+ee(?:\/|$))/,
];

const LIVE_EXCHANGE_PATTERNS: readonly [RegExp, string][] = [
  [/\bLiveExchange\b/, 'LiveExchange symbol'],
  [/\bBinanceLiveAdapter\b/, 'BinanceLiveAdapter symbol'],
  [/from\s+['"][^'"]*exchange\/live['"]/, 'exchange/live import'],
  [/from\s+['"]ccxt['"]/, 'direct ccxt import'],
  [/\.createOrder\s*\(/, 'CCXT createOrder() call'],
  [/\.createMarketOrder\s*\(/, 'CCXT createMarketOrder() call'],
  [/\.createLimitOrder\s*\(/, 'CCXT createLimitOrder() call'],
  [/\bexecuteLiveOrder\s*\(/, 'executeLiveOrder() call'],
];

const PAPER_FORWARD_PURITY_PATTERNS: readonly [RegExp, string][] = [
  [/from\s+['"]@\/forest\//, '@/forest/* import'],
  [/from\s+['"]@\/land\//, '@/land/* import'],
  [/research-agent/, 'research-agent import'],
  [/from\s+['"]node:fs['"]/, 'node:fs import'],
  [/from\s+['"]fs['"]/, 'fs import'],
  [/\bfetch\s*\(/, 'fetch() call'],
  [/\bconsole\.(log|warn|error|info|debug)\s*\(/, 'console.* call'],
];

function makeDeterministicRegistryFixture() {
  return signLifecycleRegistryPayload({
    schema_version: '1.0.0',
    generated_at: '2026-11-14T12:00:00Z',
    commit: '3d56c1e',
    live_trading_locked: true,
    strategies: [
      { strategy_id: 'H1', status: 'ARCHIVED_FALSIFIED', archive_reason: 'Falsified in G5 DSR/PBO', g5_verdict: 'REJECT', dsr_at_n185: 0.01, pbo: 0.72, locked_oos_sharpe: -0.45, paper_forward_allowed: false },
      { strategy_id: 'H2', status: 'ARCHIVED_FALSIFIED', archive_reason: 'Falsified in G5 DSR/PBO', g5_verdict: 'REJECT', dsr_at_n185: 0.02, pbo: 0.68, locked_oos_sharpe: -0.21, paper_forward_allowed: false },
      { strategy_id: 'H3', status: 'ARCHIVED_FALSIFIED', archive_reason: 'Taker basis net-negative after fees', g5_verdict: 'REJECT', dsr_at_n185: 0.08, pbo: 0.55, locked_oos_sharpe: -0.12, paper_forward_allowed: false },
      { strategy_id: 'H1_G1', status: 'ARCHIVED_FALSIFIED', archive_reason: 'Defensive-overlay funding carry falsified', g5_verdict: 'REJECT', dsr_at_n185: 0.03, pbo: 0.64, locked_oos_sharpe: -0.18, paper_forward_allowed: false },
      { strategy_id: 'H2_G1', status: 'ARCHIVED_FALSIFIED', archive_reason: 'Defensive-overlay TSMOM falsified', g5_verdict: 'REJECT', dsr_at_n185: 0.04, pbo: 0.61, locked_oos_sharpe: -0.09, paper_forward_allowed: false },
      { strategy_id: 'H3_MAKER', status: 'PAPER_FORWARD_ELIGIBLE', archive_reason: null, g5_verdict: 'PASS', dsr_at_n185: 0.99, pbo: 0.08, locked_oos_sharpe: 3.12, paper_forward_allowed: true },
    ],
  });
}

function makeDeterministicSpecFixture() {
  return signStrategySpecPayload({
    specVersion: '1.0.0',
    strategyId: 'H3_MAKER',
    executionMode: 'PAPER_ONLY',
    liveOrderAuthority: false,
    aiOrderAuthority: false,
    universe: ['BNBUSDT', 'BTCUSDT', 'ETHUSDT'],
    parameters: {
      lookbackDays: 30,
      entryAnnualBps: 800,
      exitAnnualBps: 150,
      fifoFillProbability: 0.68,
      adverseSelectionBps: 1.4,
      singleLegMissProbability: 0.04,
      maxGrossLeverage: 1.0,
    },
    venueSchedule: {
      primaryVenue: 'hyperliquid',
      benchmarkVenue: 'binance',
      spotMakerBps: 1.5,
      perpMakerBps: 1.0,
      spotTakerBps: 10.0,
      perpTakerBps: 4.5,
    },
    riskGates: {
      maxDrawdownSoftPct: 8.0,
      maxDrawdownHardPct: 12.0,
      maxDailyLossPct: 2.5,
      staleDataCutoffMs: 15_000,
      maxTrackingErrorBpsPerMonth: 15.0,
    },
    observationWindow: { minRequiredDays: 60, targetDays: 90 },
  });
}

describe('Gate G1 / G13 / G15 Architecture & Authority Boundary Suite (Audit §20.2.5)', () => {
  const guardedDirs = [
    'src/tree/paper-forward',
    'src/tree/protection',
    'src/tree/execution/lifecycle',
    'src/tree/ledger',
    'src/tree/research/tradingagents',
  ] as const;

  it('proves zero LiveExchange, BinanceLiveAdapter, or CCXT createOrder imports across guarded tree modules', () => {
    const allFiles = guardedDirs.flatMap((dir) => collectProdTsFiles(dir));
    expect(allFiles.length).toBeGreaterThanOrEqual(45);

    const violations: string[] = [];
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(REPO_ROOT, file);
      for (const [pattern, label] of LIVE_EXCHANGE_PATTERNS) {
        if (pattern.test(content)) violations.push(`${rel}: ${label}`);
      }
      if (EE_LEAK_PATTERNS.some((re) => re.test(content))) {
        violations.push(`${rel}: @/ee commercial layer leak`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('enforces pure src/tree/paper-forward boundaries (zero @/forest, @/land, node:fs, fetch, console, and <= 200 LOC/file)', () => {
    const pfFiles = collectProdTsFiles('src/tree/paper-forward');
    expect(pfFiles.length).toBeGreaterThanOrEqual(6);

    const violations: string[] = [];
    for (const file of pfFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(REPO_ROOT, file);
      const newlineCount = content.endsWith('\n')
        ? content.split('\n').length - 1
        : content.split('\n').length;
      if (newlineCount > 200) violations.push(`${rel}: ${newlineCount} LOC exceeds 200 LOC ceiling`);
      for (const [pattern, label] of PAPER_FORWARD_PURITY_PATTERNS) {
        if (pattern.test(content)) violations.push(`${rel}: ${label}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('proves ResearchAgent and tradingagents expose zero order-writing methods (AI order authority = false)', () => {
    const methodNames = Object.getOwnPropertyNames(ResearchAgent.prototype).filter((m) => m !== 'constructor');
    expect(methodNames.sort()).toEqual([
      'clusterHypotheses',
      'explainFailure',
      'generateHypotheses',
      'proposeFeatureCombinations',
      'recommendNextExperiments',
    ]);
    const forbiddenOrderVerbs = ['placeOrder', 'submitOrder', 'createOrder', 'executeLiveOrder', 'cancelOrder'];
    for (const verb of forbiddenOrderVerbs) {
      expect(methodNames).not.toContain(verb);
    }
  });

  it('verifies LiveExchange remains fail-closed hard-locked in the codebase by default and without safety gates', async () => {
    const ks = {
      isTradingEnabled: () => true,
      onOrderPlaced: () => undefined,
      onOrderFilled: () => undefined,
      onError: () => undefined,
    };
    const cfg = {
      apiKey: 'paper-test-placeholder',
      apiSecret: 'paper-test-placeholder',
      testnet: true,
      sandbox: true,
      rateLimitMs: 100,
    };
    const sampleOrder = {
      symbol: 'BTC/USDT',
      side: 'buy' as const,
      type: 'limit' as const,
      quantity: 0.01,
      price: 50_000,
    };
    const defaultLocked = new LiveExchange('binance', cfg, ks);
    await expect(defaultLocked.placeOrder(sampleOrder)).rejects.toThrow(
      /Live trading is disabled \(fail-closed\)/,
    );

    const missingRiskGate = new LiveExchange('binance', cfg, ks, {
      liveExecutionEnabled: true,
    });
    await expect(missingRiskGate.placeOrder(sampleOrder)).rejects.toThrow(
      /Live trading blocked: explicit valid loss and order limits are required/,
    );

    const missingAuditGate = new LiveExchange('binance', cfg, ks, {
      liveExecutionEnabled: true,
      maxDailyLossPct: 2,
      maxOrdersPerMinute: 10,
    });
    await expect(missingAuditGate.placeOrder(sampleOrder)).rejects.toThrow(
      /Live trading blocked: pre-trade safety and durable audit gate is not configured/,
    );
  });

  it('validates deterministic SignedStrategySpec & StrategyLifecycleRegistry fixtures and on-disk artifacts when present', () => {
    const regFixture = makeDeterministicRegistryFixture();
    const specFixture = makeDeterministicSpecFixture();
    expect(StrategyLifecycleRegistrySchema.safeParse(regFixture).success).toBe(true);
    expect(SignedStrategySpecSchema.safeParse(specFixture).success).toBe(true);
    expect(validateSignedStrategySpec(specFixture, { registry: regFixture }).ok).toBe(true);

    const specArtifactPath = path.join(REPO_ROOT, 'artifacts/signed_strategy_spec_h3_maker.json');
    const regArtifactPath = path.join(REPO_ROOT, 'artifacts/strategy_lifecycle_registry.json');
    const g13ArtifactPath = path.join(REPO_ROOT, 'artifacts/g13_paper_tracking_error.json');

    if (fs.existsSync(regArtifactPath)) {
      const rawRegJson = fs.readFileSync(regArtifactPath, 'utf8').trim();
      if (rawRegJson.length > 0) {
        const parsedReg = JSON.parse(rawRegJson) as unknown;
        const regCheck = validateStrategyLifecycleRegistry(parsedReg, rawRegJson);
        expect(regCheck.ok).toBe(true);
      }
    }

    if (fs.existsSync(specArtifactPath)) {
      const rawSpecJson = fs.readFileSync(specArtifactPath, 'utf8').trim();
      if (rawSpecJson.length > 0) {
        const parsedSpec = JSON.parse(rawSpecJson) as unknown;
        const specCheck = validateSignedStrategySpec(parsedSpec, { rawSpecJson });
        expect(specCheck.ok).toBe(true);
      }
    }

    if (fs.existsSync(g13ArtifactPath)) {
      const rawG13Json = fs.readFileSync(g13ArtifactPath, 'utf8').trim();
      if (rawG13Json.length > 0) {
        const parsedG13 = JSON.parse(rawG13Json) as unknown;
        const g13Res = G13TrackingArtifactSchema.safeParse(parsedG13);
        expect(g13Res.success).toBe(true);
        if (g13Res.success) {
          expect(g13Res.data.live_trading_unlocked).toBe(false);
        }
      }
    }
  });
});
