import Link from 'next/link';

export function Footer() {
  const book = process.env.NEXT_PUBLIC_PARALLAXBOOK;
  const registry = process.env.NEXT_PUBLIC_REGISTRY;
  return (
    <footer className="mx-auto mt-24 w-[min(1180px,calc(100%-24px))] border-t border-rule py-10 text-sm text-graphite">
      <div className="grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <svg className="size-5 text-net" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="44" fill="#00B07A" fillOpacity="0.15" />
              <circle cx="50" cy="50" r="40" stroke="#00B07A" strokeWidth="6" strokeDasharray="140 30" strokeLinecap="round" />
              <path d="M 50 16 C 68 34, 68 66, 50 84 C 32 66, 32 34, 50 16 Z" stroke="#00B07A" strokeWidth="6" strokeLinejoin="round" />
              <circle cx="50" cy="50" r="7" fill="#16130E" />
            </svg>
            <p className="font-display text-xl font-semibold text-ink">Parallax</p>
          </div>
          <p className="mt-2 max-w-xs">Wrappers quote. Shares decide.</p>
        </div>
        <ul className="space-y-1.5">
          <li><Link className="hover:text-ink" href="/app">Shelf</Link></li>
          <li><Link className="hover:text-ink" href="/app/orders">Standing orders</Link></li>
          <li><Link className="hover:text-ink" href="/app/holdings">Holdings in shares</Link></li>
          <li><Link className="hover:text-ink" href="/app/agent">Keeper agent</Link></li>
        </ul>
        <ul className="space-y-1.5">
          <li><Link className="hover:text-ink" href="/proof">Proof</Link></li>
          <li><Link className="hover:text-ink" href="/verify">Verify a fill</Link></li>
          <li><a className="hover:text-ink" href="/api/mcp">MCP endpoint</a></li>
          <li><a className="hover:text-ink" href="/.well-known/agent-card.json">Agent card</a></li>
        </ul>
        <ul className="space-y-1.5 font-mono text-xs">
          <li>{book ? <span className="text-ink">ParallaxBook {book.slice(0, 8)}…</span> : 'ParallaxBook: Stellar Soroban'}</li>
          <li>{registry ? <span className="text-ink">Registry {registry.slice(0, 8)}…</span> : 'WrapperRegistry: Stellar Soroban'}</li>
          <li>MIT license</li>
          <li>Fonts: Fontshare FFL, JetBrains Mono OFL</li>
        </ul>
      </div>
      <p className="mt-8 text-xs">Spot only. Stellar (Soroban) & Multi-chain. Tokenized stocks are not shares; read the issuer terms. Not investment advice.</p>
    </footer>
  );
}
