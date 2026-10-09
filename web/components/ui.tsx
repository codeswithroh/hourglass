"use client";
import { useId, useMemo, useState, type ReactNode } from "react";

/* ----------------------------------------------------------------- icons (lucide-style, 1.6 stroke) */

const paths = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  server: "M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  key: "M15 7a4 4 0 1 1-3.9 5H7v3H4v-3H3v-3h8.1A4 4 0 0 1 15 7zM16 11h.01",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  coins: "M8 7c0 1.7 2.7 3 6 3s6-1.3 6-3-2.7-3-6-3-6 1.3-6 3zM8 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7M4 13c0 1.7 2.7 3 6 3M4 13v4c0 1.7 2.7 3 6 3s6-1.3 6-3",
  cpu: "M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12l4 4L19 6",
  x: "M6 6l12 12M18 6L6 18",
  copy: "M8 8h12v12H8zM4 16V4h12",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 3",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
  terminal: "M4 4h16v16H4zM8 9l3 3-3 3M13 15h3",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  chart: "M3 3v18h18M7 15l4-4 3 3 6-7",
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="metal inline-flex items-center justify-center rounded-[30%] shadow-[0_0_24px_rgba(255,255,255,.12)]"
      style={{ width: size, height: size }}>
      <Icon name="hourglass" size={size * 0.6} className="text-black" />
    </span>
  );
}

/* ----------------------------------------------------------------- layout atoms */

