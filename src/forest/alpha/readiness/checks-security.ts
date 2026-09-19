// Live Readiness Hardening — Security Checks
// Secret leak detection + paper-only trading invariant.

import { ok, fail, run } from './checks-helpers';

/** Grep source for leaked API keys / tokens. */
export function checkSecretsNotCommitted() {
  const patterns = [
    'sk-[A-Za-z0-9]{20,}',
    'AKIA[A-Z0-9]{16}',
    'ghp_[A-Za-z0-9]{36}',
  ];
  for (const pat of patterns) {
    const out = run('grep', [
      '-rE', pat, 'src/',
      '--include=*.ts', '--include=*.tsx', '-l',
    ]);
    if (out !== null && out.length > 0) {
      return fail('secrets_not_committed', 'security', `Potential secret found matching ${pat}`);
    }
  }
  return ok('secrets_not_committed', 'No leaked secrets detected in src/');
}

/** Verify no live trading code is present. */
export function checkPaperTradingOnly() {
  const livePatterns = [
    'execute_real_trade',
    'place_live_order',
    'LIVE_TRADING_ENABLED',
  ];
  for (const pat of livePatterns) {
    const out = run('grep', [
      '-r', pat, 'src/',
      '--include=*.ts', '-l',
    ]);
    if (out !== null && out.length > 0) {
      return fail('paper_trading_only', 'security', `Live trading reference found: ${pat}`);
    }
  }
  return ok('paper_trading_only', 'No live trading code detected');
}
