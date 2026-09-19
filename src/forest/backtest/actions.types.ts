import type { BotConfig } from '@/tree/bot/types';
import type { BacktestResult } from './engine';

export interface BacktestRunInput {
  botId: string;
  exchange: string;
  symbol: string;
  strategy: string;
  config: BotConfig;
  startDate: Date;
  endDate: Date;
  interval?: string;
  feePct?: number;
  slippagePct?: number;
  initialCapital?: number;
}

export interface BacktestRunOutput {
  success: boolean;
  result?: BacktestResult;
  error?: string;
  candlesFetched: number;
}
