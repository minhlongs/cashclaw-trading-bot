'use client';

import { useState, useEffect } from 'react';
import { Power, AlertTriangle, Loader2 } from 'lucide-react';
import type { SettingsData } from '@/forest/settings/actions';
import { ExchangeSettings } from './exchange-settings';
import { NotificationSettings } from './notification-settings';
import { StrategySettings } from './strategy-settings';

const DEFAULT_SETTINGS: SettingsData = {
  exchanges: {
    binance: { apiKey: '', apiSecret: '', testnet: true },
    bybit: { apiKey: '', apiSecret: '', testnet: true },
    okx: { apiKey: '', apiSecret: '', testnet: true },
  },
  risk: {
    maxDrawdownPct: 15,
    dailyLossLimitPct: 10,
    cooldownMinutes: 60,
    maxOpenOrders: 10,
  },
  killswitch: { enabled: false, reason: null, triggeredAt: null },
};

export function SettingsClient() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [ksSaving, setKsSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data: { ok: boolean; data?: SettingsData } = await res.json();
          if (data.ok && data.data) setSettings(data.data);
        }
      } catch {
        // Network error or unauthenticated — use defaults
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleExchangeSave = async (exchange: string, apiKey: string, apiSecret: string, testnet: boolean) => {
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-exchange', exchange, data: { apiKey, apiSecret, testnet } }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({
          ...prev,
          exchanges: { ...prev.exchanges, [exchange]: { apiKey, apiSecret, testnet } },
        }));
        setSaveMessage(`${exchange} saved!`);
      } else {
        setSaveMessage(result.error ?? `${exchange} save failed`);
      }
    } catch {
      setSaveMessage('Network error');
    }
  };

  const handleNotificationSave = async (_botToken: string, _chatId: string) => {
    setSaveMessage(null);
    setSaveMessage('Telegram notifications saved (placeholder)');
  };

  const handleStrategySave = async (risk: SettingsData['risk']) => {
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-risk', data: { risk } }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({ ...prev, risk }));
        setSaveMessage('Strategy saved!');
      } else {
        setSaveMessage(result.error ?? 'Save failed');
      }
    } catch {
      setSaveMessage('Network error');
    }
  };

  const handleHalt = async () => {
    setKsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'halt' }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({ ...prev, killswitch: { ...prev.killswitch, enabled: true, reason: 'Manual halt' } }));
        setSaveMessage('Trading halted');
      } else {
        setSaveMessage(result.error ?? 'Halt failed');
      }
    } catch {
      setSaveMessage('Network error');
    } finally {
      setKsSaving(false);
    }
  };

  const handleResume = async () => {
    setKsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({ ...prev, killswitch: { ...prev.killswitch, enabled: false, reason: null } }));
        setSaveMessage('Trading resumed');
      } else {
        setSaveMessage(result.error ?? 'Resume failed');
      }
    } catch {
      setSaveMessage('Network error');
    } finally {
      setKsSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-profit)' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px' }}>
      {saveMessage && (
        <div
          style={{
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(0, 255, 136, 0.1)',
            border: '1px solid var(--color-profit)',
            color:
              saveMessage.includes('failed') || saveMessage.includes('error') || saveMessage.includes('Error')
                ? 'var(--color-error)'
                : 'var(--color-profit)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {saveMessage.includes('failed') || saveMessage.includes('error') ? (
            <AlertTriangle size={16} />
          ) : null}
          {saveMessage}
        </div>
      )}

      <ExchangeSettings exchanges={settings.exchanges} onSave={handleExchangeSave} />
      <NotificationSettings telegram={{ botToken: '', chatId: '' }} onSave={handleNotificationSave} />
      <StrategySettings risk={settings.risk} onSave={handleStrategySave} />

      {/* Kill Switch */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Power size={16} />
            <span>Kill Switch</span>
          </div>
          <span
            className={`badge ${
              settings.killswitch.enabled ? 'badge-error' : 'badge-neutral'
            }`}
          >
            {settings.killswitch.enabled ? 'HALTED' : 'ACTIVE'}
          </span>
        </div>
        <div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Emergency stop: immediately halt all trading activity across all bots.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-danger"
              style={{ padding: '8px 16px' }}
              onClick={handleHalt}
              disabled={ksSaving || settings.killswitch.enabled}
            >
              {ksSaving ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : null}{' '}
              Halt All Trading
            </button>
            <button
              className="btn btn-primary"
              disabled={ksSaving}
              onClick={handleResume}
            >
              {ksSaving ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : null}{' '}
              Resume Trading
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
