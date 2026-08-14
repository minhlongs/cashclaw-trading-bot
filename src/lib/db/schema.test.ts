import { describe, it, expect } from 'vitest';
import { SQL, MIGRATION } from './schema';

describe('SQL object structure', () => {
  it('exports all CREATE TABLE statements', () => {
    const tableKeys = Object.keys(SQL).filter((k) => k.startsWith('CREATE_'));
    expect(tableKeys).toContain('CREATE_USERS');
    expect(tableKeys).toContain('CREATE_BOTS');
    expect(tableKeys).toContain('CREATE_TRADES');
    expect(tableKeys).toContain('CREATE_CREDENTIALS');
    expect(tableKeys).toContain('CREATE_TRADE_EVENTS');
    expect(tableKeys).toContain('CREATE_CAPITAL_SNAPSHOTS');
    expect(tableKeys).toContain('CREATE_AUDIT_LOG');
    expect(tableKeys).toContain('CREATE_BACKTEST_RESULTS');
  });

  it('exports all CREATE INDEX statements', () => {
    const indexKeys = Object.keys(SQL).filter((k) => k.startsWith('CREATE_INDEX_'));
    expect(indexKeys).toContain('CREATE_INDEX_USER_AUDIT');
    expect(indexKeys).toContain('CREATE_INDEX_BOT_AUDIT');
    expect(indexKeys).toContain('CREATE_INDEX_BOT_USER');
    expect(indexKeys).toContain('CREATE_INDEX_TRADES_BOT');
    expect(indexKeys).toContain('CREATE_INDEX_EVENTS_BOT_TIME');
    expect(indexKeys).toContain('CREATE_INDEX_SNAPSHOTS_BOT');
    expect(indexKeys).toContain('CREATE_INDEX_BACKTEST_BOT');
  });

  it('has exactly 15 SQL statements total', () => {
    expect(Object.keys(SQL)).toHaveLength(15);
  });
});

describe('SQL CREATE TABLE content', () => {
  it('users table has id as PRIMARY KEY', () => {
    expect(SQL.CREATE_USERS).toContain('id TEXT PRIMARY KEY');
  });

  it('users table has unique email', () => {
    expect(SQL.CREATE_USERS).toContain('email TEXT UNIQUE NOT NULL');
  });

  it('users table defaults locale to vi', () => {
    expect(SQL.CREATE_USERS).toContain("locale TEXT DEFAULT 'vi'");
  });

  it('bots table restricts strategy via CHECK', () => {
    expect(SQL.CREATE_BOTS).toContain(
      "CHECK (strategy IN ('grid', 'mean_reversion'))",
    );
  });

  it('bots table restricts exchange via CHECK', () => {
    expect(SQL.CREATE_BOTS).toContain(
      "CHECK (exchange IN ('binance', 'bybit', 'okx'))",
    );
  });

  it('bots table restricts status via CHECK with all 6 values', () => {
    expect(SQL.CREATE_BOTS).toContain(
      "CHECK (status IN ('draft', 'paper_test', 'live_running', 'paused', 'error', 'stopped'))",
    );
  });

  it('trades table restricts side to buy/sell', () => {
    expect(SQL.CREATE_TRADES).toContain(
      "CHECK (side IN ('buy', 'sell'))",
    );
  });

  it('trades table restricts status with 4 values', () => {
    expect(SQL.CREATE_TRADES).toContain(
      "CHECK (status IN ('open', 'filled', 'cancelled', 'failed'))",
    );
  });

  it('trade_events table restricts event_type with 12 values', () => {
    const expected = [
      'tick', 'fill', 'signal', 'error', 'halt', 'resume',
      'start', 'stop', 'pause', 'config_change', 'rebalance', 'metric_snapshot',
    ];
    for (const evt of expected) {
      expect(SQL.CREATE_TRADE_EVENTS).toContain(`'${evt}'`);
    }
  });

  it('backtest_results has sharpe_ratio and equity_curve_json', () => {
    expect(SQL.CREATE_BACKTEST_RESULTS).toContain('sharpe_ratio REAL');
    expect(SQL.CREATE_BACKTEST_RESULTS).toContain('equity_curve_json TEXT');
  });

  it('every CREATE TABLE uses CREATE TABLE IF NOT EXISTS', () => {
    const tableStatements = [
      SQL.CREATE_USERS, SQL.CREATE_BOTS, SQL.CREATE_TRADES,
      SQL.CREATE_CREDENTIALS, SQL.CREATE_TRADE_EVENTS,
      SQL.CREATE_CAPITAL_SNAPSHOTS, SQL.CREATE_AUDIT_LOG,
      SQL.CREATE_BACKTEST_RESULTS,
    ];
    for (const stmt of tableStatements) {
      expect(stmt).toContain('CREATE TABLE IF NOT EXISTS');
    }
  });
});

describe('SQL CREATE INDEX content', () => {
  it('every index uses CREATE INDEX IF NOT EXISTS', () => {
    const indexStatements = [
      SQL.CREATE_INDEX_USER_AUDIT, SQL.CREATE_INDEX_BOT_AUDIT,
      SQL.CREATE_INDEX_BOT_USER, SQL.CREATE_INDEX_TRADES_BOT,
      SQL.CREATE_INDEX_EVENTS_BOT_TIME, SQL.CREATE_INDEX_SNAPSHOTS_BOT,
      SQL.CREATE_INDEX_BACKTEST_BOT,
    ];
    for (const stmt of indexStatements) {
      expect(stmt).toContain('CREATE INDEX IF NOT EXISTS');
    }
  });

  it('index on audit_log references user_id and created_at', () => {
    expect(SQL.CREATE_INDEX_USER_AUDIT).toContain('audit_log(user_id, created_at)');
  });

  it('index on bots references user_id', () => {
    expect(SQL.CREATE_INDEX_BOT_USER).toContain('bots(user_id)');
  });

  it('index on trades references bot_id and opened_at', () => {
    expect(SQL.CREATE_INDEX_TRADES_BOT).toContain('trades(bot_id, opened_at)');
  });
});

describe('MIGRATION string', () => {
  it('is a non-empty string', () => {
    expect(typeof MIGRATION).toBe('string');
    expect(MIGRATION.length).toBeGreaterThan(0);
  });

  it('contains all 8 CREATE TABLE statements', () => {
    const tableNames = [
      'users', 'bots', 'trades', 'api_credentials',
      'trade_events', 'capital_snapshots', 'audit_log', 'backtest_results',
    ];
    for (const name of tableNames) {
      expect(MIGRATION).toContain(`CREATE TABLE IF NOT EXISTS ${name}`);
    }
  });

  it('contains all 7 CREATE INDEX statements', () => {
    expect(MIGRATION).toContain('idx_audit_user');
    expect(MIGRATION).toContain('idx_audit_bot');
    expect(MIGRATION).toContain('idx_bots_user');
    expect(MIGRATION).toContain('idx_trades_bot');
    expect(MIGRATION).toContain('idx_events_bot_time');
    expect(MIGRATION).toContain('idx_snapshots_bot');
    expect(MIGRATION).toContain('idx_backtest_bot');
  });

  it('MIGRATION includes every individual SQL value', () => {
    for (const key of Object.keys(SQL)) {
      const value = SQL[key as keyof typeof SQL];
      expect(MIGRATION).toContain(value.trim());
    }
  });
});
