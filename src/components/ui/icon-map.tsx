'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  BarChart2,
  Shield,
  Briefcase,
  Rocket,
  ClipboardList,
  Plug,
  Play,
  TrendingUp,
  ShieldCheck,
  Zap,
  TrendingDown,
  Settings,
  LayoutDashboard,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  Plus,
  Search,
  Filter,
  Play as PlayIcon,
  Pause,
  ArrowLeft,
  RotateCcw,
  Settings2,
  ArrowUp,
  ArrowDown,
  GitBranch,
  Loader2,
  AlertCircle,
  CheckCircle,
  Power,
  AlertTriangle,
  Key,
  Activity,
  RefreshCw,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from 'lucide-react';

/**
 * Maps icon identifier strings to Lucide icon components.
 * Used in landing page and get-started page to replace emoji icons.
 */
export const iconMap: Record<string, LucideIcon> = {
  // Landing page features
  'bot': Bot,
  'chart': BarChart2,
  'shield': Shield,
  'briefcase': Briefcase,
  // Get-started steps
  'rocket': Rocket,
  'clipboard': ClipboardList,
  'clipboard-list': ClipboardList,
  'plug': Plug,
  'play': Play,
  'trending-up': TrendingUp,
  'guarantee': ShieldCheck,
  'shield-check': ShieldCheck,
  // Hero icons
  'zap': Zap,
  // Sidebar / mobile nav
  'dashboard': LayoutDashboard,
  'bots': Bot,
  'settings': Settings,
  'menu': Menu,
  'close': X,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'plus': Plus,
  'search': Search,
  'filter': Filter,
  'play-icon': PlayIcon,
  'pause': Pause,
  'arrow-left': ArrowLeft,
  'rotate-ccw': RotateCcw,
  'settings2': Settings2,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'git-branch': GitBranch,
  'loader2': Loader2,
  'alert-circle': AlertCircle,
  'check-circle': CheckCircle,
  'power': Power,
  'alert-triangle': AlertTriangle,
  'key': Key,
  'activity': Activity,
  'refresh-cw': RefreshCw,
};

/**
 * Get a Lucide icon component by name, with fallback to Bot icon.
 */
export function getIcon(name: string): LucideIcon {
  return iconMap[name] || Bot;
}

export type IconName = keyof typeof iconMap;
