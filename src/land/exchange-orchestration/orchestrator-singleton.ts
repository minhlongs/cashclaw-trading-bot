import { ExchangeOrchestrator } from './orchestrator-class';
import type { ExchangeOrchestratorDeps } from './orchestrator-types';

let orchestrator: ExchangeOrchestrator | null = null;

export function getExchangeOrchestrator(deps?: ExchangeOrchestratorDeps): ExchangeOrchestrator {
  if (!orchestrator) orchestrator = new ExchangeOrchestrator(deps);
  return orchestrator;
}

export function resetExchangeOrchestrator(): void {
  orchestrator?.destroy();
  orchestrator = null;
}
