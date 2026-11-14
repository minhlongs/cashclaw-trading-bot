'use client';

import { AlertTriangle, ChevronLeft, ChevronRight, GitBranch, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getStrategyVerificationTier } from '@/tree/bot/config-types';
import { type StrategyStepProps, STRATEGIES, STRATEGY_KEY_MAP } from './wizard-types';

export function StrategyStep({ form, setStrategyDefaults, onNext, onPrev }: StrategyStepProps) {
  const t = useTranslations('botWizard');

  return (
    <div className="space-y-4">
      <h3 className="card-title">{t('title.strategy')}</h3>
      <div className="strategy-option-list" role="radiogroup" aria-label={t('title.strategy')}>
        {STRATEGIES.map((s) => {
          const keyPrefix = STRATEGY_KEY_MAP[s.value] ?? s.value;
          const selected = form.strategy === s.value;
          const tier = getStrategyVerificationTier(s.value);
          const isEligible = tier === 'PAPER_FORWARD_ELIGIBLE';

          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStrategyDefaults(s.value)}
              className={`strategy-option ${selected ? 'selected' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GitBranch size={16} className={`strategy-option-icon ${selected ? 'selected' : ''}`} />
                  <div className="strategy-option-title">{t(`${keyPrefix}.label`)}</div>
                </div>
                {isEligible ? (
                  <span
                    className="badge badge-running inline-flex items-center gap-1 font-mono text-xs"
                    data-testid={`tier-badge-${s.value}`}
                  >
                    <ShieldCheck size={12} aria-hidden="true" />
                    <span>PAPER_FORWARD_ELIGIBLE • SignedStrategySpec • H3_MAKER</span>
                  </span>
                ) : (
                  <span
                    className="badge badge-paused inline-flex items-center gap-1 font-mono text-xs"
                    data-testid={`tier-badge-${s.value}`}
                  >
                    <AlertTriangle size={12} aria-hidden="true" />
                    <span>UNVERIFIED_RETAIL_SANDBOX</span>
                  </span>
                )}
              </div>
              <div className="strategy-option-desc">
                {t(`${keyPrefix}.desc`)}
              </div>
              <div className="text-xs text-tertiary mt-1">
                {isEligible
                  ? t('verification.eligibleNote')
                  : t('verification.retailNote')}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex justify-between">
        <button className="btn btn-ghost" onClick={onPrev}><ChevronLeft size={16} /> {t('back')}</button>
        <button className="btn btn-primary" onClick={onNext} disabled={!form.strategy}>
          {t('next')} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
