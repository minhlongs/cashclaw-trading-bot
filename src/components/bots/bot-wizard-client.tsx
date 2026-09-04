'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type Step, type FormState, GRID_DEFAULTS, MEANREV_DEFAULTS } from './wizard-types';
import { BasicStep } from './basic-step';
import { StrategyStep } from './strategy-step';
import { ConfigStep } from './config-step';
import { ReviewStep } from './review-step';

const INITIAL: FormState = {
  name: '',
  strategy: '',
  pair: '',
  exchange: '',
  capital: 5000,
  config: {},
};

const STEPS: Step[] = ['basic', 'strategy', 'config', 'review'];

export function BotWizardClient() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('botWizard');
  const [step, setStep] = useState<Step>('basic');
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateConfig = (key: string, value: number) => {
    setForm((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));
  };

  const setStrategyDefaults = (strategy: 'grid' | 'mean_reversion') => {
    const defaults = strategy === 'grid' ? GRID_DEFAULTS : MEANREV_DEFAULTS;
    setForm((prev) => ({ ...prev, strategy, config: { ...defaults } }));
  };

  const goToNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goToPrev = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          name: form.name,
          strategy: form.strategy,
          pair: form.pair,
          exchange: form.exchange,
          capital: form.capital,
          config: form.config,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; data?: { id: string } };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('submitError'));
      }
      setSubmitSuccess(true);
      setTimeout(() => {
        if (mountedRef.current) router.push(`/${locale}/bots/${data.data?.id}`);
      }, 1500);
    } catch (e: unknown) {
      if (mountedRef.current) setSubmitError(e instanceof Error ? e.message : t('submitError'));
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const stepNumber = STEPS.indexOf(step) + 1;

  const stepContent = {
    basic: <BasicStep form={form} update={update} onNext={goToNext} />,
    strategy: (
      <StrategyStep
        form={form}
        setStrategyDefaults={setStrategyDefaults}
        onNext={goToNext}
        onPrev={goToPrev}
      />
    ),
    config: (
      <ConfigStep
        form={form}
        updateConfig={updateConfig}
        strategy={form.strategy as 'grid' | 'mean_reversion'}
        onNext={goToNext}
        onPrev={goToPrev}
      />
    ),
    review: (
      <ReviewStep
        form={form}
        submitting={submitting}
        submitError={submitError}
        submitSuccess={submitSuccess}
        onSubmit={handleSubmit}
        onPrev={goToPrev}
      />
    ),
  }[step];

  return (
    <div className="wizard-container">
      <div className="wizard-inner">
        <div className="wizard-header">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`progress-bar ${i + 1 <= stepNumber ? 'active' : ''}`}
            />
          ))}
        </div>
        <div className="card wizard-card">
          <div className="card-body wizard-card-body">
            <div className="wizard-header">
              <span className="wizard-step-num">
                {stepNumber}
              </span>
              <span className="wizard-step-total">
                / {STEPS.length}
              </span>
            </div>
            {stepContent}
          </div>
        </div>
      </div>
    </div>
  );
}
