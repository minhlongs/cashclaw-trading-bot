'use client';

import { Shield, Loader2 } from 'lucide-react';
import type { SettingsData } from '@/forest/settings/actions';
import type { useExchangeSettingsState } from './exchange-settings-state';

interface ExchangeSettingsCardProps {
  name: string;
  config: SettingsData['exchanges']['binance'];
  state: ReturnType<typeof useExchangeSettingsState>;
  onSave: (exchange: string, apiKey: string, apiSecret: string, testnet: boolean) => Promise<void>;
}

export function ExchangeSettingsCard({ name, config, state, onSave }: ExchangeSettingsCardProps) {
  const {
    editing,
    apiKey,
    apiSecret,
    testnet,
    saving,
    setApiKey,
    setApiSecret,
    setTestnet,
    setEditing,
    handleEdit,
    handleSave,
  } = state;

  return (
    <div className="exchange-card">
      <div className="exchange-card-header">
        <div className="exchange-card-title">
          <Shield size={14} className={config.apiKey ? 'exchange-active' : 'exchange-inactive'} />
          <span className="font-600 text-cap">{name}</span>
          {config.apiKey && (
            <span className="badge badge-profit text-xs-sm">Configured</span>
          )}
          {config.testnet && (
            <span className="badge badge-neutral text-xs-sm">Testnet</span>
          )}
        </div>
        {editing !== name && (
          <button
            className="btn btn-ghost btn-sm-ghost"
            onClick={() => handleEdit(name)}
          >
            {config.apiKey ? 'Update' : 'Add'}
          </button>
        )}
      </div>

      {editing === name && (
        <div className="exchange-card-body">
          <div>
            <label className="form-label" htmlFor={`exchange-${name}-key`}>
              API Key
            </label>
            <input
              id={`exchange-${name}-key`}
              type="text"
              placeholder="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label" htmlFor={`exchange-${name}-secret`}>
              API Secret
            </label>
            <input
              id={`exchange-${name}-secret`}
              type="password"
              placeholder="API Secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="form-input"
            />
          </div>
          <label className="config-field">
            <input
              type="checkbox"
              checked={testnet}
              onChange={(e) => setTestnet(e.target.checked)}
            />
            Testnet / Sandbox
          </label>
          <div className="flex-gap-2">
            <button
              className="btn btn-primary flex-1"
              onClick={() => handleSave(onSave)}
              disabled={saving || !apiKey || !apiSecret}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}