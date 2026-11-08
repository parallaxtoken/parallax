'use client';

import { useState } from 'react';

/** Company icon with a typographic fallback when the image host refuses or is slow. */
export function TickerIcon({ src, ticker, size = 44 }: { src: string | null; ticker: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span aria-hidden style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-paper-2 font-mono text-xs text-graphite">
        {ticker.slice(0, 3)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: size, height: size }} className="shrink-0 rounded-full bg-paper-2 object-cover" />;
}
