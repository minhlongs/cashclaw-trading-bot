import { BackoffEntry } from './types';

export function calculateNextBackoff(
  current: BackoffEntry | undefined,
  multiplier: number = 2,
  now: number = Date.now()
): BackoffEntry {
  const base = current?.delayMs ?? 1000;
  const next = Math.min(60_000, base * multiplier);
  return {
    delayMs: next,
    expiresAt: now + next,
  };
}

export function calculateRemainingBackoff(
  current: BackoffEntry | undefined,
  now: number = Date.now()
): { remaining: number; isExpired: boolean } {
  if (!current) {
    return { remaining: 0, isExpired: true };
  }

  if (current.expiresAt <= now) {
    return { remaining: 0, isExpired: true };
  }

  return {
    remaining: Math.max(0, current.expiresAt - now),
    isExpired: false,
  };
}
