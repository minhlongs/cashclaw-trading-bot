'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

interface Feature {
  icon: string;
  title: string;
  desc: string;
}

interface Stat {
  value: string;
  label: string;
}

interface Step {
  n: string;
  title: string;
  desc: string;
}

interface PricingPlan {
  name: string;
  price: string;
  unit: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

export default function LandingClient() {
  const t = useTranslations('landing');
  const locale = useLocale();
  const router = useRouter();

  const features = t.raw('features.items') as Feature[];
  const stats = t.raw('stats.items') as Stat[];
  const steps = t.raw('steps.items') as Step[];
  const pricing = t.raw('pricing.plans') as PricingPlan[];

  return (
    <div className="landing-root">
      {/* Nav */}
      <nav className="landing-nav">
        <span className="landing-logo">{t('nav.logo')}</span>
        <button className="btn btn-primary btn-sm" onClick={() => router.push(`/${locale}/get-started`)}>
          {t('nav.cta')}
        </button>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="hero-badge">{t('hero.badge')} <span className="hero-badge-sub">{t('hero.badgeSub')}</span></div>
        <h1 className="hero-title">
          {t('hero.title')}
          <br />
          <span className="text-accent">{t('hero.titleLine2')}</span>
        </h1>
        <p className="hero-subtitle">
          {t('hero.subtitle')}
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={() => router.push(`/${locale}/get-started`)}>
            {t('hero.cta')} →
          </button>
        </div>
        <p className="hero-trust">{t('hero.trust')}</p>
      </section>

      {/* Features */}
      <section className="landing-section">
        <h2 className="section-title">{t('features.title')}</h2>
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
        <p className="section-label">{t('stats.label')}</p>
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
        <h2 className="section-title">{t('steps.title')}</h2>
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
        <h2 className="section-title">{t('pricing.title')}</h2>
        <div className="pricing-grid">
          {pricing.map((p) => (
            <div key={p.name} className={`pricing-card ${p.popular ? 'pricing-popular' : ''}`}>
              {p.popular && <span className="pricing-badge">{t('pricing.popular')}</span>}
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
        <h2 className="text-accent">{t('cta.title')}</h2>
        <p className="text-secondary">{t('cta.subtitle')}</p>
        <button className="btn btn-primary btn-lg" onClick={() => router.push(`/${locale}/get-started`)}>
          {t('cta.button')} →
        </button>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span>{t('footer.copyright')}</span>
      </footer>
    </div>
  );
}
