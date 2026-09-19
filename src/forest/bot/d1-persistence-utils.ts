/**
 * Shared utility functions for D1 persistence operations.
 */

export const uid = (): string => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const now = (): number => Date.now();
