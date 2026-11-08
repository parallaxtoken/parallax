'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { WalletButton } from './WalletButton';
import { EditionBanner } from './EditionBanner';

const LINKS: [string, string][] = [['Shelf', '/app'], ['Orders', '/app/orders'], ['Agent', '/app/agent'], ['Proof', '/proof'], ['Verify', '/verify']];

/** The Shelf owns /app and the ticker pages; every other link owns its own prefix. */
const isActive = (path: string, href: string): boolean => (href === '/app' ? path === '/app' || path.startsWith('/app/t/') : path === href || path.startsWith(`${href}/`));

export function Nav() {
  const [open, setOpen] = useState(false);
  const path = usePathname() ?? '/';
  return (
    <>
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className="sticky top-3 z-50 mx-auto w-[min(1180px,calc(100%-24px))]"
      >
        <nav aria-label="Primary" className="flex items-center justify-between gap-2 rounded-[var(--radius-capsule)] bg-[#16130E]/95 px-3 py-2 text-[#F4EFE5] ring-1 ring-white/10 backdrop-blur-xl shadow-[0_18px_40px_-20px_rgba(0,0,0,.55)]">
          <Link href="/" className="flex items-center gap-2.5 pl-2 font-display text-xl tracking-tight">
            <svg className="size-6 text-net" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="44" fill="#00B07A" fillOpacity="0.15" />
              <circle cx="50" cy="50" r="40" stroke="#00B07A" strokeWidth="6" strokeDasharray="140 30" strokeLinecap="round" />
              <path d="M 50 16 C 68 34, 68 66, 50 84 C 32 66, 32 34, 50 16 Z" stroke="#00B07A" strokeWidth="6" strokeLinejoin="round" />
              <path d="M 16 50 C 34 68, 66 68, 84 50 C 66 32, 34 32, 16 50 Z" stroke="#00B07A" strokeWidth="6" strokeLinejoin="round" />
              <circle cx="50" cy="50" r="7" fill="#F4EFE5" />
              <circle cx="50" cy="50" r="3.5" fill="#16130E" />
            </svg>
            <span className="font-semibold text-[#F4EFE5]">Parallax</span>
          </Link>
          <div className="hidden items-center gap-1 rounded-[14px] bg-white/5 p-1 text-sm md:flex">
            {LINKS.map(([l, h]) => {
              const on = isActive(path, h);
              return (
                <Link
                  key={h}
                  href={h}
                  aria-current={on ? 'page' : undefined}
                  className={`rounded-[10px] px-3 py-1.5 transition ${on ? 'bg-white/15 text-[#F4EFE5] shadow-[0_0_0_1px_rgba(244,239,229,.35),0_0_18px_rgba(0,176,122,.45)]' : 'text-[#F4EFE5]/80 hover:bg-white/10 hover:text-[#F4EFE5]'}`}
                >
                  {l}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <WalletButton />
            <button className="grid size-9 place-items-center rounded-[12px] bg-white/10 md:hidden" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>
        {open && (
          <div className="mt-2 grid gap-1 rounded-[var(--radius-capsule)] bg-[#16130E]/95 p-2 text-[#F4EFE5] md:hidden">
            {LINKS.map(([l, h]) => {
              const on = isActive(path, h);
              return (
                <Link
                  key={h}
                  href={h}
                  onClick={() => setOpen(false)}
                  aria-current={on ? 'page' : undefined}
                  className={`rounded-[12px] px-3 py-2 ${on ? 'bg-white/15 shadow-[0_0_0_1px_rgba(244,239,229,.35),0_0_18px_rgba(0,176,122,.45)]' : 'hover:bg-white/10'}`}
                >
                  {l}
                </Link>
              );
            })}
          </div>
        )}
      </motion.header>
      <EditionBanner />
    </>
  );
}

