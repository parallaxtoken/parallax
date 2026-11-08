import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const clash = localFont({ src: './fonts/ClashDisplay-Variable.woff2', variable: '--font-clash', weight: '200 700', display: 'swap' });
const general = localFont({ src: './fonts/GeneralSans-Variable.woff2', variable: '--font-general', weight: '200 700', display: 'swap' });
const gambetta = localFont({
  src: [
    { path: './fonts/Gambetta-Variable.woff2', style: 'normal' },
    { path: './fonts/Gambetta-VariableItalic.woff2', style: 'italic' },
  ],
  variable: '--font-gambetta',
  weight: '300 700',
  display: 'swap',
});
const mono = localFont({ src: './fonts/jetbrains-mono-latin-wght-normal.woff2', variable: '--font-jetbrains', weight: '100 800', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Parallax. The real price of a tokenized stock, net of the wrapper.', template: '%s | Parallax' },
  description:
    'Set a standing order for a tokenized stock once, in real shares on Stellar & Multi-chain. Any hour of the week, no custody, and the chain refuses any fill below the shares you signed for.',
  metadataBase: new URL(process.env.PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000'),
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F4EFE5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${clash.variable} ${general.variable} ${gambetta.variable} ${mono.variable}`} data-edition="day" suppressHydrationWarning>
      <body className="min-h-screen overflow-x-hidden">
        <Providers>
          <Nav />
          <main id="main">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
