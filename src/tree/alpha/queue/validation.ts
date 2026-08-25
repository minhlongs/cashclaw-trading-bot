// Research Queue — VALIDATING-stage checks.
// Fail-closed: any missing field or registry collision produces
// { ok: false, reasons } — never a silent pass.

import type { ResearchEntry } from '@/tree/alpha/registry/types';
import type { QueueJobSpec } from './types';

/** Outcome of a job-spec validation pass. */
export interface JobSpecValidation {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

function isNonEmpty(value: string): boolean {
  return value.trim() !== '';
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** Field-completeness checks, expressed as data to keep branches flat. */
function fieldReasons(job: QueueJobSpec): string[] {
  const checks: ReadonlyArray<readonly [boolean, string]> = [
    [!isNonEmpty(job.id), 'id must be non-empty'],
    [!isNonEmpty(job.hypothesis), 'hypothesis must be non-empty'],
    [!isNonEmpty(job.rationale), 'rationale must be non-empty'],
    [!isNonEmpty(job.dataset), 'dataset must be non-empty'],
    [!isNonEmpty(job.generatedBy), 'generatedBy must be non-empty'],
    [job.features.length === 0, 'features must be non-empty'],
    [!isNonEmpty(job.universe.id), 'universe.id must be non-empty'],
    [job.universe.symbols.length === 0, 'universe.symbols must be non-empty'],
    [!Number.isFinite(job.timestamp), 'timestamp must be a finite number'],
    [!isFiniteNonNegative(job.costs.feeBps), 'costs.feeBps must be a finite non-negative number'],
    [!isFiniteNonNegative(job.costs.impactBps), 'costs.impactBps must be a finite non-negative number'],
    [!isFiniteNonNegative(job.slippage.slippageBps), 'slippage.slippageBps must be a finite non-negative number'],
  ];
  return checks.filter(([failed]) => failed).map(([, reason]) => reason);
}

/**
 * Registry-collision checks. A job whose hypothesis matches an existing
 * registry entry is rejected. Matching a FALSIFIED entry is the machine
 * guard behind "do not retest dead hypotheses" (covers the seeded
 * falsified classes).
 */
function registryCollisionReasons(
  job: QueueJobSpec,
  registryEntries: readonly ResearchEntry[],
): string[] {
  const normalized = job.hypothesis.trim().toLowerCase();
  const reasons: string[] = [];
  for (const entry of registryEntries) {
    if (entry.hypothesis.trim().toLowerCase() !== normalized) continue;
    if (entry.status === 'FALSIFIED') {
      reasons.push(
        `re-tests falsified hypothesis class '${entry.id}' — do not retest dead hypotheses`,
      );
    } else {
      reasons.push(
        `duplicates existing registry entry '${entry.id}' (status ${entry.status})`,
      );
    }
  }
  return reasons;
}

/**
 * Validate a job spec before it may enter RUNNING.
 *
 * Checks (all fail-closed):
 * 1. Field completeness — required strings non-empty, features and
 *    universe symbols non-empty, timestamp finite, costs/slippage
 *    finite and non-negative.
 * 2. Registry collision — duplicate hypothesis vs existing entries,
 *    with re-testing a falsified class rejected outright.
 */
export function validateJobSpec(
  job: QueueJobSpec,
  registryEntries: readonly ResearchEntry[],
): JobSpecValidation {
  const reasons = [
    ...fieldReasons(job),
    ...registryCollisionReasons(job, registryEntries),
  ];
  return { ok: reasons.length === 0, reasons };
}
