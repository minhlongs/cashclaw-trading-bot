'use client';

import { ChevronLeft, ChevronRight, GitBranch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type StrategyStepProps, STRATEGIES, STRATEGY_KEY_MAP } from './wizard-types';

export function StrategyStep({ form, setStrategyDefaults, onNext, onPrev }: StrategyStepProps) {
  const t = useTranslations('botWizard');

  return (
    <div className="space-y-4">
      <h3 className="card-title">{t('title.strategy')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {STRATEGIES.map((s) => {
          const keyPrefix = STRATEGY_KEY_MAP[s.value] ?? s.value;
          return (
            <button
              key={s.value}
              onClick={() => setStrategyDefaults(s.value)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                border: form.strategy === s.value ? '2px solid var(--color-profit)' : '1px solid var(--border-subtle)',
                background: form.strategy === s.value ? 'rgba(0, 212, 170, 0.06)' : 'var(--bg-primary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GitBranch size={16} style={{ color: form.strategy === s.value ? 'var(--color-profit)' : 'var(--text-secondary)' }} />
                <div style={{ fontWeight: 600 }}>{t(`${keyPrefix}.label`)}</div>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '4px', paddingLeft: 24 }}>
                {t(`${keyPrefix}.desc`)}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onPrev}><ChevronLeft size={16} /> {t('back')}</button>
        <button className="btn btn-primary" onClick={onNext} disabled={!form.strategy}>
          {t('next')} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
