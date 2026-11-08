'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { rise } from '@/lib/motion';

export function Reveal({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  return (
    <motion.div className={className} variants={rise} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-10% 0px' }}>
      {children}
    </motion.div>
  );
}
