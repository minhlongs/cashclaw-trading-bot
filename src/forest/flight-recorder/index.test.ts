import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

import { FlightRecorder, getFlightRecorder, resetFlightRecorder } from './index';
import { createServerClient } from '@/lib/db/client';

beforeEach(() => {
  vi.restoreAllMocks();
  resetFlightRecorder();
  vi.mocked(createServerClient).mockReset();
});

describe('getFlightRecorder', () => {
  it('returns same instance on repeated calls', () => {
    const first = getFlightRecorder();
    const second = getFlightRecorder();
    expect(first).toBe(second);
  });

  it('returns FlightRecorder instance', () => {
    const recorder = getFlightRecorder();
    expect(recorder).toBeInstanceOf(FlightRecorder);
  });
});

describe('resetFlightRecorder', () => {
  it('allows creation of fresh instance', () => {
    const first = getFlightRecorder();
    resetFlightRecorder();
    const second = getFlightRecorder();
    expect(first).not.toBe(second);
  });

  it('resets singleton so next call creates new instance', () => {
    const before = getFlightRecorder();
    resetFlightRecorder();
    const after = getFlightRecorder();
    expect(after).toBeInstanceOf(FlightRecorder);
    expect(before).not.toBe(after);
  });
});
