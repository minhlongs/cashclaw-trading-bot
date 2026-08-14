// Flight Recorder — D1-backed types for bot lifecycle events

export interface BotRecord {
  id: string;
  user_id: string;
  name: string;
  strategy: string;
  pair: string;
  exchange: string;
  status: string;
  started_at: string;
  stopped_at: string | null;
  created_at: string;
}

export interface FillRecord {
  id: string;
  bot_id: string;
  pair: string;
  side: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  fee: number;
  status: string;
  exchange_order_id: string;
  error_message: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
}

export interface TickRecord {
  id: string;
  bot_id: string;
  event_type: string;
  data: string;
  created_at: string;
}

export interface NewBotInput {
  id: string;
  userId: string;
  name: string;
  strategy: string;
  pair: string;
  exchange: string;
  status?: string;
}

export interface NewFillInput {
  id: string;
  botId: string;
  pair: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  fee: number;
  status: string;
  exchangeOrderId: string;
  errorMessage?: string;
}

export interface NewTickInput {
  id: string;
  botId: string;
  eventType: string;
  data: string;
}
