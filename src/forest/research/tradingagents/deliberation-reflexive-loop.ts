import type {
  FactorOOSResult,
  AgentBeliefPrior,
  ReflexiveDebateContext,
} from './deliberation-reflexive-types';

export class DeliberationReflexiveLoop {
  updateBeliefPriors(
    currentPriors: readonly AgentBeliefPrior[],
    oosResults: readonly FactorOOSResult[]
  ): AgentBeliefPrior[] {
    const priorMap = new Map<string, AgentBeliefPrior>();
    for (const p of currentPriors) {
      priorMap.set(p.featureKey, p);
    }

    const updated: AgentBeliefPrior[] = [];

    for (const r of oosResults) {
      const existing = priorMap.get(r.factorName) ?? {
        featureKey: r.factorName,
        confidenceScore: 0.5,
        sampleCount: 0,
        isQuarantined: false,
        feedbackNotes: [],
      };

      let newConf = existing.confidenceScore;
      let quarantined = existing.isQuarantined;
      const notes = [...existing.feedbackNotes];

      if (r.verdict === 'PAPER_CANDIDATE') {
        newConf = Math.min(1.0, newConf + 0.15 * Math.max(0.1, r.irRatio));
        notes.push(`OOS Pass: IC=${r.icMean.toFixed(3)}, IR=${r.irRatio.toFixed(2)}`);
      } else if (r.verdict === 'KILLED') {
        newConf = Math.max(0.05, newConf - 0.25);
        if (newConf < 0.2 || r.icMean < -0.05) {
          quarantined = true;
          notes.push(`Quarantined: negative drift or severe degradation`);
        } else {
          notes.push(`Penalized: Failed survival gate`);
        }
      }

      updated.push({
        featureKey: r.factorName,
        confidenceScore: Number(newConf.toFixed(4)),
        sampleCount: existing.sampleCount + 1,
        isQuarantined: quarantined,
        feedbackNotes: notes.slice(-5),
      });
      priorMap.delete(r.factorName);
    }

    for (const remaining of priorMap.values()) {
      updated.push(remaining);
    }

    return updated;
  }

  generateDebateGuidance(priors: readonly AgentBeliefPrior[]): ReflexiveDebateContext {
    const boostFactors: string[] = [];
    const penalizedFactors: string[] = [];
    const quarantinedFactors: string[] = [];

    for (const p of priors) {
      if (p.isQuarantined) {
        quarantinedFactors.push(p.featureKey);
      } else if (p.confidenceScore >= 0.65) {
        boostFactors.push(p.featureKey);
      } else if (p.confidenceScore < 0.4) {
        penalizedFactors.push(p.featureKey);
      }
    }

    const guidance = `Guidance: Prioritize high-performing features [${boostFactors.join(', ')}]. Avoid quarantined features [${quarantinedFactors.join(', ')}]. Deprioritize weak features [${penalizedFactors.join(', ')}].`;

    return {
      boostFactors,
      penalizedFactors,
      quarantinedFactors,
      summaryPromptGuidance: guidance,
    };
  }
}
