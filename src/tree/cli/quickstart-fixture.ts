// Step 10: Deterministic 60-Second Quickstart Fixture for Open-Source Onboarding
// Pure, causal 3-asset mini OHLCV + fee/slippage seed so new GitHub visitors
// can run a verified paper backtest immediately without API keys.

import type { HighLowBar } from '../quantlib/microstructure/corwin-schultz-types';
import type { OhlcBar } from '../quantlib/volatility/garman-klass-volatility-types';

export interface QuickstartSymbolFixture {
  readonly symbol: 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT';
  readonly feeBps: number;
  readonly slippageBps: number;
  readonly bars: readonly (OhlcBar & HighLowBar & { readonly volume: number })[];
}

export const QUICKSTART_DEMO_FIXTURES: readonly QuickstartSymbolFixture[] = [
  {
    symbol: 'BTCUSDT',
    feeBps: 10,
    slippageBps: 5,
    bars: [
      { open: 62000, high: 62850, low: 61700, close: 62500, volume: 1840 },
      { open: 62500, high: 63400, low: 62100, close: 63120, volume: 2150 },
      { open: 63120, high: 63900, low: 62800, close: 63550, volume: 1980 },
      { open: 63550, high: 64200, low: 63050, close: 63890, volume: 2310 },
    ],
  },
  {
    symbol: 'ETHUSDT',
    feeBps: 10,
    slippageBps: 5,
    bars: [
      { open: 3100, high: 3165, low: 3070, close: 3140, volume: 9400 },
      { open: 3140, high: 3210, low: 3115, close: 3190, volume: 10200 },
      { open: 3190, high: 3255, low: 3160, close: 3225, volume: 8900 },
      { open: 3225, high: 3290, low: 3205, close: 3270, volume: 11400 },
    ],
  },
  {
    symbol: 'SOLUSDT',
    feeBps: 10,
    slippageBps: 8,
    bars: [
      { open: 145, high: 151, low: 143, close: 149, volume: 45000 },
      { open: 149, high: 156, low: 147, close: 154, volume: 52000 },
      { open: 154, high: 160, low: 151, close: 158, volume: 49500 },
      { open: 158, high: 164, low: 155, close: 162, volume: 58000 },
    ],
  },
] as const;
