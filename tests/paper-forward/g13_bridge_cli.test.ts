import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { G13TrackingArtifactSchema } from '@/tree/paper-forward';

const REPO_ROOT = path.resolve(__dirname, '../..');
const VITE_NODE_BIN = path.join(REPO_ROOT, 'node_modules', 'vite-node', 'vite-node.mjs');
const VITEST_CFG = path.join(REPO_ROOT, 'vitest.config.ts');
const CHECKPOINT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'g13-checkpoint.ts');
const G13_COMMITTED_PATH = path.join(REPO_ROOT, 'artifacts', 'g13_paper_tracking_error.json');
const SPEC_COMMITTED_PATH = path.join(REPO_ROOT, 'artifacts', 'signed_strategy_spec_h3_maker.json');

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g13-cli-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function computePySnapshotSha256(snap: Record<string, unknown>): string {
  const sortDeep = (val: unknown): unknown => {
    if (Array.isArray(val)) return val.map(sortDeep);
    if (val !== null && typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>)
        .filter(([k]) => k !== 'snapshot_sha256' && k !== 'cache_hit')
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const out: Record<string, unknown> = {};
      for (const [k, v] of entries) out[k] = sortDeep(v);
      return out;
    }
    return val;
  };
  const floatFormatted = JSON.stringify(sortDeep(snap)).replace(
    /("gross_target_pair_weight"|"causal_target_pair_weight"|"binance_funding_8h_rate"|"annualised_funding_bps"|"mark_px"):(-?\d+)(?=[,}])/g,
    '$1:$2.0',
  );
  return createHash('sha256').update(`${floatFormatted}\n`, 'utf8').digest('hex');
}

function buildDatedSnapshotFile(dir: string, filename: string, observedAtUtc: string, bnbSpot: number, bnbPerp: number, bnbFund8h: number): string {
  const committed = JSON.parse(fs.readFileSync(G13_COMMITTED_PATH, 'utf8')) as {
    day0_live_public_snapshot: Record<string, unknown>;
  };
  const snap = JSON.parse(JSON.stringify(committed.day0_live_public_snapshot)) as Record<string, unknown>;
  delete snap.cache_hit;
  delete snap.snapshot_sha256;
  snap.observed_at_utc = observedAtUtc;
  const symbols = snap.symbols as Record<string, Record<string, unknown>>;
  const bnb = symbols.BNBUSDT!;
  bnb.binance_spot_mid = bnbSpot;
  bnb.binance_perp_mark = bnbPerp;
  bnb.binance_funding_8h_rate = bnbFund8h;
  const basisBps = (bnbPerp / bnbSpot - 1) * 10_000;
  bnb.binance_spot_perp_basis_bps = Number(basisBps.toFixed(4));
  bnb.binance_instantaneous_annual_basis_bps = Number((basisBps * 365).toFixed(2));
  const outPath = path.join(dir, filename);
  const pyBin = fs.existsSync(path.join(REPO_ROOT, 'verification_lab', '.labenv', 'bin', 'python'))
    ? path.join(REPO_ROOT, 'verification_lab', '.labenv', 'bin', 'python')
    : 'python3';
  fs.writeFileSync(outPath, JSON.stringify(snap), 'utf8');
  const hashRes = spawnSync(pyBin, [
    '-c',
    'import hashlib,json,sys;p=sys.argv[1];d=json.loads(open(p).read());d["snapshot_sha256"]=hashlib.sha256((json.dumps(d,sort_keys=True,separators=(",",":"))+"\\n").encode()).hexdigest();open(p,"w").write(json.dumps(d,indent=2)+"\\n")',
    outPath,
  ], { encoding: 'utf8' });
  if (hashRes.status !== 0) {
    snap.snapshot_sha256 = computePySnapshotSha256(snap);
    fs.writeFileSync(outPath, `${JSON.stringify(snap, null, 2)}\n`, 'utf8');
  }
  return outPath;
}

