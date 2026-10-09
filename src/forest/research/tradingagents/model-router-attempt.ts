import type { LlmProvider, LlmProviderInput } from './provider-adapter';

export async function attemptProviderCall(
  provider: LlmProvider,
  input: LlmProviderInput,
  timeoutMs: number,
): Promise<{ text: string; promptTokens: number; completionTokens: number; latencyMs: number }> {
  const startMs = Date.now();
  const result = await Promise.race([
    provider.call(input),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
  const latencyMs = result.latencyMs > 0 ? result.latencyMs : Date.now() - startMs;
  return {
    text: result.text,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    latencyMs,
  };
}
