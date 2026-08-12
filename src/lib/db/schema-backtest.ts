// Backtest-specific D1 schema additions
export const SQL_BACKTEST = {
  CREATE_BACKTEST_RESULTS: `
    CREATE TABLE IF NOT EXISTS backtest_results (
      id TEXT PRIMARY KEY,
      bot_id TEXT,
      strategy TEXT NOT NULL,
      pair TEXT NOT NULL,
      exchange TEXT NOT NULL,
      start_date INTEGER NOT NULL,
      end_date INTEGER NOT NULL,
      total_trades INTEGER NOT NULL,
      win_count INTEGER NOT NULL,
      loss_count INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      total_pnl REAL NOT NULL,
      max_drawdown REAL NOT NULL,
      sharpe_ratio REAL,
      params_json TEXT NOT NULL,
      equity_curve_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `,
  CREATE_INDEX_BACKTEST_STRATEGY: `CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy, created_at)`,
};

export const BACKTEST_MIGRATION = `
  ${SQL_BACKTEST.CREATE_BACKTEST_RESULTS};
  ${SQL_BACKTEST.CREATE_INDEX_BACKTEST_STRATEGY};
`;
