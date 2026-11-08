'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * Original inline SVG: a precision instrument that is half phone, half assayer's balance.
 * Three versions of one stock are weighed in real shares; the longest bar glows green.
 */
export function BalanceArtifact({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 70, damping: 11, mass: 1.1 };
  const breathe = reduce ? undefined : { opacity: [0.6, 0.9, 0.6], transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' as const } };
  return (
    <svg viewBox="0 0 720 760" role="img" aria-label="Three versions of the same stock weighed in real shares" className={className}>
      <defs>
        <radialGradient id="ba-glow" cx="62%" cy="22%" r="42%">
          <stop offset="0" stopColor="rgb(255,226,180)" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="rgb(255,226,180)" stopOpacity="0.12" />
          <stop offset="1" stopColor="rgb(255,226,180)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ba-fade" cx="50%" cy="50%" r="55%">
          <stop offset="0.5" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id="ba-mask"><rect width="720" height="760" fill="url(#ba-fade)" /></mask>
        <filter id="ba-green" x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="ba-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBF8F1" />
          <stop offset="1" stopColor="#F1EADB" />
        </linearGradient>
      </defs>

      <g mask="url(#ba-mask)" opacity="0.9">
        {[120, 190, 260, 330].map((r) => (
          <circle key={r} cx="400" cy="360" r={r} fill="none" stroke="#5F584C" strokeOpacity="0.16" strokeWidth="1" />
        ))}
        {Array.from({ length: 16 }).map((_, i) => (
          <line key={`h${i}`} x1="0" x2="720" y1={i * 48 + 10} y2={i * 48 + 10} stroke="#16130E" strokeOpacity="0.05" />
        ))}
        {Array.from({ length: 16 }).map((_, i) => (
          <line key={`v${i}`} y1="0" y2="760" x1={i * 48 + 10} x2={i * 48 + 10} stroke="#16130E" strokeOpacity="0.05" />
        ))}
      </g>
      <rect width="720" height="760" fill="url(#ba-glow)" />

      {/* balance beam, level */}
      <g stroke="#5F584C" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <line x1="40" y1="250" x2="330" y2="250" />
        <line x1="185" y1="250" x2="185" y2="600" />
        <path d="M150 600 h70" />
        <circle cx="185" cy="250" r="7" fill="#FBF8F1" />
        <path d="M40 250 l-26 120 M40 250 l26 120" />
        <path d="M330 250 l-26 120 M330 250 l26 120" />
      </g>
      {/* left pan: gross gap, unit, session */}
      <motion.g initial={{ y: reduce ? 0 : -22 }} animate={{ y: 0 }} transition={spring}>
        <path d="M-12 370 h104 a0 0 0 0 1 0 0 q-52 36 -104 0 z" transform="translate(-0 0)" fill="#EFE8D8" stroke="#5F584C" strokeWidth="1.5" />
        <circle cx="52" cy="352" r="18" fill="#F04A23" />
        <circle cx="52" cy="318" r="15" fill="#2E5BFF" />
        <circle cx="52" cy="288" r="12" fill="#F2B21B" />
      </motion.g>
      {/* right pan: the net share */}
      <motion.g initial={{ y: reduce ? 0 : 22 }} animate={{ y: 0 }} transition={spring}>
        <path d="M268 370 h124 q-62 40 -124 0 z" fill="#EFE8D8" stroke="#5F584C" strokeWidth="1.5" />
        <circle cx="330" cy="344" r="26" fill="#00B07A" filter="url(#ba-green)" />
      </motion.g>

      {/* phone */}
      <g transform="translate(548 352) rotate(-6)">
        <rect x="-150" y="-300" width="300" height="600" rx="56" fill="#16130E" />
        <rect x="-138" y="-288" width="276" height="576" rx="46" fill="url(#ba-screen)" />
        <rect x="-40" y="-280" width="80" height="18" rx="9" fill="#16130E" />
        <text x="-118" y="-224" fontFamily="var(--font-display)" fontSize="26" fontWeight="600" fill="#16130E">NVDA</text>
        <text x="-118" y="-198" fontFamily="var(--font-mono)" fontSize="11" fill="#5F584C">per share, net of the wrapper</text>
        {[
          { y: -150, label: 'bStocks', c: '#2E5BFF', w: 196, win: true },
          { y: -80, label: 'Ondo', c: '#F2B21B', w: 150, win: false },
          { y: -10, label: 'xStocks', c: '#F04A23', w: 98, win: false },
        ].map((r) => (
          <g key={r.label}>
            <rect x="-118" y={r.y - 26} width="30" height="30" rx="9" fill={r.c} />
            <text x="-76" y={r.y - 6} fontFamily="var(--font-sans)" fontSize="15" fontWeight="500" fill="#16130E">{r.label}</text>
            <rect x="-118" y={r.y + 12} width="236" height="9" rx="4.5" fill="#E7DFCD" />
            <motion.rect
              x="-118" y={r.y + 12} height="9" rx="4.5" width={r.w}
              fill={r.win ? '#00B07A' : '#C9BFA8'}
              filter={r.win ? 'url(#ba-green)' : undefined}
              initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: 1 }} style={{ transformOrigin: '-118px 0' }}
              transition={{ duration: reduce ? 0 : 0.9, delay: r.win ? 0.1 : 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </g>
        ))}
        <motion.rect x="-118" y="62" width="236" height="64" rx="18" fill="#16130E" animate={breathe} />
        <text x="-98" y="90" fontFamily="var(--font-mono)" fontSize="11" fill="#F4EFE5">FLOOR, IN SHARES</text>
        <text x="-98" y="116" fontFamily="var(--font-display)" fontSize="22" fontWeight="600" fill="#F4EFE5">0.2143</text>
        <rect x="-118" y="146" width="236" height="52" rx="16" fill="#E7F7F0" />
        <text x="-100" y="176" fontFamily="var(--font-sans)" fontSize="13" fill="#00805A">Chain refuses anything below</text>
      </g>
    </svg>
  );
}
