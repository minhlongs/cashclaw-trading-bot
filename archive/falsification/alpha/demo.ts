// Demo: Alpha Research Pipeline
// Run: npx tsx src/forest/alpha/demo.ts

import { AlphaResearchPipeline } from '@/forest/alpha/pipeline/engine';
import type { PipelineConfig } from '@/forest/alpha/pipeline/types';
import { generateSyntheticCandlesWithRegimes } from '@/forest/alpha/integration/fixtures';
import type { AlphaResearchReport } from '@/forest/alpha/pipeline/types';

async function main(): Promise<void> {
  // 1. Generate synthetic data with regime transitions
  const candles = generateSyntheticCandlesWithRegimes([
    { regime: 'TREND_UP', bars: 50 },
    { regime: 'RANGE', bars: 30 },
    { regime: 'HIGH_VOLATILITY', bars: 20 },
    { regime: 'TREND_DOWN', bars: 40 },
    { regime: 'TREND_UP', bars: 30 },
  ]);

  // 2. Configure pipeline
  const config: PipelineConfig = {
    symbol: 'BTC/USDT',
    timeframe: '1h',
    candles,
    indicatorSet: { sma: 14, ema: 12, rsi: 14, macd: 26, bollinger: 20 },
    regimeConfig: {
      minCandles: 10,
      confidenceThreshold: 0.4,
      lookback: 20,
      minDuration: 2,
    },
    walkforwardConfig: {
      trainBars: 30,
      validateBars: 15,
      testBars: 15,
      stepBars: 15,
    },
    costMode: 'conservative',
    minSharpe: 0.1,
    minTrades: 5,
    baselinesEnabled: true,
  };

  // 3. Run pipeline
  console.log('Starting Alpha Research Pipeline...\n');
  const pipeline = new AlphaResearchPipeline(config);
  const result: AlphaResearchReport = await pipeline.run();

  // 4. Print results
  console.log('\nPipeline Results:');
  console.log(`  Steps executed: ${result.totalSteps}`);
  console.log(`  Steps passed: ${result.passedSteps}`);
  console.log(`  Symbol: ${result.symbol}`);
  console.log(`  Timeframe: ${result.timeframe}`);
  console.log(`  Sharpe: ${result.finalSharpe.toFixed(3)}`);
  console.log(`  Recommendation: ${result.recommendation}`);

  if (result.topFeatures.length > 0) {
    console.log('\nTop Features:');
    for (const f of result.topFeatures) {
      console.log(`  ${f.name}: importance=${f.importance.toFixed(3)}`);
    }
  }

  if (result.report) {
    console.log('\nRegime Breakdown:');
    for (const [regime, metrics] of Object.entries(result.report.byRegime)) {
      const r = metrics as { sharpe?: number; numTrades?: number };
      console.log(
        `  ${regime}: Sharpe=${(r.sharpe ?? 0).toFixed(3)}, Trades=${r.numTrades ?? 0}`,
      );
    }
  }
}

main().catch(console.error);
