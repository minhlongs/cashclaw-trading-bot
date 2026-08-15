'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

interface StepItem {
  icon: string;
  title: string;
  desc: string;
}

export default function CtaClient() {
  const t = useTranslations('cta');
  const locale = useLocale();
  const router = useRouter();

  const steps = t.raw('whatNext.items') as StepItem[];
  const guarantees = t.raw('guarantee.items') as string[];

  return (
    <div className="landing-root">
      {/* Nav */}
      <nav className="landing-nav">
        <span className="landing-logo">{t('nav.logo')}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/${locale}`)}>
          {t('nav.back')}
        </button>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="hero-icon">{t('hero.icon')}</div>
        <h1 className="hero-title text-accent">{t('hero.title')}</h1>
        <p className="hero-subtitle">{t('hero.subtitle')}</p>
        <p className="hero-note">{t('hero.note')}</p>
        <button className="btn btn-primary btn-lg" style={{ marginTop: 24 }} onClick={() => router.push(`/${locale}/bots/new`)}>
          {t('hero.createButton')}
        </button>
      </section>

      {/* Steps */}
      <section className="landing-section">
        <h2 className="section-title">{t('whatNext.title')}</h2>
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
          <span className="guarantee-icon">{t('guarantee.icon')}</span>
          <h2 className="section-title">{t('guarantee.title')}</h2>
          <ul className="guarantee-list">
            {guarantees.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-cta-section">
        <button className="btn btn-primary btn-lg" onClick={() => router.push(`/${locale}/bots/new`)}>
          {t('cta.button')} →
        </button>
        <p className="cta-note">{t('cta.note')}</p>
      </section>
    </div>
  );
}
