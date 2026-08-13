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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Max Drawdown %
          </label>
          <input
            type="number"
            value={riskConfig.maxDrawdownPct}
            onChange={(e) => setRiskConfig({ ...riskConfig, maxDrawdownPct: parseFloat(e.target.value) || 0 })}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Daily Loss Limit %
          </label>
          <input
            type="number"
            value={riskConfig.dailyLossLimitPct}
            onChange={(e) => setRiskConfig({ ...riskConfig, dailyLossLimitPct: parseFloat(e.target.value) || 0 })}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Cooldown (minutes)
          </label>
          <input
            type="number"
            value={riskConfig.cooldownMinutes}
            onChange={(e) => setRiskConfig({ ...riskConfig, cooldownMinutes: parseFloat(e.target.value) || 0 })}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Max Open Orders
          </label>
          <input
            type="number"
            value={riskConfig.maxOpenOrders}
            onChange={(e) => setRiskConfig({ ...riskConfig, maxOpenOrders: parseInt(e.target.value) || 0 })}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
      <div style={{ marginTop: '12px' }}>
        <button
          className="btn btn-primary"
          style={{ padding: '8px 16px' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save Parameters'}
        </button>
      </div>
    </div>
  );
}
