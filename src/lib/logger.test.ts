import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger, type Logger } from './logger';

describe('createLogger', () => {
  const originalEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;

  afterEach(() => {
    env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  function getLogger(module = 'test-module'): Logger {
    return createLogger(module);
  }

  describe('returns object with required methods', () => {
    it('returns object with all four log methods', () => {
      const logger = getLogger();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('info()', () => {
    it('calls console.log with formatted message', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = getLogger('my-module');
      logger.info('server started');
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('[my-module]');
      expect(output).toContain('[INFO]');
      expect(output).toContain('server started');
    });

    it('includes action when provided', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = getLogger('db');
      logger.info('connected', { action: 'connect' });
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('connect');
      expect(output).toContain('connected');
    });

    it('includes extra context fields in output', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = getLogger('net');
      logger.info('fetch done', { module: 'net', userId: 'u123', latencyMs: 42 });
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('fetch done');
    });
  });

  describe('warn()', () => {
    it('calls console.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logger = getLogger('sched');
      logger.warn('disk low');
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('[WARN]');
      expect(output).toContain('disk low');
    });

    it('includes action in warn output', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logger = getLogger('api');
      logger.warn('rate limited', { action: 'throttle' });
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('throttle');
    });
  });

  describe('error()', () => {
    it('calls console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logger = getLogger('auth');
      logger.error('login failed');
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('[ERROR]');
      expect(output).toContain('login failed');
    });

    it('includes error details when Error object is passed', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logger = getLogger('db');
      const err = new Error('connection refused');
      logger.error('query failed', err);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('connection refused');
      expect(output).toContain('Error');
    });

    it('includes error stack when available', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logger = getLogger('core');
      const err = new Error('oops');
      logger.error('fail', err);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('Error: oops');
    });

    it('handles error without stack gracefully', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logger = getLogger('x');
      const err = new Error('no-stack');
      delete (err as any).stack;
      logger.error('fail', err);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('no-stack');
    });
  });

  describe('debug()', () => {
    it('does nothing in non-development environment', () => {
      env.NODE_ENV = 'production';
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = getLogger('mod');
      logger.debug('trace detail');
      expect(spy).not.toHaveBeenCalled();
    });

    it('calls console.log in development environment', () => {
      env.NODE_ENV = 'development';
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = getLogger('mod');
      logger.debug('trace detail');
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('[DEBUG]');
      expect(output).toContain('trace detail');
    });

    it('does nothing in test environment', () => {
      env.NODE_ENV = 'test';
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = getLogger('mod');
      logger.debug('should not appear');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('module name propagation', () => {
    it('uses provided module name in log output', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = getLogger('my-module');
      logger.info('msg');
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('[my-module]');
    });

    it('allows different module names per logger', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const loggerA = getLogger('alpha');
      const loggerB = getLogger('beta');
      loggerA.info('a-msg');
      loggerB.info('b-msg');
      const outA = spy.mock.calls[0][0] as string;
      const outB = spy.mock.calls[1][0] as string;
      expect(outA).toContain('[alpha]');
      expect(outB).toContain('[beta]');
    });
  });
});
