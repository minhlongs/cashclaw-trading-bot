// Land layer — Exchange Orchestration
// Wraps PaperExchangeProvider (v1) + CCXT providers (v2) with Killswitch + circuit breakers.

export type { ExchangeOrchestratorDeps } from './orchestrator-types';
export { ExchangeOrchestrator } from './orchestrator-class';
export { getExchangeOrchestrator, resetExchangeOrchestrator } from './orchestrator-singleton';
