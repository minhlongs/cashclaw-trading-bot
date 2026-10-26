'use client';

import type { Step } from './wizard-types';

export interface BotWizardProgressBarProps {
  steps: Step[];
  stepNumber: number;
}

export function BotWizardProgressBar({ steps, stepNumber }: BotWizardProgressBarProps) {
  return (
    <div
      className="wizard-header"
      role="progressbar"
      aria-label="Bot creation progress"
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuenow={stepNumber}
    >
      {steps.map((s, i) => (
        <div
          key={s}
          className={`progress-bar ${i + 1 <= stepNumber ? 'active' : ''}`}
        />
      ))}
    </div>
  );
}

export interface BotWizardStepIndicatorProps {
  totalSteps: number;
  stepNumber: number;
}

export function BotWizardStepIndicator({ totalSteps, stepNumber }: BotWizardStepIndicatorProps) {
  return (
    <div className="wizard-header">
      <span className="wizard-step-num">{stepNumber}</span>
      <span className="wizard-step-total">/ {totalSteps}</span>
    </div>
  );
}
