'use client';

import { ChevronLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReviewStepProps, GRID_FIELDS, MEANREV_FIELDS, GRID_DEFAULTS, MEANREV_DEFAULTS, STRATEGY_KEY_MAP, FIELD_KEY_MAP } from './wizard-types';

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
      <div className="form-grid-sm">
        {[
          [t('review.name'), form.name],
          [t('review.pair'), form.pair],
          [t('review.exchange'), form.exchange.toUpperCase()],
          [t('review.capital'), `$${form.capital}`],
          [t('review.strategy'), strategyLabel],
          ...configSummary,
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div className="review-label">{label}</div>
            <div className="review-value">{value}</div>
          </div>
        ))}
      </div>
      <div className="review-note">
        {t('paperModeNote')}
      </div>

      {submitSuccess && (
        <div className="review-success">
          <CheckCircle size={16} /> {t('createSuccess')}
        </div>
      )}

      {submitError && (
        <div className="review-error">
          <AlertCircle size={16} /> {submitError}
        </div>
      )}

      <div className="flex justify-between">
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
