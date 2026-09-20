// Research Registry — pure functions.
// Immutable operations: every function returns a new registry and never
// mutates its input. No I/O, no randomness, no Node APIs.
//
// Facade: retains lifecycle mutations (`createRegistry`,
// `createRegistryFromEntries`, `addEntry`, `falsifyEntry`) and
// re-exports hash + summary utilities from co-located submodules.

import type { ResearchEntry, ResearchRegistry } from './types';
import { entryConfigHash } from './registry-hash';
import { countByStatus, emptyCounts } from './registry-summary';

/** Create an empty registry. */
export function createRegistry(): ResearchRegistry {
  return { entries: [], counts: emptyCounts() };
}

/** Build a registry from a list of entries, enforcing dedup. */
export function createRegistryFromEntries(entries: readonly ResearchEntry[]): ResearchRegistry {
  let registry = createRegistry();
  for (const entry of entries) {
    registry = addEntry(registry, entry);
  }
  return registry;
}

/**
 * Add an entry, returning a NEW registry. Rejects an entry whose
 * hypothesis + configuration hash duplicates an existing entry.
 */
export function addEntry(registry: ResearchRegistry, entry: ResearchEntry): ResearchRegistry {
  if (entry.id.trim() === '') {
    throw new Error('Research entry id must be non-empty');
  }
  if (registry.entries.some((existing) => existing.id === entry.id)) {
    throw new Error(`Duplicate research entry id: ${entry.id}`);
  }
  const hash = entryConfigHash(entry);
  const duplicate = registry.entries.find(
    (existing) =>
      existing.hypothesis === entry.hypothesis && entryConfigHash(existing) === hash,
  );
  if (duplicate) {
    throw new Error(
      `Duplicate research hypothesis+config (id '${duplicate.id}', hash ${hash}): ${entry.hypothesis}`,
    );
  }
  const entries = [...registry.entries, entry];
  return { entries, counts: countByStatus(entries) };
}

/**
 * Falsify an entry by id, returning a NEW registry. The input registry
 * is never mutated. Throws if the id is unknown.
 */
export function falsifyEntry(
  registry: ResearchRegistry,
  id: string,
  reason: string,
): ResearchRegistry {
  const target = registry.entries.find((entry) => entry.id === id);
  if (!target) {
    throw new Error(`Cannot falsify unknown research entry id: ${id}`);
  }
  if (reason.trim() === '') {
    throw new Error(`Falsification reason must be non-empty for entry: ${id}`);
  }
  const entries = registry.entries.map((entry) =>
    entry.id === id
      ? { ...entry, status: 'FALSIFIED' as const, falsificationReason: reason }
      : entry,
  );
  return { entries, counts: countByStatus(entries) };
}

export { fnv1a32, entryConfigHash } from './registry-hash';
export { summarize, toCanonicalJson } from './registry-summary';
