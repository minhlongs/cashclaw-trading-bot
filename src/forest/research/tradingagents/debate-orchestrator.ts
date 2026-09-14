// Debate Orchestrator — Facade re-exporting types, prompt helpers, and engine.
// Preserves backward compatibility and Vitest module mocking seams.

import { runDebateOrchestrator } from './debate-orchestrator-impl';

export * from './debate-orchestrator-types';
export { formatDebatePrompt } from './debate-orchestrator-prompts';
export { runDebateOrchestrator };

export const evaluateTradingDebate = runDebateOrchestrator;
