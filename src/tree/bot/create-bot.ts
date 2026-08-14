// Bot creation logic — extracted from BotManager for size compliance

import type { ExchangeAdapter } from '../exchange/types';
import type { BotConfig } from './types';
import { BotInstance, type BotCallbacks } from './bot-instance';
import { createPaperAdapter } from './paper-adapter';
import type { TelemetryWriter } from '../telemetry';
import { persistBot, patchBot, persistTrade } from '@/forest/bot/d1-adapter';
import type { Killswitch } from './killswitch';
import { createLogger } from '@/lib/logger';

const log = createLogger('bot-create');

type D1BotStatus = 'draft' | 'paper_test' | 'live_running' | 'paused' | 'error' | 'stopped';

function toD1Status(status: string): D1BotStatus {
  switch (status) {
    case 'running': return 'paper_test';
    case 'paused': return 'paused';
    case 'stopped': return 'stopped';
    case 'error': return 'error';
    case 'idle': return 'draft';
    default: return 'draft';
  }
}

export interface CreateBotRequest {
  id: string;
  config: BotConfig;
  exchangeConfig?: { apiKey: string; apiSecret: string; passphrase?: string; testnet: boolean; sandbox: boolean; rateLimitMs: number };
  mode: 'paper' | 'live';
}

export interface CreateBotContext {
  userId?: string;
  onLog: (msg: string) => void;
  onError: (error: Error, context: string) => void;
  onBotEvent?: (botId: string, event: string, data: Record<string, unknown>) => void;
  telemetry?: TelemetryWriter;
  killswitch: Killswitch;
}

export async function createBotInstance(
  req: CreateBotRequest,
  ctx: CreateBotContext,
  bots: Map<string, BotInstance>,
  exchanges: Map<string, ExchangeAdapter>,
): Promise<BotInstance> {
  if (bots.has(req.id)) {
    throw new Error(`Bot already exists: ${req.id}`);
  }

  // v1: paper-only lockdown — force paper mode at BotManager level
  if (req.mode !== 'paper') {
    ctx.onLog('Live mode blocked — Paper-only v1');
    req.mode = 'paper';
  }

  const modeKey = 'paper';
  let exchange = exchanges.get(modeKey);

  if (!exchange) {
    exchange = createPaperAdapter(req.config.capital);
    exchanges.set(modeKey, exchange);
  }

  const callbacks: BotCallbacks = {
    onStateChange: (state) => {
      ctx.onBotEvent?.(req.id, 'state_change', { status: state.status, pnl: state.totalPnl });
      if (ctx.userId) {
        patchBot(req.id, {
          status: toD1Status(state.status),
          total_pnl: state.totalPnl,
          total_trades: state.totalTrades,
          win_count: state.winCount,
          loss_count: state.lossCount,
          max_drawdown: state.maxDrawdown,
          current_drawdown: state.currentDrawdown,
          started_at: state.startedAt,
          stopped_at: state.stoppedAt,
          last_error: state.error,
          last_tick_at: state.lastTickAt,
          last_order_at: state.lastOrderAt,
        }).catch((error) => {
          log.error(`D1 persist state failed for ${req.id}`, error instanceof Error ? error : new Error(String(error)), { action: 'patchBot:state' });
        });
      }
    },
    onTrade: (trade) => {
      ctx.onBotEvent?.(req.id, 'trade', { side: trade.side, price: trade.price });
      if (ctx.userId) {
        persistTrade(req.id, {
          side: trade.side,
          entryPrice: trade.price,
          exitPrice: trade.filled > 0 && trade.side === 'sell' ? trade.price : undefined,
          quantity: trade.quantity,
          pnl: trade.pnl,
          status: trade.status === 'filled' ? 'filled' : 'open',
          exchangeOrderId: trade.id,
        }).catch((error) => {
          log.error(`D1 persist trade failed for ${req.id}`, error instanceof Error ? error : new Error(String(error)), { action: 'persistTrade' });
        });
      }
    },
    onLog: (msg) => ctx.onLog(`[${req.id}] ${msg}`),
    onError: (error, ctx2) => ctx.onError(error, `${req.id}:${ctx2}`),
  };

  const bot = new BotInstance(req.id, req.config, { exchange, killswitch: ctx.killswitch }, callbacks);
  bots.set(req.id, bot);

  // Persist new bot to D1
  if (ctx.userId) {
    persistBot(ctx.userId, {
      id: req.id,
      config: req.config,
      capital: req.config.capital,
      name: req.id,
      strategy: req.config.strategy,
      pair: req.config.symbol,
      exchange: req.config.exchange,
    }).catch((error) => {
      log.error(`D1 persist bot failed for ${req.id}`, error instanceof Error ? error : new Error(String(error)), { action: 'persistBot' });
    });
  }

  ctx.onLog(`Bot ${req.id} created (${req.config.strategy}, ${req.config.symbol}, ${req.mode})`);
  return bot;
}
