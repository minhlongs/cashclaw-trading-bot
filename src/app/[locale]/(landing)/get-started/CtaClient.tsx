'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

const STEPS_VI = [
  { icon: '📋', title: 'Chọn chiến lược', desc: 'Grid hoặc Mean Reversion — bạn chọn phù hợp mục tiêu.' },
  { icon: '🔌', title: 'Kết nối sàn', desc: 'Nhập API key Binance/Bybit/OKX — được mã hoá, lưu an toàn.' },
  { icon: '▶️', title: 'Chạy paper trading', desc: 'Thử nghiệm 7 ngày không tốn tiền thật — xem kết quả trước khi live.' },
  { icon: '📈', title: 'Thu lãi', desc: 'Bot chạy tự động, bạn nhận báo cáo qua Telegram mỗi ngày.' },
];
const STEPS_EN = [
  { icon: '📋', title: 'Pick a Strategy', desc: 'Grid or Mean Reversion — choose what fits your goals.' },
  { icon: '🔌', title: 'Connect Exchange', desc: 'Enter Binance/Bybit/OKX API key — encrypted, safe storage.' },
  { icon: '▶️', title: 'Run Paper Trading', desc: '7-day free trial with simulated funds — see results before going live.' },
  { icon: '📈', title: 'Earn Profit', desc: 'Bot runs 24/7, you get daily reports via Telegram.' },
];

const GUARANTEE_VI = [
  'Không khoá hợp đồng — hủy bất cứ lúc nào',
  'API key của bạn được mã hoá, chúng tôi không thể rút tiền',
  'Thử nghiệm 7 ngày miễn phí, dùng paper trading trước',
  'Hỗ trợ Telegram 1-1 cho gói Pro',
];
const GUARANTEE_EN = [
  'No lock-in contract — cancel anytime',
  'Your API key is encrypted — we cannot withdraw funds',
  '7-day free trial with paper trading first',
  '1-1 Telegram support for Pro plan',
];

export default function CtaClient() {
  const locale = useLocale();
  const router = useRouter();
  const t = (vi: string, en: string) => locale === 'vi' ? vi : en;
  const steps = locale === 'vi' ? STEPS_VI : STEPS_EN;
  const guarantees = locale === 'vi' ? GUARANTEE_VI : GUARANTEE_EN;

  return (
    <div className="landing-root">
      {/* Nav */}
      <nav className="landing-nav">
        <span className="landing-logo">CashClaw</span>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/${locale}`)}>
          {t('← Quay lại', '← Back')}
        </button>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="hero-icon">{t('🚀', '🚀')}</div>
        <h1 className="hero-title text-accent">{t('Bắt đầu ngay', 'Get Started Now')}</h1>
        <p className="hero-subtitle">{t('Tạo bot đầu tiên trong vài phút. Chúng tôi hướng dẫn từng bước.', 'Create your first bot in minutes. We\'ll guide you step-by-step.')}</p>
        <p className="hero-note">{t('Nền tảng vận hành trên Cloudflare — an toàn, nhanh, toàn cầu.', 'Powered by Cloudflare — safe, fast, worldwide.')}</p>
        <button className="btn btn-primary btn-lg" style={{ marginTop: 24 }} onClick={() => router.push(`/${locale}/bots/new`)}>
          {t('Tạo bot đầu tiên →', 'Create First Bot →')}
        </button>
      </section>

      {/* Steps */}
      <section className="landing-section">
        <h2 className="section-title">{t('Điều gì xảy ra tiếp theo?', 'What happens next?')}</h2>
        <div className="steps-grid">
          {steps.map((s) => (
            <div key={s.title} className="step-card">
              <span className="step-icon">{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Guarantee */}
      <section className="landing-section">
        <div className="guarantee-card">
          <span className="guarantee-icon">🛡️</span>
          <h2 className="section-title">{t('Cam kết của chúng tôi', 'Our Commitment')}</h2>
          <ul className="guarantee-list">
            {guarantees.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-cta-section">
        <button className="btn btn-primary btn-lg" onClick={() => router.push(`/${locale}/bots/new`)}>
          {t('Đăng ký & tạo bot đầu tiên', 'Sign Up & Create First Bot')} →
        </button>
        <p className="cta-note">{t('Không cần thẻ tín dụng để bắt đầu.', 'No credit card required to start.')}</p>
      </section>
    </div>
  );
}