export function Card({ children, className = "", ...rest }: { children?: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, sub, right }: { icon?: IconName; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="metal w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0">
            <Icon name={icon} size={17} className="text-black" />
          </span>
        )}
        <div>
          <div className="font-medium leading-tight">{title}</div>
          {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Pill({ tone = "muted", children, pulse }: { tone?: "up" | "down" | "muted" | "white"; children: ReactNode; pulse?: boolean }) {
  const t = {
    up: "bg-up/12 text-up border-up/25",
    down: "bg-down/12 text-down border-down/25",
    muted: "bg-panel-2 text-muted border-line",
    white: "bg-white text-black border-white",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${t}`}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current pulse-dot" />}
      {children}
    </span>
  );
}

export function Stat({ label, value, delta, icon, spark, testId }: {
  label: string; value: ReactNode; delta?: { text: string; up?: boolean }; icon?: IconName; spark?: number[]; testId?: string;
}) {
  return (
    <Card className="p-4 flex flex-col gap-3 min-w-0" data-testid={testId}>
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1.5">{icon && <Icon name={icon} size={14} />}{label}</span>
        {delta && <span className={delta.up === false ? "text-down" : "text-up"}>{delta.text}</span>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="num text-[22px] sm:text-[26px] leading-none tracking-tight truncate">{value}</div>
        {spark && spark.length > 1 && <span className="hidden sm:block"><Sparkline values={spark} /></span>}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- charts */

function smooth(points: [number, number][]) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

export function Sparkline({ values, w = 84, h = 28 }: { values: number[]; w?: number; h?: number }) {
  const id = useId();
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / (max - min || 1)) * (h - 4)] as [number, number]);
  const line = smooth(pts);
  return (
    <svg width={w} height={h} className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".25" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="#e4e4e7" strokeWidth={1.4} />
    </svg>
  );
}

export type Point = { t: number; v: number };

/** Area chart with a crosshair tooltip (reference 3). */
export function AreaChart({ data, height = 220, format = (v: number) => v.toFixed(0), label = "" }: {
  data: Point[]; height?: number; format?: (v: number) => string; label?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number>();
  const W = 800, H = height, P = { l: 36, r: 12, t: 16, b: 26 };
  const { pts, ticks, minT, maxT } = useMemo(() => {
    const maxV = Math.max(1, ...data.map((d) => d.v)) * 1.15;
    const minT = data[0]?.t ?? 0, maxT = data[data.length - 1]?.t ?? 1;
    const x = (t: number) => P.l + ((t - minT) / (maxT - minT || 1)) * (W - P.l - P.r);
    const y = (v: number) => H - P.b - (v / maxV) * (H - P.t - P.b);
    return {
      pts: data.map((d) => [x(d.t), y(d.v)] as [number, number]),
      ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: y(maxV * f), v: maxV * f })),
      minT, maxT,
    };
  }, [data, H, P.b, P.l, P.r, P.t]);
  if (data.length < 2)
    return <div className="grid place-items-center text-muted text-sm" style={{ height }}>Waiting for data…</div>;
  const line = smooth(pts);
  const hi = hover ?? pts.length - 1;
  const fmtDate = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none"
      onMouseLeave={() => setHover(undefined)}
      onMouseMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        let best = 0;
        pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(pts[best][0] - x)) best = i; });
        setHover(best);
      }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".18" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t.y}>
          <line x1={P.l} x2={W - P.r} y1={t.y} y2={t.y} stroke="#fff" strokeOpacity=".05" strokeDasharray="3 5" />
          <text x={P.l - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="#71717a">{format(t.v)}</text>
        </g>
      ))}
      <path d={`${line} L${pts[pts.length - 1][0]},${H - P.b} L${pts[0][0]},${H - P.b} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="#e4e4e7" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <text x={P.l} y={H - 6} fontSize="11" fill="#71717a">{fmtDate(minT)}</text>
      <text x={W - P.r} y={H - 6} fontSize="11" fill="#71717a" textAnchor="end">{fmtDate(maxT)}</text>
      <line x1={pts[hi][0]} x2={pts[hi][0]} y1={P.t} y2={H - P.b} stroke="#fff" strokeOpacity=".5" />
      <circle cx={pts[hi][0]} cy={pts[hi][1]} r={5} fill="#09090b" stroke="#fff" strokeWidth={2} />
      <g transform={`translate(${Math.min(pts[hi][0] + 10, W - 170)},${Math.max(pts[hi][1] - 44, 6)})`}>
        <rect width="160" height="36" rx="8" fill="#18181b" stroke="#3f3f46" />
        <text x="10" y="15" fontSize="10.5" fill="#a1a1aa">{new Date(data[hi].t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</text>
        <text x="10" y="29" fontSize="12" fill="#fafafa" fontWeight="600">{format(data[hi].v)} {label}</text>
      </g>
    </svg>
  );
}

// Server and browser Math.cos/sin can differ in the last digit; round so SSR markup hydrates cleanly.
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Circular gauge (reference 1 "Resources" dial). `mark` draws a threshold tick, e.g. the SLA. */
export function Ring({ value, size = 140, stroke = 10, mark, tone = "white", children, ticks = true }: {
  value: number; size?: number; stroke?: number; mark?: number; tone?: "white" | "up" | "down"; children?: ReactNode; ticks?: boolean;
}) {
  const r = (size - stroke) / 2 - (ticks ? 8 : 0);
  const c = 2 * Math.PI * r;
  const color = { white: "#f4f4f5", up: "#4ade80", down: "#f87171" }[tone];
  const v = Math.max(0, Math.min(1, value));
  const markAngle = mark !== undefined ? mark * 2 * Math.PI - Math.PI / 2 : 0;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        {ticks &&
          Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * 2 * Math.PI;
            const R = size / 2 - 2;
            return (
              <line key={i} x1={r2(size / 2 + Math.cos(a) * R)} y1={r2(size / 2 + Math.sin(a) * R)}
                x2={r2(size / 2 + Math.cos(a) * (R - 4))} y2={r2(size / 2 + Math.sin(a) * (R - 4))} stroke="#fff" strokeOpacity=".12" />
            );
          })}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray .6s ease", filter: `drop-shadow(0 0 6px ${color}55)` }} />
        {mark !== undefined && (
          <line x1={r2(size / 2 + Math.cos(markAngle) * (r - stroke))} y1={r2(size / 2 + Math.sin(markAngle) * (r - stroke))}
            x2={r2(size / 2 + Math.cos(markAngle) * (r + stroke))} y2={r2(size / 2 + Math.sin(markAngle) * (r + stroke))}
            stroke="#fff" strokeWidth={2} />
        )}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** Horizontal meter (reference 1 "Total cores" bars). */
export function Meter({ value, tone = "white", mark, h = 8 }: { value: number; tone?: "white" | "up" | "down"; mark?: number; h?: number }) {
  const bg = { white: "linear-gradient(90deg,#71717a,#f4f4f5)", up: "linear-gradient(90deg,#166534,#4ade80)", down: "linear-gradient(90deg,#7f1d1d,#f87171)" }[tone];
  return (
    <div className="relative w-full rounded-full bg-[#202024] overflow-hidden" style={{ height: h }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: bg }} />
      {mark !== undefined && <div className="absolute top-0 h-full w-0.5 bg-white/80" style={{ left: `${mark * 100}%` }} />}
    </div>
  );
}

/** Segmented progress (reference 2 "career path"). */
export function Segments({ total, filled, tone = "white" }: { total: number; filled: number; tone?: "white" | "up" }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full ${i < filled ? (tone === "up" ? "bg-up" : "bg-white") : "bg-[#27272a]"}`} />
      ))}
    </div>
  );
}

/** Oracle check history: one tick per probe, green up / red down. */
export function ProbeStrip({ probes, max = 40 }: { probes: boolean[]; max?: number }) {
  const shown = probes.slice(-max);
  return (
    <div className="flex items-end gap-[3px] h-7">
      {shown.length === 0 && <span className="text-[11px] text-muted">awaiting first check</span>}
      {shown.map((up, i) => (
        <div key={i} title={up ? "up" : "down"}
          className={`w-[5px] rounded-sm ${up ? "bg-up/80 h-full" : "bg-down h-2/5"}`} />
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 999 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center card-inset">
      <button type="button" aria-label="fewer hours" onClick={() => onChange(Math.max(min, value - 1))} className="p-3 text-muted hover:text-text">
        <Icon name="minus" />
      </button>
      <input type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="num bg-transparent flex-1 min-w-0 text-center text-2xl outline-none" />
      <button type="button" aria-label="more hours" onClick={() => onChange(Math.min(max, value + 1))} className="p-3 text-muted hover:text-text">
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function GpuGlyph({ model, size = 44 }: { model: string; size?: number }) {
  const short = model.split("-")[0];
  return (
    <span className="metal relative inline-flex items-center justify-center rounded-2xl shrink-0 text-black font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.27 }}>
      {short}
    </span>
  );
}
