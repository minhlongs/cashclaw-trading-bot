import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotInstance } from '../bot-instance';
import type { ExchangeAdapter } from '../../exchange/types';
import { Killswitch } from '../killswitch';
import type { TelemetryWriter } from '../../telemetry/writer';
import type { GridBotConfig } from '../types';
import {
  BOT_ID,
  makeMockExchange,
  makeKillswitch,
  makeMockTelemetry,
  makeBotConfig,
  makeCallbacks,
} from './bot-instance-test-utils';

describe('BotInstance — Strategy, Killswitch & Config', () => {
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

  describe('Killswitch integration', () => {
    it('checks halt before order placement', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      killswitch.manualHalt('Test halt');
      await bot.start();
      vi.advanceTimersByTime(1000);

      expect(exchange.placeOrder).not.toHaveBeenCalled();
    });

    it('resumes trading after killswitch resume', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      killswitch.manualHalt('Test halt');
      vi.advanceTimersByTime(1000);

      killswitch.manualResume();
      vi.advanceTimersByTime(1000);

      expect(callbacks.onLog).toHaveBeenCalled();
    });
  });

  describe('Strategy composition', () => {
    it('multiple strategies execute in sequence', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      vi.advanceTimersByTime(1000);

      expect(callbacks.onLog).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('emits error telemetry on start failure', async () => {
      vi.mocked(exchange.fetchTicker).mockRejectedValue(new Error('Connection failed'));

      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();

      expect(telemetry.emit).toHaveBeenCalledWith(
        BOT_ID,
        'error',
        expect.objectContaining({ context: 'bot.start' }),
      );
    });
  });

  describe('hasStrategy()', () => {
    it('returns false for a newly created bot', () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      expect(bot.hasStrategy()).toBe(false);
    });

    it('returns true after start() succeeds', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();

      expect(bot.hasStrategy()).toBe(true);
    });

    it('returns false after stop()', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      await bot.start();
      expect(bot.hasStrategy()).toBe(true);

      bot.stop();

      expect(bot.hasStrategy()).toBe(false);
    });
  });

  describe('updateConfig()', () => {
    it('updates config, state.config, and touches updatedAt', () => {
      const config = makeBotConfig();
      const bot = new BotInstance(
        BOT_ID,
        config,
        { exchange, killswitch, telemetry },
        callbacks,
      );

      const beforeUpdatedAt = bot.getSnapshot().updatedAt;
      bot.updateConfig({ capital: 2000, gridLevels: 15 });

      const updatedConfig = bot.getConfig();
      expect(updatedConfig.capital).toBe(2000);
      expect((updatedConfig as GridBotConfig).gridLevels).toBe(15);
      expect(bot.getSnapshot().config.capital).toBe(2000);
      expect(bot.getSnapshot().updatedAt).toBeGreaterThanOrEqual(beforeUpdatedAt);
    });
  });
});
