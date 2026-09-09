import { describe, it, expect } from 'vitest';
import * as BotModule from './index';

describe('bot/index barrel export', () => {
  it('exports core classes and functions', () => {
    expect(BotModule.Killswitch).toBeDefined();
    expect(BotModule.BotInstance).toBeDefined();
    expect(BotModule.BotManager).toBeDefined();
    expect(typeof BotModule.getBotManager).toBe('function');
    expect(typeof BotModule.resetBotManager).toBe('function');
    expect(typeof BotModule.isGridConfig).toBe('function');
    expect(typeof BotModule.isMeanRevConfig).toBe('function');
    expect(typeof BotModule.hasStrategyChain).toBe('function');
    expect(BotModule.GridStrategy).toBeDefined();
    expect(BotModule.MeanRevStrategy).toBeDefined();
    expect(typeof BotModule.buildDefaultChain).toBe('function');
  });
});
