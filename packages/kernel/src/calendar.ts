// NYSE calendar cross-check for the session read (T10). The RWA market status is the source of truth;
// disagreements are logged by callers and become developer-experience findings.

export type NyseSession = 'PRE' | 'REGULAR' | 'POST' | 'OVERNIGHT' | 'CLOSED_WEEKEND' | 'CLOSED_HOLIDAY';

/** NYSE full-day closures, YYYY-MM-DD in New York local date. Source: NYSE published holiday calendar. */
export const NYSE_HOLIDAYS: readonly string[] = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03',
  '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05',
  '2027-09-06', '2027-11-25', '2027-12-24',
];

/** NYSE early closes (13:00 New York). */
export const NYSE_HALF_DAYS: readonly string[] = ['2026-11-27', '2026-12-24', '2027-11-26'];

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export interface NyParts {
  date: string;
  weekday: string;
  minutes: number;
}

export function nyParts(utcMs: number): NyParts {
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: p.weekday ?? '',
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

export function nyseSessionAt(utcMs: number): NyseSession {
  const { date, weekday, minutes } = nyParts(utcMs);
  if (weekday === 'Sat') return 'CLOSED_WEEKEND';
  if (weekday === 'Sun') return minutes >= 20 * 60 ? 'OVERNIGHT' : 'CLOSED_WEEKEND';
  if (weekday === 'Fri' && minutes >= 20 * 60) return 'CLOSED_WEEKEND';
  if (NYSE_HOLIDAYS.includes(date)) return 'CLOSED_HOLIDAY';
  const close = NYSE_HALF_DAYS.includes(date) ? 13 * 60 : 16 * 60;
  if (minutes >= 9 * 60 + 30 && minutes < close) return 'REGULAR';
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return 'PRE';
  if (minutes >= close && minutes < 20 * 60) return 'POST';
  return 'OVERNIGHT';
}

const isLive = (s: NyseSession) => s === 'PRE' || s === 'REGULAR' || s === 'POST' || s === 'OVERNIGHT';

/** Seconds since the equity reference could last have changed (0 while a session is live). */
export function referenceAgeSeconds(utcMs: number): number {
  if (isLive(nyseSessionAt(utcMs))) return 0;
  const step = 60_000;
  let t = utcMs;
  for (let i = 0; i < 6 * 24 * 60; i++) {
    t -= step;
    if (isLive(nyseSessionAt(t))) return Math.round((utcMs - t) / 1000);
  }
  return Math.round((utcMs - t) / 1000);
}
