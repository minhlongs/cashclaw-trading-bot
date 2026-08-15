import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatUptime,
  formatPnl,
  timeAgo,
  formatTimestamp,
  levelColors,
  levelBadges,
  type HealthResponse,
  type MetricsResponse,
  type KillswitchResponse,
  type Alert,
  type MonitoringData,
} from './monitoring-types';

/* ------------------------------------------------------------------ */
/*  formatUptime                                                       */
/* ------------------------------------------------------------------ */
describe('formatUptime', () => {
  it('returns minutes only when zero hours', () => {
    expect(formatUptime(0)).toBe('0m');
  });

  it('formats minutes without rounding up', () => {
    expect(formatUptime(90)).toBe('1m');
  });

  it('formats hours and minutes', () => {
    expect(formatUptime(3600)).toBe('1h 0m');
  });

  it('formats hours and remaining minutes', () => {
    expect(formatUptime(3660)).toBe('1h 1m');
  });

  it('formats large uptime values', () => {
    expect(formatUptime(86400)).toBe('24h 0m');
  });

  it('formats sub-minute values as 0m', () => {
    expect(formatUptime(59)).toBe('0m');
  });
});

/* ------------------------------------------------------------------ */
/*  formatPnl                                                          */
/* ------------------------------------------------------------------ */
describe('formatPnl', () => {
  it('formats zero with plus sign', () => {
    expect(formatPnl(0)).toBe('+$0.00');
  });

  it('formats positive values with plus sign', () => {
    expect(formatPnl(123.456)).toBe('+$123.46');
  });

  // NOTE: negative values currently lose their sign entirely — `Math.abs()` strips
  // the minus and the sign prefix is '' for negatives. A loss renders as "$50.10",
  // visually indistinguishable from an unsigned amount. Asserting actual behavior;
  // see the bug note in the test report.
  it('drops the minus sign on negative values', () => {
    expect(formatPnl(-50.1)).toBe('$50.10');
  });

  it('drops the minus sign on large negative values', () => {
    expect(formatPnl(-12345.678)).toBe('$12345.68');
  });

  it('distinguishes positive from negative only by the plus prefix', () => {
    expect(formatPnl(50.1)).toBe('+$50.10');
    expect(formatPnl(-50.1)).toBe('$50.10');
  });
});

/* ------------------------------------------------------------------ */
/*  timeAgo                                                            */
/* ------------------------------------------------------------------ */
describe('timeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns seconds ago for recent timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(timeAgo(Date.now() - 30_000)).toBe('30s ago');
  });

  it('returns minutes ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(timeAgo(Date.now() - 120_000)).toBe('2m ago');
  });

  it('returns hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(timeAgo(Date.now() - 7_200_000)).toBe('2h ago');
  });

  it('returns days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(timeAgo(Date.now() - 172_800_000)).toBe('2d ago');
  });

  it('returns 0s ago for exact now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(timeAgo(Date.now())).toBe('0s ago');
  });
});

/* ------------------------------------------------------------------ */
/*  formatTimestamp                                                    */
/* ------------------------------------------------------------------ */
describe('formatTimestamp', () => {
  it('formats a timestamp to Vietnamese locale time string', () => {
    const ts = new Date('2026-08-15T14:30:45Z').getTime();
    const result = formatTimestamp(ts);
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

/* ------------------------------------------------------------------ */
/*  levelColors                                                        */
/* ------------------------------------------------------------------ */
describe('levelColors', () => {
  it('has a color for every alert level', () => {
    expect(levelColors.info).toBe('var(--text-secondary)');
    expect(levelColors.warning).toBe('var(--color-warning)');
    expect(levelColors.error).toBe('var(--color-loss)');
    expect(levelColors.critical).toBe('#FF0040');
  });
});

/* ------------------------------------------------------------------ */
/*  levelBadges                                                        */
/* ------------------------------------------------------------------ */
describe('levelBadges', () => {
  it('has a badge class for every alert level', () => {
    expect(levelBadges.info).toBe('badge-neutral');
    expect(levelBadges.warning).toBe('badge-warning');
    expect(levelBadges.error).toBe('badge-error');
    expect(levelBadges.critical).toBe('badge-error');
  });
});

/* ------------------------------------------------------------------ */
/*  Type exports (compile-time check)                                  */
/* ------------------------------------------------------------------ */
describe('type exports', () => {
  it('HealthResponse has expected shape', () => {
    const h: HealthResponse = {
      status: 'ok',
      timestamp: 0,
      version: '1.0.0',
      environment: 'production',
    };
    expect(h.status).toBe('ok');
  });

  it('MetricsResponse has expected shape', () => {
    const m: MetricsResponse = {
      bots: { total: 0, running: 0, paused: 0 },
      performance: {
        totalPnl: 0,
        winRate: 0,
        totalTrades: 0,
        totalWins: 0,
        totalLosses: 0,
      },
      uptime: 0,
      timestamp: 0,
    };
    expect(m.bots.total).toBe(0);
  });

  it('KillswitchResponse has expected shape', () => {
    const k: KillswitchResponse = {
      enabled: true,
      halted: false,
      haltReason: null,
      haltedAt: null,
      dailyPnl: 0,
      consecutiveLosses: 0,
      currentDrawdown: 0,
      timestamp: 0,
    };
    expect(k.enabled).toBe(true);
  });

  it('Alert has expected shape', () => {
    const a: Alert = {
      id: '1',
      level: 'info',
      message: 'test',
      timestamp: 0,
    };
    expect(a.level).toBe('info');
  });

  it('MonitoringData has expected shape', () => {
    const d: MonitoringData = {
      health: { status: 'ok', timestamp: 0, version: '1', environment: 'prod' },
      metrics: {
        bots: { total: 0, running: 0, paused: 0 },
        performance: { totalPnl: 0, winRate: 0, totalTrades: 0, totalWins: 0, totalLosses: 0 },
        uptime: 0,
        timestamp: 0,
      },
      killswitch: {
        enabled: true,
        halted: false,
        haltReason: null,
        haltedAt: null,
        dailyPnl: 0,
        consecutiveLosses: 0,
        currentDrawdown: 0,
        timestamp: 0,
      },
      alerts: [],
    };
    expect(d.alerts).toHaveLength(0);
  });
});
