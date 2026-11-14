import { describe, expect, it } from 'vitest';
import { sha256HexSync } from '@/tree/protection';
import {
  ARCHIVED_FALSIFIED_FAMILIES,
  PaperForwardGuardError,
  PaperForwardRunner,
  StrategyLifecycleRegistrySchema,
  TrackingErrorReconciler,
  assertValidSignedStrategySpec,
  canonicalizeRawJsonPayload,
  computeFeeMicroUsd,
  evaluateG13Gate,
  executeSingleLegLifecycle,
  isArchivedFalsifiedFamily,
  serializeCanonicalWithFloatSet,
  signLifecycleRegistryPayload,
  signStrategySpecPayload,
  stripHashKey,
  toBaseUnits,
  validateSignedStrategySpec,
  validateStrategyLifecycleRegistry,
  verifyCanonicalPayloadSha256,
  type OracleReplayCheckpoint,
  type PaperForwardDayInput,
  type SignedStrategySpec,
  type UnsignedStrategySpec,
} from '@/tree/paper-forward';

const GENESIS_MS = 1_794_614_400_000;
const DAY_MS = 86_400_000;

function makeBaseUnsignedSpec(overrides: Partial<UnsignedStrategySpec> = {}): UnsignedStrategySpec {
  return {
    specVersion: '1.0.0',
    strategyId: 'H3_MAKER',
    executionMode: 'PAPER_ONLY',
    liveOrderAuthority: false,
    aiOrderAuthority: false,
    universe: ['BNBUSDT', 'BTCUSDT'],
    parameters: {
      lookbackDays: 30,
      entryAnnualBps: 800,
      exitAnnualBps: 150,
      fifoFillProbability: 0.75,
      adverseSelectionBps: 1.2,
      singleLegMissProbability: 0.05,
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
    observationWindow: {
      minRequiredDays: 60,
      targetDays: 90,
    },
    ...overrides,
  };
}

function makeSignedSpec(overrides: Partial<UnsignedStrategySpec> = {}): SignedStrategySpec {
  return signStrategySpecPayload(makeBaseUnsignedSpec(overrides));
}

function makeLifecycleRegistry() {
  return signLifecycleRegistryPayload({
    schema_version: '1.0.0',
    generated_at: '2026-11-14T12:00:00Z',
    commit: '3d56c1e',
    live_trading_locked: true,
    strategies: [
      { strategy_id: 'H1', status: 'ARCHIVED_FALSIFIED', archive_reason: 'DSR=0.01 < 0.95', g5_verdict: 'REJECT', dsr_at_n185: 0.01, pbo: 0.72, locked_oos_sharpe: -0.45, paper_forward_allowed: false },
      { strategy_id: 'H2', status: 'ARCHIVED_FALSIFIED', archive_reason: 'DSR=0.02 < 0.95', g5_verdict: 'REJECT', dsr_at_n185: 0.02, pbo: 0.68, locked_oos_sharpe: -0.21, paper_forward_allowed: false },
      { strategy_id: 'H3', status: 'ARCHIVED_FALSIFIED', archive_reason: 'Taker fees destroy carry', g5_verdict: 'REJECT', dsr_at_n185: 0.08, pbo: 0.55, locked_oos_sharpe: -0.12, paper_forward_allowed: false },
      { strategy_id: 'H1_G1', status: 'ARCHIVED_FALSIFIED', archive_reason: 'Regime gate falsified', g5_verdict: 'REJECT', dsr_at_n185: 0.03, pbo: 0.64, locked_oos_sharpe: -0.18, paper_forward_allowed: false },
      { strategy_id: 'H2_G1', status: 'ARCHIVED_FALSIFIED', archive_reason: 'Regime gate falsified', g5_verdict: 'REJECT', dsr_at_n185: 0.04, pbo: 0.61, locked_oos_sharpe: -0.09, paper_forward_allowed: false },
      { strategy_id: 'H3_MAKER', status: 'PAPER_FORWARD_ELIGIBLE', archive_reason: null, g5_verdict: 'PASS', dsr_at_n185: 0.99, pbo: 0.08, locked_oos_sharpe: 3.12, paper_forward_allowed: true },
    ],
  });
}

function buildMultiDayInputs(totalDays: number): PaperForwardDayInput[] {
  const days: PaperForwardDayInput[] = [];
  for (let d = 1; d <= totalDays; d += 1) {
    const highCarryCycle = d % 14 <= 9;
    const carryBps = highCarryCycle ? 940 : 90;
    const spotBnb = 610 + Math.sin(d * 0.2) * 8;
    const perpBnb = spotBnb * (1 + carryBps / (365 * 10_000));
    const spotBtc = 88_000 + Math.cos(d * 0.15) * 900;
    const perpBtc = spotBtc * (1 + (carryBps - 120) / (365 * 10_000));
    const fundingTriad = d % 9 === 0 ? [-0.4, 0.8, 0.9] : [1.1, 1.2, 1.0];
    days.push({
      dayIndex: d,
      timestampMs: GENESIS_MS + d * DAY_MS,
      observations: [
        {
          symbol: 'BNBUSDT',
          spotMidUsd: Number(spotBnb.toFixed(4)),
          perpMidUsd: Number(perpBnb.toFixed(4)),
          impliedCarryAnnualBps: carryBps,
          fundingIntervalsBps: fundingTriad,
          spreadBps: 3.2,
          bookDepthUsd: 800_000,
          fifoUniformDraw: d === 1 ? 0.95 : 0.25,
          fifoFillFraction: d === 2 ? 0.5 : 1.0,
          legMissUniformDraw: d === 2 ? 0.01 : 0.5,
        },
        {
          symbol: 'BTCUSDT',
          spotMidUsd: Number(spotBtc.toFixed(2)),
          perpMidUsd: Number(perpBtc.toFixed(2)),
          impliedCarryAnnualBps: carryBps - 120,
          fundingIntervalsBps: [0.9, 1.0, 0.95],
          spreadBps: 2.0,
          bookDepthUsd: 2_500_000,
          fifoUniformDraw: 0.2,
          legMissUniformDraw: 0.5,
        },
      ],
    });
  }
  return days;
}

describe('Gate G13 Archived-Strategy Kill Fence & SignedStrategySpec Verifier', () => {
  it('blocks H1, H2, H3, H1_G1, and H2_G1 with STRATEGY_ARCHIVED_FALSIFIED unconditionally', () => {
    const base = makeSignedSpec();
    const registry = makeLifecycleRegistry();

    for (const family of ARCHIVED_FALSIFIED_FAMILIES) {
      expect(isArchivedFalsifiedFamily(family)).toBe(true);
      const candidate = { ...base, strategyId: family };
      const res = validateSignedStrategySpec(candidate, { registry });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('STRATEGY_ARCHIVED_FALSIFIED');

      expect(() => new PaperForwardRunner({ spec: candidate, registry })).toThrowError(
        PaperForwardGuardError,
      );
      try {
        assertValidSignedStrategySpec(candidate, { registry });
      } catch (err) {
        expect(err).toBeInstanceOf(PaperForwardGuardError);
        expect((err as PaperForwardGuardError).code).toBe('STRATEGY_ARCHIVED_FALSIFIED');
      }
    }
  });

  it('blocks dynamically archived or unregistered strategies via StrategyLifecycleRegistry', () => {
    const registry = makeLifecycleRegistry();
    const unknownSigned = makeSignedSpec({ strategyId: 'H4_EXPERIMENTAL' });
    const res = validateSignedStrategySpec(unknownSigned, { registry });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('STRATEGY_ARCHIVED_FALSIFIED');

    const badRegUnlocked = { ...registry, live_trading_locked: false };
    const regCheck = validateStrategyLifecycleRegistry(badRegUnlocked);
    expect(regCheck.ok).toBe(false);
    if (!regCheck.ok) expect(regCheck.code).toBe('LIVE_AUTHORITY_FORBIDDEN');

    const badRegSig = { ...registry, registry_sha256: 'a'.repeat(64) };
    const sigCheck = validateStrategyLifecycleRegistry(badRegSig);
    expect(sigCheck.ok).toBe(false);
    if (!sigCheck.ok) expect(sigCheck.code).toBe('SPEC_SIGNATURE_MISMATCH');

    expect(validateStrategyLifecycleRegistry(null).ok).toBe(false);
    const badSchemaReg = validateStrategyLifecycleRegistry({ live_trading_locked: true, schema_version: '9.9.9' });
    expect(badSchemaReg.ok).toBe(false);
    if (!badSchemaReg.ok) expect(badSchemaReg.code).toBe('INVALID_SPEC_SCHEMA');

    const badRegProp = validateSignedStrategySpec(makeSignedSpec(), { registry: badRegUnlocked });
    expect(badRegProp.ok).toBe(false);
    if (!badRegProp.ok) expect(badRegProp.code).toBe('LIVE_AUTHORITY_FORBIDDEN');
    expect(
      StrategyLifecycleRegistrySchema.safeParse({
        ...registry,
        strategies: registry.strategies.filter((s) => s.strategy_id !== 'H3'),
      }).success,
    ).toBe(false);
    expect(
      StrategyLifecycleRegistrySchema.safeParse({
        ...registry,
        strategies: [
          ...registry.strategies,
          { strategy_id: 'H9_ROGUE', status: 'PAPER_FORWARD_ELIGIBLE', archive_reason: null, g5_verdict: 'PASS', dsr_at_n185: 0.99, pbo: 0.05, locked_oos_sharpe: 2.1, paper_forward_allowed: true },
        ],
      }).success,
    ).toBe(false);
    expect(
      StrategyLifecycleRegistrySchema.safeParse({
        ...registry,
        strategies: [
          ...registry.strategies,
          { strategy_id: 'H3_MAKER', status: 'ARCHIVED_FALSIFIED', archive_reason: 'revoked', g5_verdict: 'REJECT', dsr_at_n185: 0.1, pbo: 0.5, locked_oos_sharpe: 0, paper_forward_allowed: true },
        ],
      }).success,
    ).toBe(false);
  });

  it('blocks liveOrderAuthority=true, executionMode!=PAPER_ONLY, aiOrderAuthority=true, and tampered payloadSha256', () => {
    const valid = makeSignedSpec();

    const liveTrue = validateSignedStrategySpec({ ...valid, liveOrderAuthority: true });
    expect(liveTrue.ok).toBe(false);
    if (!liveTrue.ok) expect(liveTrue.code).toBe('LIVE_AUTHORITY_FORBIDDEN');

    const modeLive = validateSignedStrategySpec({ ...valid, executionMode: 'LIVE_TRADING' });
    expect(modeLive.ok).toBe(false);
    if (!modeLive.ok) expect(modeLive.code).toBe('LIVE_AUTHORITY_FORBIDDEN');

    const aiTrue = validateSignedStrategySpec({ ...valid, aiOrderAuthority: true });
    expect(aiTrue.ok).toBe(false);
    if (!aiTrue.ok) expect(aiTrue.code).toBe('AI_AUTHORITY_FORBIDDEN');

    const tamperedSha = validateSignedStrategySpec({ ...valid, payloadSha256: 'f'.repeat(64) });
    expect(tamperedSha.ok).toBe(false);
    if (!tamperedSha.ok) expect(tamperedSha.code).toBe('SPEC_SIGNATURE_MISMATCH');

    const tamperedParam = validateSignedStrategySpec({
      ...valid,
      parameters: { ...valid.parameters, entryAnnualBps: 650 },
    });
    expect(tamperedParam.ok).toBe(false);
    if (!tamperedParam.ok) expect(tamperedParam.code).toBe('SPEC_SIGNATURE_MISMATCH');

    expect(validateSignedStrategySpec('not-an-object').ok).toBe(false);
    expect(validateSignedStrategySpec({ ...valid, strategyId: '   ' }).ok).toBe(false);
    expect(validateSignedStrategySpec({ ...valid, universe: [] }).ok).toBe(false);
  });

  it('maintains 100% SHA-256 parity with Python json.dumps integer-valued floats (.0) across raw & parsed specs', () => {
    const unsigned = makeBaseUnsignedSpec({
      venueSchedule: {
        primaryVenue: 'hyperliquid',
        benchmarkVenue: 'binance',
        spotMakerBps: 2,
        perpMakerBps: 1,
        spotTakerBps: 10,
        perpTakerBps: 5,
      },
    });
    const stripped = stripHashKey(unsigned as unknown as Record<string, unknown>, 'payloadSha256');
    const pythonStyleFloatSet = new Set([
      'parameters.maxGrossLeverage',
      'riskGates.maxDrawdownSoftPct',
      'riskGates.maxDrawdownHardPct',
      'riskGates.maxTrackingErrorBpsPerMonth',
      'venueSchedule.spotTakerBps',
    ]);
    const pythonCanonical = serializeCanonicalWithFloatSet(stripped, pythonStyleFloatSet);
    expect(pythonCanonical).toContain('"maxGrossLeverage":1.0');
    expect(pythonCanonical).toContain('"maxTrackingErrorBpsPerMonth":15.0');
    expect(pythonCanonical).toContain('"entryAnnualBps":800');
    const pythonDigest = sha256HexSync(pythonCanonical);

    const rawPythonFormattedJson = `{\n  "payloadSha256": "${pythonDigest}",\n  ${pythonCanonical.slice(1)}`;
    const parsedByJs = JSON.parse(rawPythonFormattedJson) as Record<string, unknown>;

    const checkWithRaw = validateSignedStrategySpec(parsedByJs, { rawSpecJson: rawPythonFormattedJson });
    expect(checkWithRaw.ok).toBe(true);

    const checkParsedOnly = validateSignedStrategySpec(parsedByJs);
    expect(checkParsedOnly.ok).toBe(true);

    expect(verifyCanonicalPayloadSha256(parsedByJs, 'payloadSha256', 'bad-hex')).toBe(false);
    expect(verifyCanonicalPayloadSha256(parsedByJs, 'payloadSha256', 'a'.repeat(64))).toBe(false);
    expect(verifyCanonicalPayloadSha256({ plain: 'string' }, 'payloadSha256', 'a'.repeat(64))).toBe(false);

    const allFloatPaths = new Set([
      'parameters.maxGrossLeverage',
      'riskGates.maxDrawdownSoftPct',
      'riskGates.maxDrawdownHardPct',
      'riskGates.maxTrackingErrorBpsPerMonth',
      'venueSchedule.spotMakerBps',
      'venueSchedule.perpMakerBps',
      'venueSchedule.spotTakerBps',
      'venueSchedule.perpTakerBps',
    ]);
    const allFloatDigest = sha256HexSync(serializeCanonicalWithFloatSet(stripped, allFloatPaths));
    expect(verifyCanonicalPayloadSha256(parsedByJs, 'payloadSha256', allFloatDigest)).toBe(true);

    expect(verifyCanonicalPayloadSha256(parsedByJs, 'payloadSha256', pythonDigest, '{broken json')).toBe(false);
    expect(verifyCanonicalPayloadSha256(parsedByJs, 'payloadSha256', pythonDigest, '["array-root"]')).toBe(false);
    const divergedRecord = { ...parsedByJs, strategyId: 'H1' };
    expect(verifyCanonicalPayloadSha256(divergedRecord, 'payloadSha256', pythonDigest, rawPythonFormattedJson)).toBe(false);
    expect(() => canonicalizeRawJsonPayload('{"a":"unterminated}', 'x')).toThrow();
    expect(() => canonicalizeRawJsonPayload('["unterminated', 'x')).toThrow();
    expect(() => canonicalizeRawJsonPayload('[1 2]', 'x')).toThrow();
    expect(() => canonicalizeRawJsonPayload('{"a":1 "b":2}', 'x')).toThrow();
    expect(() => canonicalizeRawJsonPayload('{"a" 1}', 'x')).toThrow();
    expect(() => canonicalizeRawJsonPayload('{"a":1', 'x')).toThrow();
    expect(() => canonicalizeRawJsonPayload('{"a":1} extra', 'x')).toThrow();
    expect(() => canonicalizeRawJsonPayload('{"dup":1,"dup":2}', 'none')).toThrow(/Duplicate JSON key/);
    expect(() => canonicalizeRawJsonPayload('{"nested":{"k":1,"k":2}}', 'none')).toThrow(/Duplicate JSON key/);
    expect(() => canonicalizeRawJsonPayload('{"__proto__":1}', 'none')).toThrow(/__proto__/);
    const protoInjected = Object.create(null) as Record<string, unknown>;
    Object.assign(protoInjected, parsedByJs);
    Object.defineProperty(protoInjected, '__proto__', { value: { evil: 1 }, enumerable: true, configurable: true, writable: true });
    expect(verifyCanonicalPayloadSha256(protoInjected, 'payloadSha256', pythonDigest, rawPythonFormattedJson)).toBe(false);
    expect(canonicalizeRawJsonPayload('{"b":[1, 2],"a":"x\\"y","drop":9}', 'drop')).toBe('{"a":"x\\"y","b":[1,2]}');
    expect(canonicalizeRawJsonPayload('{"emptyArr":[],"emptyObj":{}}', 'none')).toBe('{"emptyArr":[],"emptyObj":{}}');
  });
});

describe('Gate G13 PaperForwardRunner, TrackingErrorReconciler & Gate G15 Hard-Lock', () => {
  it('returns INCONCLUSIVE (g13Pass=false, liveTradingUnlocked=false) on Day-0 and 30-day (< 60d) runs', () => {
    const spec = makeSignedSpec();
    const registry = makeLifecycleRegistry();
    const runner = new PaperForwardRunner({ spec, registry, initialCapitalUsd: 100_000, genesisTimestampMs: GENESIS_MS });
    const day0 = runner.recordGenesisCheckpoint(GENESIS_MS);
    expect(day0.dayIndex).toBe(0);
    expect(day0.paperNav).toBe(100_000);
    expect(day0.ledgerBalanced).toBe(true);

    const reconciler = new TrackingErrorReconciler({ minRequiredDays: 10 });
    const day0Verdict = reconciler.reconcile([day0], [{ dayIndex: 0, oracleNav: 100_000 }]);
    expect(day0Verdict.verdict).toBe('INCONCLUSIVE');
    expect(day0Verdict.minRequiredDays).toBe(60);
    expect(day0Verdict.g13Pass).toBe(false);
    expect(day0Verdict.liveTradingUnlocked).toBe(false);

    const days30 = buildMultiDayInputs(30);
    const checkpoints30 = runner.runDays(days30);
    expect(checkpoints30).toHaveLength(31);
    expect(checkpoints30.every((cp) => cp.ledgerBalanced)).toBe(true);
    expect(runner.getWeeklyCheckpoints().length).toBeGreaterThanOrEqual(5);

    const oracle30: OracleReplayCheckpoint[] = checkpoints30.map((cp) => ({
      dayIndex: cp.dayIndex,
      oracleNav: Number((cp.paperNav * (1 + 0.00001 * Math.sin(cp.dayIndex))).toFixed(6)),
    }));
    const verdict30 = reconciler.reconcile(checkpoints30, oracle30, runner.getViolationSummary());
    expect(verdict30.verdict).toBe('INCONCLUSIVE');
    expect(verdict30.elapsedDays).toBe(30);
    expect(verdict30.g13Pass).toBe(false);
    expect(verdict30.liveTradingUnlocked).toBe(false);
    expect(verdict30.trackingErrorBpsPerMonth).toBeLessThan(15.0);
  });

  it('returns PASS (g13Pass=true) on a 65-day clean shadow run with < 15 bps/mo tracking error while keeping liveTradingUnlocked=false', () => {
    const spec = makeSignedSpec();
    const registry = makeLifecycleRegistry();
    const runner = new PaperForwardRunner({ spec, registry, initialCapitalUsd: 100_000, genesisTimestampMs: GENESIS_MS });
    runner.recordGenesisCheckpoint(GENESIS_MS);
    const checkpoints65 = runner.runDays(buildMultiDayInputs(65));

    expect(checkpoints65).toHaveLength(66);
    const lastCp = checkpoints65[checkpoints65.length - 1]!;
    expect(lastCp.executedOrderCount).toBeGreaterThan(8);
    expect(lastCp.ledgerBalanced).toBe(true);
    expect(runner.getLedger().getBalanceSheet().balanced).toBe(true);
    expect(runner.getViolationSummary()).toEqual({ ledgerBreachCount: 0, protectionViolationCount: 0 });
    expect(runner.getSpec().strategyId).toBe('H3_MAKER');
    expect(runner.getLifecycleEngine().getAllOrders().length).toBeGreaterThan(8);
    expect(runner.getProtectionEngine().getStateSnapshot().globalKillSwitchActive).toBe(false);

    const oracle65: OracleReplayCheckpoint[] = checkpoints65.map((cp, idx) => ({
      dayIndex: cp.dayIndex,
      oracleNav: Number((cp.paperNav * (1 + (idx % 2 === 0 ? 0.000015 : -0.000012))).toFixed(6)),
    }));

    const reconciler = new TrackingErrorReconciler();
    const report = reconciler.reconcile(checkpoints65, oracle65, runner.getViolationSummary());
    expect(report.verdict).toBe('PASS');
    expect(report.g13Pass).toBe(true);
    expect(report.liveTradingUnlocked).toBe(false);
    expect(report.autoKillTriggered).toBe(false);
    expect(report.elapsedDays).toBe(65);
    expect(report.trackingErrorBpsPerMonth).toBeLessThan(15.0);
  });

  it('returns FAIL on 65-day runs with >= 15 bps/mo drift, ledger breach, risk breach, or misaligned checkpoints', () => {
    const spec = makeSignedSpec();
    const runner = new PaperForwardRunner({ spec, initialCapitalUsd: 100_000, genesisTimestampMs: GENESIS_MS });
    runner.recordGenesisCheckpoint(GENESIS_MS);
    const checkpoints65 = runner.runDays(buildMultiDayInputs(65));

    const driftedOracle: OracleReplayCheckpoint[] = checkpoints65.map((cp, idx) => ({
      dayIndex: cp.dayIndex,
      oracleNav: cp.paperNav * Math.pow(1 - 0.0009, idx),
    }));
    const driftReport = evaluateG13Gate({
      paperCheckpoints: checkpoints65,
      oracleCheckpoints: driftedOracle,
    });
    expect(driftReport.verdict).toBe('FAIL');
    expect(driftReport.g13Pass).toBe(false);
    expect(driftReport.liveTradingUnlocked).toBe(false);
    expect(driftReport.trackingErrorBpsPerMonth).toBeGreaterThanOrEqual(15.0);
    expect(driftReport.autoKillTriggered).toBe(true);

    const cleanOracle: OracleReplayCheckpoint[] = checkpoints65.map((cp) => ({
      dayIndex: cp.dayIndex,
      oracleNav: cp.paperNav,
    }));
    const ledgerBreachReport = evaluateG13Gate({
      paperCheckpoints: checkpoints65.map((cp, i) => (i === 10 ? { ...cp, ledgerBalanced: false } : cp)),
      oracleCheckpoints: cleanOracle,
    });
    expect(ledgerBreachReport.verdict).toBe('FAIL');
    expect(ledgerBreachReport.g13Pass).toBe(false);
    expect(ledgerBreachReport.ledgerBreachCount).toBe(1);
    expect(ledgerBreachReport.autoKillTriggered).toBe(true);
    expect(ledgerBreachReport.liveTradingUnlocked).toBe(false);

    const emptyReport = evaluateG13Gate({ paperCheckpoints: [], oracleCheckpoints: [] });
    expect(emptyReport.verdict).toBe('FAIL');

    const badOracleNav = evaluateG13Gate({
      paperCheckpoints: checkpoints65.slice(0, 2),
      oracleCheckpoints: [{ dayIndex: 0, oracleNav: 100_000 }, { dayIndex: 1, oracleNav: -5 }],
    });
    expect(badOracleNav.verdict).toBe('FAIL');

    const oneDayReport = evaluateG13Gate({
      paperCheckpoints: checkpoints65.slice(0, 2),
      oracleCheckpoints: checkpoints65.slice(0, 2).map((cp) => ({ dayIndex: cp.dayIndex, oracleNav: cp.paperNav })),
    });
    expect(oneDayReport.verdict).toBe('INCONCLUSIVE');
    expect(oneDayReport.elapsedDays).toBe(1);

    const protBreachReport = evaluateG13Gate({
      paperCheckpoints: checkpoints65,
      oracleCheckpoints: cleanOracle,
      protectionViolationCount: 2,
    });
    expect(protBreachReport.verdict).toBe('FAIL');
    expect(protBreachReport.protectionViolationCount).toBe(2);
  });

  it('enforces stale-data protection veto, non-monotonic day rejection, zero-fee helper, and invalid capital guard', () => {
    const spec = makeSignedSpec();
    expect(() => new PaperForwardRunner({ spec, initialCapitalUsd: 0 })).toThrowError(PaperForwardGuardError);
    expect(computeFeeMicroUsd(BigInt(1_000_000), 0)).toBe(BigInt(0));

    const runner = new PaperForwardRunner({ spec, initialCapitalUsd: 100_000, genesisTimestampMs: GENESIS_MS });
    runner.recordGenesisCheckpoint(GENESIS_MS);

    const staleDay: PaperForwardDayInput = {
      dayIndex: 1,
      timestampMs: GENESIS_MS + DAY_MS,
      observations: [
        {
          symbol: 'BNBUSDT',
          spotMidUsd: 600,
          perpMidUsd: 602,
          impliedCarryAnnualBps: 950,
          fundingIntervalsBps: [],
          dataTimestampMs: GENESIS_MS + DAY_MS - 60_000,
        },
      ],
    };
    const cp1 = runner.stepDay(staleDay);
    expect(cp1.executedOrderCount).toBe(0);
    expect(runner.getViolationSummary().protectionViolationCount).toBeGreaterThanOrEqual(1);

    expect(() => runner.stepDay(staleDay)).toThrow(/Non-monotonic/);

    const emptyObsCp = runner.stepDay({
      dayIndex: 2,
      timestampMs: GENESIS_MS + 2 * DAY_MS,
      observations: [{ symbol: 'UNLISTED', spotMidUsd: 10, perpMidUsd: 10, impliedCarryAnnualBps: 900, fundingIntervalsBps: [] }],
    });
    expect(emptyObsCp.dayIndex).toBe(2);

    const vetoRes = executeSingleLegLifecycle({
      botId: 'test',
      strategyId: 'H3_MAKER',
      idempotencyKey: 'oversized_order',
      legSymbol: 'BNBUSDT:SPOT',
      side: 'buy',
      qtyBase: toBaseUnits(1000),
      fillQtyBase: toBaseUnits(1000),
      limitPriceUsd: 600,
      fillPriceUsd: 600,
      feeBps: 1.0,
      marginRateBps: BigInt(10_000),
      reduceOnly: false,
      nowMs: GENESIS_MS + 2 * DAY_MS,
      protection: runner.getProtectionEngine(),
      lifecycle: runner.getLifecycleEngine(),
      tickCtx: {
        nowMs: GENESIS_MS + 2 * DAY_MS,
        equityUsd: 100_000,
        peakEquityUsd: 100_000,
        rolling24hPnlUsd: 0,
        rolling24hRefEquityUsd: 100_000,
        positions: [],
        markets: {},
      },
    });
    expect(vetoRes).toEqual({ executedOrders: 0, protectionViolations: 1 });

    const freshMarkets = {
      'BNBUSDT:SPOT': {
        symbol: 'BNBUSDT:SPOT',
        timestampMs: GENESIS_MS + 2 * DAY_MS,
        midPrice: 600,
        bestBid: 599.9,
        bestAsk: 600.1,
        spreadBps: 3.3,
        bookDepthUsd: 800_000,
        barVolumeUsd: 8_000_000,
        barReturnSigma: 0.5,
        jumpShockBps: 3,
      },
    };
    const validTickCtx = {
      nowMs: GENESIS_MS + 2 * DAY_MS,
      equityUsd: 100_000,
      peakEquityUsd: 100_000,
      rolling24hPnlUsd: 0,
      rolling24hRefEquityUsd: 100_000,
      positions: [],
      markets: freshMarkets,
    };

    const overfillRes = executeSingleLegLifecycle({
      botId: 'test',
      strategyId: 'H3_MAKER',
      idempotencyKey: 'overfill_order',
      legSymbol: 'BNBUSDT:SPOT',
      side: 'buy',
      qtyBase: toBaseUnits(1),
      fillQtyBase: toBaseUnits(2),
      limitPriceUsd: 600,
      fillPriceUsd: 600,
      feeBps: 1.0,
      marginRateBps: BigInt(10_000),
      reduceOnly: false,
      nowMs: GENESIS_MS + 2 * DAY_MS,
      protection: runner.getProtectionEngine(),
      lifecycle: runner.getLifecycleEngine(),
      tickCtx: validTickCtx,
    });
    expect(overfillRes).toEqual({ executedOrders: 0, protectionViolations: 1 });

    const invalidReduceOnly = executeSingleLegLifecycle({
      botId: 'test',
      strategyId: 'H3_MAKER',
      idempotencyKey: 'invalid_ro',
      legSymbol: 'BNBUSDT:SPOT',
      side: 'sell',
      qtyBase: toBaseUnits(1),
      fillQtyBase: toBaseUnits(1),
      limitPriceUsd: 600,
      fillPriceUsd: 600,
      feeBps: 1.0,
      marginRateBps: BigInt(10_000),
      reduceOnly: true,
      nowMs: GENESIS_MS + 2 * DAY_MS,
      protection: runner.getProtectionEngine(),
      lifecycle: runner.getLifecycleEngine(),
      tickCtx: validTickCtx,
    });
    expect(invalidReduceOnly).toEqual({ executedOrders: 0, protectionViolations: 1 });

    const defaultGenesisRunner = new PaperForwardRunner({ spec });
    expect(defaultGenesisRunner.recordGenesisCheckpoint().dayIndex).toBe(0);
    const defaultDays = buildMultiDayInputs(1).map((d) => ({
      ...d,
      observations: d.observations.map((o) => ({
        symbol: o.symbol,
        spotMidUsd: o.spotMidUsd,
        perpMidUsd: o.perpMidUsd,
        impliedCarryAnnualBps: o.impliedCarryAnnualBps,
        fundingIntervalsBps: o.fundingIntervalsBps,
      })),
    }));
    expect(defaultGenesisRunner.runDays(defaultDays)).toHaveLength(2);
    defaultGenesisRunner.stepDay({
      dayIndex: 2,
      timestampMs: GENESIS_MS + 2 * DAY_MS,
      observations: [
        { symbol: 'BNBUSDT', spotMidUsd: 615, perpMidUsd: 615.2, impliedCarryAnnualBps: 50, fundingIntervalsBps: [] },
      ],
    });
    defaultGenesisRunner.stepDay({
      dayIndex: 3,
      timestampMs: GENESIS_MS + 3 * DAY_MS,
      observations: [
        {
          symbol: 'BNBUSDT',
          spotMidUsd: 615,
          perpMidUsd: 618,
          impliedCarryAnnualBps: 950,
          fundingIntervalsBps: [],
          fifoUniformDraw: 0.1,
          legMissUniformDraw: 0.01,
        },
      ],
    });
    viCorruptLedgerAndStep(defaultGenesisRunner);
    verifyOrphanSpotUnwindOnPerpReject();
    verifyFullUniverseHeadroomClamp();
  });
});

function verifyFullUniverseHeadroomClamp(): void {
  const core19 = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT',
    'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'TRXUSDT', 'LTCUSDT', 'NEARUSDT', 'ATOMUSDT',
    'UNIUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'INJUSDT',
  ];
  const spec = makeSignedSpec({ universe: core19 });
  const runner = new PaperForwardRunner({ spec, initialCapitalUsd: 100_000, genesisTimestampMs: GENESIS_MS });
  runner.recordGenesisCheckpoint(GENESIS_MS);
  runner.stepDay({
    dayIndex: 1,
    timestampMs: GENESIS_MS + DAY_MS,
    observations: core19.map((symbol) => ({
      symbol,
      spotMidUsd: 100,
      perpMidUsd: 101.5,
      impliedCarryAnnualBps: 980,
      fundingIntervalsBps: [1.0, 1.0, 1.0],
      fifoUniformDraw: 0.1,
      legMissUniformDraw: 0.5,
    })),
  });
  runner.stepDay({
    dayIndex: 2,
    timestampMs: GENESIS_MS + 2 * DAY_MS,
    observations: core19.map((symbol) => ({
      symbol,
      spotMidUsd: 106,
      perpMidUsd: 107.6,
      impliedCarryAnnualBps: 980,
      fundingIntervalsBps: [1.0, 1.0, 1.0],
      fifoUniformDraw: 0.1,
      legMissUniformDraw: 0.5,
    })),
  });
  expect(runner.getViolationSummary()).toEqual({ ledgerBreachCount: 0, protectionViolationCount: 0 });
}

