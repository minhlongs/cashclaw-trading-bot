import { Metadata } from 'next';
import { AlphaZooEvaluator } from '@/components/quant/alpha-zoo-evaluator';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Alpha Zoo Evaluator & Factor IC/IR Matrix',
  description: 'Causal operator AST parser and Spearman IC/IR falsification matrix',
};

export default function AlphaZooPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <AlphaZooEvaluator />
    </div>
  );
}
