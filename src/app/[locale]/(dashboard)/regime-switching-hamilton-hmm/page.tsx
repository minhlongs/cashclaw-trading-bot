import { HamiltonHmmWorkbench } from '@/components/quant/hamilton-hmm-workbench';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata = {
  title: 'Hamilton Markov-Switching Regime Filter | CashClaw Quant OS',
  description:
    'Hamilton (1989) causal 2-state Markov-switching regime filter with zero-lookahead filtered state probabilities for CashClaw OS.',
};

export default function RegimeSwitchingHamiltonHmmPage() {
  return (
    <main className="w-full py-4 px-2 sm:px-4">
      <HamiltonHmmWorkbench />
    </main>
  );
}
