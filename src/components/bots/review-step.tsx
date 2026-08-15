'use client';

import { ChevronLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReviewStepProps, GRID_FIELDS, MEANREV_FIELDS, GRID_DEFAULTS, MEANREV_DEFAULTS } from './wizard-types';

const STRATEGY_KEY_MAP: Record<string, string> = {
  grid: 'strategies.grid',
  mean_reversion: 'strategies.mean_reversion',
};

const FIELD_KEY_MAP: Record<string, string> = {
  spacing_pct: 'fields.spacingPct',
  levels: 'fields.levels',
  capital_per_level_pct: 'fields.capitalPerLevelPct',
  max_drawdown_pct: 'fields.maxDrawdownPct',
  bb_period: 'fields.bbPeriod',
  bb_std: 'fields.bbStd',
  rsi_period: 'fields.rsiPeriod',
  rsi_buy_threshold: 'fields.rsiBuy',
  rsi_sell_threshold: 'fields.rsiSell',
  volume_multiplier: 'fields.volumeMultiplier',
  position_size_pct: 'fields.positionSizePct',
};

export function ReviewStep({ form, submitting, submitError, submitSuccess, onSubmit, onPrev }: ReviewStepProps) {
  const t = useTranslations('botWizard');
  const fields = form.strategy === 'grid' ? GRID_FIELDS : MEANREV_FIELDS;
  const defaults = form.strategy === 'grid' ? GRID_DEFAULTS : MEANREV_DEFAULTS;

  const configSummary = form.strategy
    ? fields.map((f) => {
        const key = FIELD_KEY_MAP[f.key] ?? f.key;
        return [t(key), form.config[f.key] ?? defaults[f.key]] as [string, number];
      })
    : [];

  const strategyLabel = form.strategy
    ? t(`${STRATEGY_KEY_MAP[form.strategy] ?? form.strategy}.label`)
    : '--';

  return (
    <div className="space-y-4">
      <h3 className="card-title">{t('title.review')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: 'var(--text-sm)' }}>
        {[
          [t('review.name'), form.name],
          [t('review.pair'), form.pair],
          [t('review.exchange'), form.exchange.toUpperCase()],
          [t('review.capital'), `$${form.capital}`],
          [t('review.strategy'), strategyLabel],
          ...configSummary,
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{label}</div>
            <div style={{ fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{
        padding: '12px',
        background: 'rgba(0, 212, 170, 0.06)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)'
      }}>
        {t('paperModeNote')}
      </div>

      {submitSuccess && (
        <div style={{
          padding: '12px',
          background: 'rgba(0, 212, 170, 0.1)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-profit)',
          color: 'var(--color-profit)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle size={16} /> {t('createSuccess')}
        </div>
      )}

      {submitError && (
        <div style={{
          padding: '12px',
          background: 'rgba(255, 76, 76, 0.1)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-error)',
          color: 'var(--color-error)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} /> {submitError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onPrev} disabled={submitting || submitSuccess}>
          <ChevronLeft size={16} /> {t('back')}
        </button>
        {!submitSuccess ? (
          <button className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : t('createBot')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
