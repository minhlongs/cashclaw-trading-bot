// Gate G13 End-to-End TS <-> Python Checkpoint Orchestrator (PAPER_ONLY, Fail-Closed).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MICRO_USD_PER_USD, ZERO_BIGINT } from '@/tree/ledger';
import {
  ARCHIVED_FALSIFIED_FAMILIES, G13TrackingArtifactSchema, PaperForwardRunner,
  isArchivedFalsifiedFamily, validateSignedStrategySpec, validateStrategyLifecycleRegistry,
  valuePortfolioAtMarks, type SignedStrategySpec, type StrategyLifecycleRegistry,
} from '@/tree/paper-forward';
import {
  BRIDGE_INITIAL_CAPITAL_USD, BRIDGE_SEED, PublicMarketSnapshotSchema,
  buildDayStepFromSnapshot, computeUtcCalendarDayOffset, extractSerializedFills,
  serializeOpenPositions, verifyDay0ShadowTick,
  type PersistedBridgeDay, type PersistedRunnerState, type PublicMarketSnapshot,
} from './g13-checkpoint-helpers';

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REGISTRY_PATH = path.join(REPO_ROOT, 'artifacts', 'strategy_lifecycle_registry.json');
const DEFAULT_SPEC_PATH = path.join(REPO_ROOT, 'artifacts', 'signed_strategy_spec_h3_maker.json');
const DEFAULT_G13_OUT_PATH = path.join(REPO_ROOT, 'artifacts', 'g13_paper_tracking_error.json');
const DEFAULT_STATE_PATH = path.join(REPO_ROOT, 'verification_lab', 'data', 'g13_runner_state.json');
const PY_SCRIPT_PATH = path.join(REPO_ROOT, 'verification_lab', 'scripts', 'g13_paper_forward.py');

interface CliOptions {
  offline: boolean; stateFile?: string; outPath?: string; pythonBin?: string;
  specPath: string; registryPath: string; snapshotIn?: string;
}

interface VerifiedGovernance {
  readonly spec: SignedStrategySpec; readonly registry: StrategyLifecycleRegistry;
  readonly rawSpecJson: string; readonly rawRegistryJson: string;
}

const VALUE_FLAG_HANDLERS: Readonly<Record<string, (opts: CliOptions, val: string) => void>> = {
  '--state-file': (o, v) => { o.stateFile = path.resolve(v); },
  '--out': (o, v) => { o.outPath = path.resolve(v); },
  '--python': (o, v) => { o.pythonBin = v; },
  '--spec': (o, v) => { o.specPath = path.resolve(v); },
  '--registry': (o, v) => { o.registryPath = path.resolve(v); },
  '--snapshot-in': (o, v) => { o.snapshotIn = path.resolve(v); },
};

