import type { Metadata } from 'next';
import {
  Cormorant_Garamond,
  JetBrains_Mono,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import { QueryProvider } from '@/components/providers/QueryProvider';
import './globals.css';

// DESIGN.md: Cormorant Garamond for luxury display/brand headings,
// Plus Jakarta Sans for all UI text, JetBrains Mono for every
// numeric/tabular value (prices, HPP, stock quantities, totals).
const cormorantGaramond = Cormorant_Garamond({
  variable: '--font-cormorant-garamond',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
});

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3001'),
  title: {
    default: 'OhMyPos — Multi-Branch Point of Sale & Back-Office',
    template: '%s | OhMyPos',
  },
  description:
    'Modern Point of Sale and back-office management system designed for multi-branch F&B businesses. Real-time inventory, sales, and financial reconciliation.',
  applicationName: 'OhMyPos',
  authors: [{ name: 'OhMyPos Team' }],
  keywords: [
    'point of sale',
    'POS',
    'F&B',
    'inventory management',
    'back office',
    'reconciliation',
    'multi-branch',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'OhMyPos — Multi-Branch Point of Sale & Back-Office',
    description:
      'Modern Point of Sale and back-office management system designed for multi-branch F&B businesses.',
    url: '/',
    siteName: 'OhMyPos',
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: 'OhMyPos Logo',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OhMyPos — Multi-Branch Point of Sale & Back-Office',
    description:
      'Modern Point of Sale and back-office management system designed for multi-branch F&B businesses.',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="id"
      className={`${cormorantGaramond.variable} ${plusJakartaSans.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
