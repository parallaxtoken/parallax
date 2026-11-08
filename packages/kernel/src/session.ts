import { nyseSessionAt, referenceAgeSeconds, type NyseSession } from './calendar';

export type Session =
  | 'REGULAR'
  | 'PRE'
  | 'POST'
  | 'OVERNIGHT'
  | 'CLOSED_WEEKEND'
  | 'CLOSED_HOLIDAY'
  | 'HALTED'
  | 'CORPORATE_ACTION';

export interface SessionRead {
  session: Session;
  /** T10: seconds since the equity reference could last have moved. */
  referenceAgeSec: number;
  nextOpenUtc: string | null;
  /** Empirical P(|underlying move over a gap this long| > |net premium|); null when no calibration exists. */
  moveExceedsPremiumProb: number | null;
  sample: { n: number; source: string; from: string; to: string } | null;
  /** Where the label came from. `calendar` is the local cross-check when the API gave nothing. */
  source: 'RWA_STATUS' | 'CALENDAR';
  /** True when the RWA status and the local calendar disagree about open versus closed. */
  disagreesWithCalendar: boolean;
}

export interface RwaStatus {
  marketStatus: string | null; // premarket | regular | postmarket | overnight | closed | pause | null
  openState: boolean | null;
  reasonCode: string | null; // TRADING | MARKET_CLOSED | ASSET_PAUSED | ASSET_LIMITED | ...
  reasonMsg: string | null;
  nextOpenTime: number | null;
}

const API_TO_SESSION: Record<string, Session> = {
  premarket: 'PRE',
  regular: 'REGULAR',
  postmarket: 'POST',
  overnight: 'OVERNIGHT',
};

/** Reads the session. Corporate-action and halt codes dominate the label (T4). */
export function readSession(nowMs: number, api: RwaStatus | null): SessionRead {
  const cal: NyseSession = nyseSessionAt(nowMs);
  const calOpen = cal === 'PRE' || cal === 'REGULAR' || cal === 'POST' || cal === 'OVERNIGHT';
  let session: Session = cal;
  let source: SessionRead['source'] = 'CALENDAR';
  if (api) {
    if (api.reasonCode === 'ASSET_PAUSED') {
      session = 'CORPORATE_ACTION';
      source = 'RWA_STATUS';
    } else if (api.reasonCode === 'MARKET_PAUSED') {
      session = 'HALTED';
      source = 'RWA_STATUS';
    } else if (api.marketStatus && API_TO_SESSION[api.marketStatus]) {
      session = API_TO_SESSION[api.marketStatus] as Session;
      source = 'RWA_STATUS';
    } else if (api.marketStatus === 'closed' || api.openState === false) {
      session = cal === 'CLOSED_HOLIDAY' ? 'CLOSED_HOLIDAY' : 'CLOSED_WEEKEND';
      source = 'RWA_STATUS';
    }
  }
  const apiOpen = session === 'REGULAR' || session === 'PRE' || session === 'POST' || session === 'OVERNIGHT';
  const known = api !== null && source === 'RWA_STATUS' && session !== 'CORPORATE_ACTION' && session !== 'HALTED';
  return {
    session,
    referenceAgeSec: referenceAgeSeconds(nowMs),
    nextOpenUtc: api?.nextOpenTime ? new Date(api.nextOpenTime).toISOString() : null,
    moveExceedsPremiumProb: null,
    sample: null,
    source,
    disagreesWithCalendar: known && apiOpen !== calOpen,
  };
}

/** The reference may not be presented or used as live outside a live session (T10). */
export const referenceIsLive = (r: SessionRead): boolean => r.referenceAgeSec === 0 && r.session !== 'CORPORATE_ACTION' && r.session !== 'HALTED';
