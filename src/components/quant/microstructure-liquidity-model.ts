// Pure domain model for MicrostructureLiquidityAnalyzer
// Extracted to keep UI components focused and <= 135 LOC.

export type SymbolKey = 'BTC/USDT' | 'ETH/USDT' | 'SOL/USDT';

export interface SymbolMicrostructure {
  readonly symbol: SymbolKey;
  readonly midPrice: number;
  readonly spreadBps: number;
  readonly ofiScore: number;
  readonly vpinToxicity: number;
  readonly depthUsdTop5: number;
}

export const MICROSTRUCTURE_SNAPSHOTS: Record<SymbolKey, SymbolMicrostructure> = {
  'BTC/USDT': {
    symbol: 'BTC/USDT',
    midPrice: 64280.5,
    spreadBps: 1.4,
    ofiScore: 0.34,
    vpinToxicity: 0.28,
    depthUsdTop5: 1840000,
  },
  'ETH/USDT': {
    symbol: 'ETH/USDT',
    midPrice: 3145.2,
    spreadBps: 2.1,
    ofiScore: -0.19,
    vpinToxicity: 0.46,
    depthUsdTop5: 920000,
  },
  'SOL/USDT': {
    symbol: 'SOL/USDT',
    midPrice: 148.65,
    spreadBps: 4.8,
    ofiScore: -0.52,
    vpinToxicity: 0.71,
    depthUsdTop5: 340000,
  },
};
