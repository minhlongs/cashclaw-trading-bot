'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

export function LandingNav() {
  const t = useTranslations('landing');
  const locale = useLocale();
  const router = useRouter();

  return (
    <nav className="landing-nav">
      <span className="landing-logo">{t('nav.logo')}</span>
      <button className="btn btn-primary btn-sm" onClick={() => router.push(`/${locale}/get-started`)}>
        {t('nav.cta')}
      </button>
    </nav>
  );
}

export function LandingHero() {
  const t = useTranslations('landing');
  const locale = useLocale();
  const router = useRouter();

  return (
    <section className="landing-hero">
      <div className="hero-badge">{t('hero.badge')} <span className="hero-badge-sub">{t('hero.badgeSub')}</span></div>
      <h1 className="hero-title hero-title-responsive">
        {t('hero.title')}
        <br />
        <span className="text-accent">{t('hero.titleLine2')}</span>
      </h1>
      <p className="hero-subtitle">{t('hero.subtitle')}</p>
      <div className="hero-actions">
        <button className="btn btn-primary btn-lg" onClick={() => router.push(`/${locale}/get-started`)}>
          {t('hero.cta')} →
        </button>
      </div>
      <p className="hero-trust">{t('hero.trust')}</p>
    </section>
  );
}

export function LandingCta() {
  const t = useTranslations('landing');
  const locale = useLocale();
  const router = useRouter();

  return (
    <section className="landing-cta-section">
      <h2 className="text-accent">{t('cta.title')}</h2>
      <p className="text-secondary">{t('cta.subtitle')}</p>
      <button className="btn btn-primary btn-lg" onClick={() => router.push(`/${locale}/get-started`)}>
        {t('cta.button')} →
      </button>
    </section>
  );
}

export function LandingFooter() {
  const t = useTranslations('landing');

  return (
    <footer className="landing-footer">
      <span>{t('footer.copyright')}</span>
    </footer>
  );
}
