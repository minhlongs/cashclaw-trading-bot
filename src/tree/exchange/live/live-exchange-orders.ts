// Live Trading Adapter — Order execution & safety helpers

import { rateLimiter } from '../rate-limiter';
import { createLogger } from '@/lib/logger';
import type { ExchangeId, OrderRequest, OrderResult } from '../types';
import type { createCCXTClient } from '../ccxt/client';
import type { KillswitchCallbacks } from './live-exchange-types';

const log = createLogger('exchange-live');

export interface OrderStateContext {
  id: ExchangeId;
  client: ReturnType<typeof createCCXTClient>;
  killswitch: KillswitchCallbacks;
  dailyPnl: number;
  maxDailyLoss: number;
  orderCount: number;
  maxOrdersPerMinute: number;
}

export async function executeLiveOrder(
  ctx: OrderStateContext,
  request: OrderRequest,
): Promise<{ result: OrderResult; newOrderCount: number }> {
  if (!ctx.killswitch.isTradingEnabled()) {
    throw new Error('Trading halted by killswitch');
  }

  if (Math.abs(ctx.dailyPnl) >= ctx.maxDailyLoss) {
    throw new Error(`Daily loss limit reached: ${(ctx.dailyPnl * 100).toFixed(2)}%`);
  }

  if (ctx.orderCount >= ctx.maxOrdersPerMinute) {
    throw new Error(`Rate limit: ${ctx.maxOrdersPerMinute} orders/minute`);
  }

  await rateLimiter.acquire(ctx.id, 'order');

  try {
    const result = await ctx.client.placeOrder(ctx.id, request as unknown as OrderResult);
    const newOrderCount = ctx.orderCount + 1;
    ctx.killswitch.onOrderPlaced(result as OrderResult);
    return { result: result as OrderResult, newOrderCount };
  } catch (error) {
    ctx.killswitch.onError(error instanceof Error ? error : new Error(String(error)), 'placeOrder');
    throw error;
  }
}

export async function cancelLiveOrder(
  ctx: { id: ExchangeId; client: ReturnType<typeof createCCXTClient>; killswitch: KillswitchCallbacks },
  orderId: string,
  symbol: string,
): Promise<boolean> {
  await rateLimiter.acquire(ctx.id, 'order');
  try {
    return await ctx.client.cancelOrder(ctx.id, orderId, symbol);
  } catch (error) {
    ctx.killswitch.onError(error instanceof Error ? error : new Error(String(error)), 'cancelOrder');
    return false;
  }
}

export function checkKillswitchLoss(
  dailyPnl: number,
  maxDailyLoss: number,
  killswitch: KillswitchCallbacks,
): void {
  if (Math.abs(dailyPnl) >= maxDailyLoss) {
    killswitch.onError(
      new Error(`Daily loss limit breached: ${(dailyPnl * 100).toFixed(2)}%`),
      'dailyLossCheck',
    );
  }
}

export async function pingExchange(
  id: ExchangeId,
  client: ReturnType<typeof createCCXTClient>,
): Promise<boolean> {
  try {
    await rateLimiter.acquire(id, 'api');
    await client.fetchTicker(id, 'BTC/USDT');
    return true;
  } catch (error) {
    log.warn('Exchange ping failed', { action: 'ping', error: error instanceof Error ? error : new Error(String(error)) });
    return false;
  }
}
