'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

/**
 * Scroll-linked weighing: the gross gap (vermilion) splits into unit (cobalt) and net (green),
 * with the session as an amber clock overlay. Values are passed in from generated files, never typed here.
 */
export function Weighing({ unitBps, weekendPct }: { unitBps: number | null; weekendPct: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 40%'] });
  const split = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const unitW = useTransform(split, (v) => `${(reduce ? 1 : v) * 38}%`);
  const netW = useTransform(split, (v) => `${100 - (reduce ? 1 : v) * 38}%`);

  return (
    <div ref={ref} className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-6 shadow-[var(--shadow-lift)]">
        <p className="font-mono text-xs text-graphite">GROSS GAP, ONE TICKER, THREE WRAPPERS</p>
        <div className="mt-4 flex h-14 overflow-hidden rounded-[14px] bg-gross/90" role="img" aria-label="A gross gap split into a unit part and a net part">
          <motion.div style={{ width: unitW }} className="grid place-items-center bg-unit font-mono text-xs text-white">unit</motion.div>
          <motion.div style={{ width: netW }} className="grid place-items-center bg-net font-mono text-xs text-white">net</motion.div>
        </div>
        <div className="relative mt-6 h-10">
          <div className="absolute inset-y-0 left-0 rounded-[12px] bg-session/80" style={{ width: weekendPct === null ? '0%' : `${weekendPct}%` }} />
          <p className="relative z-10 flex h-full items-center px-3 font-mono text-xs text-ink">{weekendPct === null ? 'session' : `New York closed ${weekendPct.toFixed(0)}% of the week`}</p>
        </div>
      </div>
      <ol className="space-y-5">
        <li><span className="font-mono text-gross">gross</span><p className="text-graphite">The gap you see between a token price and the stock price. It is what a price monitor reports.</p></li>
        <li>
          <span className="font-mono text-unit">unit</span>
          <p className="text-graphite">How many shares one token stands for. It moves with dividends and splits{unitBps !== null ? `, and today it alone separates two tokens of one ticker by up to ${unitBps} bps` : ''}.</p>
        </li>
        <li><span className="font-mono text-net">net</span><p className="text-graphite">What is left after the wrapper: the real premium per share. This is the only part a limit should talk about.</p></li>
      </ol>
    </div>
  );
}
