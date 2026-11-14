// Gate G12 — 3-Arm Blind Net-of-Token-Cost ROI Evaluator (Audit §10 & §19).
// Compares DETERMINISTIC_BASELINE ($0 token cost), SINGLE_MODEL_CRITIC, and MULTI_AGENT_DEBATE
// over identical OOS windows. Fail-closed rule: KEEP_READ_ONLY_CRITIC requires
// netAfterTokenSharpe > baselineSharpe, incrementalNetReturnAfterTokensUsd > 0, and orderAuthorityCount === 0.

import {
  DEFAULT_NET_ROI_CONFIG, NET_ROI_ARMS, netRoiArmInputSchema, netRoiConfigSchema,
  type AiArmGateDecision, type NetRoiAblationResult, type NetRoiArmId,
  type NetRoiArmInput, type NetRoiArmSummary, type NetRoiEvaluationConfig, type NetRoiWindowObservation,
} from './net-roi-types';

const round6 = (value: number): number => Number(value.toFixed(6));

function computeAnnualizedSharpe(returns: readonly number[], periodsPerYear: number): number {
  const n = returns.length;
  if (n < 2) return 0;
  const mean = returns.reduce((acc, r) => acc + r, 0) / n;
  const sqDiff = returns.reduce((acc, r) => acc + (r - mean) * (r - mean), 0);
  const std = Math.sqrt(sqDiff / (n - 1));
  return std <= 1e-12 ? 0 : round6((mean / std) * Math.sqrt(periodsPerYear));
}

function windowTokenUsd(w: NetRoiWindowObservation, cfg: NetRoiEvaluationConfig): number {
  return (w.promptTokens / 1_000_000) * cfg.inputCostPer1MTokensUsd +
    (w.completionTokens / 1_000_000) * cfg.outputCostPer1MTokensUsd;
}

function summarizeArm(armInput: NetRoiArmInput, cfg: NetRoiEvaluationConfig): NetRoiArmSummary {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokenCostUsd = 0;
  let grossReturnSum = 0;
  let tradingDragSum = 0;
  let orderAuthorityCount = 0;
  const preTokenReturns: number[] = [];
  const afterTokenReturns: number[] = [];

  for (const w of armInput.windows) {
    const tokenUsd = windowTokenUsd(w, cfg);
    const netTradingRet = w.grossReturn - w.tradingCostDrag;
    totalPromptTokens += w.promptTokens;
    totalCompletionTokens += w.completionTokens;
    totalTokenCostUsd += tokenUsd;
    grossReturnSum += w.grossReturn;
    tradingDragSum += w.tradingCostDrag;
    orderAuthorityCount += w.orderAuthorityCount;
    preTokenReturns.push(netTradingRet);
    afterTokenReturns.push(netTradingRet - tokenUsd / cfg.startingCapitalUsd);
  }

  const grossReturnUsd = cfg.startingCapitalUsd * grossReturnSum;
  const tradingCostUsd = cfg.startingCapitalUsd * tradingDragSum;
  const netTradingReturnUsd = grossReturnUsd - tradingCostUsd;

  return {
    arm: armInput.arm,
    windowCount: armInput.windows.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    totalTokenCostUsd: round6(totalTokenCostUsd),
    grossReturnUsd: round6(grossReturnUsd),
    tradingCostUsd: round6(tradingCostUsd),
    netTradingReturnUsd: round6(netTradingReturnUsd),
    netReturnAfterTokensUsd: round6(netTradingReturnUsd - totalTokenCostUsd),
    preTokenSharpe: computeAnnualizedSharpe(preTokenReturns, cfg.annualizationPeriodsPerYear),
    netAfterTokenSharpe: computeAnnualizedSharpe(afterTokenReturns, cfg.annualizationPeriodsPerYear),
    orderAuthorityCount,
  };
}

