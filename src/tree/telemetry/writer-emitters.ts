import type { TradeEventType } from './types';

export interface EmitterTarget { emit(botId: string, eventType: TradeEventType, details?: Record<string, unknown>): void; }

export const TelemetryEmitters = {
  emitTick(t: EmitterTarget, botId: string, price: number, pnl?: number): void { t.emit(botId, 'tick', { price, pnl }); },
  emitFill(t: EmitterTarget, botId: string, orderId: string, side: string, price: number, qty: number, pnl = 0): void { t.emit(botId, 'fill', { orderId, side, price, quantity: qty, pnl }); },
  emitSignal(t: EmitterTarget, botId: string, signal: string, indicatorValues: Record<string, unknown>): void { t.emit(botId, 'signal', { signal, ...indicatorValues }); },
  emitError(t: EmitterTarget, botId: string, error: string, context: string): void { t.emit(botId, 'error', { error, context }); },
  emitHalt(t: EmitterTarget, botId: string, reason: string): void { t.emit(botId, 'halt', { reason }); },
  emitResume(t: EmitterTarget, botId: string): void { t.emit(botId, 'resume', {}); },
  emitStart(t: EmitterTarget, botId: string, config: Record<string, unknown>): void { t.emit(botId, 'start', { config }); },
  emitStop(t: EmitterTarget, botId: string, reason?: string): void { t.emit(botId, 'stop', { reason: reason ?? 'normal' }); },
  emitPause(t: EmitterTarget, botId: string): void { t.emit(botId, 'pause', {}); },
  emitRebalance(t: EmitterTarget, botId: string, oldBase: number, newBase: number): void { t.emit(botId, 'rebalance', { oldBase, newBase }); },
  emitExchangeHealth(t: EmitterTarget, botId: string, h: { exchangeId: string; score: number; state: string; latencyMs: number; failureCount: number; rateLimitUsed: number; rateLimitTotal: number }): void { t.emit(botId, 'exchange_health', { ...h, timestamp: Date.now() }); },
  emitRateLimitUsage(t: EmitterTarget, botId: string, ex: string, u: { endpoint: string; callsInWindow: number; maxPerWindow: number; windowMs: number }): void { t.emit(botId, 'rate_limit_usage', { exchangeId: ex, ...u, timestamp: Date.now() }); },
};
