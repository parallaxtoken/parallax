import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { bsc } from 'wagmi/chains';
import { createConfig, http, type Config } from 'wagmi';

const transports = { [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC || 'https://bsc-dataseed1.defibit.io') };

// Server render: no connectors. The WalletConnect connector touches IndexedDB on construction and throws on the server.
const serverConfig = createConfig({ chains: [bsc], transports, ssr: true });
let clientConfig: Config | null = null;

/** Injected wallets work without a WalletConnect project id; WalletConnect and mobile deep links need it. */
export function getConfig(): Config {
  if (typeof window === 'undefined') return serverConfig;
  clientConfig ??= getDefaultConfig({
    appName: 'Parallax',
    projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || '00000000000000000000000000000000',
    chains: [bsc],
    transports,
    ssr: true,
  });
  return clientConfig;
}
