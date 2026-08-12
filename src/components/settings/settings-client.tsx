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

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/auth/me');
        const json: { ok?: boolean; user?: unknown } = await res.json();
        if (json.ok && json.user) {
          // User is authenticated — fetch settings from server action
          const { getSettings } = await import('@/forest/settings/actions');
          const serverSettings = await getSettings();
          setSettings(serverSettings);
        }
        // If not authenticated, keep DEFAULT_SETTINGS — user can still configure
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
            const ex = settings.exchanges[exchange];
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
                      defaultValue={maskValue(`${exchange}-key`, ex.apiKey)}
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">API Secret</label>
                    <input
                      type="text"
                      className="form-input mono"
                      defaultValue={maskValue(`${exchange}-secret`, ex.apiSecret)}
                      readOnly
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
                  >
                    {t('settings.update', { defaultValue: 'Update' })}
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
              defaultValue={settings.risk.maxDrawdownPct}
              min={1}
              max={100}
              step={1}
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
              defaultValue={settings.risk.dailyLossLimitPct}
              min={1}
              max={100}
              step={1}
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
              defaultValue={settings.risk.cooldownMinutes}
              min={5}
              max={1440}
              step={5}
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
              defaultValue={settings.risk.maxOpenOrders}
              min={1}
              max={500}
              step={5}
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
          onClick={async () => {
            setSaving(true);
            // TODO: collect form values → call updateRiskLimits server action
            await new Promise((r) => setTimeout(r, 400));
            setSaving(false);
          }}
        >
          {saving ? 'Saving...' : t('settings.save', { defaultValue: 'Lưu thay đổi / Save' })}
        </button>
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
          >
            <Power size={16} /> {t('settings.halt', { defaultValue: 'Emergency Halt / Dừng khẩn cấp' })}
          </button>
          <button className="btn btn-primary">
            {t('settings.resume', { defaultValue: 'Resume Trading / Tiếp tục' })}
          </button>
        </div>
      </div>
    </div>
  );
}
