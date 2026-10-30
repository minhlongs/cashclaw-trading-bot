import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import AdmZip from 'adm-zip';

const config = '.wrangler/pr35-local.jsonc';
const database = '.wrangler/verification/pr35-d1-worker';
const raw = '.wrangler/verification/pr35-playwright-raw';
const state = '.wrangler/verification/pr35-browser-state.json';
const artifactDir = '.wrangler/verification/pr35-browser-artifacts';
const baseUrl = 'http://localhost:8787';
const secretFile = '.wrangler/verification/pr35-worker.dev.vars';
const passcodes = ['Temporary-A-Only-2026', 'Temporary-B-Only-2026'];
const emails = ['pr35-a@example.test', 'pr35-b@example.test'];

rmSync(raw, { recursive: true, force: true });
rmSync(artifactDir, { recursive: true, force: true });
rmSync(state, { force: true });
mkdirSync(raw, { recursive: true });
mkdirSync(join(raw, 'screenshots'), { recursive: true });
mkdirSync(artifactDir, { recursive: true });

function readTestSecret() {
  try { return readFileSync(secretFile, 'utf8').match(/^NOWPAYMENTS_IPN_SECRET=(.+)$/m)?.[1] ?? ''; }
  catch { return ''; }
}
function cleanString(value, secret = '') {
  let output = String(value);
  for (const sensitive of [...passcodes, ...emails, secret].filter(Boolean)) {
    output = output.split(sensitive).join('[REDACTED_TEST_VALUE]');
  }
  return output
    .replace(/session_id=[^;\s"'<>]+/gi, 'session_id=[REDACTED]')
    .replace(/^.*NOWPAYMENTS_IPN_SECRET.*$/gim, 'NOWPAYMENTS_IPN_SECRET=[REDACTED]')
    .replace(/("(?:cookie|set-cookie|authorization|passcode|password|signature|secret|email)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"');
}
function cleanJson(value, secret = '') {
  if (Array.isArray(value)) return value.map((item) => cleanJson(item, secret));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? cleanString(value, secret) : value;
  const cookieValue = typeof value.name === 'string' && /cookie|authorization|session/i.test(value.name);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /cookie|authorization|passcode|password|signature|secret|session|email/i.test(key) || (key === 'value' && cookieValue)
      ? '[REDACTED]'
      : cleanJson(item, secret),
  ]));
}
function cleanTraceText(text, secret = '') {
  try { return JSON.stringify(cleanJson(JSON.parse(text), secret)); }
  catch {
    return text.split('\n').map((line) => {
      try { return JSON.stringify(cleanJson(JSON.parse(line), secret)); }
      catch { return cleanString(line, secret); }
    }).join('\n');
  }
}
function sanitizeZip(zip, secret) {
  const cleanZip = new AdmZip();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const data = entry.getData();
    const decoded = data.toString('utf8');
    const textFile = /\.(?:trace|network|json|txt|log|html|js|css)$/i.test(entry.entryName)
      || (!data.includes(0) && !decoded.includes('\uFFFD'));
    const content = textFile ? Buffer.from(cleanTraceText(decoded, secret)) : data;
    cleanZip.addFile(entry.entryName, content);
  }
  return cleanZip;
}
function verifyScrubber() {
  const secret = 'scrubber-only-secret-42';
  const cookieToken = 'scrubber-only-session-42';
  const input = JSON.stringify({
    email: emails[0], passcode: passcodes[0], secret,
    cookies: [{ name: 'session_id', value: cookieToken }],
    jar: [{ name: 'session_id', value: cookieToken }],
    headers: [{ name: 'authorization', value: 'Bearer scrubber-only-auth-42' }],
    signature: 'scrubber-only-signature-42',
  });
  const scrubbed = cleanTraceText(input, secret);
  for (const value of [emails[0], passcodes[0], secret, cookieToken, 'scrubber-only-auth-42', 'scrubber-only-signature-42']) {
    assert.ok(!scrubbed.includes(value), `Artifact scrubber self-test leaked ${value}`);
  }
  const result = JSON.parse(scrubbed);
  assert.equal(result.cookies, '[REDACTED]');
  assert.equal(result.jar[0].value, '[REDACTED]');
  assert.equal(result.headers[0].value, '[REDACTED]');
  const traceZip = new AdmZip();
  traceZip.addFile('trace.trace', Buffer.from(input));
  const zippedEntry = sanitizeZip(traceZip, secret).getEntry('trace.trace');
  assert.ok(zippedEntry);
  const zippedText = zippedEntry.getData().toString('utf8');
  for (const value of [emails[0], passcodes[0], secret, cookieToken, 'scrubber-only-auth-42', 'scrubber-only-signature-42']) {
    assert.ok(!zippedText.includes(value), `Trace ZIP scrubber self-test leaked ${value}`);
  }
  assert.doesNotThrow(() => assertPlaywrightSummary('3 passed (12.1s)', 3));
  assert.throws(() => assertPlaywrightSummary('2 passed, 1 skipped (12.1s)', 3));
}
verifyScrubber();
if (process.argv.includes('--verify-scrubber-only')) {
  console.log('PASS artifact scrubber redacts synthetic credentials/session/auth/signature data in JSON and trace ZIPs; Playwright phase summaries reject missing or skipped tests.');
  process.exit(0);
}