function decideAiArm(
  aiSummary: NetRoiArmSummary,
  armId: 'SINGLE_MODEL_CRITIC' | 'MULTI_AGENT_DEBATE',
  baseline: NetRoiArmSummary,
): AiArmGateDecision {
  const incrementalSharpe = round6(aiSummary.netAfterTokenSharpe - baseline.netAfterTokenSharpe);
  const incrementalUsd = round6(aiSummary.netReturnAfterTokensUsd - baseline.netReturnAfterTokensUsd);

  if (
    aiSummary.orderAuthorityCount === 0 &&
    aiSummary.netAfterTokenSharpe > baseline.netAfterTokenSharpe &&
    incrementalUsd > 0
  ) {
    return {
      arm: armId,
      verdict: 'KEEP_READ_ONLY_CRITIC',
      baselineSharpe: baseline.netAfterTokenSharpe,
      netAfterTokenSharpe: aiSummary.netAfterTokenSharpe,
      incrementalSharpeAfterTokens: incrementalSharpe,
      incrementalNetReturnAfterTokensUsd: incrementalUsd,
      orderAuthorityCount: 0,
      rationale: `${armId} improves net-of-token Sharpe (+${incrementalSharpe}) and net USD (+$${incrementalUsd}) with zero order authority`,
    };
  }

  const reasons: string[] = [];
  if (aiSummary.orderAuthorityCount > 0) {
    reasons.push(`orderAuthorityCount=${aiSummary.orderAuthorityCount} violates zero-order fence`);
  }
  if (aiSummary.netAfterTokenSharpe <= baseline.netAfterTokenSharpe) {
    reasons.push(`netAfterTokenSharpe (${aiSummary.netAfterTokenSharpe}) <= baseline (${baseline.netAfterTokenSharpe})`);
  }
  if (incrementalUsd <= 0) {
    reasons.push(`incrementalNetReturnAfterTokensUsd ($${incrementalUsd}) <= $0`);
  }

  return {
    arm: armId,
    verdict: 'DISABLE_NEGATIVE_NET_ROI',
    baselineSharpe: baseline.netAfterTokenSharpe,
    netAfterTokenSharpe: aiSummary.netAfterTokenSharpe,
    incrementalSharpeAfterTokens: incrementalSharpe,
    incrementalNetReturnAfterTokensUsd: incrementalUsd,
    orderAuthorityCount: aiSummary.orderAuthorityCount,
    rationale: `${armId} disabled: ${reasons.join('; ')}`,
  };
}

function validateBlindArms(arms: readonly NetRoiArmInput[], cfg: NetRoiEvaluationConfig): string[] {
  const errors: string[] = [];
  const byArm = new Map<NetRoiArmId, NetRoiArmInput>();
  for (const rawArm of arms) {
    const parsed = netRoiArmInputSchema.safeParse(rawArm);
    if (!parsed.success) {
      errors.push(`arm schema invalid: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
      continue;
    }
    if (byArm.has(parsed.data.arm)) errors.push(`duplicate arm '${parsed.data.arm}'`);
    byArm.set(parsed.data.arm, parsed.data);
  }
  for (const required of NET_ROI_ARMS) {
    if (!byArm.has(required)) errors.push(`missing required arm '${required}'`);
  }
  if (errors.length > 0) return errors;

  const baseline = byArm.get('DETERMINISTIC_BASELINE')!;
  if (baseline.windows.length < cfg.minWindowsRequired) {
    errors.push(`window count ${baseline.windows.length} < minWindowsRequired ${cfg.minWindowsRequired}`);
  }
  if (baseline.windows.some((w) => w.promptTokens !== 0 || w.completionTokens !== 0)) {
    errors.push('DETERMINISTIC_BASELINE must have zero promptTokens and completionTokens');
  }
  const baseIds = baseline.windows.map((w) => w.windowId);
  for (const armId of ['SINGLE_MODEL_CRITIC', 'MULTI_AGENT_DEBATE'] as const) {
    const ids = byArm.get(armId)!.windows.map((w) => w.windowId);
    if (ids.length !== baseIds.length || ids.some((id, idx) => id !== baseIds[idx])) {
      errors.push(`arm '${armId}' OOS windowIds do not align identically with DETERMINISTIC_BASELINE`);
    }
  }
  return errors;
}

/** Evaluate 3 blind arms over identical OOS windows net of LLM token & trading costs. */
export function evaluateThreeArmNetRoi(
  arms: readonly NetRoiArmInput[],
  config: NetRoiEvaluationConfig = DEFAULT_NET_ROI_CONFIG,
): NetRoiAblationResult {
  const cfgParsed = netRoiConfigSchema.safeParse(config);
  if (!cfgParsed.success) {
    return { ok: false, reasons: cfgParsed.error.issues.map((i) => `config.${i.path.join('.')}: ${i.message}`) };
  }
  const validationErrors = validateBlindArms(arms, cfgParsed.data);
  if (validationErrors.length > 0) return { ok: false, reasons: validationErrors };

  const map = new Map<NetRoiArmId, NetRoiArmSummary>();
  for (const arm of arms) map.set(arm.arm, summarizeArm(arm, cfgParsed.data));

  const baseline = map.get('DETERMINISTIC_BASELINE')!;
  const singleCritic = map.get('SINGLE_MODEL_CRITIC')!;
  const multiDebate = map.get('MULTI_AGENT_DEBATE')!;
  const debateToSingleTokenMultiplier =
    singleCritic.totalTokenCostUsd > 0
      ? round6(multiDebate.totalTokenCostUsd / singleCritic.totalTokenCostUsd)
      : 0;

  return {
    ok: true,
    report: {
      config: cfgParsed.data,
      armSummaries: {
        DETERMINISTIC_BASELINE: baseline,
        SINGLE_MODEL_CRITIC: singleCritic,
        MULTI_AGENT_DEBATE: multiDebate,
      },
      aiDecisions: {
        SINGLE_MODEL_CRITIC: decideAiArm(singleCritic, 'SINGLE_MODEL_CRITIC', baseline),
        MULTI_AGENT_DEBATE: decideAiArm(multiDebate, 'MULTI_AGENT_DEBATE', baseline),
      },
      debateToSingleTokenMultiplier,
    },
  };
}
