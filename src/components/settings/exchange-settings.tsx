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
          <div
            key={name}
            style={{
              padding: '12px',
              marginBottom: '8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: editing === name ? 'var(--bg-secondary)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing === name ? '12px' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={14} style={{ color: config.apiKey ? 'var(--color-profit)' : 'var(--text-tertiary)' }} />
                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{name}</span>
                {config.apiKey && (
                  <span className="badge badge-profit" style={{ fontSize: '10px' }}>
                    Configured
                  </span>
                )}
                {config.testnet && (
                  <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                    Testnet
                  </span>
                )}
              </div>
              {editing !== name && (
                <button
                  className="btn btn-ghost"
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                  onClick={() => handleEdit(name)}
                >
                  {config.apiKey ? 'Update' : 'Add'}
                </button>
              )}
            </div>

            {editing === name && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
                <input
                  type="password"
                  placeholder="API Secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={testnet}
                    onChange={(e) => setTestnet(e.target.checked)}
                    style={{ width: '14px', height: '14px' }}
                  />
                  Testnet / Sandbox
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '8px' }}
                    onClick={handleSave}
                    disabled={saving || !apiKey || !apiSecret}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '8px 12px' }}
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
