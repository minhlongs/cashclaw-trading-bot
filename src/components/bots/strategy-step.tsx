'use client';

import { ChevronLeft, ChevronRight, GitBranch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type StrategyStepProps, STRATEGIES, STRATEGY_KEY_MAP } from './wizard-types';

export function StrategyStep({ form, setStrategyDefaults, onNext, onPrev }: StrategyStepProps) {
  const t = useTranslations('botWizard');

  return (
    <div className="space-y-4">
      <h3 className="card-title">{t('title.strategy')}</h3>
      <div className="strategy-option-list">
        {STRATEGIES.map((s) => {
          const keyPrefix = STRATEGY_KEY_MAP[s.value] ?? s.value;
          const selected = form.strategy === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setStrategyDefaults(s.value)}
              className={`strategy-option ${selected ? 'selected' : ''}`}
            >
              <div className="flex items-center gap-2">
                <GitBranch size={16} className={`strategy-option-icon ${selected ? 'selected' : ''}`} />
                <div className="strategy-option-title">{t(`${keyPrefix}.label`)}</div>
              </div>
              <div className="strategy-option-desc">
                {t(`${keyPrefix}.desc`)}
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
