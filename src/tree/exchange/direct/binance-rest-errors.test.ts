import { describe, expect, it, vi } from 'vitest';
import { BinanceRestClient } from './binance-rest-client';

describe('BinanceRestClient Error Handling', () => {
  it('parses structured Binance JSON error with code and msg', async () => {
    const errorBody = { code: -1121, msg: 'Invalid symbol.' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 400 })
    );
    const client = new BinanceRestClient({ fetchFn: mockFetch });

    await expect(client.fetchTicker('UNKNOWN')).rejects.toThrow(
      'Binance REST 400 on /api/v3/ticker/24hr?symbol=UNKNOWN [code: -1121]: Invalid symbol.'
    );
  });

  it('parses structured Binance JSON error with msg but missing code', async () => {
    const errorBody = { msg: 'Service error without code' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 500 })
    );
    const client = new BinanceRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'Binance REST 500 on /api/v3/ping [code: unknown]: Service error without code'
    );
  });

  it('parses JSON error without msg property', async () => {
    const errorBody = { error: 'Bad Request' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 400 })
    );
    const client = new BinanceRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'Binance REST 400 on /api/v3/ping: {"error":"Bad Request"}'
    );
  });

  it('falls back to raw text when JSON parse fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 })
    );
    const client = new BinanceRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'Binance REST 502 on /api/v3/ping: <html>502 Bad Gateway</html>'
    );
  });

  it('handles empty error response gracefully', async () => {
    const emptyResponse = {
      ok: false,
      status: 500,
      text: async () => '',
    } as unknown as Response;

    const mockFetch = vi.fn().mockResolvedValue(emptyResponse);
    const client = new BinanceRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow('Binance REST 500 on /api/v3/ping');
  });

  it('handles text read failure gracefully', async () => {
    const failingResponse = {
      ok: false,
      status: 503,
      text: async () => {
        throw new Error('Cannot read text');
      },
    } as unknown as Response;

    const mockFetch = vi.fn().mockResolvedValue(failingResponse);
    const client = new BinanceRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow('Binance REST 503 on /api/v3/ping');
  });
});
