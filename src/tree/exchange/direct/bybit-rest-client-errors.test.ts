import { describe, expect, it, vi } from 'vitest';
import { BybitRestClient } from './bybit-rest-client';

describe('BybitRestClient Error Handling', () => {
  it('throws structured error when retCode is not 0 in 200 OK response', async () => {
    const errorBody = { retCode: 10001, retMsg: 'Parameter error: symbol invalid', result: {} };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 200 })
    );
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'Bybit REST error [code: 10001]: Parameter error: symbol invalid'
    );
  });

  it('parses structured JSON error on HTTP 400 with retCode and retMsg', async () => {
    const errorBody = { retCode: 10002, retMsg: 'Invalid request' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 400 })
    );
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.fetchTicker('spot', 'UNKNOWN')).rejects.toThrow(
      'Bybit REST 400 on /v5/market/tickers?category=spot&symbol=UNKNOWN [code: 10002]: Invalid request'
    );
  });

  it('parses JSON error on HTTP 500 with retMsg but no retCode', async () => {
    const errorBody = { retMsg: 'Internal server error' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 500 })
    );
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'Bybit REST 500 on /v5/market/time [code: unknown]: Internal server error'
    );
  });

  it('parses JSON error on HTTP 400 without retMsg property', async () => {
    const errorBody = { error: 'Bad request' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 400 })
    );
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'Bybit REST 400 on /v5/market/time: {"error":"Bad request"}'
    );
  });

  it('falls back to raw text when JSON parsing fails on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 })
    );
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'Bybit REST 502 on /v5/market/time: <html>502 Bad Gateway</html>'
    );
  });

  it('handles empty response body on HTTP error gracefully', async () => {
    const emptyResponse = {
      ok: false,
      status: 500,
      text: async () => '',
    } as unknown as Response;

    const mockFetch = vi.fn().mockResolvedValue(emptyResponse);
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow('Bybit REST 500 on /v5/market/time');
  });

  it('handles stream read failure on HTTP error gracefully', async () => {
    const failingResponse = {
      ok: false,
      status: 503,
      text: async () => {
        throw new Error('Stream read failed');
      },
    } as unknown as Response;

    const mockFetch = vi.fn().mockResolvedValue(failingResponse);
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow('Bybit REST 503 on /v5/market/time');
  });

  it('throws when ticker list is empty in successful response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: { list: [] } }), { status: 200 })
    );
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.fetchTicker('BTCUSDT')).rejects.toThrow(
      'No ticker data returned for BTCUSDT'
    );
  });

  it('throws when ticker result object has no list property', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: {} }), { status: 200 })
    );
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.fetchTicker('BTCUSDT')).rejects.toThrow(
      'No ticker data returned for BTCUSDT'
    );
  });

  it('throws when time field is 0 and timeSecond is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', time: 0, result: {} }), { status: 200 })
    );
    const client = new BybitRestClient({ fetchFn: mockFetch });

    await expect(client.getServerTime()).rejects.toThrow(
      'Invalid serverTime format in Bybit response'
    );
  });
});
