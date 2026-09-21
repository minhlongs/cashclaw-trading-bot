'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { Feature, Stat, Step, PricingPlan } from './landing-types';

export { LandingNav, LandingHero, LandingCta, LandingFooter } from './landing-nav-hero';

export function LandingFeatures({ features }: { features: Feature[] }) {
  const t = useTranslations('landing');

  return (
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
  );
}

export function LandingStats({ stats }: { stats: Stat[] }) {
  const t = useTranslations('landing');

  return (
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
  );
}

export function LandingSteps({ steps }: { steps: Step[] }) {
  const t = useTranslations('landing');

  return (
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
  );
}

export function LandingPricing({ pricing }: { pricing: PricingPlan[] }) {
  const t = useTranslations('landing');
  const locale = useLocale();
  const router = useRouter();

  return (
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
  );
}
