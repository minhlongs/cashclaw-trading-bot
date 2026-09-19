// Live Readiness Hardening — Individual Checks
// Each function returns one ReadinessCheck with a concrete status.
// Facade re-exports grouped by category (CI/CD, security, integration).

export {
  checkTypeScriptCompilation,
  checkTestCoverage,
  checkNoAnyTypes,
  checkNoEslintDisables,
  checkBuildPasses,
} from './checks-cicd';

export {
  checkSecretsNotCommitted,
  checkPaperTradingOnly,
} from './checks-security';

export {
  checkCostModelConfigured,
  checkRegimeEngineWired,
  checkWalkForwardWired,
} from './checks-integration';
