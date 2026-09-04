'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type BasicStepProps, PAIRS, EXCHANGES } from './wizard-types';

export function BasicStep({ form, update, onNext }: BasicStepProps) {
  const t = useTranslations('botWizard');

  return (
    <div className="space-y-4">
      <h3 className="card-title">{t('title.basic')}</h3>
      <div className="form-group">
        <label className="form-label">{t('botName')}</label>
        <input
          type="text"
          className="form-input"
          placeholder="BTC Grid v2"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">{t('tradingPair')}</label>
        <select
          className="form-input"
          value={form.pair}
          onChange={(e) => update('pair', e.target.value)}
        >
          <option value="">{t('select')}</option>
          {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">{t('exchange')}</label>
        <select
          className="form-input"
          value={form.exchange}
          onChange={(e) => update('exchange', e.target.value)}
        >
          <option value="">{t('select')}</option>
          {EXCHANGES.map((ex) => <option key={ex.value} value={ex.value}>{ex.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">{t('capitalUsd')}</label>
        <input
          type="number"
          className="form-input"
          value={form.capital}
          onChange={(e) => update('capital', Number(e.target.value))}
          min={100}
          step={100}
        />
      </div>
      <div className="flex justify-end">
        <button
          className="btn btn-primary"
          onClick={onNext}
          disabled={!form.name || !form.pair || !form.exchange}
        >
          {t('next')} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
