export interface BarrierConfig {
  readonly takeProfitPct: number;
  readonly stopLossPct: number;
  readonly maxHoldingMs: number;
}

export type BarrierLabel = 1 | -1 | 0;

export interface LabeledEvent {
  readonly entryTimestamp: number;
  readonly exitTimestamp: number;
  readonly label: BarrierLabel;
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly pnl: number;
  readonly duration: number;
}
