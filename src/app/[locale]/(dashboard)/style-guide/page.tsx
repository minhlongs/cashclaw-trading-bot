import { Metadata } from 'next';
import { DesignSystemStyleGuide } from '@/components/quant/design-system-style-guide';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Design System & Accessibility Style Guide',
  description: 'Semantic color tokens, typography scale, and stitch-a11y interactive geometry specimens',
};

export default function StyleGuidePage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <DesignSystemStyleGuide />
    </div>
  );
}
