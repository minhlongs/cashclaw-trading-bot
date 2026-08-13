'use client';

import { ChevronRight } from 'lucide-react';
import { type BasicStepProps, PAIRS, EXCHANGES } from './wizard-types';

export function BasicStep({ form, update, onNext }: BasicStepProps) {
  return (
    <div className="space-y-4">
      <h3 className="card-title">Basic Info / Thong tin co ban</h3>
      <div className="form-group">
        <label className="form-label">Bot Name / Ten bot</label>
        <input
          type="text"
          className="form-input"
          placeholder="BTC Grid v2"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Trading Pair / Cap giao dich</label>
        <select
          className="form-input"
          value={form.pair}
          onChange={(e) => update('pair', e.target.value)}
        >
          <option value="">-- Select / Chon --</option>
          {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Exchange / San</label>
        <select
          className="form-input"
          value={form.exchange}
          onChange={(e) => update('exchange', e.target.value)}
        >
          <option value="">-- Select / Chon --</option>
          {EXCHANGES.map((ex) => <option key={ex.value} value={ex.value}>{ex.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Capital / Von (USD)</label>
        <input
          type="number"
          className="form-input"
          value={form.capital}
          onChange={(e) => update('capital', Number(e.target.value))}
          min={100}
          step={100}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary"
          onClick={onNext}
          disabled={!form.name || !form.pair || !form.exchange}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
