'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { getConfig } from '@/lib/wagmi';

const theme = lightTheme({ accentColor: '#16130E', accentColorForeground: '#F4EFE5', borderRadius: 'large', fontStack: 'system' });

export function Providers({ children }: { children: ReactNode }) {
  // The WalletConnect modal container is injected by a third-party library without an accessible name.
  useEffect(() => {
    const walk = (root: Document | ShadowRoot): void => {
      root.querySelectorAll('*').forEach((el) => {
        if (el.id === 'wcm-modal' && !el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Wallet connection');
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    };
    walk(document);
    // the modal builds its shadow tree after mount, which a body observer cannot see
    const timers = [200, 600, 1500, 3000, 6000].map((ms) => window.setTimeout(() => walk(document), ms));
    const mo = new MutationObserver(() => walk(document));
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      mo.disconnect();
    };
  }, []);
  const [config] = useState(getConfig);
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } }));
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider theme={theme} locale="en">{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
