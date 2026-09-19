// Grid Levels — Deployed capital accounting.

import type { GridLevel } from '../types';

/**
 * Compute total deployed capital across open/filled levels.
 */
export function computeDeployedCapital(levels: GridLevel[]): number {
  let deployed = 0;
  for (const level of levels) {
    if (level.status === 'open' || level.status === 'filled') {
      deployed += level.quantity * level.triggerPrice;
    }
  }
  return deployed;
}
