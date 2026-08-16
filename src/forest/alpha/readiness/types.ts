// Live Readiness Hardening — Types
// Defines the shapes for readiness checks and reports.

// ── Categories ────────────────────────────────────────────────────────────────

/** Functional area a readiness check belongs to. */
export type ReadinessCategory =
  | 'ci_cd'
  | 'monitoring'
  | 'deployment'
  | 'security'
  | 'data'
  | 'performance';

/** Outcome of a single readiness check. */
export type ReadinessStatus = 'pass' | 'fail' | 'warn';

/** Computed overall status for the full readiness report. */
export type OverallStatus = 'pass' | 'fail' | 'warn';

// ── Check ─────────────────────────────────────────────────────────────────────

/** A single readiness check result. */
export interface ReadinessCheck {
  /** Short machine-readable name (e.g. "typescript_compilation"). */
  name: string;
  /** Functional area this check covers. */
  category: ReadinessCategory;
  /** Outcome. */
  status: ReadinessStatus;
  /** Human-readable explanation of what was checked and why. */
  description: string;
}

// ── Report ────────────────────────────────────────────────────────────────────

/** Aggregated readiness report from running all checks. */
export interface ReadinessReport {
  /** ISO-8601 timestamp of when the report was generated. */
  timestamp: string;
  /** Total number of checks executed. */
  totalChecks: number;
  /** Count of passing checks. */
  passedChecks: number;
  /** Count of failing checks. */
  failedChecks: number;
  /** Count of warning-only checks. */
  warnings: number;
  /** Individual check results. */
  checks: ReadinessCheck[];
  /** Computed overall status: FAIL if any failures, WARN if only warnings, PASS otherwise. */
  overallStatus: OverallStatus;
}