describe('Gate G13 End-to-End TS <-> Python Checkpoint CLI Bridge', () => {
  it('executes npm run g13:checkpoint -- --offline --out <tmp> cleanly with < 15 bps/mo and live_trading_unlocked=false', () => {
    const tmpDir = makeTempDir();
    const outPath = path.join(tmpDir, 'g13_offline_out.json');

    const res = spawnSync('npm', ['run', 'g13:checkpoint', '--', '--offline', '--out', outPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(res.status).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);

    const parsed = G13TrackingArtifactSchema.parse(JSON.parse(fs.readFileSync(outPath, 'utf8')) as unknown);
    expect(parsed.gate).toBe('G13');
    expect(parsed.status).toBe('OBSERVATION_ACTIVE_INCONCLUSIVE');
    expect(parsed.g13_pass).toBe(false);
    expect(parsed.live_trading_unlocked).toBe(false);
    expect(parsed.elapsed_days).toBe(0);
    const shadowTe = Number(parsed.harness_shadow_parity_check.harness_shadow_tracking_error_bps_per_month);
    expect(shadowTe).toBeLessThan(15.0);
  }, 30_000);

  it('progresses Day 0 -> Day 1 -> Day 2 end-to-end across persistent runner state and rejects archived H1 fail-closed', () => {
    const tmpDir = makeTempDir();
    const outPath = path.join(tmpDir, 'g13_multiday.json');
    const statePath = path.join(tmpDir, 'runner_state.json');

    const r0 = spawnSync(process.execPath, [
      VITE_NODE_BIN, '-c', VITEST_CFG, CHECKPOINT_SCRIPT, '--offline', '--state-file', statePath, '--out', outPath,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(r0.status).toBe(0);

    const snapDay1 = buildDatedSnapshotFile(tmpDir, 'snap_d1.json', '2026-11-15T14:00:00Z', 612.5, 614.2, 0.00012);
    const r1 = spawnSync(process.execPath, [
      VITE_NODE_BIN, '-c', VITEST_CFG, CHECKPOINT_SCRIPT, '--snapshot-in', snapDay1, '--state-file', statePath, '--out', outPath,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(r1.status).toBe(0);

    const snapDay2 = buildDatedSnapshotFile(tmpDir, 'snap_d2.json', '2026-11-16T15:00:00Z', 614.0, 615.1, 0.00015);
    const r2 = spawnSync(process.execPath, [
      VITE_NODE_BIN, '-c', VITEST_CFG, CHECKPOINT_SCRIPT, '--snapshot-in', snapDay2, '--state-file', statePath, '--out', outPath,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(r2.status).toBe(0);

    const finalDoc = JSON.parse(fs.readFileSync(outPath, 'utf8')) as Record<string, unknown>;
    expect(finalDoc.live_trading_unlocked).toBe(false);
    expect(finalDoc.g13_pass).toBe(false);
    expect(finalDoc.elapsed_days).toBe(2);
    expect((finalDoc.checkpoints as unknown[]).length).toBe(3);
    expect(Number(finalDoc.realized_tracking_error_bps_per_month)).toBeLessThan(15.0);

    const archivedSpec = JSON.parse(fs.readFileSync(SPEC_COMMITTED_PATH, 'utf8')) as Record<string, unknown>;
    archivedSpec.strategyId = 'H1';
    const archivedSpecPath = path.join(tmpDir, 'archived_h1_spec.json');
    fs.writeFileSync(archivedSpecPath, JSON.stringify(archivedSpec), 'utf8');

    const rArchived = spawnSync(process.execPath, [
      VITE_NODE_BIN, '-c', VITEST_CFG, CHECKPOINT_SCRIPT, '--offline', '--spec', archivedSpecPath, '--out', outPath,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(rArchived.status).toBe(2);
    expect(rArchived.stderr).toContain('STRATEGY_ARCHIVED_FALSIFIED');

    const zeroByteOut = path.join(tmpDir, 'empty_out.json');
    fs.writeFileSync(zeroByteOut, '', 'utf8');
    const cleanStatePath = path.join(tmpDir, 'atomic_state.json');
    const rZero = spawnSync(process.execPath, [
      VITE_NODE_BIN, '-c', VITEST_CFG, CHECKPOINT_SCRIPT, '--offline', '--state-file', cleanStatePath, '--out', zeroByteOut,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(rZero.status).toBe(0);
    expect(fs.existsSync(cleanStatePath)).toBe(true);
    const savedBeforeFail = fs.readFileSync(cleanStatePath, 'utf8');

    const rBadPy = spawnSync(process.execPath, [
      VITE_NODE_BIN, '-c', VITEST_CFG, CHECKPOINT_SCRIPT, '--snapshot-in', snapDay1,
      '--state-file', cleanStatePath, '--out', zeroByteOut, '--python', '/nonexistent/python-bin',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(rBadPy.status).toBe(2);
    expect(fs.readFileSync(cleanStatePath, 'utf8')).toBe(savedBeforeFail);
  }, 30_000);
});
