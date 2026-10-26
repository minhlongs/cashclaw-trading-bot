import {
  type LucideIcon,
  LayoutDashboard, Bot, Settings, BookOpen,
  Activity, Zap, Filter, Cpu, MessageSquare, GitBranch, BarChart3,
  Grid, Layers, Database, KeyRound, Scale, Flame, Palette, Compass, Waypoints,
  CreditCard, TrendingUp,
} from 'lucide-react';

export interface NavRoute {
  path: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: 'trading' | 'research' | 'quantlib' | 'system';
  routes: NavRoute[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'trading',
    routes: [
      { path: 'dashboard', icon: LayoutDashboard },
      { path: 'bots', icon: Bot },
      { path: 'strategies/volatility-dca', icon: TrendingUp },
      { path: 'backtests', icon: BookOpen },
      { path: 'execution-ledger', icon: Layers },
      { path: 'monitoring', icon: Activity },
    ],
  },
  {
    id: 'research',
    routes: [
      { path: 'alpha-zoo', icon: Cpu },
      { path: 'deliberation', icon: MessageSquare },
      { path: 'fdr-gate', icon: Filter },
      { path: 'survival-gate', icon: GitBranch },
      { path: 'data-quality-gate', icon: Database },
      { path: 'regime-attribution', icon: Activity },
    ],
  },
  {
    id: 'quantlib',
    routes: [
      { path: 'microstructure', icon: BarChart3 },
      { path: 'orderbook-imbalance-lob', icon: Activity },
      { path: 'correlation-matrix', icon: Grid },
      { path: 'relative-value-basis', icon: Scale },
      { path: 'portfolio-cvar-stress', icon: Flame },
      { path: 'rough-volatility-hurst', icon: Zap },
      { path: 'leadlag-hayashi-yoshida', icon: GitBranch },
      { path: 'optimal-execution-almgren-chriss', icon: Layers },
      { path: 'regime-switching-hamilton-hmm', icon: Activity },
      { path: 'hrp-allocator', icon: Scale },
      { path: 'martingale-optimal-transport', icon: Compass },
      { path: 'rough-path-signatures', icon: Waypoints },
    ],
  },
  {
    id: 'system',
    routes: [
      { path: 'sovereign-enclave', icon: KeyRound },
      { path: 'billing', icon: CreditCard },
      { path: 'style-guide', icon: Palette },
      { path: 'settings', icon: Settings },
    ],
  },
];

export const NAV_ROUTES: NavRoute[] = NAV_GROUPS.flatMap((g) => g.routes);
