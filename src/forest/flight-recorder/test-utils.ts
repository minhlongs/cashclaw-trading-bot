import { vi } from 'vitest';
import type { D1PreparedStatement, D1Database } from '@/lib/db/types';
import type { NewBotInput, NewFillInput, NewTickInput } from './flight-recorder-types';

export function mockPreparedStmt(): D1PreparedStatement {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    firstRow: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [], meta: { duration: 0 } }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1, last_row_id: 1, duration: 0 } }),
  };
}

export function mockDb(stmt?: D1PreparedStatement): D1Database {
  const s = stmt ?? mockPreparedStmt();
  return {
    prepare: vi.fn().mockReturnValue(s),
    exec: vi.fn(),
    batch: vi.fn(),
    dump: vi.fn(),
    __cf: {} as unknown,
  } as unknown as D1Database;
}

export const sampleBotInput: NewBotInput = {
  id: 'bot_1',
  userId: 'user_1',
  name: 'TestBot',
  strategy: 'grid',
  pair: 'BTC/USDT',
  exchange: 'binance',
};

export const sampleFillInput: NewFillInput = {
  id: 'fill_1',
  botId: 'bot_1',
  pair: 'BTC/USDT',
  side: 'buy',
  entryPrice: 50000,
  exitPrice: 51000,
  quantity: 0.1,
  pnl: 100,
  fee: 1,
  status: 'filled',
  exchangeOrderId: 'order_1',
};

export const sampleTickInput: NewTickInput = {
  id: 'evt_1',
  botId: 'bot_1',
  eventType: 'price_update',
  data: '{"price":50000}',
};
