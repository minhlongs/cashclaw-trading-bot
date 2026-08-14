import { describe, it, expect } from 'vitest';
import { formatBotRow, formatFillRow, formatTickRow } from './flight-recorder-helpers';

describe('formatBotRow', () => {
  it('converts D1 row to BotRecord', () => {
    const row = {
      id: 'bot_1', user_id: 'u1', name: 'Grid Bot', strategy: 'grid',
      pair: 'BTC/USDT', exchange: 'binance', status: 'running',
      started_at: '2025-01-01', stopped_at: null, created_at: '2024-12-31',
    };
    const rec = formatBotRow(row);
    expect(rec.id).toBe('bot_1');
    expect(rec.user_id).toBe('u1');
    expect(rec.name).toBe('Grid Bot');
    expect(rec.status).toBe('running');
    expect(rec.stopped_at).toBeNull();
  });
  it('formats stopped_at as string when present', () => {
    const row = {
      id: 'b1', user_id: 'u1', name: 'Bot', strategy: 'mean_rev',
      pair: 'ETH/USDT', exchange: 'bybit', status: 'stopped',
      started_at: '2025-01-01', stopped_at: 1704153600000, created_at: '2024-12-31',
    };
    const rec = formatBotRow(row);
    expect(rec.stopped_at).toBe('1704153600000');
  });
});

describe('formatFillRow', () => {
  it('converts D1 row to FillRecord', () => {
    const row = {
      id: 'f1', bot_id: 'b1', pair: 'BTC/USDT', side: 'buy',
      entry_price: 50000, exit_price: 51000, quantity: 0.1, pnl: 100,
      fee: 5, status: 'closed', exchange_order_id: 'ex_1',
      error_message: null, opened_at: '2025-01-01', closed_at: '2025-01-02',
      created_at: '2025-01-01',
    };
    const rec = formatFillRow(row);
    expect(rec.entry_price).toBe(50000);
    expect(rec.pnl).toBe(100);
    expect(rec.error_message).toBeNull();
    expect(rec.closed_at).toBe('2025-01-02');
  });
  it('formats error_message as string when present', () => {
    const row = {
      id: 'f2', bot_id: 'b1', pair: 'ETH/USDT', side: 'sell',
      entry_price: 3000, exit_price: 0, quantity: 0.5, pnl: 0,
      fee: 0, status: 'error', exchange_order_id: '',
      error_message: 'timeout', opened_at: '2025-01-01', closed_at: null,
      created_at: '2025-01-01',
    };
    const rec = formatFillRow(row);
    expect(rec.error_message).toBe('timeout');
    expect(rec.closed_at).toBeNull();
  });
});

describe('formatTickRow', () => {
  it('converts D1 row to TickRecord', () => {
    const row = {
      id: 't1', bot_id: 'b1', event_type: 'tick',
      data: '{"price":50000}', created_at: '2025-01-01',
    };
    const rec = formatTickRow(row);
    expect(rec.id).toBe('t1');
    expect(rec.event_type).toBe('tick');
    expect(rec.data).toBe('{"price":50000}');
  });
});
