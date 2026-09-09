import { describe, it, expect } from 'vitest';
import { toD1Status } from './bot-manager-types';

describe('bot-manager-types toD1Status', () => {
  it('maps all BotStatus values to D1BotStatus correctly', () => {
    expect(toD1Status('running')).toBe('paper_test');
    expect(toD1Status('paused')).toBe('paused');
    expect(toD1Status('stopped')).toBe('stopped');
    expect(toD1Status('error')).toBe('error');
    expect(toD1Status('idle')).toBe('draft');
  });
});
