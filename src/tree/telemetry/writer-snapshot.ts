import type { Balance } from '../exchange/types';
import type { TelemetryWriterDeps, TelemetryWriterCallbacks } from './writer-types';
import { INSERT_CAPITAL_SNAPSHOT_SQL, buildSnapshotInsertParams } from './writer-sql';
import type { EmitterTarget } from './writer-emitters';

export interface SnapshotConfig { maxDrawdownPct: number; winCount: number; lossCount: number; totalTrades: number; }

export async function persistSnapshot(
  t: EmitterTarget, deps: TelemetryWriterDeps, cbs: TelemetryWriterCallbacks,
  botId: string, capital: number, pnl: number, _b: Balance[], cfg: SnapshotConfig,
): Promise<void> {
  const now = Date.now(), id = `snap_${botId}_${now}`, maxDD = cfg.maxDrawdownPct;
  try {
    await deps.enqueue(INSERT_CAPITAL_SNAPSHOT_SQL, buildSnapshotInsertParams(id, botId, capital, pnl, maxDD, cfg, now));
  } catch (e) {
    cbs.onFlushError?.(e instanceof Error ? e : new Error(String(e)));
  }
  t.emit(botId, 'metric_snapshot', { capital, pnl, maxDrawdownPct: maxDD, winCount: cfg.winCount, lossCount: cfg.lossCount, totalTrades: cfg.totalTrades });
}