function verifyOrphanSpotUnwindOnPerpReject(): void {
  const spec = makeSignedSpec();
  const runner = new PaperForwardRunner({ spec, initialCapitalUsd: 100_000, genesisTimestampMs: GENESIS_MS });
  runner.recordGenesisCheckpoint(GENESIS_MS);
  const origPre = runner.getProtectionEngine().evaluatePreTrade.bind(runner.getProtectionEngine());
  runner.getProtectionEngine().evaluatePreTrade = (order, ctx) => {
    const baseDec = origPre(order, ctx);
    if (order.symbol === 'BNBUSDT:PERP' && !order.reduceOnly) {
      return {
        ...baseDec,
        allowed: false,
        action: 'REJECT_PRETRADE',
        controlId: 4,
        reason: 'simulated perp leg pre-trade veto',
      };
    }
    return baseDec;
  };
  runner.stepDay({
    dayIndex: 1,
    timestampMs: GENESIS_MS + DAY_MS,
    observations: [
      {
        symbol: 'BNBUSDT',
        spotMidUsd: 600,
        perpMidUsd: 602,
        impliedCarryAnnualBps: 950,
        fundingIntervalsBps: [],
        fifoUniformDraw: 0.1,
        legMissUniformDraw: 0.5,
      },
    ],
  });
  expect(runner.getLedger().getPosition('BNBUSDT:SPOT').signedQtyBase).toBe(BigInt(0));
  expect(runner.getLedger().getPosition('BNBUSDT:PERP').signedQtyBase).toBe(BigInt(0));
  expect(runner.getViolationSummary().protectionViolationCount).toBeGreaterThanOrEqual(1);
}

function viCorruptLedgerAndStep(runner: PaperForwardRunner): void {
  const orig = runner.getLedger().getBalanceSheet.bind(runner.getLedger());
  runner.getLedger().getBalanceSheet = () => ({
    ...orig(),
    assetsMicroUsd: orig().assetsMicroUsd + BigInt(50_000_000),
    discrepancyMicroUsd: BigInt(50_000_000),
    balanced: false,
  });
  const cp = runner.stepDay({
    dayIndex: 4,
    timestampMs: GENESIS_MS + 4 * DAY_MS,
    observations: [
      {
        symbol: 'BNBUSDT',
        spotMidUsd: 616,
        perpMidUsd: 619,
        impliedCarryAnnualBps: 900,
        fundingIntervalsBps: [],
      },
    ],
  });
  expect(cp.ledgerBalanced).toBe(false);
  expect(runner.getViolationSummary().ledgerBreachCount).toBeGreaterThanOrEqual(2);
}
