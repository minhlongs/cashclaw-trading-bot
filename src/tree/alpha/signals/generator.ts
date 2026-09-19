// Derivative signal generator — converts funding rate, OI, liquidation features
// into directional alpha signals with confidence scores.
//
// Re-exports type and generator for backward compatibility.

export type { DerivativeSignal } from './generator-types';
export { generateDerivativeSignals } from './signals';
