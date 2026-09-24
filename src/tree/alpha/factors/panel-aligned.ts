// Cross-panel alignment validation (fail-closed, misaligned rejected).
// Pure, deterministic — no I/O, no network, no Node APIs.

import { validateSymbolPanel, type SymbolPanel } from './panel-validate';

/**
 * Validate a set of panels as an aligned cross-section: every panel valid on
 * its own AND all panels share the identical timestamp grid (same length and
 * same values). Throws on any violation (fail-closed, misaligned rejected).
 */
export function validateAlignedPanels(panels: readonly SymbolPanel[]): void {
  if (panels.length === 0) throw new Error('validateAlignedPanels: panels must be non-empty');
  for (const panel of panels) validateSymbolPanel(panel);
  const reference = panels[0];
  for (const panel of panels.slice(1)) {
    if (panel.timestamps.length !== reference.timestamps.length) {
      throw new Error(
        `validateAlignedPanels: symbol '${panel.symbol}' length ${panel.timestamps.length} !== reference length ${reference.timestamps.length}`,
      );
    }
    for (let i = 0; i < panel.timestamps.length; i++) {
      if (panel.timestamps[i] !== reference.timestamps[i]) {
        throw new Error(
          `validateAlignedPanels: symbol '${panel.symbol}' timestamp mismatch at index ${i}`,
        );
      }
    }
  }
}
