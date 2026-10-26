'use client';

import type { ComponentType } from 'react';
import {
  Bot,
  BarChart3,
  ShieldCheck,
  Briefcase,
  Zap,
  TrendingUp,
  Rocket,
  ClipboardList,
  Plug,
  Play,
  Key,
} from 'lucide-react';

interface IconProps {
  size?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
}

const ICON_MAP: Record<string, ComponentType<IconProps>> = {
  bot: Bot,
  chart: BarChart3,
  shield: ShieldCheck,
  'shield-check': ShieldCheck,
  briefcase: Briefcase,
  zap: Zap,
  'trending-up': TrendingUp,
  rocket: Rocket,
  'clipboard-list': ClipboardList,
  plug: Plug,
  play: Play,
  key: Key,
};

export function renderMarketingIcon(name: string, size = 24) {
  const Icon = ICON_MAP[name];
  if (!Icon) return name;
  return <Icon size={size} aria-hidden="true" />;
}
