'use client';

import { useState, useRef, useEffect } from 'react';
import { Shield, Key, Loader2 } from 'lucide-react';
import type { SettingsData } from '@/forest/settings/actions';

interface ExchangeSettingsProps {
  exchanges: SettingsData['exchanges'];
  onSave: (exchange: string, apiKey: string, apiSecret: string, testnet: boolean) => Promise<void>;
}

export function ExchangeSettings({ exchanges, onSave }: ExchangeSettingsProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [testnet, setTestnet] = useState(true);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleEdit = (exchange: string) => {
    const config = exchanges[exchange as keyof typeof exchanges];
    setEditing(exchange);
    setApiKey(config.apiKey);
    setApiSecret(config.apiSecret);
    setTestnet(config.testnet);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await onSave(editing, apiKey, apiSecret, testnet);
      if (mountedRef.current) setEditing(null);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const exchangeEntries = Object.entries(exchanges) as [string, SettingsData['exchanges']['binance']][];

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Key size={16} />
          <span>Exchange API Keys</span>
        </div>
      </div>
      <div>
        {exchangeEntries.map(([name, config]) => (
          <div key={name} className="exchange-card">
            <div className="exchange-card-header">
              <div className="exchange-card-title">
                <Shield size={14} className={config.apiKey ? 'exchange-active' : 'exchange-inactive'} />
                <span className="font-600 text-cap">{name}</span>
                {config.apiKey && (
                  <span className="badge badge-profit text-xs-sm">
                    Configured
                  </span>
                )}
                {config.testnet && (
                  <span className="badge badge-neutral text-xs-sm">
                    Testnet
                  </span>
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
                <input
                  type="text"
                  placeholder="API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="form-input"
                />
                <input
                  type="password"
                  placeholder="API Secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="form-input"
                />
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
                    onClick={handleSave}
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
        ))}
      </div>
    </div>
  );
}
