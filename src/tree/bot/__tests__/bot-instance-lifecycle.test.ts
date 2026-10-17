import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotInstance } from '../bot-instance';
import type { ExchangeAdapter } from '../../exchange/types';
import { Killswitch } from '../killswitch';
import type { TelemetryWriter } from '../../telemetry/writer';
import {
  SYMBOL,
  BOT_ID,
  makeMockExchange,
  makeKillswitch,
  makeMockTelemetry,
  makeBotConfig,
  makeCallbacks,
} from './bot-instance-test-utils';

describe('BotInstance — Lifecycle (Init, Start, Stop, Destroy)', () => {
  let exchange: ExchangeAdapter;
  let killswitch: Killswitch;
  let telemetry: TelemetryWriter;
  let callbacks: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    vi.useFakeTimers();
    exchange = makeMockExchange();
    killswitch = makeKillswitch();
    telemetry = makeMockTelemetry();
    callbacks = makeCallbacks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('creates instance with correct initial state (status=idle)', () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      const state = bot.getSnapshot();
      expect(state.id).toBe(BOT_ID);
      expect(state.status).toBe('idle');
      expect(state.config).toEqual(config);
      expect(state.totalTrades).toBe(0);
      expect(state.error).toBeNull();
    });

    it('registers with killswitch on construction', () => {
      const config = makeBotConfig({ capital: 2000 });
      new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      expect(killswitch['botStates'].has(BOT_ID)).toBe(true);
    });
  });

  describe('start()', () => {
    it('sets status to running and calls strategy init', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      expect(bot.getSnapshot().status).toBe('running');
    });

    it('fetches ticker before first tick', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      expect(exchange.fetchTicker).toHaveBeenCalledWith(SYMBOL);
    });

    it('starts tick interval', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      vi.advanceTimersByTime(1000);
      expect(callbacks.onLog).toHaveBeenCalled();
    });

    it('emits telemetry start event', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      expect(telemetry.emit).toHaveBeenCalledWith(BOT_ID, 'start', expect.objectContaining({ symbol: SYMBOL }));
    });

    it('sets error state on start failure', async () => {
      vi.mocked(exchange.fetchTicker).mockRejectedValue(new Error('Network error'));
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      expect(bot.getSnapshot().status).toBe('error');
      expect(bot.getSnapshot().error).toBe('Network error');
    });
  });

  describe('stop()', () => {
    it('sets status to stopped and clears interval', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      bot.stop();
      expect(bot.getSnapshot().status).toBe('stopped');
    });

    it('emits telemetry stop event', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      vi.clearAllMocks();
      bot.stop();
      expect(telemetry.emit).toHaveBeenCalledWith(BOT_ID, 'stop', expect.any(Object));
    });
  });

  describe('destroy()', () => {
    it('stops bot and unregisters from killswitch', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      bot.destroy();
      expect(bot.getSnapshot().status).toBe('stopped');
      expect(killswitch['botStates'].has(BOT_ID)).toBe(false);
    });

    it('can be called multiple times safely', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(BOT_ID, config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      bot.destroy();
      bot.destroy();
      expect(bot.getSnapshot().status).toBe('stopped');
    });
  });
});
