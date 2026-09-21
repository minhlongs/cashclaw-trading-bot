'use client';

import { useTranslations } from 'next-intl';
import type { Feature, Stat, Step, PricingPlan } from './landing-types';
import {
  LandingNav,
  LandingHero,
  LandingFeatures,
  LandingStats,
  LandingSteps,
  LandingPricing,
  LandingCta,
  LandingFooter,
} from './landing-sections';

export type { Feature, Stat, Step, PricingPlan };

export default function LandingClient() {
  const t = useTranslations('landing');

  const features = t.raw('features.items') as Feature[];
  const stats = t.raw('stats.items') as Stat[];
  const steps = t.raw('steps.items') as Step[];
  const pricing = t.raw('pricing.plans') as PricingPlan[];

  return (
    <div className="landing-root">
      <LandingNav />
      <LandingHero />
      <LandingFeatures features={features} />
      <LandingStats stats={stats} />
      <LandingSteps steps={steps} />
      <LandingPricing pricing={pricing} />
      <LandingCta />
      <LandingFooter />
    </div>
  );
}
