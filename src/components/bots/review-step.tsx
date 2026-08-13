'use client';

import { ChevronLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { type ReviewStepProps, STRATEGIES, GRID_FIELDS, MEANREV_FIELDS, GRID_DEFAULTS, MEANREV_DEFAULTS } from './wizard-types';

export function ReviewStep({ form, submitting, submitError, submitSuccess, onSubmit, onPrev }: ReviewStepProps) {
  const fields = form.strategy === 'grid' ? GRID_FIELDS : MEANREV_FIELDS;
  const defaults = form.strategy === 'grid' ? GRID_DEFAULTS : MEANREV_DEFAULTS;

  const configSummary = form.strategy
    ? fields.map((f) => [f.label, form.config[f.key] ?? defaults[f.key]]) as [string, number][]
    : [];

  return (
    <div className="space-y-4">
      <h3 className="card-title">Review / Xac nhan</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: 'var(--text-sm)' }}>
        {[
          ['Name / Ten', form.name],
          ['Pair / Cap', form.pair],
          ['Exchange / San', form.exchange.toUpperCase()],
          ['Capital / Von', `$${form.capital}`],
          ['Strategy / Chien luoc', STRATEGIES.find((s) => s.value === form.strategy)?.label || '--'],
          ...configSummary,
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{label as string}</div>
            <div style={{ fontWeight: 600 }}>{value as string}</div>
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
        Bot se chay o che do paper trading truoc khi livenet.
        Bot will run in paper trading mode before going live.
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
          <CheckCircle size={16} /> Bot created successfully! Redirecting...
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
          <ChevronLeft size={16} /> Back
        </button>
        {!submitSuccess ? (
          <button className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Create Bot / Tao bot'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
