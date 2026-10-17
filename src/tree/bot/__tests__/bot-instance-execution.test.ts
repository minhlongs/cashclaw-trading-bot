import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotInstance } from '../bot-instance';
import type { ExchangeAdapter } from '../../exchange/types';
import { Killswitch } from '../killswitch';
import type { TelemetryWriter } from '../../telemetry/writer';
import {
  makeMockExchange,
  makeKillswitch,
  makeMockTelemetry,
  makeBotConfig,
  makeCallbacks,
} from './bot-instance-test-utils';

describe('BotInstance — Ticks & Snapshots', () => {
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

  describe('tick()', () => {
    it('executes tick cycle without errors', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance('bot-tick-1', config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      vi.advanceTimersByTime(1000);
      expect(bot.getSnapshot().status).toBe('running');
    });

    it('calls fetchTicker during tick', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance('bot-tick-2', config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      vi.clearAllMocks();
      vi.advanceTimersByTime(1000);
      expect(exchange.fetchTicker).toHaveBeenCalled();
    });
  });

  describe('getSnapshot()', () => {
    it('returns current state copy', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance('bot-snap-1', config, { exchange, killswitch, telemetry }, callbacks);
      const snapshot1 = bot.getSnapshot();
      const snapshot2 = bot.getSnapshot();
      expect(snapshot1).toEqual(snapshot2);
      expect(snapshot1).not.toBe(snapshot2);
    });

    it('includes all required fields', () => {
      const config = makeBotConfig();
      const bot = new BotInstance('bot-snap-2', config, { exchange, killswitch, telemetry }, callbacks);
      const snapshot = bot.getSnapshot();
      expect(snapshot).toHaveProperty('id');
      expect(snapshot).toHaveProperty('status');
      expect(snapshot).toHaveProperty('config');
      expect(snapshot).toHaveProperty('error');
      expect(snapshot).toHaveProperty('totalTrades');
    });
  });

  describe('State management', () => {
    it('updates state timestamp on tick', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance('bot-state-1', config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      vi.advanceTimersByTime(1000);
      const state = bot.getSnapshot();
      expect(state.lastTickAt).toBeDefined();
      expect(state.updatedAt).toBeDefined();
    });

    it('maintains state consistency after multiple ticks', async () => {
      const config = makeBotConfig();
      const bot = new BotInstance('bot-state-2', config, { exchange, killswitch, telemetry }, callbacks);
      await bot.start();
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);
      const state = bot.getSnapshot();
      expect(state.status).toBe('running');
      expect(state.error).toBeNull();
    });
  });
});
