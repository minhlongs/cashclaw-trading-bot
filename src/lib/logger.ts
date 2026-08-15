// Centralized structured logger — replaces all console.log/warn/error usage
// Structured logging for production observability

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  module: string;
  action?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

function formatLogEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.context?.module || 'unknown'}]`;
  const action = entry.context?.action ? ` ${entry.context.action}` : '';
  const message = `: ${entry.message}`;

  if (entry.error) {
    return `${base}${action}${message} — ${entry.error.name}: ${entry.error.message}\n${entry.error.stack || ''}`;
  }

  const contextStr = entry.context
    ? ` ${JSON.stringify(Object.fromEntries(
        Object.entries(entry.context).filter(([k]) => k !== 'module' && k !== 'action')
      ))}`
    : '';

  return `${base}${action}${message}${contextStr}`;
}

function timestamp(): string {
  return new Date().toISOString();
}

export function createLogger(moduleName: string) {
  const baseContext: LogContext = { module: moduleName };

  return {
    info: (message: string, ctx?: Partial<LogContext>) => {
      const entry: LogEntry = {
        timestamp: timestamp(),
        level: 'info',
        message,
        context: { ...baseContext, ...ctx },
      };
      // eslint-disable-next-line no-console -- logger is the terminal output layer; console is intentional
      console.log(formatLogEntry(entry));
    },

    warn: (message: string, ctx?: Partial<LogContext>) => {
      const entry: LogEntry = {
        timestamp: timestamp(),
        level: 'warn',
        message,
        context: { ...baseContext, ...ctx },
      };
      // eslint-disable-next-line no-console -- logger is the terminal output layer; console is intentional
      console.warn(formatLogEntry(entry));
    },

    error: (message: string, error?: Error, ctx?: Partial<LogContext>) => {
      const entry: LogEntry = {
        timestamp: timestamp(),
        level: 'error',
        message,
        context: { ...baseContext, ...ctx },
        error: error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
      };
      // eslint-disable-next-line no-console -- logger is the terminal output layer; console is intentional
      console.error(formatLogEntry(entry));
    },

    debug: (message: string, ctx?: Partial<LogContext>) => {
      if (process.env.NODE_ENV === 'development') {
        const entry: LogEntry = {
          timestamp: timestamp(),
          level: 'debug',
          message,
          context: { ...baseContext, ...ctx },
        };
        // eslint-disable-next-line no-console -- logger is the terminal output layer; console is intentional
      console.log(formatLogEntry(entry));
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
