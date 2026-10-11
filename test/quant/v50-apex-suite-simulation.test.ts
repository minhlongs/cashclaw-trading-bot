import { describe, it, expect } from 'vitest';
import { computeBialkowskiVwap } from '../../src/tree/quantlib/execution/bialkowski-vwap-engine';
import { computeEasleyVpin } from '../../src/tree/quantlib/microstructure/easley-vpin-engine';
import { BinanceWsConnection } from '../../src/tree/exchange/ws/binance-ws-connection';
import { BotInstance } from '../../src/tree/bot/bot-instance';
import { generateTrendingCandles } from '../../src/forest/alpha/integration/fixtures';
import { Killswitch } from '../../src/tree/bot/killswitch';
import type { ExchangeAdapter } from '../../src/tree/exchange/types';
import type { GridBotConfig } from '../../src/tree/bot/types';

describe('Triad v50 Golden Apex Multi-Domain Integration Simulation', () => {
  it('integrates Bialkowski VWAP, Easley VPIN, modular BinanceWsConnection, and BotInstance', () => {
    const candles = generateTrendingCandles(20, 'up');
    expect(candles).toHaveLength(20);

    const trades = candles.map((c) => ({
      size: c.volume,
      priceChange: c.close - c.open,
    }));

    const vpinRes = computeEasleyVpin({
      trades,
      bucketVolume: 100,
      numBuckets: 10,
    });
    expect(vpinRes.totalBuckets).toBeGreaterThan(0);
    expect(vpinRes.vpin).toBeGreaterThanOrEqual(0);

    const vwapRes = computeBialkowskiVwap({
      totalShares: 5000,
      initialPrice: candles[0].open,
      intradayVolumeWeights: [0.2, 0.2, 0.2, 0.2, 0.2],
    });
    expect(vwapRes.schedule).toHaveLength(5);
    expect(vwapRes.effectiveVWAP).toBeGreaterThan(0);

    const ws = new BinanceWsConnection(true);
    expect(ws['baseUrl']).toContain('testnet');

    const killswitch = new Killswitch(
      {
        onHalt: () => {},
        onResume: () => {},
        onOrderPlaced: () => {},
        onOrderFilled: () => {},
        onError: () => {},
      },
      { maxDailyLossPct: 10 },
    );
    const botConfig: GridBotConfig = {
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 1000,
      maxDrawdownPct: 10,
      strategy: 'grid',
      gridSpacingPct: 1,
      gridLevels: 5,
      capitalPerLevelPct: 20,
      takeProfitPct: 5,
      stopLossPct: 5,
      rebalanceOnFill: true,
    };
    const bot = new BotInstance(
      'bot-v50-sim',
      botConfig,
      { exchange: {} as unknown as ExchangeAdapter, killswitch },
      {
        onStateChange: () => {},
        onTrade: () => {},
        onLog: () => {},
        onError: () => {},
      },
    );
    expect(bot.id).toBe('bot-v50-sim');
    expect(bot.getSnapshot().status).toBe('idle');
  });
});
