import { type StageResult } from './report-types';
import { DecisionLogWriter } from './decision-log';
import { finalizeDeliberationReport } from './run-deliberation-helpers';
import { executeDebateAndHypothesis, executeRiskAdvisory } from './run-deliberation-stages';
import { executePortfolioAdvisory } from './run-deliberation-portfolio';
import type { RunDeliberationConfig, RunDeliberationResult } from './run-deliberation.types';

export async function runDeliberation(config: RunDeliberationConfig): Promise<RunDeliberationResult> {
  const reasons: string[] = [];
  const stageResults: StageResult[] = [];
  let writer = new DecisionLogWriter();
  if (config.initialDecisionLog) {
    const fromJson = await DecisionLogWriter.fromJSON(config.initialDecisionLog);
    if (!fromJson.ok) return { ok: false, reasons: fromJson.reasons.map((r) => `decision-log resume: ${r}`) };
    writer = fromJson.writer;
  }
  const hypothesisResult = await executeDebateAndHypothesis(config, stageResults, reasons);
  const riskAdvisory = executeRiskAdvisory(config, hypothesisResult, stageResults);
  const portfolioResult = executePortfolioAdvisory(config, hypothesisResult, riskAdvisory, stageResults);
  if (!hypothesisResult) return { ok: false, reasons };
  return finalizeDeliberationReport({
    researchGoal: config.researchGoal, proposalId: config.proposalId, nowIso: config.nowIso,
    hypothesisResult, riskAdvisory, portfolioResult, stageResults, writer,
  });
}
