'use client';

import { ColorType, LineStyle, createChart, type IChartApi, type Time } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';

interface Series { symbol: string; issuer: string; points: { time: number; value: number }[]; note: string }

const COLOR: Record<string, string> = { BSTOCKS: '#2E5BFF', ONDO: '#F2B21B', XSTOCKS: '#F04A23' };

/** USD per share for each wrapper over the last week (TradingView lightweight-charts, Apache 2.0). */
export function WeighingChart({ ticker }: { ticker: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [series, setSeries] = useState<Series[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/history/${ticker}`)
      .then((r) => r.json())
      .then((j) => alive && setSeries(j.series as Series[]))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [ticker]);

  useEffect(() => {
    if (!series || !el.current) return;
    const dark = document.documentElement.dataset.edition === 'night';
    const chart: IChartApi = createChart(el.current, {
      width: el.current.clientWidth,
      height: 320,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: dark ? '#B5AC9B' : '#5F584C', fontFamily: 'var(--font-jetbrains)' },
      grid: { vertLines: { color: dark ? '#3B3328' : '#D9CFBD' }, horzLines: { color: dark ? '#3B3328' : '#D9CFBD' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
    });
    for (const s of series) {
      if (!s.points.length) continue;
      const line = chart.addLineSeries({ color: COLOR[s.issuer] ?? '#16130E', lineWidth: 2, title: s.symbol, lineStyle: LineStyle.Solid });
      line.setData(s.points.map((p) => ({ time: p.time as Time, value: p.value })));
    }
    chart.timeScale().fitContent();
    const onResize = () => el.current && chart.applyOptions({ width: el.current.clientWidth });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
    };
  }, [series]);

  if (err) return <p className="rounded-[14px] bg-gross/10 p-4 text-sm" role="alert">Chart unavailable: {err}</p>;
  if (!series) return <div className="skeleton h-80 w-full" aria-label="Loading chart" />;
  const empty = series.every((s) => !s.points.length);
  return (
    <div>
      {empty ? (
        <p className="rounded-[14px] bg-paper-2 p-4 text-sm">No candle history is available for this ticker yet. The recorder starts a series when it first sees two quotes.</p>
      ) : (
        <div ref={el} className="w-full" role="group" aria-label={`Weekly price per share for each wrapper of ${ticker}`} />
      )}
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-graphite">
        {series.map((s) => (
          <li key={s.symbol} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLOR[s.issuer] }} />
            {s.symbol}: {s.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