function assertPlaywrightSummary(output, expectedPassed) {
  const passedCounts = [...output.matchAll(/\b(\d+) passed\b/gi)].map((match) => Number(match[1]));
  const passed = passedCounts.at(-1);
  const skipped = [...output.matchAll(/\b(\d+) skipped\b/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  assert.equal(passed, expectedPassed, `Expected ${expectedPassed} passing tests, got ${passed ?? 'no pass summary'}.`);
  assert.equal(skipped, 0, `Expected zero skipped tests, got ${skipped}.`);
}
function run(command, args, name, env = process.env, expectedPassed) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      const log = cleanString(`${stdout}\n${stderr}`, readTestSecret());
      writeFileSync(join(raw, `${name}.log`), log);
      process.stdout.write(log.slice(-12_000));
      if (code !== 0) rejectRun(new Error(`${name} exited with status ${code}. Sanitized output tail:\n${log.slice(-12_000)}`));
      else if (expectedPassed !== undefined) {
        try { assertPlaywrightSummary(`${stdout}\n${stderr}`, expectedPassed); resolveRun(); }
        catch (error) { rejectRun(new Error(`${name} did not run its full required set: ${String(error)}`)); }
      } else resolveRun();
    });
  });
}
function startWorker() {
  const child = spawn('npx', ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', '8787', '--persist-to', database, '--config', config, '--show-interactive-dev-session=false'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  return { child, getLogs: () => logs };
}
async function waitForWorker(worker) {
  const deadline = Date.now() + 120_000;
  let lastError;
  while (Date.now() < deadline) {
    if (worker.child.exitCode !== null || worker.child.signalCode !== null) throw new Error(`Worker exited before health: ${cleanString(worker.getLogs()).slice(-5000)}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        const health = await response.json();
        if (health.checks?.db === 'ok') return;
      }
      lastError = new Error(`Worker health returned ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Worker did not become healthy: ${cleanString(String(lastError))}`);
}
function signalGroup(child, signal) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    // ESRCH means the worker process group is already gone, which is the desired end state.
    if (error?.code !== 'ESRCH') throw error;
  }
}
async function stopWorker(worker, name) {
  if (worker.child.exitCode === null && worker.child.signalCode === null) {
    signalGroup(worker.child, 'SIGTERM');
    await Promise.race([
      new Promise((resolveExit) => worker.child.once('close', resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 10_000)),
    ]);
    if (worker.child.exitCode === null && worker.child.signalCode === null) signalGroup(worker.child, 'SIGKILL');
  }
  const secret = readTestSecret();
  writeFileSync(join(raw, `${name}.log`), cleanString(worker.getLogs(), secret));
}
function playwrightEnv(outputDir) {
  return {
    ...process.env,
    CI: process.env.CI ?? 'true',
    PR35_BASE_URL: baseUrl,
    PR35_E2E_RUN_ID: `pr35-${Date.now()}`,
    PR35_SCREENSHOTS_DIR: resolve(raw, 'screenshots'),
    PR35_BROWSER_STATE: resolve(state),
    PR35_PLAYWRIGHT_OUTPUT_DIR: resolve(outputDir),
  };
}
async function sanitizeTraces() {
  const secret = readTestSecret();
  const screenshotSource = join(raw, 'screenshots');
  const screenshotTarget = join(artifactDir, 'screenshots');
  mkdirSync(screenshotTarget, { recursive: true });
  for (const file of readdirSync(screenshotSource, { withFileTypes: true }).filter((entry) => entry.isFile())) {
    const bytes = readFileSync(join(screenshotSource, file.name));
    writeFileSync(join(screenshotTarget, file.name), bytes);
  }

  const traceTarget = join(artifactDir, 'traces');
  mkdirSync(traceTarget, { recursive: true });
  const traceFiles = [];
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith('.zip')) traceFiles.push(full);
    }
  }
  const testResults = join(raw, 'phase1', 'test-results');
  const restartResults = join(raw, 'phase2', 'test-results');
  for (const dir of [testResults, restartResults]) {
    try { collect(dir); } catch { /* Phase can be absent if setup failed. */ }
  }
  for (const file of traceFiles) {
    const zip = new AdmZip(file);
    const cleanZip = sanitizeZip(zip, secret);
    const isRestartTrace = file.includes(join('phase2', 'test-results'));
    const phase = isRestartTrace ? 'restart' : 'runtime';
    const sourceRoot = isRestartTrace ? restartResults : testResults;
    const name = `${phase}-${relative(sourceRoot, file).replace(/[\\/]/g, '-')}`;
    const destination = join(traceTarget, name);
    mkdirSync(dirname(destination), { recursive: true });
    await new Promise((resolveZip, rejectZip) => cleanZip.writeZip(destination, (error) => error ? rejectZip(error) : resolveZip()));
  }

  for (const name of readdirSync(raw).filter((entry) => entry.endsWith('.log'))) {
    const source = readFileSync(join(raw, name), 'utf8');
    writeFileSync(join(artifactDir, name), cleanTraceText(source, secret));
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    workerBase: baseUrl,
    migration: 'Wrangler local D1 only; no remote D1/provider/production secrets',
    screenshotFiles: readdirSync(screenshotTarget),
    sanitizedTraceFiles: readdirSync(traceTarget),
    dataRedaction: 'Synthetic emails/passcodes, NOWPayments test secret, session cookies, auth headers, signatures and session fields are redacted before artifact upload.',
  };
  writeFileSync(join(artifactDir, 'manifest.json'), `${JSON.stringify(cleanJson(manifest, secret), null, 2)}\n`);
  assertNoSensitiveStrings(artifactDir, secret);
}
function assertNoSensitiveStrings(dir, secret) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { assertNoSensitiveStrings(full, secret); continue; }
    const inspect = (buffer) => {
      const text = buffer.toString('utf8');
      for (const sensitive of [...passcodes, ...emails, secret].filter(Boolean)) {
        if (text.includes(sensitive)) throw new Error(`Sensitive test value leaked into ${relative(artifactDir, full)}`);
      }
      if (/session_id=[^;\s"'<>]+/i.test(text)) throw new Error(`Session cookie leaked into ${relative(artifactDir, full)}`);
    };
    if (entry.name.endsWith('.zip')) {
      const zip = new AdmZip(full);
      for (const zipped of zip.getEntries()) {
        if (zipped.isDirectory) continue;
        const data = zipped.getData();
        const decoded = data.toString('utf8');
        if (/\.(?:trace|network|json|txt|log|html|js|css)$/i.test(zipped.entryName) || (!data.includes(0) && !decoded.includes('\uFFFD'))) inspect(data);
      }
    } else if (!/\.png$/i.test(entry.name)) inspect(readFileSync(full));
  }
}

let worker;
let failure;
const progress = [];
try {
  await run('npm', ['run', 'build:worker'], 'worker-build');
  progress.push('build:ok');
  await run(process.execPath, ['scripts/verification/pr35-worker-d1-setup.mjs', '--reset'], 'd1-setup');
  progress.push('d1-setup:ok');
  worker = startWorker();
  await waitForWorker(worker);
  progress.push('worker1:healthy');
  await run('npx', ['playwright', 'test', '--config', 'playwright.pr35.config.ts', '--grep-invert', '@restart'], 'playwright-runtime', playwrightEnv(join(raw, 'phase1', 'test-results')), 3);
  progress.push('phase1:3-passed');
  await stopWorker(worker, 'worker-runtime');
  progress.push('worker1:stopped');
  worker = startWorker();
  await waitForWorker(worker);
  progress.push('worker2:healthy');
  await run('npx', ['playwright', 'test', '--config', 'playwright.pr35.config.ts', '--grep', '@restart'], 'playwright-restart', playwrightEnv(join(raw, 'phase2', 'test-results')), 1);
  progress.push('phase2:1-passed');
} catch (error) {
  failure = error;
  progress.push(`failed-after:${progress.length ? progress.at(-1) : 'start'}`);
} finally {
  if (worker) {
    try { await stopWorker(worker, 'worker-final'); progress.push('worker-final:stopped'); }
    catch (error) { failure ??= error; progress.push('worker-final:cleanup-error'); }
  }
  try { await sanitizeTraces(); progress.push('artifacts:sanitized'); }
  catch (error) { failure ??= error; progress.push('artifacts:error'); }
}
if (failure) {
  const message = cleanString(failure instanceof Error ? failure.message : String(failure), readTestSecret())
    .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, ' ')
    .replace(/\s+/g, ' ').slice(-4000);
  console.log(`::error title=PR35 verification failure::Phase progress: ${progress.join('; ')}. ${message}`);
  throw failure;
}
console.log(`PASS sanitized browser artifacts written under ${artifactDir}`);
