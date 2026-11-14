/**
 * Deterministic generator for artifacts/g8_tail_stress_matrix.json.
 * Usage: npx tsx scripts/generate-g8-tail-stress.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_STRESS_SEED, runTailStressSuite } from '../src/tree/protection';

const REPO_ROOT = path.resolve(__dirname, '..');
const ARTIFACT_PATH = path.join(REPO_ROOT, 'artifacts', 'g8_tail_stress_matrix.json');

function main(): void {
  const matrix = runTailStressSuite(DEFAULT_STRESS_SEED);
  if (matrix.summary.verdict !== 'PASS' || matrix.summary.passedScenarios !== 16) {
    console.error('Tail-stress suite failed invariants:', JSON.stringify(matrix.summary, null, 2));
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');

  console.log(`artifact: ${ARTIFACT_PATH}`);
  console.log(`seed: ${matrix.seed}`);
  console.log(`sha256: ${matrix.matrixSha256}`);
  console.log(
    `summary: ${matrix.summary.passedScenarios}/${matrix.summary.totalScenarios} passed | phantomTrades=${matrix.summary.phantomTradesTotal} | blindRetries=${matrix.summary.blindRetriesTotal}`,
  );
}

main();
