import { describe, it, expect, vi } from 'vitest';
import { TelemetryWriter } from './writer';

describe('TelemetryWriter minimal', () => {
  it('works', () => {
    const deps = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const writer = new TelemetryWriter(deps);
    writer.emit('bot-1', 'start', {});
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});
