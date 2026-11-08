import type { NextConfig } from 'next';
import path from 'node:path';

const root = path.join(__dirname, '..', '..');

const config: NextConfig = {
  outputFileTracingRoot: root,
  outputFileTracingIncludes: { '/**': ['../../data/**/*.json', '../../data/**/*.jsonl', '../../docs/CLAIMS.json', '../../evidence/**/*'] },
  transpilePackages: ['@parallax/kernel', '@parallax/registry', '@parallax/binance', '@parallax/verify', '@parallax/independent'],
  poweredByHeader: false,
  // Dot-prefixed route folders are not served reliably by the App Router; the well-known path is rewritten.
  async rewrites() {
    return [{ source: '/.well-known/agent-card.json', destination: '/api/agent-card' }];
  },
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'bin.bnbstatic.com' }, { protocol: 'https', hostname: 'images.unsplash.com' }] },
  webpack: (cfg) => {
    cfg.resolve.fallback = { ...cfg.resolve.fallback, fs: false, net: false, tls: false };
    cfg.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return cfg;
  },
};

export default config;
