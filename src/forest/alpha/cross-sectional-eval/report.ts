// Cross-sectional report builder facade (plan §3 Step C).
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.

export type { BuildReportConfig } from './report.config';
export { buildCrossSectionalReport } from './report.builder';
