// Real-data alpha backtest — live Binance OHLCV + derivative signals.
// Paper-only. No orders, no live trading. Fetches, computes, reports.
//
// Usage:
//   npx tsx scripts/alpha-real-data-backtest.ts BTCUSDT 1h 200
//
// Outputs: net PnL, Sharpe, win rate, cost breakdown, per-regime stats.

import { fetchResearchData, type FetchConfig } from '@/forest/alpha/data-fetcher';
import {
  fetchFundingRate,
  fetchOpenInterestHistory,
  fetchLiquidations,
  fetchPremiumIndex,
  computeDerivativeFeatures,
  generateDerivativeSignals,
} from '@/tree/alpha/signals';
import { AlphaResearchPipeline } from '@/forest/alpha/pipeline/engine';
import type { PipelineConfig } from '@/forest/alpha/pipeline/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('real-data-backtest');

function parseArgs(): { symbol: string; timeframe: string; limit: number } {
  const [, , symbol = 'BTCUSDT', timeframe = '1h', limitStr = '200'] = process.argv;
  return { symbol, timeframe, limit: Number(limitStr) };
}

async function main(): Promise<void> {
  const { symbol, timeframe, limit } = parseArgs();
  log.info('fetching real data', { symbol, timeframe, limit });

  const cfg: FetchConfig = { source: 'binance', symbol, timeframe, limit };
  const data = await fetchResearchData([cfg]);
  const candles = data.get(`binance:${symbol}:${timeframe}`) ?? [];
  if (candles.length < 50) {
    log.error('not enough candles', undefined, { count: candles.length });
    process.exit(1);
  }

  const t0 = candles[0].timestamp;
  const t1 = candles[candles.length - 1].timestamp;

  // Fetch all four derivative sources in parallel. Failures are non-fatal —
  // the pipeline degrades to empty features, exactly as it does offline.
  const [funding, oi, liquidations, premium] = await Promise.all([
    fetchFundingRate(symbol, t0, t1).catch(e => { log.warn('funding fetch failed', { error: String(e) }); return []; }),
    fetchOpenInterestHistory(symbol, '1h', t0, t1).catch(e => { log.warn('oi fetch failed', { error: String(e) }); return []; }),
    fetchLiquidations(symbol, t0).catch(e => { log.warn('liquidations fetch failed', { error: String(e) }); return []; }),
    fetchPremiumIndex(symbol, t0, t1).catch(e => { log.warn('premium fetch failed', { error: String(e) }); return []; }),
  ]);

  const features = computeDerivativeFeatures(candles, funding, oi, liquidations, premium);
  const signals = generateDerivativeSignals(candles, features, symbol);

  log.info('derivative data', {
    funding: funding.length, oi: oi.length, liquidations: liquidations.length,
    premium: premium.length, signals: signals.length,
  });

  // Build pipeline config with the live derivative data injected so the
  // fetch_derivatives step uses it directly (deterministic, no network).
  const pipelineCfg: PipelineConfig = {
    symbol, timeframe, candles,
    derivatives: { features, signals },
    indicatorSet: { rsi: 14, lookback: 20 },
    regimeConfig: { lookback: 20, minDuration: 3, minCandles: 50, confidenceThreshold: 0.5 },
    walkforwardConfig: { trainBars: 50, validateBars: 10, testBars: 20, stepBars: 10 },
    costMode: 'normal',
    minSharpe: 0.5, minTrades: 5,
    baselinesEnabled: true,
  };

  const pipeline = new AlphaResearchPipeline(pipelineCfg);
  const report = await pipeline.run();

  console.log('\n=== ALPHA RESEARCH REPORT ===');
  console.log(`Symbol:        ${report.symbol} ${report.timeframe}`);
  console.log(`Steps:         ${report.passedSteps}/${report.totalSteps} succeeded`);
  console.log(`Final Sharpe:  ${report.finalSharpe.toFixed(4)}`);
  console.log(`Recommendation: ${report.recommendation}`);
  console.log(`Regimes:       ${Object.keys(report.regimeBreakdown).length} detected`);
  console.log(`Top features:  ${report.topFeatures.slice(0, 5).map(f => `${f.name}(${f.importance.toFixed(3)})`).join(', ')}`);

  if (report.report) {
    const r = report.report;
    console.log('\n--- Cost breakdown ---');
    console.log(`Total return:  ${r.totalReturn.toFixed(2)}`);
    console.log(`Gross PnL:     ${(r.netPnl + r.fees + r.slippage).toFixed(2)}`);
    console.log(`Fees:          ${r.fees.toFixed(2)}`);
    console.log(`Slippage:      ${r.slippage.toFixed(2)}`);
    console.log(`Net PnL:       ${r.netPnl.toFixed(2)}`);
    console.log(`Win rate:      ${(r.winRate * 100).toFixed(1)}%`);
    console.log(`Loss rate:     ${(r.lossRate * 100).toFixed(1)}%`);
    console.log(`Profit factor: ${r.profitFactor.toFixed(2)}`);
    console.log(`Expectancy:    ${r.expectancy.toFixed(4)}`);
    console.log(`Sharpe:        ${r.sharpe?.toFixed(4) ?? 'n/a'}`);
    console.log(`Sortino:       ${r.sortino?.toFixed(4) ?? 'n/a'}`);
    console.log(`Max DD:        ${(r.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`Trades:        ${r.numTrades}`);
    console.log(`Turnover:      ${r.turnover.toFixed(2)}`);
    console.log(`Exposure:      ${(r.exposure * 100).toFixed(1)}%`);
  }
}

main().catch(err => {
  log.error('backtest failed', err instanceof Error ? err : undefined, { error: String(err) });
  process.exit(1);
});