import ccxt, { type Exchange as CCXTExchange } from 'ccxt';
import type { CCXTConfig, ExchangeConstructors } from './client-types';

export function createExchangeInstance(config: CCXTConfig): CCXTExchange {
  const name = config.exchange.charAt(0).toUpperCase() + config.exchange.slice(1);
  const namespace = ccxt as unknown as ExchangeConstructors;
  const ExchangeClass = namespace[name];
  if (!ExchangeClass) throw new Error(`Unsupported exchange: ${config.exchange}`);

  return new ExchangeClass({
    apiKey: config.apiKey || '',
    secret: config.apiSecret || '',
    password: config.password,
    sandbox: config.sandbox,
    enableRateLimit: true,
  });
}
