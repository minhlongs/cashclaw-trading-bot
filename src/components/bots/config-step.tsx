'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ConfigStepProps, GRID_FIELDS, MEANREV_FIELDS } from './wizard-types';

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

export function ConfigStep({ form, updateConfig, strategy, onNext, onPrev }: ConfigStepProps) {
  const t = useTranslations('botWizard');
  const fields = strategy === 'grid' ? GRID_FIELDS : MEANREV_FIELDS;

  return (
    <div className="space-y-4">
      <h3 className="card-title">
        {strategy === 'grid' ? t('title.gridConfig') : t('title.meanRevConfig')}
      </h3>
      {fields.map((field) => {
        const key = FIELD_KEY_MAP[field.key] ?? field.key;
        return (
          <div className="form-group" key={field.key}>
            <label className="form-label">{t(key)}</label>
            <input
              type="number"
              className="form-input"
              value={form.config[field.key] ?? 0}
              onChange={(e) => updateConfig(field.key, Number(e.target.value))}
              step={field.step || '1'}
            />
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onPrev}><ChevronLeft size={16} /> {t('back')}</button>
        <button className="btn btn-primary" onClick={onNext}>{t('next')} <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
