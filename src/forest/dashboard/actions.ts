// Forest layer — Server Actions for dashboard data
// Barrel re-export for backward compatibility.
// Actual implementations live in focused submodules.

'use server';

export type { BotCardData, DashboardKpis, DashboardData } from './bot-kpis';
export { getDashboardData, getKpis, getBotCards } from './bot-kpis';
export { getRecentEvents } from './trade-events';
export { getCapitalSnapshots } from './capital-snapshots';
export {
  botActionStart, botActionStop, botActionPause, botActionResume,
  killswitchActionHalt, killswitchActionResume,
} from './bot-actions';
export {
  getBotDetail, getTradeHistory, getAllBots,
  type BotDetailData, type TradeRow,
} from './bot-detail';
export { getExchangeHealth, type ExchangeHealthCard } from './exchange-health';
