"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Minimal, dependency-free charts following the dataviz guidelines:
 * single series, ≤24px bars with a 4px rounded data end, hairline grid,
 * text in text tokens (never in the series colour), hover tooltip,
 * and an accessible table fallback.
 */
const SERIES = "#2a78d6";

export type ChartFormat = "euro" | "euroShort" | "count" | "pieces";
const eurFmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
function fmt(kind: ChartFormat, v: number): string {
  switch (kind) {
    case "euro":
      return eurFmt.format(v / 100);
    case "euroShort":
      return v >= 100_000 ? `${Math.round(v / 100_000)}k €` : `${Math.round(v / 100)} €`;
    case "pieces":
      return `${v} pz`;
    default:
      return String(v);
  }
}
const GRID = "#e2e8f0";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function ColumnChart({
  data,
  format,
  height = 220,
  label,
}: {
  data: { label: string; value: number; tooltip?: string }[];
  format: ChartFormat;
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const kind = format;
  const f = (v: number) => fmt(kind, v);
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.value))), [data]);
  // Render at the container's real width so text stays at its true size.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const w = Math.max(boxW, data.length * 18 + 56);
  const top = 12;
  const bottom = 26;
  const left = 56;
  const plotH = height - top - bottom;
  const band = (w - left) / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.7);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 12);

  return (
    <figure className="relative min-w-0">
      <div ref={boxRef} className="overflow-x-auto">
        <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label}>
          {ticks.map((t) => {
            const y = top + plotH - (t / max) * plotH;
            return (
              <g key={t}>
                <line x1={left} x2={w} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={left - 8} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
                  {f(t)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / max) * plotH;
            const x = left + i * band + (band - barW) / 2;
            const y = top + plotH - h;
            const r = Math.min(4, h / 2);
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
                {/* generous hit area */}
                <rect x={left + i * band} y={top} width={band} height={plotH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${top + plotH} Z`}
                    fill={SERIES}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={left + i * band + band / 2} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow">
          <span className="font-semibold">{data[hover].tooltip ?? data[hover].label}</span>: {f(data[hover].value)}
        </div>
      )}
      <details className="mt-1 text-xs text-slate-500">
        <summary className="cursor-pointer">Vedi come tabella</summary>
        <table className="mt-2 w-full">
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1">{d.tooltip ?? d.label}</td>
                <td className="py-1 text-right tabular-nums text-slate-700">{f(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal bar list (ranking), value labelled at the bar tip. */
export function BarList({ data, format: kind, max: maxRows = 10 }: { data: { label: string; value: number; sub?: string }[]; format: ChartFormat; max?: number }) {
  const format = (v: number) => fmt(kind, v);
  const rows = data.slice(0, maxRows);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-500">Nessun dato nel periodo.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i} className="text-sm" title={`${r.label}: ${format(r.value)}`}>
          <div className="mb-1 flex justify-between gap-3">
            <span className="truncate text-slate-800">{r.label}</span>
            <span className="shrink-0 tabular-nums text-slate-600">
              {format(r.value)}
              {r.sub && <span className="text-slate-400"> · {r.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-r bg-slate-100">
            <div className="h-2 rounded-r" style={{ width: `${(r.value / max) * 100}%`, background: SERIES }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
