'use client';

import { Play, Pause, RotateCcw, Settings2, Loader2 } from 'lucide-react';

export type Tab = 'trades' | 'overview' | 'config';
export type ControlAction = 'start' | 'stop' | 'pause' | 'resume';

export const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'trades', label: 'Trade History' },
  { value: 'config', label: 'Config' },
];

export interface ControlButtonProps {
  onClick: () => void;
  icon: typeof Play;
  label: string;
  disabled?: boolean;
  loading?: boolean;
}

export function ControlButton({
  onClick,
  icon: Icon,
  label,
  disabled = false,
  loading = false,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      className="btn btn-ghost flex items-center gap-2"
      onClick={onClick}
      disabled={disabled}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
  );
}

export interface BotDetailActionButtonsProps {
  resumeAction: ControlAction;
  loadingAction: ControlAction | null;
  onAction: (action: ControlAction) => void;
  onOpenConfig: () => void;
  resumeLabel: string;
  pauseLabel: string;
  resetLabel: string;
  configLabel: string;
}

export function BotDetailActionButtons({
  resumeAction,
  loadingAction,
  onAction,
  onOpenConfig,
  resumeLabel,
  pauseLabel,
  resetLabel,
  configLabel,
}: BotDetailActionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <ControlButton
        onClick={() => onAction(resumeAction)}
        icon={Play}
        label={resumeLabel}
        disabled={loadingAction !== null}
        loading={loadingAction === resumeAction}
      />
      <ControlButton
        onClick={() => onAction('pause')}
        icon={Pause}
        label={pauseLabel}
        disabled={loadingAction !== null}
        loading={loadingAction === 'pause'}
      />
      <ControlButton
        onClick={() => onAction('stop')}
        icon={RotateCcw}
        label={resetLabel}
        disabled={loadingAction !== null}
        loading={loadingAction === 'stop'}
      />
      <ControlButton
        onClick={onOpenConfig}
        icon={Settings2}
        label={configLabel}
        disabled={loadingAction !== null}
      />
    </div>
  );
}
