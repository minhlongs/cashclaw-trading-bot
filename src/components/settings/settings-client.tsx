'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { Shield, Key, Zap, Power, AlertTriangle, Loader2 } from 'lucide-react';
import type { SettingsData } from '@/forest/settings/actions';

const DEFAULT_SETTINGS: SettingsData = {
  exchanges: {
    binance: { apiKey: '', apiSecret: '', testnet: true },
    bybit: { apiKey: '', apiSecret: '', testnet: true },
    okx: { apiKey: '', apiSecret: '', testnet: true },
  },
  risk: {
    maxDrawdownPct: 15,
    dailyLossLimitPct: 10,
    cooldownMinutes: 30,
    maxOpenOrders: 50,
  },
  killswitch: {
    enabled: true,
    reason: null,
    triggeredAt: null,
  },
};

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
      <Icon size={18} style={{ color: 'var(--color-profit)' }} />
      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</h2>
    </div>
  );
}

export default function SettingsClient() {
  const t = useTranslations();
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [riskDraft, setRiskDraft] = useState(DEFAULT_SETTINGS.risk);
  const [exchangeDrafts, setExchangeDrafts] = useState(DEFAULT_SETTINGS.exchanges);
  const [exchangeSaving, setExchangeSaving] = useState<Record<string, boolean>>({});
  const [ksSaving, setKsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { getSettings } = await import('@/forest/settings/actions');
        const serverSettings = await getSettings();
        setSettings(serverSettings);
        setRiskDraft(serverSettings.risk);
        setExchangeDrafts(serverSettings.exchanges);
      } catch {
        // Network error or unauthenticated — use defaults
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const toggleSecret = (key: string) =>
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));

  const maskValue = (key: string, value: string) =>
    !showSecrets[key] && value ? '••••••••••••••••' : value;

  const handleSaveRisk = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'risk',
          maxDrawdownPct: riskDraft.maxDrawdownPct,
          dailyLossLimitPct: riskDraft.dailyLossLimitPct,
          cooldownMinutes: riskDraft.cooldownMinutes,
          maxOpenOrders: riskDraft.maxOpenOrders,
        }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({ ...prev, risk: { ...riskDraft } }));
        setSaveMessage('Saved / Da luu');
      } else {
        setSaveMessage(result.error ?? 'Save failed');
      }
    } catch {
      setSaveMessage('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateExchange = async (
    exchange: 'binance' | 'bybit' | 'okx',
  ) => {
    const draft = exchangeDrafts[exchange];
    if (!draft.apiKey.trim() || !draft.apiSecret.trim()) return;
    setExchangeSaving((prev) => ({ ...prev, [exchange]: true }));
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'exchange',
          exchange,
          apiKey: draft.apiKey,
          apiSecret: draft.apiSecret,
          testnet: draft.testnet,
        }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({
          ...prev,
          exchanges: { ...prev.exchanges, [exchange]: draft },
        }));
        setSaveMessage(`${exchange} credentials saved`);
      } else {
        setSaveMessage(result.error ?? `${exchange} save failed`);
      }
    } catch {
      setSaveMessage('Network error');
    } finally {
      setExchangeSaving((prev) => ({ ...prev, [exchange]: false }));
    }
  };

  const handleEmergencyHalt = async () => {
    setKsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'killswitch', action: 'halt', reason: 'Manual halt from settings' }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({
          ...prev,
          killswitch: { enabled: false, reason: 'Manual halt from settings', triggeredAt: Date.now() },
        }));
        setSaveMessage('Trading halted / Da dung');
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
        body: JSON.stringify({ type: 'killswitch', action: 'resume' }),
      });
      const result: { ok: boolean; error?: string } = await res.json();
      if (result.ok) {
        setSettings((prev) => ({
          ...prev,
          killswitch: { enabled: true, reason: null, triggeredAt: null },
        }));
        setSaveMessage('Trading resumed / Tiep tuc');
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
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Loader2 size={32} style={{ color: 'var(--color-profit)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>
        {t('settings.title', { defaultValue: 'Cài đặt / Settings' })}
      </h1>

      {/* Exchange Credentials */}
      <div className="card">
        <SectionHeader
          icon={Key}
          title="Exchange Credentials / Thông tin API Sàn"
        />
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
            marginBottom: '16px',
          }}
        >
          API keys stored securely. Paper mode — no real funds at risk.
          API keys được lưu an toàn. Chế độ paper — không dùng tiền thật.
        </p>

        {(Object.keys(settings.exchanges) as Array<keyof typeof settings.exchanges>).map(
          (exchange) => {
            const ex = exchangeDrafts[exchange];
            const isDirty =
              ex.apiKey !== settings.exchanges[exchange].apiKey ||
              ex.apiSecret !== settings.exchanges[exchange].apiSecret ||
              ex.testnet !== settings.exchanges[exchange].testnet;
            return (
              <div
                key={exchange}
                style={{
                  padding: '16px',
                  background: 'var(--bg-primary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 'var(--text-sm)' }}>
                    {exchange}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: ex.testnet ? 'rgba(0,212,170,0.1)' : 'rgba(255,165,0,0.1)',
                      color: ex.testnet ? 'var(--color-profit)' : '#ffa500',
                      fontWeight: 500,
                    }}
                  >
                    TESTNET
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">API Key</label>
                    <input
                      type="text"
                      className="form-input mono"
                      value={maskValue(`${exchange}-key`, ex.apiKey)}
                      readOnly={!showSecrets[exchange]}
                      onChange={(e) =>
                        setExchangeDrafts((prev) => ({
                          ...prev,
                          [exchange]: { ...prev[exchange], apiKey: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">API Secret</label>
                    <input
                      type="text"
                      className="form-input mono"
                      value={maskValue(`${exchange}-secret`, ex.apiSecret)}
                      readOnly={!showSecrets[exchange]}
                      onChange={(e) =>
                        setExchangeDrafts((prev) => ({
                          ...prev,
                          [exchange]: { ...prev[exchange], apiSecret: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 'var(--text-xs)' }}
                    onClick={() => toggleSecret(exchange)}
                  >
                    {showSecrets[exchange] ? 'Hide' : 'Reveal'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 'var(--text-xs)' }}
                    disabled={exchangeSaving[exchange] || !isDirty}
                    onClick={() => handleUpdateExchange(exchange)}
                  >
                    {exchangeSaving[exchange] ? (
                      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      t('settings.update', { defaultValue: 'Update' })
                    )}
                  </button>
                </div>
              </div>
            );
          },
        )}
      </div>

      {/* Risk Limits */}
      <div className="card">
        <SectionHeader icon={Shield} title="Risk Limits / Giới hạn Rủi ro" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Max Drawdown (%)</label>
            <input
              type="number"
              className="form-input"
              value={riskDraft.maxDrawdownPct}
              min={1}
              max={100}
              step={1}
              onChange={(e) =>
                setRiskDraft((prev) => ({ ...prev, maxDrawdownPct: Number(e.target.value) }))
              }
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Halt all bots if portfolio drops this percentage
            </span>
          </div>
          <div className="form-group">
            <label className="form-label">Daily Loss Limit (%)</label>
            <input
              type="number"
              className="form-input"
              value={riskDraft.dailyLossLimitPct}
              min={1}
              max={100}
              step={1}
              onChange={(e) =>
                setRiskDraft((prev) => ({ ...prev, dailyLossLimitPct: Number(e.target.value) }))
              }
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Tạm dừng nếu tổng lãi/lỗ ngày vượt ngưỡng
            </span>
          </div>
          <div className="form-group">
            <label className="form-label">Cooldown (minutes)</label>
            <input
              type="number"
              className="form-input"
              value={riskDraft.cooldownMinutes}
              min={5}
              max={1440}
              step={5}
              onChange={(e) =>
                setRiskDraft((prev) => ({ ...prev, cooldownMinutes: Number(e.target.value) }))
              }
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Thời gian chờ sau chuỗi lỗ / Wait after consecutive losses
            </span>
          </div>
          <div className="form-group">
            <label className="form-label">Max Open Orders</label>
            <input
              type="number"
              className="form-input"
              value={riskDraft.maxOpenOrders}
              min={1}
              max={500}
              step={5}
              onChange={(e) =>
                setRiskDraft((prev) => ({ ...prev, maxOpenOrders: Number(e.target.value) }))
              }
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Giới hạn tổng lệnh mở toàn hệ thống
            </span>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: '16px' }}
          disabled={saving}
          onClick={handleSaveRisk}
        >
          {saving ? 'Saving...' : t('settings.save', { defaultValue: 'Lưu thay đổi / Save' })}
        </button>
        {saveMessage && (
          <span
            style={{
              marginLeft: '12px',
              fontSize: 'var(--text-xs)',
              color: saveMessage.includes('failed') || saveMessage.includes('error') || saveMessage.includes('Error')
                ? '#ff5050'
                : 'var(--color-profit)',
            }}
          >
            {saveMessage}
          </span>
        )}
      </div>

      {/* Killswitch */}
      <div className="card">
        <SectionHeader icon={Power} title="Global Killswitch / Dừng khẩn cấp" />
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
            marginBottom: '16px',
          }}
        >
          Dừng toàn bộ giao dịch ngay lập tức. Cần resume thủ công.
          / Stop all trading immediately. Requires manual resume.
        </p>

        {settings.killswitch.enabled ? (
          <div
            style={{
              padding: '16px',
              background: 'rgba(0, 212, 170, 0.06)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(0, 212, 170, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} style={{ color: 'var(--color-profit)' }} />
              <span style={{ fontWeight: 600, color: 'var(--color-profit)' }}>
                Trading Active / Đang giao dịch
              </span>
            </div>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                marginTop: '6px',
              }}
            >
              Auto-killswitch: {settings.risk.dailyLossLimitPct}% daily loss,{' '}
              {settings.risk.maxDrawdownPct}% drawdown, {settings.risk.cooldownMinutes}min cooldown
            </p>
          </div>
        ) : (
          <div
            style={{
              padding: '16px',
              background: 'rgba(255, 80, 80, 0.06)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 80, 80, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} style={{ color: '#ff5050' }} />
              <span style={{ fontWeight: 600, color: '#ff5050' }}>
                Trading Halted / Đã dừng
              </span>
            </div>
            {settings.killswitch.reason && (
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  marginTop: '6px',
                }}
              >
                Reason / Lý do: {settings.killswitch.reason}
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button
            className="btn btn-ghost"
            style={{ color: '#ff5050' }}
            disabled={ksSaving}
            onClick={handleEmergencyHalt}
          >
            {ksSaving ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Power size={16} />
            )}{' '}
            {t('settings.halt', { defaultValue: 'Emergency Halt / Dừng khẩn cấp' })}
          </button>
          <button
            className="btn btn-primary"
            disabled={ksSaving}
            onClick={handleResume}
          >
            {ksSaving ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : null}{' '}
            {t('settings.resume', { defaultValue: 'Resume Trading / Tiếp tục' })}
          </button>
        </div>
      </div>
    </div>
  );
}
