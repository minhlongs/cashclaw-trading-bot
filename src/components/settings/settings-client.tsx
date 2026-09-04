'use client';

import { useState, useEffect, useRef } from 'react';
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
  notification: { botToken: '', chatId: '' },
  killswitch: { enabled: false, reason: null, triggeredAt: null },
  killswitchDaily: { dailyPnl: 0, consecutiveLosses: 0, peakCapital: 0, dailyStartTime: 0 },
};

export function SettingsClient() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [ksSaving, setKsSaving] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data: { ok: boolean; data?: SettingsData } = await res.json();
          if (data.ok && data.data && !cancelled) setSettings(data.data);
        }
      } catch {
        // Network error or unauthenticated — use defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadSettings();
    return () => { cancelled = true; };
  }, []);

  const handleExchangeSave = async (exchange: string, apiKey: string, apiSecret: string, testnet: boolean) => {
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'exchange', exchange, apiKey, apiSecret, testnet }),
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

  const handleNotificationSave = async (botToken: string, chatId: string) => {
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'notification', botToken, chatId }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({
          ...prev,
          notification: { botToken, chatId },
        }));
        setSaveMessage('Telegram notifications saved!');
      } else {
        setSaveMessage(result.error ?? 'Notification save failed');
      }
    } catch {
      setSaveMessage('Network error');
    }
  };

  const handleStrategySave = async (risk: SettingsData['risk']) => {
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'risk', ...risk }),
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
        body: JSON.stringify({ type: 'killswitch', action: 'halt', reason: 'Manual halt' }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({ ...prev, killswitch: { ...prev.killswitch, enabled: false, reason: 'Manual halt' } }));
        setSaveMessage('Trading halted');
      } else {
        setSaveMessage(result.error ?? 'Halt failed');
      }
    } catch {
      setSaveMessage('Network error');
    } finally {
      if (mountedRef.current) setKsSaving(false);
    }
  };

  const handleResume = async () => {
    setKsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'killswitch', action: 'resume' }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({ ...prev, killswitch: { ...prev.killswitch, enabled: true, reason: null } }));
        setSaveMessage('Trading resumed');
      } else {
        setSaveMessage(result.error ?? 'Resume failed');
      }
    } catch {
      setSaveMessage('Network error');
    } finally {
      if (mountedRef.current) setKsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        <Loader2 size={32} className="animate-spin text-profit" />
      </div>
    );
  }

  const isErrorMessage =
    saveMessage &&
    (saveMessage.includes('failed') || saveMessage.includes('error') || saveMessage.includes('Error'));

  return (
    <div className="settings-container">
      {saveMessage && (
        <div
          className={`save-message ${isErrorMessage ? 'error' : ''}`}
        >
          {isErrorMessage ? <AlertTriangle size={16} /> : null}
          {saveMessage}
        </div>
      )}

      <ExchangeSettings exchanges={settings.exchanges} onSave={handleExchangeSave} />
      <NotificationSettings telegram={settings.notification} onSave={handleNotificationSave} />
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
              !settings.killswitch.enabled ? 'badge-error' : 'badge-neutral'
            }`}
          >
            {!settings.killswitch.enabled ? 'HALTED' : 'ACTIVE'}
          </span>
        </div>
        <div>
          <p className="killswitch-desc">
            Emergency stop: immediately halt all trading activity across all bots.
          </p>
          <div className="killswitch-actions">
            <button
              className="btn btn-danger btn-sm"
              onClick={handleHalt}
              disabled={ksSaving || !settings.killswitch.enabled}
            >
              {ksSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : null}{' '}
              Halt All Trading
            </button>
            <button
              className="btn btn-primary"
              disabled={ksSaving || settings.killswitch.enabled}
              onClick={handleResume}
            >
              {ksSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : null}{' '}
              Resume Trading
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}