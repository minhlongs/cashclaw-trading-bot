'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Bot, GitBranch, TrendingUp, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

type Step = 'basic' | 'strategy' | 'config' | 'review';

interface StrategyDef {
  value: 'grid' | 'mean_reversion';
  label: string;
  desc: string;
}

const STRATEGIES: StrategyDef[] = [
  { value: 'grid', label: 'Grid Trading', desc: 'Đặt lệnh limit nhiều mức giá / Multi-level limit orders' },
  { value: 'mean_reversion', label: 'Mean Reversion', desc: 'Bollinger Bands + RSI / Bollinger Bands + RSI' },
];

const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'bybit', label: 'Bybit' },
  { value: 'okx', label: 'OKX' },
];

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT'];

const GRID_DEFAULTS: Record<string, number> = {
  spacing_pct: 0.5,
  levels: 10,
  capital_per_level_pct: 5,
  max_drawdown_pct: 20,
};

const MEANREV_DEFAULTS: Record<string, number> = {
  bb_period: 20,
  bb_std: 2,
  rsi_period: 14,
  rsi_buy: 30,
  rsi_sell: 70,
  volume_multiplier: 1.5,
  position_size_pct: 10,
  max_drawdown_pct: 20,
};

interface FieldDef {
  key: string;
  label: string;
  step?: string;
}

const GRID_FIELDS: FieldDef[] = [
  { key: 'spacing_pct', label: 'Khoảng cách (%) / Spacing (%)', step: '0.1' },
  { key: 'levels', label: 'Số cấp lệnh / Levels' },
  { key: 'capital_per_level_pct', label: 'Vốn/cấp (%) / Capital per level (%)' },
  { key: 'max_drawdown_pct', label: 'Max Drawdown (%)', step: '1' },
];

const MEANREV_FIELDS: FieldDef[] = [
  { key: 'bb_period', label: 'BB Period', step: '1' },
  { key: 'bb_std', label: 'BB Std Dev', step: '0.1' },
  { key: 'rsi_period', label: 'RSI Period', step: '1' },
  { key: 'rsi_buy', label: 'RSI Buy Level', step: '1' },
  { key: 'rsi_sell', label: 'RSI Sell Level', step: '1' },
  { key: 'volume_multiplier', label: 'Volume Multiplier', step: '0.1' },
  { key: 'position_size_pct', label: 'Position Size (%)', step: '1' },
  { key: 'max_drawdown_pct', label: 'Max Drawdown (%)', step: '1' },
];

interface FormState {
  name: string;
  strategy: '' | 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  capital: number;
  config: Record<string, number>;
}

