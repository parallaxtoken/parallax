// Shared NYSE session labeller for discovery scripts (holidays not modelled in discovery).
// NYSE session label from UTC (US/Eastern via Intl). Holidays are not modelled in this discovery pass (documented).
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' });
export function session(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const m = Number(p.hour) % 24 * 60 + Number(p.minute), wd = p.weekday;
  if (wd === 'Sat' || (wd === 'Sun' && m < 20 * 60)) return 'WEEKEND';
  if (wd === 'Fri' && m >= 20 * 60) return 'WEEKEND';
  if (m >= 9 * 60 + 30 && m < 16 * 60) return 'REGULAR';
  if (m >= 4 * 60 && m < 9 * 60 + 30) return 'PRE';
  if (m >= 16 * 60 && m < 20 * 60) return 'POST';
  return 'OVERNIGHT';
}
