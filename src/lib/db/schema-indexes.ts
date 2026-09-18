/**
 * D1 Database Schema — Index DDL Definitions
 */

export const SQL_INDEXES = {
  CREATE_INDEX_EVENTS_BOT_TIME: 'CREATE INDEX IF NOT EXISTS idx_events_bot_time ON trade_events(bot_id, created_at)',
  CREATE_INDEX_SNAPSHOTS_BOT: 'CREATE INDEX IF NOT EXISTS idx_snapshots_bot ON capital_snapshots(bot_id, created_at)',
  CREATE_INDEX_USER_AUDIT: 'CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at)',
  CREATE_INDEX_BOT_AUDIT: 'CREATE INDEX IF NOT EXISTS idx_audit_bot ON audit_log(bot_id, created_at)',
  CREATE_INDEX_AUDIT_LEDGER_CREATED: 'CREATE INDEX IF NOT EXISTS idx_audit_ledger_created ON audit_ledger(created_at)',
  CREATE_INDEX_BOT_USER: 'CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id)',
  CREATE_INDEX_TRADES_BOT: 'CREATE INDEX IF NOT EXISTS idx_trades_bot ON trades(bot_id, opened_at)',
  CREATE_INDEX_BACKTEST_BOT: 'CREATE INDEX IF NOT EXISTS idx_backtest_bot ON backtest_results(bot_id, created_at)',
};
