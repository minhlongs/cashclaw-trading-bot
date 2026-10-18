import { RoughPathSignaturesWorkbench } from '@/components/quant/rough-path-signatures-workbench';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata = {
  title: 'Lyons Rough Path Signatures & Lévy Area | CashClaw Quant OS',
  description:
    'Lyons rough path truncated signature tensor and antisymmetric Lévy area lead-lag classifier for CashClaw OS.',
};

export default function RoughPathSignaturesPage() {
  return (
    <main className="w-full py-4 px-2 sm:px-4">
      <RoughPathSignaturesWorkbench />
    </main>
  );
}
