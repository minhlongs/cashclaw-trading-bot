'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

const FEATURES_VI = [
  { icon: '🤖', title: 'Bot AI thông minh', desc: 'Chiến lược tự động tối ưu chốt lãi, giảm rủi ro nhờ thuật toán nâng cao.' },
  { icon: '📊', title: 'Hiệu quả minh bạch', desc: 'Theo dõi toàn bộ lịch sử giao dịch, tối ưu hiệu suất bot.' },
  { icon: '🔒', title: 'An toàn là ưu tiên', desc: 'Không khoá hợp đồng, hủy bất cứ lúc nào. Bạn hoàn toàn làm chủ.' },
  { icon: '💼', title: 'Linh hoạt mọi mục tiêu', desc: 'Phù hợp đầu tư ngắn, trung và dài hạn. Tùy chỉnh theo chiến lược của bạn.' },
];
const FEATURES_EN = [
  { icon: '🤖', title: 'Smart AI Bots', desc: 'Auto-optimized strategies to maximize gains and reduce risk.' },
  { icon: '📊', title: 'Transparent Performance', desc: 'Full trade history and bot performance at a glance.' },
  { icon: '🔒', title: 'Safety First', desc: 'No contracts, cancel anytime. You\'re always in control.' },
  { icon: '💼', title: 'Flexible for Any Goal', desc: 'Short, medium, or long-term investing fully customizable.' },
];

const STATS_VI = [
  { value: '$500+', label: 'Vốn tối thiểu' },
  { value: '2–10%', label: 'Lợi nhuận mục tiêu/tháng' },
  { value: '24/7', label: 'Chạy tự động không ngừng' },
  { value: '100%', label: 'Bạn làm chủ tiền của mình' },
];
const STATS_EN = [
  { value: '$500+', label: 'Minimum capital' },
  { value: '2–10%', label: 'Target monthly return' },
  { value: '24/7', label: 'Runs non-stop' },
  { value: '100%', label: 'Your money, your control' },
];

const STEPS_VI = [
  { n: '01', title: 'Chọn chiến lược', desc: 'Grid hoặc Mean Reversion — phù hợp với mục tiêu của bạn.' },
  { n: '02', title: 'Nạp tiền', desc: 'Nạp tiền vào tài khoản giao dịch của bạn.' },
  { n: '03', title: 'Nhận kết quả', desc: 'Ngồi lại và theo dõi bot tự động chạy, gửi báo cáo qua Telegram.' },
];
const STEPS_EN = [
  { n: '01', title: 'Choose Strategy', desc: 'Grid or Mean Reversion — pick what fits your goals.' },
  { n: '02', title: 'Fund Account', desc: 'Deposit funds into your trading account.' },
  { n: '03', title: 'Get Results', desc: 'Relax while the bot runs and sends reports to Telegram.' },
];

const PRICING_VI = [
  { name: 'Starter', price: '99K', unit: '/ngày', features: ['Vốn: từ $500', 'Grid', 'Hỗ trợ Email'], cta: 'Bắt đầu' },
  { name: 'Pro', price: '199K', unit: '/ngày', features: ['Vốn: từ $1,000', 'Grid + Mean Rev', 'Telegram 1-1'], cta: 'Bắt đầu', popular: true },
];
const PRICING_EN = [
  { name: 'Starter', price: '$25', unit: '/day', features: ['Capital: from $500', 'Grid', 'Email support'], cta: 'Start' },
  { name: 'Pro', price: '$49', unit: '/day', features: ['Capital: from $1,000', 'Grid + Mean Rev', '1-1 Telegram'], cta: 'Start', popular: true },
];

export default function LandingClient() {
  const locale = useLocale();
  const router = useRouter();
  const t = (vi: string, en: string) => locale === 'vi' ? vi : en;
  const features = locale === 'vi' ? FEATURES_VI : FEATURES_EN;
  const stats = locale === 'vi' ? STATS_VI : STATS_EN;
  const steps = locale === 'vi' ? STEPS_VI : STEPS_EN;
  const pricing = locale === 'vi' ? PRICING_VI : PRICING_EN;

  return (
    <div className="landing-root">
      {/* Nav */}
      <nav className="landing-nav">
        <span className="landing-logo">{t('CashClaw', 'CashClaw')}</span>
        <button className="btn btn-primary btn-sm" onClick={() => router.push(`/${locale}/get-started`)}>
          {t('Bắt đầu ngay', 'Get Started')}
        </button>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="hero-badge">{t('🤖 Bot giao dịch tự động', '🤖 Automated Trading Bot')} <span className="hero-badge-sub">{t('cho người bận rộn', 'for busy busy people')}</span></div>
        <h1 className="hero-title">
          {t('Chốt lãi tự động', 'Auto-profit')}
          <br />
          <span className="text-accent">{t('không cần canh sàn', 'without watching charts')}</span>
        </h1>
        <p className="hero-subtitle">
          {t('CashClaw chạy 24/7 trên Binance, Bybit, OKX. Bạn đặt chiến lược, bot chốt lãi — kết quả gửi về Telegram.', 'CashClaw runs 24/7 on Binance, Bybit, OKX. Set your strategy, the bot books profits — results sent to Telegram.')}
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={() => router.push(`/${locale}/get-started`)}>
            {t('Bắt đầu miễn phí', 'Start Free')} →
          </button>
        </div>
        <p className="hero-trust">{t('🔒 An toàn · Không khoá hợp đồng · Thử nghiệm 7 ngày', '🔒 Safe · No lock-in · 7-day trial')}</p>
      </section>

      {/* Features */}
      <section className="landing-section">
        <h2 className="section-title">{t('Tại sao chọn CashClaw?', 'Why CashClaw?')}</h2>
        <div className="features-grid">
          {features.map((f) => (
            <div key={f.title} className="feature-card">
              <span className="feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="landing-section">
        <p className="section-label">{t('Hiệu quả đã được chứng minh', 'Proven Performance')}</p>
        <div className="stats-grid">
          {stats.map((s) => (
            <div key={s.label} className="stat-item">
              <span className="stat-value text-accent">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="landing-section">
        <h2 className="section-title">{t('Bắt đầu chỉ 3 bước', 'Start in 3 Steps')}</h2>
        <div className="steps-grid">
          {steps.map((s) => (
            <div key={s.n} className="step-card">
              <span className="step-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="landing-section">
        <h2 className="section-title">{t('Gói dịch vụ', 'Pricing')}</h2>
        <div className="pricing-grid">
          {pricing.map((p) => (
            <div key={p.name} className={`pricing-card ${p.popular ? 'pricing-popular' : ''}`}>
              {p.popular && <span className="pricing-badge">{t('Phổ biến', 'Popular')}</span>}
              <h3>{p.name}</h3>
              <div className="pricing-price">
                <span className="text-accent">{p.price}</span>
                <span className="text-tertiary">{p.unit}</span>
              </div>
              <ul className="pricing-features">
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <button className="btn btn-primary btn-block" onClick={() => router.push(`/${locale}/get-started`)}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="landing-cta-section">
        <h2 className="text-accent">{t('Sẵn sàng giao dịch tự động?', 'Ready to trade automatically?')}</h2>
        <p className="text-secondary">{t('Thử nghiệm 7 ngày miễn phí. Không ràng buộc.', '7-day free trial. No commitment.')}</p>
        <button className="btn btn-primary btn-lg" onClick={() => router.push(`/${locale}/get-started`)}>
          {t('Đăng ký ngay', 'Sign Up Now')} →
        </button>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span>© 2026 CashClaw</span>
      </footer>
    </div>
  );
}
