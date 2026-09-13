'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { SettingsData } from '@/forest/settings/actions';
import { ExchangeSettings } from './exchange-settings';
import { NotificationSettings } from './notification-settings';
import { StrategySettings } from './strategy-settings';
import { KillswitchSettings } from './killswitch-settings';

const emptyEx = { apiKey: '', apiSecret: '', testnet: true };
const DEFAULT_SETTINGS: SettingsData = {
  exchanges: { binance: { ...emptyEx }, bybit: { ...emptyEx }, okx: { ...emptyEx } },
  risk: { maxDrawdownPct: 15, dailyLossLimitPct: 10, cooldownMinutes: 60, maxOpenOrders: 10 },
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
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const d = (await res.json()) as { ok?: boolean; data?: SettingsData };
          if (d?.ok && d.data && !cancelled) setSettings(d.data);
        }
      } catch { /* Network error — use safe defaults */ } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const post = async (body: Record<string, unknown>, onOk: () => void, okMsg: string, failMsg: string) => {
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as { ok?: boolean; error?: string };
      if (result.ok) {
        onOk();
        setSaveMessage(okMsg);
      } else {
        setSaveMessage(result.error ?? failMsg);
      }
    } catch {
      setSaveMessage('Network error');
    }
  };

  const handleExchangeSave = (exchange: string, apiKey: string, apiSecret: string, testnet: boolean) =>
    post(
      { type: 'exchange', exchange, apiKey, apiSecret, testnet },
      () => setSettings((p) => ({ ...p, exchanges: { ...p.exchanges, [exchange]: { apiKey, apiSecret, testnet } } })),
      `${exchange} saved!`,
      `${exchange} save failed`,
    );

  const handleNotificationSave = (botToken: string, chatId: string) =>
    post(
      { type: 'notification', botToken, chatId },
      () => setSettings((p) => ({ ...p, notification: { botToken, chatId } })),
      'Telegram notifications saved!',
      'Notification save failed',
    );

  const handleStrategySave = (risk: SettingsData['risk']) =>
    post({ type: 'risk', ...risk }, () => setSettings((p) => ({ ...p, risk })), 'Strategy saved!', 'Save failed');

  const handleKs = async (action: 'halt' | 'resume', enabled: boolean, okMsg: string, failMsg: string) => {
    setKsSaving(true);
    try {
      await post(
        action === 'halt' ? { type: 'killswitch', action, reason: 'Manual halt' } : { type: 'killswitch', action },
        () => setSettings((p) => ({ ...p, killswitch: { ...p.killswitch, enabled, reason: action === 'halt' ? 'Manual halt' : null } })),
        okMsg,
        failMsg,
      );
    } finally {
      if (mountedRef.current) setKsSaving(false);
    }
  };
  const handleHalt = () => handleKs('halt', false, 'Trading halted', 'Halt failed');
  const handleResume = () => handleKs('resume', true, 'Trading resumed', 'Resume failed');

  if (loading) {
    return (
      <div className="settings-loading">
        <Loader2 size={32} className="animate-spin text-profit" />
      </div>
    );
  }

  const isError = saveMessage && (saveMessage.includes('failed') || saveMessage.toLowerCase().includes('error'));

  return (
    <div className="settings-container">
      {saveMessage && (
        <div className={`save-message ${isError ? 'error' : ''}`}>
          {isError ? <AlertTriangle size={16} /> : null}
          {saveMessage}
        </div>
      )}
      <ExchangeSettings exchanges={settings.exchanges} onSave={handleExchangeSave} />
      <NotificationSettings telegram={settings.notification} onSave={handleNotificationSave} />
      <StrategySettings risk={settings.risk} onSave={handleStrategySave} />
      <KillswitchSettings
        enabled={settings.killswitch.enabled}
        onHalt={handleHalt}
        onResume={handleResume}
        isSaving={ksSaving}
      />
    </div>
  );
}
