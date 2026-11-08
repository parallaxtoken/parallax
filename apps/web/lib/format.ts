import { WAD } from '@parallax/kernel';

export const dec = (wadStr: string | null | undefined, places = 4): string => {
  if (!wadStr) return '–';
  const v = BigInt(wadStr);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / WAD;
  const frac = ((a % WAD) * 10n ** BigInt(places)) / WAD;
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}.${frac.toString().padStart(places, '0')}`;
};
export const usd = (wadStr: string | null | undefined, places = 2): string => (wadStr ? `$${dec(wadStr, places)}` : '–');
export const bps = (v: number | null | undefined): string => (v === null || v === undefined ? '–' : `${v > 0 ? '+' : ''}${(v / 100).toFixed(2)}%`);
export const short = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const bscscan = (kind: 'tx' | 'address' | 'token', v: string): string => `https://bscscan.com/${kind}/${v}`;
export const hoursAgo = (sec: number): string => (sec < 3600 ? `${Math.round(sec / 60)}m` : `${Math.round(sec / 3600)}h`);
