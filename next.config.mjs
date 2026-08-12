import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  output: 'standalone',
};

// next-intl v4 plugin — wires i18n config into the build
export default createNextIntlPlugin('./src/i18n/config.ts')(nextConfig);
