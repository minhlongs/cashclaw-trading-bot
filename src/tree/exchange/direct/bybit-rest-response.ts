import type { BybitResponse } from './types';

export async function handleBybitResponse<T>(res: Response, endpoint: string): Promise<BybitResponse<T>> {
  if (!res.ok) {
    let errorDetail = '';
    try {
      const rawText = await res.text();
      if (rawText) {
        try {
          const errJson = JSON.parse(rawText) as { retCode?: number; retMsg?: string };
          errorDetail = errJson?.retMsg ? ` [code: ${errJson.retCode ?? 'unknown'}]: ${errJson.retMsg}` : `: ${rawText}`;
        } catch {
          errorDetail = `: ${rawText}`;
        }
      }
    } catch {
      // ignore stream read failures
    }
    throw new Error(`Bybit REST ${res.status} on ${endpoint}${errorDetail}`);
  }
  const data = (await res.json()) as BybitResponse<T>;
  if (data.retCode !== 0) {
    throw new Error(`Bybit REST error [code: ${data.retCode}]: ${data.retMsg}`);
  }
  return data;
}

export function parseBybitServerTime(timeVal: unknown, timeSecond?: string): number {
  const fromTime = typeof timeVal === 'number' ? timeVal : parseInt(String(timeVal ?? ''), 10);
  if (Number.isFinite(fromTime) && fromTime > 0) return fromTime;
  const fromSec = parseInt(timeSecond ?? '', 10) * 1000;
  if (Number.isFinite(fromSec) && fromSec > 0) return fromSec;
  throw new Error('Invalid serverTime format in Bybit response');
}
