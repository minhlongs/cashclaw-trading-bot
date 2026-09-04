'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { SettingsData } from '@/forest/settings/actions';

interface StrategySettingsProps {
  risk: SettingsData['risk'];
  onSave: (risk: SettingsData['risk']) => Promise<void>;
}

export function StrategySettings({ risk, onSave }: StrategySettingsProps) {
  const [riskConfig, setRiskConfig] = useState(risk);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(riskConfig);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>Trading Parameters</span>
        </div>
      </div>
      <div className="form-grid">
        <div>
          <label className="form-label">
            Max Drawdown %
          </label>
          <input
            type="number"
            value={riskConfig.maxDrawdownPct}
            onChange={(e) => setRiskConfig({ ...riskConfig, maxDrawdownPct: parseFloat(e.target.value) || 0 })}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">
            Daily Loss Limit %
          </label>
          <input
            type="number"
            value={riskConfig.dailyLossLimitPct}
            onChange={(e) => setRiskConfig({ ...riskConfig, dailyLossLimitPct: parseFloat(e.target.value) || 0 })}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">
            Cooldown (minutes)
          </label>
          <input
            type="number"
            value={riskConfig.cooldownMinutes}
            onChange={(e) => setRiskConfig({ ...riskConfig, cooldownMinutes: parseFloat(e.target.value) || 0 })}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">
            Max Open Orders
          </label>
          <input
            type="number"
            value={riskConfig.maxOpenOrders}
            onChange={(e) => setRiskConfig({ ...riskConfig, maxOpenOrders: parseInt(e.target.value) || 0 })}
            className="form-input"
          />
        </div>
      </div>
      <div className="mt-3">
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save Parameters'}
        </button>
      </div>
    </div>
  );
}
