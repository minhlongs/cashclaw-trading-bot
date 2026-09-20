// Research Contracts — Phase 1 public API barrel.
// Re-exports all research-domain contracts for downstream adapters
// (AlphaZooAdapter, ResearchWorkerAdapter, MCPResearchAdapter).

export * from './research-core-exports';
export * from './research-zoo-exports';

// TradingAgents deliberation layer — fail-closed contracts for untrusted
// multi-agent output (decision proposals, debate, risk, calibration).
export * from './tradingagents';
