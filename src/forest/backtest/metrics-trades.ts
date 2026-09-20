// Backtest Engine — trade construction from raw fills.
// FIFO multi-fill lot matching: sells are matched against open buy lots
// in chronological order, correctly unwinding multi-step DCA accumulation
// on single aggregate exits.

import type { BacktestTrade } from './types';
import type { Fill } from './paper-exchange';

interface OpenBuyLot {
  timestamp: number;
  price: number;
  quantity: number;
  remainingQty: number;
  feePerUnit: number;
}

/**
 * Convert raw fills into BacktestTrade records.
 * Uses FIFO multi-fill lot matching: sells are matched against open buy lots in chronological order,
 * correctly unwinding multi-step DCA accumulation on single aggregate exits.
 */
export function buildTradesFromFills(fills: Fill[], _feePct: number, _capitalStart: number): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const openBuys: OpenBuyLot[] = [];

  for (const f of fills) {
    if (f.side === 'buy') {
      const feePerUnit = f.quantity > 0 ? f.fee / f.quantity : 0;
      openBuys.push({
        timestamp: f.timestamp,
        price: f.price,
        quantity: f.quantity,
        remainingQty: f.quantity,
        feePerUnit,
      });
    } else if (openBuys.length > 0) {
      const sellFeePerUnit = f.quantity > 0 ? f.fee / f.quantity : 0;
      let sellQtyRemaining = f.quantity;

      while (sellQtyRemaining > 1e-8 && openBuys.length > 0) {
        const buyLot = openBuys[0];
        const matchedQty = Math.min(buyLot.remainingQty, sellQtyRemaining);
        const allocatedFees = (buyLot.feePerUnit + sellFeePerUnit) * matchedQty;
        const pnl = (f.price - buyLot.price) * matchedQty - allocatedFees;
        const pnlPct = buyLot.price > 0 ? ((f.price - buyLot.price) / buyLot.price) * 100 : 0;

        trades.push({
          entryTimestamp: buyLot.timestamp,
          exitTimestamp: f.timestamp,
          side: 'buy',
          entryPrice: buyLot.price,
          exitPrice: f.price,
          quantity: matchedQty,
          pnl: Number(pnl.toFixed(2)),
          fee: Number(allocatedFees.toFixed(2)),
          pnlPct: Number(pnlPct.toFixed(4)),
          holdingMinutes: Math.max(0, Math.round((f.timestamp - buyLot.timestamp) / 60000)),
        });

        buyLot.remainingQty -= matchedQty;
        sellQtyRemaining -= matchedQty;

        if (buyLot.remainingQty <= 1e-8) {
          openBuys.shift();
        }
      }
    }
  }

  return trades;
}
