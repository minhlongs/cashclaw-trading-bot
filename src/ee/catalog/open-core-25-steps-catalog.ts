// 25-Step Open-Core Public GitHub & Cloud SaaS Blueprint Catalog & Types
// Strictly < 200 LOC, zero :any, pure TypeScript

export type OpenCorePhaseId = 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'PHASE_4' | 'PHASE_5';
export type OpenCoreLicenseTier = 'APACHE_2_0' | 'COMMERCIAL_EE';

export interface OpenCoreStepSpec {
  readonly stepNumber: number;
  readonly phase: OpenCorePhaseId;
  readonly license: OpenCoreLicenseTier;
  readonly title: string;
  readonly artifactPath: string;
}

export const OPEN_CORE_25_STEPS: readonly OpenCoreStepSpec[] = [
  { stepNumber: 1, phase: 'PHASE_1', license: 'APACHE_2_0', title: 'Secret & Harness Sanitization', artifactPath: '.npmignore' },
  { stepNumber: 2, phase: 'PHASE_1', license: 'APACHE_2_0', title: 'Dual-License Root Structure', artifactPath: 'LICENSE' },
  { stepNumber: 3, phase: 'PHASE_1', license: 'APACHE_2_0', title: 'Enforce Zero-Leak Import Boundary', artifactPath: 'src/tree/__tests__/open-core-boundary.test.ts' },
  { stepNumber: 4, phase: 'PHASE_1', license: 'APACHE_2_0', title: 'Trademark & Brand Protection Policy', artifactPath: 'TRADEMARK.md' },
  { stepNumber: 5, phase: 'PHASE_1', license: 'APACHE_2_0', title: 'Contributor & Security Governance', artifactPath: 'CODE_OF_CONDUCT.md' },
  { stepNumber: 6, phase: 'PHASE_2', license: 'APACHE_2_0', title: 'Public QuantLib Barrel (@cashclaw/quantlib)', artifactPath: 'src/tree/quantlib/public-sdk.ts' },
  { stepNumber: 7, phase: 'PHASE_2', license: 'APACHE_2_0', title: 'Public Alpha Zoo Falsification SDK', artifactPath: 'src/tree/research/alpha/zoo/public-sdk.ts' },
  { stepNumber: 8, phase: 'PHASE_2', license: 'APACHE_2_0', title: 'Standalone Local Single-User Mode', artifactPath: 'src/lib/edition/edition-mode.ts' },
  { stepNumber: 9, phase: 'PHASE_2', license: 'APACHE_2_0', title: 'One-Command Local Paper Simulator CLI', artifactPath: 'bin/cashclaw.js' },
  { stepNumber: 10, phase: 'PHASE_2', license: 'APACHE_2_0', title: 'Deterministic Demo Seed Dataset', artifactPath: 'src/tree/cli/quickstart-fixture.ts' },
  { stepNumber: 11, phase: 'PHASE_3', license: 'COMMERCIAL_EE', title: 'Multi-Tenant RBAC & Workspace Isolation', artifactPath: 'src/ee/tenancy/tenant-policy.ts' },
  { stepNumber: 12, phase: 'PHASE_3', license: 'COMMERCIAL_EE', title: '24/7 Durable Cloud Cron Scheduler Coordinator', artifactPath: 'src/ee/scheduler/cloud-scheduler-coordinator.ts' },
  { stepNumber: 13, phase: 'PHASE_3', license: 'COMMERCIAL_EE', title: 'Managed TradingAgents LLM Credit Ledger', artifactPath: 'src/ee/deliberation-cloud/llm-credit-ledger.ts' },
  { stepNumber: 14, phase: 'PHASE_3', license: 'COMMERCIAL_EE', title: 'Cloud Alpha Registry & Curated IC/IR Feed', artifactPath: 'src/ee/alpha-cloud/alpha-feed-service.ts' },
  { stepNumber: 15, phase: 'PHASE_3', license: 'COMMERCIAL_EE', title: 'Real-Time Alerting & Webhook Cloud Dispatcher', artifactPath: 'src/ee/alerts/cloud-alert-dispatcher.ts' },
  { stepNumber: 16, phase: 'PHASE_4', license: 'COMMERCIAL_EE', title: '4-Tier SaaS Entitlement Schema', artifactPath: 'src/ee/billing/tier-entitlements.ts' },
  { stepNumber: 17, phase: 'PHASE_4', license: 'COMMERCIAL_EE', title: 'Quota & Concurrency Enforcement Middleware', artifactPath: 'src/ee/billing/quota-guard.ts' },
  { stepNumber: 18, phase: 'PHASE_4', license: 'COMMERCIAL_EE', title: 'NOWPayments IPN Webhook & Crypto Billing Engine', artifactPath: 'src/ee/billing/nowpayments-ipn.ts' },
  { stepNumber: 19, phase: 'PHASE_4', license: 'COMMERCIAL_EE', title: 'BYOK vs. Managed Key Router', artifactPath: 'src/ee/billing/key-mode-router.ts' },
  { stepNumber: 20, phase: 'PHASE_4', license: 'COMMERCIAL_EE', title: '1-Click Local-to-Cloud Sync Bridge', artifactPath: 'src/ee/sync/local-to-cloud-sync.ts' },
  { stepNumber: 21, phase: 'PHASE_5', license: 'APACHE_2_0', title: 'GitHub Actions Public CI Quality Gate', artifactPath: '.github/workflows/open-core-ci.yml' },
  { stepNumber: 22, phase: 'PHASE_5', license: 'APACHE_2_0', title: 'Bilingual README & OSS vs. Cloud Comparison Table', artifactPath: 'docs/open-core-saas-architecture.md' },
  { stepNumber: 23, phase: 'PHASE_5', license: 'APACHE_2_0', title: 'Community Alpha Hypothesis PR Template', artifactPath: '.github/ISSUE_TEMPLATE/alpha-hypothesis.md' },
  { stepNumber: 24, phase: 'PHASE_5', license: 'APACHE_2_0', title: 'Release Versioning & SDK Package Metadata', artifactPath: 'package.json' },
  { stepNumber: 25, phase: 'PHASE_5', license: 'COMMERCIAL_EE', title: 'Privacy-First SaaS Telemetry & Conversion Funnel Metrics', artifactPath: 'src/ee/telemetry/conversion-funnel.ts' },
] as const;

export interface OpenCoreAuditSummary {
  readonly totalSteps: number;
  readonly apacheStepsCount: number;
  readonly commercialStepsCount: number;
  readonly verifiedStepsCount: number;
  readonly missingArtifacts: readonly string[];
  readonly allVerified: boolean;
}

export function evaluateOpenCoreCatalog(
  artifactExists: (relPath: string) => boolean,
): OpenCoreAuditSummary {
  const missingArtifacts: string[] = [];
  let apacheStepsCount = 0;
  let commercialStepsCount = 0;

  for (const step of OPEN_CORE_25_STEPS) {
    if (step.license === 'APACHE_2_0') apacheStepsCount += 1;
    else commercialStepsCount += 1;

    if (!artifactExists(step.artifactPath)) {
      missingArtifacts.push(`Step ${step.stepNumber}: ${step.artifactPath}`);
    }
  }

  return {
    totalSteps: OPEN_CORE_25_STEPS.length,
    apacheStepsCount,
    commercialStepsCount,
    verifiedStepsCount: OPEN_CORE_25_STEPS.length - missingArtifacts.length,
    missingArtifacts,
    allVerified: missingArtifacts.length === 0 && OPEN_CORE_25_STEPS.length === 25,
  };
}
