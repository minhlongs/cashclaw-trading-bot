import type { BotState, BotCallbacks } from './types';
import type { TradeEventType } from '../telemetry/types';

export function pauseBot(
  s: BotState, id: string, cb: BotCallbacks,
  stop: () => void, emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void,
): void {
  if (s.status !== 'running') return;
  s.status = 'paused'; s.updatedAt = Date.now();
  stop(); emitTelem('pause', {}); emitSt(); cb.onLog(`Bot ${id} paused`);
}

export function resumeBot(
  s: BotState, id: string, cb: BotCallbacks,
  start: () => void, emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void,
): void {
  if (s.status !== 'paused') return;
  s.status = 'running'; s.updatedAt = Date.now();
  start(); emitTelem('resume', {}); emitSt(); cb.onLog(`Bot ${id} resumed`);
}

export function stopBot(
  s: BotState, id: string, cb: BotCallbacks,
  stop: () => void, emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void,
): void {
  if (s.status === 'stopped') return;
  s.status = 'stopped'; s.stoppedAt = s.updatedAt = Date.now();
  stop(); emitTelem('stop', { reason: 'manual' }); emitSt(); cb.onLog(`Bot ${id} stopped`);
}
