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
  liveExecutionEnabled: boolean;
  riskConfigurationValid: boolean;
  preTradeAuthorizeAndAudit?: (request: OrderRequest) => Promise<{ approved: boolean; reason?: string }>;
}

export async function executeLiveOrder(
  ctx: OrderStateContext,
  request: OrderRequest,
): Promise<{ result: OrderResult; newOrderCount: number }> {
  if (!ctx.liveExecutionEnabled) {
    throw new Error('Live trading is disabled (fail-closed)');
  }
  if (!ctx.riskConfigurationValid) {
    throw new Error('Live trading blocked: explicit valid loss and order limits are required');
  }
  if (!ctx.preTradeAuthorizeAndAudit) {
    throw new Error('Live trading blocked: pre-trade safety and durable audit gate is not configured');
  }
  if (!ctx.killswitch.isTradingEnabled()) {
    throw new Error('Trading halted by killswitch');
  }

  const gate = await ctx.preTradeAuthorizeAndAudit(request);
  if (!gate.approved) {
    throw new Error(gate.reason ? `Live order blocked: ${gate.reason}` : 'Live order blocked by safety gate');
  }

  if (ctx.dailyPnl <= -ctx.maxDailyLoss) {
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
  if (dailyPnl <= -maxDailyLoss) {
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
