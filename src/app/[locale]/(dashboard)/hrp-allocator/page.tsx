import { HrpAllocatorWorkbench } from '@/components/quant/hrp-allocator-workbench';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata = {
  title: 'Hierarchical Risk Parity (HRP) Allocator | CashClaw Quant OS',
  description:
    'López de Prado (2016) Hierarchical Risk Parity recursive bisection portfolio allocator for CashClaw OS.',
};

export default function HrpAllocatorPage() {
  return (
    <main className="w-full py-4 px-2 sm:px-4">
      <HrpAllocatorWorkbench />
    </main>
  );
}
