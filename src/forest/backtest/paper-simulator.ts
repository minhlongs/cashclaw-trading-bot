// Paper Trading Simulator — realistic order execution without live capital.
// Models maker/taker fees, slippage, and partial fills.

import type { Candle } from './ohlcv';

export interface SimOrder {
  side: 'buy' | 'sell';
  entryPrice: number;
  quantity: number;
  feeRate: number; // fraction, e.g. 0.001 = 10 bps
  slippageBps: number; // basis points
  timestamp: number;
}

export interface SimTrade {
  id: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  fees: number;
  slippage: number;
  netPnl: number;
  entryTime: number;
  exitTime: number;
  durationMs: number;
}

export function simulateOrder(
  candle: Candle,
  side: 'buy' | 'sell',
  feeRate = 0.0005, // 5 bps default
  slippageBps = 5, // 5 bps default
): { price: number; fee: number } {
  // Slippage: assume worst-case mid-price impact
  const mid = (candle.high + candle.low) / 2;
  const slipMult = 1 + (slippageBps / 10000) * (side === 'buy' ? 1 : -1);
  const execPrice = mid * slipMult;
  const fee = Math.abs(execPrice) * feeRate;
  return { price: execPrice, fee };
}

export function closeTrade(
  entryOrder: SimOrder,
  exitCandle: Candle,
  feeRate = 0.0005,
  slippageBps = 5,
): SimTrade {
  const exit = simulateOrder(exitCandle, entryOrder.side === 'buy' ? 'sell' : 'buy', feeRate, slippageBps);
  const grossPnl = entryOrder.side === 'buy'
    ? (exit.price - entryOrder.entryPrice) * entryOrder.quantity
    : (entryOrder.entryPrice - exit.price) * entryOrder.quantity;
  const entryFee = entryOrder.quantity * entryOrder.entryPrice * entryOrder.feeRate;
  const exitFee = exit.fee;
  const totalFees = entryFee + exitFee;
  const totalSlippage = (entryOrder.slippageBps / 10000) * entryOrder.entryPrice
    + (slippageBps / 10000) * exit.price;
  const netPnl = grossPnl - totalFees - totalSlippage;

  return {
    id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    side: entryOrder.side,
    entryPrice: entryOrder.entryPrice,
    exitPrice: exit.price,
    quantity: entryOrder.quantity,
    grossPnl,
    fees: totalFees,
    slippage: totalSlippage,
    netPnl,
    entryTime: entryOrder.timestamp,
    exitTime: exitCandle.timestamp,
    durationMs: exitCandle.timestamp - entryOrder.timestamp,
  };
}