/**
 * Derivative signal types.
 */

import type { DerivativeFeatures } from './funding';

export interface DerivativeSignal {
  timestamp: number;
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  confidence: number; // 0-1
  features: DerivativeFeatures;
  reasons: string[];
}
