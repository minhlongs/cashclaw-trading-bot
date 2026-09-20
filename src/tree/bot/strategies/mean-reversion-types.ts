// Mean Reversion Strategy Types
// Callbacks and local types for MeanRevStrategy.

import type {
  MeanRevBotConfig,
  BotTrade,
} from '../types';
import type {
  OrderRequest,
  OrderResult,
} from '../../exchange/types';
import type { BollingerBands, RSI } from './mean-reversion-indicators';

export interface MeanRevStrategyCallbacks {
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}

export type PositionSide = 'long' | 'short' | 'none';

export interface EnterLongParams {
  config: MeanRevBotConfig;
  callbacks: MeanRevStrategyCallbacks;
  price: number;
  bb: BollingerBands;
  rsi: RSI;
}

export interface ExitLongParams {
  config: MeanRevBotConfig;
  callbacks: MeanRevStrategyCallbacks;
  entryPrice: number;
  price: number;
  bb: BollingerBands;
  rsi: RSI;
}
