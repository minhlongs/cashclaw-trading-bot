import { describe, expect, it } from 'vitest';
import { computeKratzSchonebornExecution } from '@/tree/quantlib/execution/kratz-schoneborn-engine';
import { computeBiaisHillionSpattMicrostructure } from '@/tree/quantlib/microstructure/biais-hillion-spatt-engine';
import { BybitRestClient } from '@/tree/exchange/direct/bybit-rest-client';
import { normalizeTicker } from '@/tree/exchange/direct/ticker-normalizer';
import type { Binance24hrTicker, OkxTicker, BybitTicker } from '@/tree/exchange/direct/types';

describe('Triad v35 Apex Multi-Domain Quantitative & Architecture Suite Simulation', () => {
  it('integrates Kratz-Schöneborn liquidation, Biais-Hillion-Spatt dynamics & modular direct REST normalizers', async () => {
    // 1. Kratz-Schöneborn (2014) Dark Pool Liquidation
    const darkExec = computeKratzSchonebornExecution({
      initialInventory: 1000,
      initialPrice: 50000,
      timeHorizon: 1.0,
      numSteps: 4,
      litTemporaryImpact: 0.02,
      litPermanentImpact: 0.01,
      darkArrivalRate: 3.0,
      darkFillProbability: 0.75,
    });
    expect(darkExec.terminalInventory).toBe(0);
    expect(darkExec.trajectory.length).toBe(4);
    expect(darkExec.darkCaptureRatio).toBeGreaterThan(0);
    expect(darkExec.costSavingsVsPureLitBps).toBeGreaterThan(0);

    // 2. Biais-Hillion-Spatt (1995) Order Flow Dynamics
    const flow = computeBiaisHillionSpattMicrostructure({
      spreadTicks: 5,
      bidDepth: 200,
      askDepth: 250,
      baseArrivalRate: 50,
      spreadSensitivity: 0.4,
      depthSensitivity: 0.15,
    });
    expect(flow.probLimitOrderAtTouch).toBeGreaterThan(0);
    expect(flow.probLimitOrderAtTouch + flow.probMarketOrder + flow.probCancellation).toBeCloseTo(1.0, 5);
    expect(flow.liquidityReplenishmentRate).toBeGreaterThan(0);
    expect(flow.spreadWideningRisk).toBeGreaterThan(0);

    // 3. Bybit REST Client Modular Architecture
    const mockFetch = async () =>
      new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', result: { list: [{ symbol: 'BTCUSDT', lastPrice: '50000', bid1Price: '49995', ask1Price: '50005', highPrice24h: '51000', lowPrice24h: '49000', volume24h: '1200' }] } }));
    const client = new BybitRestClient({ baseUrl: 'https://api.bybit.com', fetchFn: mockFetch as typeof fetch });
    const ticker = await client.fetchTicker('spot', 'BTCUSDT');
    expect(ticker.symbol).toBe('BTCUSDT');
    expect(ticker.lastPrice).toBe('50000');

    // 4. Normalized Tickers Across Exchanges
    const rawBinance: Binance24hrTicker = { symbol: 'BTCUSDT', lastPrice: '50000', bidPrice: '49995', askPrice: '50005', highPrice: '51000', lowPrice: '49000', volume: '1000', quoteVolume: '50000000', closeTime: 1700000000000 };
    const rawOkx: OkxTicker = { instId: 'BTC-USDT', last: '50000', bidPx: '49995', askPx: '50005', high24h: '51000', low24h: '49000', vol24h: '1000', volCcy24h: '50000000', ts: '1700000000000' };
    const rawBybit: BybitTicker = { symbol: 'BTCUSDT', lastPrice: '50000', bid1Price: '49995', ask1Price: '50005', highPrice24h: '51000', lowPrice24h: '49000', volume24h: '1000', turnover24h: '50000000' };

    const normBinance = normalizeTicker('binance', rawBinance);
    const normOkx = normalizeTicker('okx', rawOkx);
    const normBybit = normalizeTicker('bybit', rawBybit);

    expect(normBinance.last).toBe(50000);
    expect(normOkx.last).toBe(50000);
    expect(normBybit.last).toBe(50000);
  });
});
