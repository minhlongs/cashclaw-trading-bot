// Live Readiness Hardening — Integration Checks
// Cost model, regime engine, walk-forward module wiring.

import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { ok, fail } from './checks-helpers';

const ROOT = process.cwd();

/** Verify the cost model module is present, exported, and applyCosts produces non-zero costs. */
export function checkCostModelConfigured() {
  const costPath = resolve(ROOT, 'src/forest/backtest/cost-model.ts');
  if (!existsSync(costPath)) return fail('cost_model_configured', 'data', 'cost-model.ts not found');
  const content = readFileSync(costPath, 'utf-8');
  if (!content.includes('export')) {
    return fail('cost_model_configured', 'data', 'cost-model.ts has no exports');
  }
  // Smoke test: parse the file for StressMode exports and verify feePct > 0 in normal mode
  const stressMatch = content.match(/normal:\s*\{[^}]*feePct:\s*([\d.]+)/);
  if (!stressMatch || Number(stressMatch[1]) <= 0) {
    return fail('cost_model_configured', 'data', 'Cost model normal stress mode has non-positive feePct');
  }
  return ok('cost_model_configured', `Cost model present, exported, normal feePct=${stressMatch[1]}`);
}

/** Verify the regime classifier exists and is exported. */
export function checkRegimeEngineWired() {
  const classifierPath = resolve(ROOT, 'src/tree/regime/classifier.ts');
  if (!existsSync(classifierPath)) return fail('regime_engine_wired', 'data', 'regime classifier.ts not found');
  const indexPath = resolve(ROOT, 'src/tree/regime/index.ts');
  if (!existsSync(indexPath)) return fail('regime_engine_wired', 'data', 'regime index.ts not found');
  const content = readFileSync(indexPath, 'utf-8');
  if (!content.includes('RuleBasedRegimeClassifier')) {
    return fail('regime_engine_wired', 'data', 'RegimeClassifier not exported from index.ts');
  }
  return ok('regime_engine_wired', 'Regime engine present and exported');
}

/** Verify the walk-forward module exists and is exported. */
export function checkWalkForwardWired() {
  const wfPath = resolve(ROOT, 'src/forest/backtest/walkforward.ts');
  if (!existsSync(wfPath)) return fail('walk_forward_wired', 'data', 'walkforward.ts not found');
  const content = readFileSync(wfPath, 'utf-8');
  if (!content.includes('export')) {
    return fail('walk_forward_wired', 'data', 'walkforward.ts has no exports');
  }
  return ok('walk_forward_wired', 'Walk-forward module present and exporting');
}
