// Live Readiness Hardening — Helpers
// Shared result constructors + safe command runner for all readiness checks.

import { execFileSync } from 'child_process';
import type { ReadinessCheck } from './types';

const ROOT = process.cwd();

export function ok(name: string, desc: string): ReadinessCheck {
  return { name, category: 'ci_cd', status: 'pass', description: desc };
}

export function fail(name: string, cat: ReadinessCheck['category'], desc: string): ReadinessCheck {
  return { name, category: cat, status: 'fail', description: desc };
}

export function warn(name: string, cat: ReadinessCheck['category'], desc: string): ReadinessCheck {
  return { name, category: cat, status: 'warn', description: desc };
}

/** Run a command with argument array (no shell). Returns stdout or null on failure. */
export function run(bin: string, args: string[]): string | null {
  try {
    return execFileSync(bin, args, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    }).trim();
  } catch {
    return null;
  }
}
