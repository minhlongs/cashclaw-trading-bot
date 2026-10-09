import { z } from 'zod';
import { AgentValidationError } from './agent-validation-matcher';
import type { ResearchLLMProvider } from './types';

export { AgentValidationError };
export class ResearchAgentError extends Error { constructor(m: string) { super(m); this.name = 'ResearchAgentError'; } }
export class FalsificationGuardError extends ResearchAgentError { constructor(m: string) { super(m); this.name = 'FalsificationGuardError'; } }
export class NonCausalFeatureError extends ResearchAgentError { constructor(m: string) { super(m); this.name = 'NonCausalFeatureError'; } }
export interface ResearchAgentDeps { readonly provider: ResearchLLMProvider; }

export function wrapSchemaError<T>(fn: () => T, actionName: string): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AgentValidationError(`Schema validation failed for ${actionName}: ${err.message}`, err.issues);
    }
    throw err;
  }
}
