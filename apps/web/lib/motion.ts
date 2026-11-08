export const ease = [0.2, 0.8, 0.2, 1] as const;
export const rise = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, ease, delay: i * 0.06 } }),
};
export const stagger = { show: { transition: { staggerChildren: 0.06 } } };
export const countUp = 900;
