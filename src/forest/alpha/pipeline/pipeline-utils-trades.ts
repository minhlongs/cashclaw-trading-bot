import type { Candle } from '@/forest/backtest/ohlcv';
import type { BacktestTrade } from '@/forest/backtest/types';
import type { AlphaSignal } from '@/tree/alpha/types';
import { applyCosts } from '@/forest/backtest/cost-model';

export function extractTrades(
  signals: AlphaSignal[],
  candles: Candle[],
  offset: number,
  costCfg?: { feePct: number; slipPct: number; marketImpactPct: number },
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let pos = false, ep = 0, et = 0;
  const mkTrade = (c: Candle) => {
    const grossPnl = c.close - ep;
    const cost = costCfg ? applyCosts(grossPnl, Math.abs(ep), costCfg) : { netPnl: grossPnl, fees: 0, slippage: 0, marketImpact: 0 };
    return {
      entryTimestamp: et,
      exitTimestamp: c.timestamp,
      side: 'buy' as const,
      entryPrice: ep,
      exitPrice: c.close,
      quantity: 1,
      pnl: cost.netPnl,
      pnlPct: ep > 0 ? (cost.netPnl / ep) * 100 : 0,
      fee: cost.fees + cost.slippage + cost.marketImpact,
      holdingMinutes: Math.max(0, Math.round((c.timestamp - et) / 60000)),
    };
  };
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i], c = candles[i + offset];
    if (!c) continue;
    if (s.direction === 'buy' && !pos) {
      ep = c.close;
      et = c.timestamp;
      pos = true;
    } else if (s.direction === 'sell' && pos) {
      trades.push(mkTrade(c));
      pos = false;
    }
  }
  if (pos && candles[candles.length - 1]) trades.push(mkTrade(candles[candles.length - 1]));
  return trades;
}
