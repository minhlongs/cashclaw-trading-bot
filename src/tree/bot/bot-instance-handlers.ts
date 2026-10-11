import type { BotState, BotCallbacks, BotDependencies } from './types';
import type { TradeEventType } from '../telemetry/types';
import { pauseBot, resumeBot, stopBot } from './bot-instance-control';
import { destroyBotInstance } from './bot-instance-events';

export function handleBotPause(
  s: BotState, id: string, cb: BotCallbacks, stop: () => void,
  emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void,
): void {
  pauseBot(s, id, cb, stop, emitTelem, emitSt);
}
export function handleBotResume(
  s: BotState, id: string, cb: BotCallbacks, start: () => void,
  emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void,
): void {
  resumeBot(s, id, cb, start, emitTelem, emitSt);
}
export function handleBotStop(
  s: BotState, id: string, cb: BotCallbacks, stop: () => void,
  emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void,
): void {
  stopBot(s, id, cb, stop, emitTelem, emitSt);
}
export function handleBotDestroy(id: string, stop: () => void, deps: BotDependencies): void {
  destroyBotInstance(id, stop, deps);
}
