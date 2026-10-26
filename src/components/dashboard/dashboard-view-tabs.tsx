'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';

export type DashboardViewMode = 'ALL' | 'TRADING' | 'TELEMETRY';

const VIEW_MODES: DashboardViewMode[] = ['ALL', 'TRADING', 'TELEMETRY'];

export interface DashboardViewTabsProps {
  mode: DashboardViewMode;
  onChange: (mode: DashboardViewMode) => void;
}

export function DashboardViewTabs({ mode, onChange }: DashboardViewTabsProps) {
  const t = useTranslations('dashboard.viewMode');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = VIEW_MODES.indexOf(mode);
    let nextIndex = -1;
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % VIEW_MODES.length;
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + VIEW_MODES.length) % VIEW_MODES.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = VIEW_MODES.length - 1;

    if (nextIndex !== -1) {
      e.preventDefault();
      onChange(VIEW_MODES[nextIndex]);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      className="dashboard-tabs"
      role="tablist"
      aria-label={t('label')}
      onKeyDown={handleKeyDown}
    >
      {VIEW_MODES.map((m, idx) => {
        const isSelected = mode === m;
        return (
          <button
            key={m}
            ref={(el) => { tabRefs.current[idx] = el; }}
            type="button"
            role="tab"
            id={`dashboard-tab-${m.toLowerCase()}`}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            className={`dashboard-tab ${isSelected ? 'active' : ''}`}
            onClick={() => onChange(m)}
          >
            {t(m.toLowerCase())}
          </button>
        );
      })}
    </div>
  );
}
