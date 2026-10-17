/**
 * ResearchAgent E2E Test Suite Barrel Runner
 *
 * Decomposed into modular single-responsibility sub-suites:
 * - e2e-tier1-part1.test.ts: Tier 1.1 Capability 1 — Hypothesis Generation
 * - e2e-tier1-part2.test.ts: Tier 1.2 & 1.3 Capability 2 & 3 — Features & Diagnosis
 * - e2e-tier1-part3.test.ts: Tier 1.4 & 1.5 Capability 4 & 5 — Clustering & Recommendations
 * - e2e-tier2-part1.test.ts: Tier 2.1 & 2.2 Capability 1 & 2 Boundaries
 * - e2e-tier2-part2.test.ts: Tier 2.3 & 2.4 Capability 3 & 4 Boundaries
 * - e2e-tier2-part3.test.ts: Tier 2.5 Capability 5 Boundaries
 * - e2e-tier3-integration.test.ts: Tier 3 Cross-Feature & Seam Integration
 * - e2e-tier4-part1.test.ts: Tier 4 Real-World Application Scenarios (Part 1)
 * - e2e-tier4-part2.test.ts: Tier 4 Real-World Application Scenarios (Part 2)
 */

import './e2e-tier1-part1.test';
import './e2e-tier1-part2.test';
import './e2e-tier1-part3.test';
import './e2e-tier2-part1.test';
import './e2e-tier2-part2.test';
import './e2e-tier2-part3.test';
import './e2e-tier3-integration.test';
import './e2e-tier4-part1.test';
import './e2e-tier4-part2.test';
