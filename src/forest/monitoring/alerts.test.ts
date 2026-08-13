import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitAlert, getAlerts, getAlertsByLevel, clearAlerts, onAlert } from './alerts';

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('alerts', () => {
  beforeEach(() => {
    clearAlerts();
    vi.clearAllMocks();
  });

  describe('emitAlert', () => {
    it('creates alert with correct structure', () => {
      const alert = emitAlert('error', 'Test error', 'test-module', { key: 'value' });

      expect(alert).toMatchObject({
        id: expect.stringMatching(/^alert_/),
        level: 'error',
        message: 'Test error',
        context: 'test-module',
        timestamp: expect.any(Number),
        data: { key: 'value' },
      });
    });

    it('stores alerts in memory', () => {
      emitAlert('error', 'Alert 1', 'test');
      emitAlert('warning', 'Alert 2', 'test');

      const all = getAlerts();
      expect(all).toHaveLength(2);
      expect(all[0].message).toBe('Alert 1');
      expect(all[1].message).toBe('Alert 2');
    });
  });

  describe('getAlerts', () => {
    it('returns alerts in correct order', () => {
      emitAlert('error', 'First', 'test');
      emitAlert('warning', 'Second', 'test');
      emitAlert('critical', 'Third', 'test');

      const all = getAlerts();
      expect(all[0].message).toBe('First');
      expect(all[1].message).toBe('Second');
      expect(all[2].message).toBe('Third');
    });

    it('respects limit parameter', () => {
      emitAlert('error', '1', 'test');
      emitAlert('error', '2', 'test');
      emitAlert('error', '3', 'test');

      const limited = getAlerts(2);
      expect(limited).toHaveLength(2);
      expect(limited[0].message).toBe('2');
      expect(limited[1].message).toBe('3');
    });

    it('returns empty array when no alerts', () => {
      expect(getAlerts()).toEqual([]);
    });
  });

  describe('getAlertsByLevel', () => {
    it('filters alerts by level', () => {
      emitAlert('error', 'Error 1', 'test');
      emitAlert('warning', 'Warning', 'test');
      emitAlert('error', 'Error 2', 'test');

      const errors = getAlertsByLevel('error');
      expect(errors).toHaveLength(2);
      expect(errors.every(a => a.level === 'error')).toBe(true);
    });

    it('returns empty array for non-existent level', () => {
      emitAlert('info', 'Info', 'test');
      expect(getAlertsByLevel('critical')).toEqual([]);
    });
  });

  describe('clearAlerts', () => {
    it('clears all alerts', () => {
      emitAlert('error', '1', 'test');
      emitAlert('warning', '2', 'test');
      clearAlerts();

      expect(getAlerts()).toEqual([]);
    });
  });

  describe('onAlert', () => {
    it('notifies handler on alert', () => {
      const handler = vi.fn();
      onAlert(handler);

      emitAlert('error', 'Test', 'test');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Test' }),
      );
    });

    it('returns unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = onAlert(handler);

      emitAlert('error', 'Before', 'test');
      expect(handler).toHaveBeenCalledOnce();

      unsub();
      emitAlert('error', 'After', 'test');
      expect(handler).toHaveBeenCalledOnce(); // still 1
    });

    it('does not throw when handler fails', () => {
      onAlert(() => {
        throw new Error('handler crash');
      });

      expect(() => {
        emitAlert('critical', 'Alert', 'test');
      }).not.toThrow();
    });
  });
});
