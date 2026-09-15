// Hypothesis Engine — Generator
// Systematically creates and evolves alpha hypotheses.

import { RegimeLabel } from '../../regime/types';
import type { BarrierConfig } from '../labeling';
import type { AlphaHypothesis, HypothesisTemplate, IndicatorPreset } from './types';
import {
  ALL_COMBINERS, ALL_INDICATORS, ALL_OPTIMIZERS, ALL_REGIMES,
  DEFAULT_BARRIER, LOOKBACK_RANGE, REGIME_STRATEGY,
  clamp, pick, pickN, randomInt, slug,
} from './presets';

// ── Public API ─────────────────────────────────────────────────────────────────

export class HypothesisGenerator {
  private counter = 0;

  /** Generate from a named template. */
  generateFromTemplate(template: HypothesisTemplate): AlphaHypothesis {
    this.counter++;
    const id = `h-${slug()}-${this.counter}`;
    return {
      id,
      name: `${template.name} #${this.counter}`,
      description: template.description,
      indicatorSet: [...template.indicatorPreset],
      combineMethod: template.combinePreset,
      regimeFilter: [...template.regimePreset],
      barrierConfig: { ...template.barrierPreset },
      optimizerMethod: 'equal_weight',
      confidence: 0.5,
      createdAt: new Date().toISOString(),
    };
  }

  /** Generate a random but valid hypothesis. */
  generateRandomHypothesis(): AlphaHypothesis {
    this.counter++;
    const id = `h-${slug()}-${this.counter}`;
    const indicators = pickN(ALL_INDICATORS, 2, 5);
    const indicatorSet: IndicatorPreset[] = indicators.map((name) => ({
      indicator: name,
      lookback: randomInt(LOOKBACK_RANGE[0], LOOKBACK_RANGE[1]),
    }));
    const combineMethod = pick(ALL_COMBINERS);
    const optimizerMethod = pick(ALL_OPTIMIZERS);
    const regimeFilter = pickN(ALL_REGIMES, 1, 3);

    return {
      id,
      name: `Random-${combineMethod}-#${this.counter}`,
      description: `Auto-generated hypothesis: ${indicators.join('+')} with ${combineMethod}`,
      indicatorSet,
      combineMethod,
      regimeFilter,
      barrierConfig: { ...DEFAULT_BARRIER },
      optimizerMethod,
      confidence: 0.5,
      createdAt: new Date().toISOString(),
    };
  }

  /** Generate a hypothesis tuned for a specific regime. */
  generateRegimeSpecificHypothesis(regime: RegimeLabel): AlphaHypothesis {
    this.counter++;
    const preset = REGIME_STRATEGY[regime] ?? REGIME_STRATEGY.UNKNOWN;
    const id = `h-${slug()}-${this.counter}`;
    const indicatorSet: IndicatorPreset[] = preset.indicators.map((name) => ({
      indicator: name,
      lookback: randomInt(LOOKBACK_RANGE[0], LOOKBACK_RANGE[1]),
    }));

    const regimeBarriers: Partial<Record<RegimeLabel, BarrierConfig>> = {
      TREND_UP: { takeProfitPct: 0.03, stopLossPct: 0.015, maxHoldingMs: 48 * 3600_000 },
      TREND_DOWN: { takeProfitPct: 0.015, stopLossPct: 0.005, maxHoldingMs: 12 * 3600_000 },
      RANGE: { takeProfitPct: 0.01, stopLossPct: 0.01, maxHoldingMs: 6 * 3600_000 },
      HIGH_VOLATILITY: { takeProfitPct: 0.04, stopLossPct: 0.02, maxHoldingMs: 24 * 3600_000 },
      LOW_VOLATILITY: { takeProfitPct: 0.015, stopLossPct: 0.01, maxHoldingMs: 36 * 3600_000 },
      SHOCK: { takeProfitPct: 0.05, stopLossPct: 0.025, maxHoldingMs: 6 * 3600_000 },
    };

    return {
      id,
      name: `${regime}-specialist #${this.counter}`,
      description: preset.description,
      indicatorSet,
      combineMethod: preset.combiner,
      regimeFilter: [regime],
      barrierConfig: regimeBarriers[regime] ?? { ...DEFAULT_BARRIER },
      optimizerMethod: 'regime_sized',
      confidence: 0.5,
      createdAt: new Date().toISOString(),
    };
  }

  /** Mutate an existing hypothesis to explore nearby configurations. */
  evolveHypothesis(parent: AlphaHypothesis, mutationRate: number): AlphaHypothesis {
    this.counter++;
    const id = `h-${slug()}-${this.counter}`;
    const rate = clamp(mutationRate, 0.05, 0.8);

    // Evolve indicators: add, remove, or replace with probability = rate
    const indicators = [...parent.indicatorSet];
    for (let i = indicators.length - 1; i >= 0; i--) {
      if (Math.random() < rate) {
        const action = Math.random();
        if (action < 0.33 && indicators.length > 1) {
          // Remove
          indicators.splice(i, 1);
        } else if (action < 0.66) {
          // Replace
          const candidates = ALL_INDICATORS.filter((n) => !indicators.some((ind) => ind.indicator === n));
          if (candidates.length > 0) {
            indicators[i] = { indicator: pick(candidates), lookback: randomInt(LOOKBACK_RANGE[0], LOOKBACK_RANGE[1]) };
          }
        } else {
          // Mutate lookback
          const orig = indicators[i]!;
          indicators[i] = { ...orig, lookback: randomInt(LOOKBACK_RANGE[0], LOOKBACK_RANGE[1]) };
        }
      }
    }

    // Add new indicator if below max
    if (indicators.length < 5 && Math.random() < rate) {
      const candidates = ALL_INDICATORS.filter((n) => !indicators.some((ind) => ind.indicator === n));
      if (candidates.length > 0) {
        indicators.push({ indicator: pick(candidates), lookback: randomInt(LOOKBACK_RANGE[0], LOOKBACK_RANGE[1]) });
      }
    }

    // Evolve combiner or optimizer with probability = rate
    const combineMethod = Math.random() < rate ? pick(ALL_COMBINERS) : parent.combineMethod;
    const optimizerMethod = Math.random() < rate ? pick(ALL_OPTIMIZERS) : parent.optimizerMethod;

    return {
      ...parent,
      id,
      name: `${parent.name}-evolved#${this.counter}`,
      indicatorSet: indicators,
      combineMethod,
      optimizerMethod,
      confidence: parent.confidence,
      createdAt: new Date().toISOString(),
    };
  }
}
