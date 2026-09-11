import { describe, expect, it, vi } from 'vitest';
import { OkxRestClient } from './okx-rest-client';

describe('OkxRestClient Error Handling', () => {
  it('throws structured error when code is not 0 in 200 OK response', async () => {
    const errorBody = { code: '50001', msg: 'Service temporarily unavailable', data: [] };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 200 })
    );
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'OKX REST error [code: 50001]: Service temporarily unavailable'
    );
  });

  it('parses structured JSON error on HTTP 400 with code and msg', async () => {
    const errorBody = { code: '51001', msg: 'Instrument ID does not exist' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 400 })
    );
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.fetchTicker('UNKNOWN-PAIR')).rejects.toThrow(
      'OKX REST 400 on /api/v5/market/ticker?instId=UNKNOWN-PAIR [code: 51001]: Instrument ID does not exist'
    );
  });

  it('parses JSON error on HTTP 500 with msg but no code', async () => {
    const errorBody = { msg: 'Internal server failure' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 500 })
    );
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'OKX REST 500 on /api/v5/system/status [code: unknown]: Internal server failure'
    );
  });

  it('parses JSON error on HTTP 400 without msg property', async () => {
    const errorBody = { error: 'Bad Request' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), { status: 400 })
    );
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'OKX REST 400 on /api/v5/system/status: {"error":"Bad Request"}'
    );
  });

  it('falls back to raw text when JSON parsing fails on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 })
    );
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow(
      'OKX REST 502 on /api/v5/system/status: <html>502 Bad Gateway</html>'
    );
  });

  it('handles empty response body on HTTP error gracefully', async () => {
    const emptyResponse = {
      ok: false,
      status: 500,
      text: async () => '',
    } as unknown as Response;

    const mockFetch = vi.fn().mockResolvedValue(emptyResponse);
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow('OKX REST 500 on /api/v5/system/status');
  });

  it('handles stream read failure on HTTP error gracefully', async () => {
    const failingResponse = {
      ok: false,
      status: 503,
      text: async () => {
        throw new Error('Connection reset');
      },
    } as unknown as Response;

    const mockFetch = vi.fn().mockResolvedValue(failingResponse);
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.ping()).rejects.toThrow('OKX REST 503 on /api/v5/system/status');
  });

  it('throws when ticker data array is empty in successful response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: '0', msg: '', data: [] }), { status: 200 })
    );
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.fetchTicker('BTC-USDT')).rejects.toThrow(
      'No ticker data returned for BTC-USDT'
    );
  });

  it('throws when serverTime data array is empty in successful response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: '0', msg: '', data: [] }), { status: 200 })
    );
    const client = new OkxRestClient({ fetchFn: mockFetch });

    await expect(client.getServerTime()).rejects.toThrow(
      'Invalid serverTime format in OKX response'
    );
  });
});
