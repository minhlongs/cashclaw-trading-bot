// Core type definitions — runtime, domain entities, telemetry, strategy & backtest.
// Facade re-exports for 100% backward compatibility across all consumers.

export type {
  KVNamespace,
  D1PreparedStatement,
  D1Database,
  Env,
} from './types-runtime';

export type {
  User,
  SettingsRow,
  Bot,
} from './types-entities';

export type {
  Trade,
  ApiCredential,
  TradeEvent,
  CapitalSnapshot,
  AuditLog,
} from './types-telemetry';

export type {
  GridConfig,
  MeanRevConfig,
  StrategyConfig,
  ParsedGridConfig,
  ParsedMeanRevConfig,
  ParsedStrategyConfig,
  BacktestResultRow,
} from './types-strategy';
