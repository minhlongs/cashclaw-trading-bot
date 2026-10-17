// Step 9: Interactive CLI Paper Backtest Summary & Cloud SaaS Upsell Bridge
// Generates a clean terminal/markdown summary for self-hosted Apache-2.0 users
// with a 1-click invitation to sync their bot to 24/7 CashClaw Cloud SaaS.

import { CorwinSchultzEngine } from '../quantlib/microstructure/corwin-schultz-engine';
import { GarmanKlassVolatilityEngine } from '../quantlib/volatility/garman-klass-volatility-engine';
import { QUICKSTART_DEMO_FIXTURES, type QuickstartSymbolFixture } from './quickstart-fixture';

export interface CliBacktestMetrics {
  readonly symbol: string;
  readonly barCount: number;
  readonly netReturnPct: number;
  readonly annualizedVolatility: number;
  readonly estimatedSpreadBps: number;
  readonly feeAndSlippageBps: number;
  readonly safetyMode: 'PAPER_ONLY';
}

export interface CliPaperReport {
  readonly edition: 'OSS_LOCAL';
  readonly license: 'Apache-2.0';
  readonly metrics: readonly CliBacktestMetrics[];
  readonly cloudSyncUrl: string;
  readonly formattedOutput: string;
}

export function evaluateQuickstartFixture(fixture: QuickstartSymbolFixture): CliBacktestMetrics {
  const firstOpen = fixture.bars[0].open;
  const lastClose = fixture.bars[fixture.bars.length - 1].close;
  const rawReturnPct = ((lastClose - firstOpen) / firstOpen) * 100;
  const totalCostBps = fixture.feeBps + fixture.slippageBps;
  const netReturnPct = Number((rawReturnPct - totalCostBps / 100).toFixed(4));

  const gk = GarmanKlassVolatilityEngine.calculate({ bars: fixture.bars, annualizationFactor: 365 });
  const cs = CorwinSchultzEngine.calculate({ bars: fixture.bars, clampNegativeSpread: true });

  return {
    symbol: fixture.symbol,
    barCount: fixture.bars.length,
    netReturnPct,
    annualizedVolatility: Number(gk.annualizedVolatility.toFixed(4)),
    estimatedSpreadBps: Number(cs.estimatedSpreadBps.toFixed(2)),
    feeAndSlippageBps: totalCostBps,
    safetyMode: 'PAPER_ONLY',
  };
}

export function generateCliPaperReport(
  fixtures: readonly QuickstartSymbolFixture[] = QUICKSTART_DEMO_FIXTURES,
  cloudSyncBaseUrl = 'https://cloud.cashclaw.io/sync',
): CliPaperReport {
  const metrics = fixtures.map(evaluateQuickstartFixture);
  const lines: string[] = [
    '=== CashClaw Open-Core (Apache-2.0) | 60s Paper Quant Summary ===',
    'Mode: PAPER_ONLY (ADR-001 Verified | Fees & Slippage Included)',
    '-----------------------------------------------------------------',
  ];

  for (const m of metrics) {
    lines.push(
      `${m.symbol.padEnd(8)} | Net: ${m.netReturnPct.toFixed(2)}% | Vol(GK): ${(m.annualizedVolatility * 100).toFixed(2)}% | Spread(CS): ${m.estimatedSpreadBps.toFixed(1)} bps | Cost: ${m.feeAndSlippageBps} bps`,
    );
  }

  lines.push('-----------------------------------------------------------------');
  lines.push(`[24/7 Cloud SaaS] Run this bot 24/7 on Cloudflare Edge + Managed LLM Debate:`);
  lines.push(`-> Sync in 1 click: ${cloudSyncBaseUrl}?source=oss-cli`);

  return {
    edition: 'OSS_LOCAL',
    license: 'Apache-2.0',
    metrics,
    cloudSyncUrl: `${cloudSyncBaseUrl}?source=oss-cli`,
    formattedOutput: lines.join('\n'),
  };
}