function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = { offline: false, specPath: DEFAULT_SPEC_PATH, registryPath: DEFAULT_REGISTRY_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--offline') { opts.offline = true; continue; }
    const handler = VALUE_FLAG_HANDLERS[arg];
    if (!handler) throw new Error(`Unknown CLI option: ${arg}`);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for flag ${arg}`);
    handler(opts, next);
    i += 1;
  }
  return opts;
}

function resolvePython(explicit?: string): string {
  const fromEnv = explicit?.trim() || process.env.G13_PYTHON_BIN?.trim();
  if (fromEnv) return fromEnv;
  const labBin = path.join(REPO_ROOT, 'verification_lab', '.labenv', 'bin', 'python');
  return fs.existsSync(labBin) ? labBin : 'python3';
}

function resolveGenesisUtc(specSha: string, state: PersistedRunnerState | null, outPath: string, fallbackUtc: string): string {
  if (state) return state.genesisUtc;
  for (const candidate of [outPath, DEFAULT_G13_OUT_PATH]) {
    if (!fs.existsSync(candidate)) continue;
    const doc = JSON.parse(fs.readFileSync(candidate, 'utf8')) as Record<string, unknown>;
    if (doc.spec_sha256 === specSha && typeof doc.genesis_utc === 'string') return doc.genesis_utc;
  }
  return fallbackUtc;
}

function loadVerifiedGovernance(opts: CliOptions): VerifiedGovernance {
  if (!fs.existsSync(opts.registryPath) || !fs.existsSync(opts.specPath)) throw new Error('missing lifecycle registry or signed strategy spec');
  const rawRegistryJson = fs.readFileSync(opts.registryPath, 'utf8');
  const rawSpecJson = fs.readFileSync(opts.specPath, 'utf8');
  const regRes = validateStrategyLifecycleRegistry(JSON.parse(rawRegistryJson) as unknown, rawRegistryJson);
  if (!regRes.ok) throw new Error(`${regRes.code}: ${regRes.error}`);
  const specRes = validateSignedStrategySpec(JSON.parse(rawSpecJson) as unknown, { registry: regRes.data, rawSpecJson, rawRegistryJson });
  if (!specRes.ok) throw new Error(`${specRes.code}: ${specRes.error}`);
  if (specRes.data.strategyId !== 'H3_MAKER' || ARCHIVED_FALSIFIED_FAMILIES.some((f) => !isArchivedFalsifiedFamily(f))) {
    throw new Error('Only H3_MAKER is eligible for Gate G13');
  }
  return { spec: specRes.data, registry: regRes.data, rawSpecJson, rawRegistryJson };
}

function acquireMarketSnapshot(opts: CliOptions, pythonBin: string, snapTmp: string, effectiveStatePath?: string): PublicMarketSnapshot {
  if (opts.snapshotIn) fs.copyFileSync(opts.snapshotIn, snapTmp);
  else {
    const stateArgs = effectiveStatePath && fs.existsSync(effectiveStatePath) ? ['--state-file', effectiveStatePath] : [];
    const pySnap = spawnSync(pythonBin, [PY_SCRIPT_PATH, ...(opts.offline ? ['--offline'] : []), ...stateArgs, '--emit-snapshot-json', snapTmp], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (pySnap.status !== 0) throw new Error((pySnap.stderr || 'Python snapshot acquisition failed').trim());
  }
  return PublicMarketSnapshotSchema.parse(JSON.parse(fs.readFileSync(snapTmp, 'utf8')) as unknown);
}

function loadPriorRunnerState(statePath: string, expectedSpecSha: string): PersistedRunnerState | null {
  if (!fs.existsSync(statePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as PersistedRunnerState;
  if (parsed.specSha256 !== expectedSpecSha) throw new Error('persisted runner state specSha256 mismatch');
  return parsed;
}

function stepRunnerThroughToday(
  gov: VerifiedGovernance, snapshot: PublicMarketSnapshot, priorState: PersistedRunnerState | null, genesisUtc: string,
): { runner: PaperForwardRunner; executedDays: PersistedBridgeDay[]; genesisTsMs: number } {
  const genesisTsMs = Date.parse(genesisUtc);
  const obsTsMs = Date.parse(snapshot.observed_at_utc);
  if (!Number.isFinite(genesisTsMs) || !Number.isFinite(obsTsMs) || obsTsMs < genesisTsMs) throw new Error('invalid or non-monotonic observation timestamp');
  const runner = new PaperForwardRunner({
    spec: gov.spec, registry: gov.registry, rawSpecJson: gov.rawSpecJson, rawRegistryJson: gov.rawRegistryJson,
    initialCapitalUsd: BRIDGE_INITIAL_CAPITAL_USD, genesisTimestampMs: genesisTsMs, seed: BRIDGE_SEED,
  });
  runner.recordGenesisCheckpoint(genesisTsMs);
  const executedDays: PersistedBridgeDay[] = [];
  for (const savedDay of priorState?.days ?? []) {
    runner.stepDay({ dayIndex: savedDay.dayIndex, timestampMs: savedDay.timestampMs, observations: savedDay.observations });
    executedDays.push(savedDay);
  }
  if (priorState && runner.getLedger().getBalanceSheet().equityMicroUsd.toString() !== priorState.equityMicroUsd) {
    throw new Error('replayed runner ledger equity diverged from persisted state');
  }
  const dayOffset = computeUtcCalendarDayOffset(genesisUtc, snapshot.observed_at_utc);
  if (dayOffset === 0) {
    verifyDay0ShadowTick(gov.spec, gov.registry, snapshot, genesisTsMs);
  } else if (!executedDays.some((d) => d.dayIndex === dayOffset)) {
    const prevTs = executedDays.length > 0 ? executedDays[executedDays.length - 1]!.timestampMs : genesisTsMs;
    const heldSymbols = new Set(gov.spec.universe.filter((s) => runner.getLedger().getPosition(`${s}:SPOT`).signedQtyBase > ZERO_BIGINT));
    const todayStep = buildDayStepFromSnapshot(gov.spec, snapshot, dayOffset, Math.max(obsTsMs, prevTs + 1_000), heldSymbols);
    runner.stepDay({ dayIndex: todayStep.dayIndex, timestampMs: todayStep.timestampMs, observations: todayStep.observations });
    executedDays.push(todayStep);
  }
  return { runner, executedDays, genesisTsMs };
}

function executeCheckpointPipeline(opts: CliOptions, tmpDir: string): void {
  const gov = loadVerifiedGovernance(opts);
  const pythonBin = resolvePython(opts.pythonBin);
  const outArtifactPath = opts.outPath ?? DEFAULT_G13_OUT_PATH;
  const effectiveStatePath = opts.stateFile ?? (opts.offline ? path.join(tmpDir, 'offline-state.json') : DEFAULT_STATE_PATH);
  const snapTmp = path.join(tmpDir, 'snapshot.json');
  const snapshot = acquireMarketSnapshot(opts, pythonBin, snapTmp, effectiveStatePath);
  const priorState = loadPriorRunnerState(effectiveStatePath, gov.spec.payloadSha256);
  const genesisUtc = resolveGenesisUtc(gov.spec.payloadSha256, priorState, outArtifactPath, snapshot.observed_at_utc);
  const { runner, executedDays, genesisTsMs } = stepRunnerThroughToday(gov, snapshot, priorState, genesisUtc);

  const sheet = runner.getLedger().getBalanceSheet();
  const violations = runner.getViolationSummary();
  if (!sheet.balanced || sheet.discrepancyMicroUsd !== ZERO_BIGINT || violations.ledgerBreachCount > 0 || violations.protectionViolationCount > 0) {
    throw new Error('ledger double-entry or capital protection invariant breached');
  }

  const latestMarks = executedDays.length > 0 ? new Map(Object.entries(executedDays[executedDays.length - 1]!.marks).map(([k, v]) => [k, { spotMidUsd: v.spotMidUsd, perpMidUsd: v.perpMidUsd }])) : new Map<string, { spotMidUsd: number; perpMidUsd: number }>();
  const val = valuePortfolioAtMarks(runner.getLedger(), gov.spec.universe, latestMarks);
  const paperNav = Number(val.navMicroUsd) / Number(BigInt(BRIDGE_INITIAL_CAPITAL_USD) * MICRO_USD_PER_USD);
  const positions = serializeOpenPositions(runner.getLedger(), gov.spec.universe);
  const fills = extractSerializedFills(runner, gov.spec, new Map(executedDays.map((d) => [d.dayIndex, d])));
  const fundingEvents = runner.getLedger().getJournalEntries().filter((e) => e.eventType === 'FUNDING_CASHFLOW').length;

  const nextState: PersistedRunnerState = {
    schemaVersion: '1.0.0', specSha256: gov.spec.payloadSha256, genesisUtc, genesisTimestampMs: genesisTsMs,
    initialCapitalUsd: BRIDGE_INITIAL_CAPITAL_USD, seed: BRIDGE_SEED, days: executedDays,
    ledgerVersion: runner.getLedger().getVersion(), equityMicroUsd: sheet.equityMicroUsd.toString(), positions,
  };
  fs.mkdirSync(path.dirname(effectiveStatePath), { recursive: true });
  fs.writeFileSync(effectiveStatePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');

  const reconTmp = path.join(tmpDir, 'ts-reconciliation.json');
  fs.writeFileSync(reconTmp, `${JSON.stringify({
    schemaVersion: '1.0.0', strategyId: gov.spec.strategyId, specSha256: gov.spec.payloadSha256,
    snapshotSha256: snapshot.snapshot_sha256, observedAtUtc: snapshot.observed_at_utc,
    paperNav, initialCapitalUsd: BRIDGE_INITIAL_CAPITAL_USD,
    equityMicroUsd: sheet.equityMicroUsd.toString(), discrepancyMicroUsd: sheet.discrepancyMicroUsd.toString(),
    doubleEntryBalanced: sheet.balanced, executedOrders: fills.length, fundingEvents,
    protectionViolations: violations.protectionViolationCount, ledgerBreachCount: violations.ledgerBreachCount,
    positions, fills, days: executedDays, liveTradingUnlocked: false,
  }, null, 2)}\n`, 'utf8');

  const pyArgs = [PY_SCRIPT_PATH, '--ts-reconciliation-json', reconTmp, '--snapshot-json', snapTmp, ...(opts.offline ? ['--offline'] : []), '--out-g13', outArtifactPath, '--state-file', effectiveStatePath];
  const pyRecon = spawnSync(pythonBin, pyArgs, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (pyRecon.status !== 0) throw new Error((pyRecon.stderr || 'Python Decimal(prec=50) reconciliation failed').trim());

  const g13 = G13TrackingArtifactSchema.parse(JSON.parse(fs.readFileSync(outArtifactPath, 'utf8')) as unknown);
  process.stdout.write(`${JSON.stringify({
    ok: true, gate: g13.gate, status: g13.status, g13Pass: g13.g13_pass, liveTradingUnlocked: g13.live_trading_unlocked,
    elapsedDays: g13.elapsed_days, paperNav, checkpointsCount: g13.checkpoints.length, outPath: outArtifactPath,
  })}\n`);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g13-bridge-'));
try { executeCheckpointPipeline(parseArgs(process.argv.slice(2)), tmpDir); process.exit(0); } catch (err) {
  process.stderr.write(`REFUSING: ${(err as Error).message}\n`); process.exit(2);
} finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