export default function BotWizardClient() {
  const t = useTranslations();
  const locale = useLocale();
  const [step, setStep] = useState<Step>('basic');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: '',
    strategy: '',
    pair: '',
    exchange: '',
    capital: 500,
    config: {},
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateConfig = (key: string, value: number) =>
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));

  const setStrategyDefaults = (strategy: 'grid' | 'mean_reversion') => {
    update('strategy', strategy);
    update('config', strategy === 'grid' ? { ...GRID_DEFAULTS } : { ...MEANREV_DEFAULTS });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    // Generate a unique ID
    const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
      id: botId,
      name: form.name || `Bot ${botId.slice(0, 8)}`,
      strategy: form.strategy,
      pair: form.pair,
      exchange: form.exchange,
      capital: form.capital,
      config: form.config,
      mode: 'paper' as const,
    };

    try {
      const res = await fetch(`/${locale}/api/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; data?: { id: string } };

      if (!data.ok) {
        throw new Error(data.error || 'Failed to create bot');
      }

      setSubmitSuccess(true);
      // Redirect after short delay
      const newBotId = data.data?.id;
      if (newBotId) {
        setTimeout(() => {
          window.location.href = `/${locale}/bots/${newBotId}`;
        }, 1500);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to create bot');
    } finally {
      setSubmitting(false);
    }
  };

  const steps: { key: Step; title: string; icon: typeof Bot }[] = [
    { key: 'basic', title: 'Thông tin cơ bản', icon: Bot },
    { key: 'strategy', title: 'Chiến lược', icon: GitBranch },
    { key: 'config', title: 'Cấu hình', icon: TrendingUp },
    { key: 'review', title: 'Xác nhận', icon: Bot },
  ];

  const currentIndex = steps.findIndex((s) => s.key === step);

  const fields: FieldDef[] = form.strategy === 'grid' ? GRID_FIELDS : MEANREV_FIELDS;
  const defaults: Record<string, number> = form.strategy === 'grid' ? GRID_DEFAULTS : MEANREV_DEFAULTS;

  const configSummary = form.strategy
    ? fields.map((f) => [f.label, form.config[f.key] ?? defaults[f.key]]) as [string, number][]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>
          {t('bots.createNew')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
          Tạo bot giao dịch mới / Create a new trading bot
        </p>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  background: i <= currentIndex ? 'var(--color-profit)' : 'var(--bg-elevated)',
                  color: i <= currentIndex ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                }}
              >
                {i <= currentIndex ? <Icon size={14} /> : i + 1}
              </div>
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: i === currentIndex ? 600 : 400,
                  color: i <= currentIndex ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                {s.title}
              </span>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: '32px',
                    height: '2px',
                    background: i < currentIndex ? 'var(--color-profit)' : 'var(--border-subtle)',
                    margin: '0 8px',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="card" style={{ maxWidth: '640px' }}>
        {step === 'basic' && (
          <div className="space-y-4">
            <h3 className="card-title">Thông tin cơ bản / Basic Info</h3>
            <div className="form-group">
              <label className="form-label">Tên bot / Bot Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="BTC Grid v2"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cặp giao dịch / Pair</label>
              <select
                className="form-input"
                value={form.pair}
                onChange={(e) => update('pair', e.target.value)}
              >
                <option value="">-- Chọn / Select --</option>
                {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Sàn / Exchange</label>
              <select
                className="form-input"
                value={form.exchange}
                onChange={(e) => update('exchange', e.target.value)}
              >
                <option value="">-- Chọn / Select --</option>
                {EXCHANGES.map((ex) => <option key={ex.value} value={ex.value}>{ex.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vốn / Capital (USD)</label>
              <input
                type="number"
                className="form-input"
                value={form.capital}
                onChange={(e) => update('capital', Number(e.target.value))}
                min={100}
                step={100}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={() => setStep('strategy')}
                disabled={!form.name || !form.pair || !form.exchange}
              >
                Tiếp theo <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 'strategy' && (
          <div className="space-y-4">
            <h3 className="card-title">Chọn chiến lược / Choose Strategy</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {STRATEGIES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStrategyDefaults(s.value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: form.strategy === s.value ? '2px solid var(--color-profit)' : '1px solid var(--border-subtle)',
                    background: form.strategy === s.value ? 'rgba(0, 212, 170, 0.06)' : 'var(--bg-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '4px' }}>{s.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setStep('basic')}><ChevronLeft size={16} /> Quay lại</button>
              <button className="btn btn-primary" onClick={() => setStep('config')} disabled={!form.strategy}>
                Tiếp theo <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 'config' && form.strategy && (
          <div className="space-y-4">
            <h3 className="card-title">{form.strategy === 'grid' ? 'Grid Config' : 'Mean Reversion Config'}</h3>
            {fields.map((field) => (
              <div className="form-group" key={field.key}>
                <label className="form-label">{field.label}</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.config[field.key] ?? 0}
                  onChange={(e) => updateConfig(field.key, Number(e.target.value))}
                  step={field.step || '1'}
                />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setStep('strategy')}><ChevronLeft size={16} /> Quay lại</button>
              <button className="btn btn-primary" onClick={() => setStep('review')}>Tiếp theo <ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <h3 className="card-title">Xác nhận / Review</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: 'var(--text-sm)' }}>
              {[
                ['Tên / Name', form.name],
                ['Cặp / Pair', form.pair],
                ['Sàn / Exchange', form.exchange.toUpperCase()],
                ['Vốn / Capital', `$${form.capital}`],
                ['Chiến lược / Strategy', STRATEGIES.find((s) => s.value === form.strategy)?.label || '—'],
                ...configSummary,
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{label as string}</div>
                  <div style={{ fontWeight: 600 }}>{value as string}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px', background: 'rgba(0, 212, 170, 0.06)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Bot sẽ chạy ở chế độ paper trading trước khi livenet.
              Bot will run in paper trading mode before going live.
            </div>

            {submitSuccess && (
              <div style={{ padding: '12px', background: 'rgba(0, 212, 170, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-profit)', color: 'var(--color-profit)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={16} /> Đã tạo bot thành công! Đang chuyển hướng... / Bot created successfully! Redirecting...
              </div>
            )}

            {submitError && (
              <div style={{ padding: '12px', background: 'rgba(255, 76, 76, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-error)', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} /> {submitError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setStep('config')} disabled={submitting || submitSuccess}><ChevronLeft size={16} /> Quay lại</button>
              {!submitSuccess ? (
                <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Tạo bot / Create Bot'}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
