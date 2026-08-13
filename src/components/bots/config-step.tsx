'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ConfigStepProps, GRID_FIELDS, MEANREV_FIELDS } from './wizard-types';

export function ConfigStep({ form, updateConfig, strategy, onNext, onPrev }: ConfigStepProps) {
  const fields = strategy === 'grid' ? GRID_FIELDS : MEANREV_FIELDS;

  return (
    <div className="space-y-4">
      <h3 className="card-title">
        {strategy === 'grid' ? 'Grid Config' : 'Mean Reversion Config'}
      </h3>
      {fields.map((field) => (
        <div className="form-group" key={field.key}>
          <label className="form-label">{field.label}</label>
          <input
            type="number"
            className="form-input"
            value={form.config[field.key] ?? 0}
            onChange={(e) => updateConfig(field.key, Number(e.target.value))}
            step={field.step || '1'}
          />
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onPrev}><ChevronLeft size={16} /> Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
