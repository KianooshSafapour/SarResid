'use client'

import { useId, useRef, useState } from 'react'
import { faNum, formatJalaliShort } from '@/lib/jalali'

const PALETTE = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#8a5a2b', '#207a63', '#a33d3d', '#5b4a8a']

/** Vertical bar chart (SVG, RTL-safe) — hover shows a floating label+value tooltip */
export function BarChart({
  data,
  height = 160,
  color = '#0e7a4a',
  formatValue,
  formatLabel,
}: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
  formatValue?: (v: number) => string
  formatLabel?: (l: string) => string
}) {
  if (!data.length) return null
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex min-w-0 items-end gap-1.5 overflow-x-auto pb-1 [contain:inline-size] sm:gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = Math.max(4, (d.value / max) * (height - 34))
        return (
          <div key={i} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="pointer-events-none absolute -top-1 z-20 hidden max-w-44 truncate rounded-lg bg-foreground px-2 py-1 text-[10px] font-bold text-background shadow-lg group-hover:block">
              {formatLabel ? formatLabel(d.label) : d.label}: {formatValue ? formatValue(d.value) : faNum(d.value)}
            </span>
            <div
              className="w-full max-w-9 rounded-t-lg transition-all duration-300 group-hover:opacity-80"
              style={{
                height: h,
                background: `linear-gradient(180deg, ${color}, ${color}99)`,
                boxShadow: `0 3px 10px -3px ${color}66`,
              }}
            />
            <span className="max-w-full truncate text-[9px] text-muted-foreground">
              {formatLabel ? formatLabel(d.label) : d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Smooth line chart — hover crosshair + floating info box (mouse & touch), optional gradient area + markers */
export function LineChart({
  data,
  height = 150,
  color = '#0e7a4a',
  fill = true,
  formatValue,
  autoMin = false,
  area = false,
  markers = true,
  formatLabel,
}: {
  data: { label: string; value: number; extra?: string }[]
  height?: number
  color?: string
  fill?: boolean
  formatValue?: (v: number) => string
  /** مقیاس هوشمند: کف نمودار نزدیک کمترین مقدار می‌رود (مناسب روند قیمت) */
  autoMin?: boolean
  /** پرکردن نرم گرادیانی زیر خط */
  area?: boolean
  /** نمایش نقطه روی داده‌ها */
  markers?: boolean
  /** قالب‌بندی برچسب (مثلاً تاریخ شمسی) در جعبهٔ اطلاعات شناور */
  formatLabel?: (l: string) => string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '')
  if (data.length < 2) return null
  const w = 300
  const h = 100
  const values = data.map((d) => d.value)
  let max = Math.max(...values, 1)
  let min = 0
  if (autoMin) {
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    if (hi - lo < Math.abs(hi) * 0.02) {
      // داده تقریباً تخت — خط در میانهٔ نمودار با حاشیهٔ مناسب
      min = Math.max(lo * 0.8, 0)
      max = hi * 1.2 || 1
    } else {
      min = Math.max(lo - (hi - lo) * 0.25, 0)
      max = hi + (hi - lo) * 0.15
    }
  }
  const range = max - min || 1
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.value - min) / range) * (h - 14) - 7
    return [x, y] as const
  })
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const areaPath = `${path} L${w},${h} L0,${h} Z`

  const nearest = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const rel = Math.max(0, Math.min(rect.width, clientX - rect.left))
    setHoverIdx(Math.round((rel / rect.width) * (data.length - 1)))
  }
  const hover = hoverIdx !== null ? data[hoverIdx] : null
  // جعبهٔ اطلاعات: لبه‌ها را گیر می‌دهد تا بیرون نزند
  const tipLeft = hoverIdx === 0 ? '0%' : hoverIdx === data.length - 1 ? '100%' : `${((pts[hoverIdx ?? 0]?.[0] ?? 0) / w) * 100}%`
  const tipShift = hoverIdx === 0 ? 'translate(0,-115%)' : hoverIdx === data.length - 1 ? 'translate(-100%,-115%)' : 'translate(-50%,-115%)'

  return (
    <div
      ref={boxRef}
      style={{ height }}
      className="relative w-full touch-pan-y"
      onMouseMove={(e) => nearest(e.clientX)}
      onMouseLeave={() => setHoverIdx(null)}
      onTouchStart={(e) => nearest(e.touches[0]?.clientX ?? 0)}
      onTouchMove={(e) => nearest(e.touches[0]?.clientX ?? 0)}
      onTouchEnd={() => setHoverIdx(null)}
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[85%] w-full" preserveAspectRatio="none">
        {area && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
        )}
        {area && <path d={areaPath} fill={`url(#${gid})`} />}
        {!area && fill && <path d={areaPath} fill={color} opacity="0.13" />}
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {markers &&
          pts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="2.6" fill="#fff" stroke={color} strokeWidth="2" />
          ))}
        {hoverIdx !== null && pts[hoverIdx] && (
          <>
            <line x1={pts[hoverIdx][0]} y1="0" x2={pts[hoverIdx][0]} y2={h} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
            <circle cx={pts[hoverIdx][0]} cy={pts[hoverIdx][1]} r="4.6" fill={color} stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>
      {hover && hoverIdx !== null && (
        <div
          className="pointer-events-none absolute z-30 min-w-24 max-w-56 rounded-xl bg-foreground px-2.5 py-1.5 text-[10px] font-bold leading-4 text-background shadow-xl"
          style={{ left: tipLeft, top: `${((pts[hoverIdx]?.[1] ?? 0) / h) * 85}%`, transform: tipShift }}
        >
          <span className="block">{formatLabel ? formatLabel(hover.label) : hover.label}</span>
          <span className="block">{formatValue ? formatValue(hover.value) : faNum(hover.value)}</span>
          {hover.extra && <span className="block opacity-80">{hover.extra}</span>}
        </div>
      )}
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{data[0] && formatValue ? formatValue(data[0].value) : ''}</span>
        <span>{data[data.length - 1] && formatValue ? formatValue(data[data.length - 1].value) : ''}</span>
      </div>
    </div>
  )
}

export type DonutSegment = {
  label: string
  value: number
  /** ردیف‌های اطلاعات تکمیلی برای تولتیپ هاور */
  meta?: { k: string; v: string }[]
}

/** Donut chart with center label — interactive: hovered segment expands outward (+۸٪ شعاع),
 *  بقیه کم‌رنگ می‌شوند، برچسب مرکز عوض می‌شود و تولتیپ شناور با meta نمایش داده می‌شود. */
export function Donut({
  data,
  size = 150,
  thickness = 22,
  centerLabel,
  centerValue,
  onHoverInfo,
}: {
  data: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
  /** هنگام هاور هر قطعه (و null هنگام خروج) صدا زده می‌شود — برای گفت‌وگوی اطلاعات در مصرف‌کننده */
  onHoverInfo?: (seg: { label: string; value: number; pct: number; meta?: { k: string; v: string }[] } | null) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  // precompute arc offsets before render (react-compiler safe, no outer reassign)
  const arcs = data
    .map((d, i) => ({ value: d.value, i }))
    .reduce<{ i: number; frac: number; offset: number }[]>((acc, x) => {
      if (x.value <= 0) return acc
      const last = acc[acc.length - 1]
      const offset = last ? last.offset + last.frac : 0
      acc.push({ i: x.i, frac: x.value / total, offset })
      return acc
    }, [])

  const enter = (i: number) => {
    setHover(i)
    const seg = data[i]
    onHoverInfo?.({ label: seg.label, value: seg.value, pct: Math.round((seg.value / total) * 100), meta: seg.meta })
  }
  const leave = () => {
    setHover(null)
    onHoverInfo?.(null)
  }
  const hoveredSeg = hover !== null ? data[hover] : null
  const hoveredPct = hover !== null && data[hover] ? Math.round((data[hover].value / total) * 100) : 0
  const tipPos = tip || { x: size / 2, y: size / 2 }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }}
        onMouseLeave={() => {
          setTip(null)
          leave()
        }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eee7d2" strokeWidth={thickness} />
          {arcs.map(({ i, frac, offset }) => {
            const mid = (offset + frac / 2) * 2 * Math.PI
            const isHover = hover === i
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={isHover ? thickness + 2 : thickness}
                strokeDasharray={`${frac * c} ${c - frac * c}`}
                strokeDashoffset={-offset * c}
                strokeLinecap="butt"
                tabIndex={0}
                role="img"
                aria-label={`${data[i].label}: ${faNum(data[i].value)} — ${faNum(Math.round(frac * 100))}٪`}
                className="cursor-pointer outline-none transition-all duration-200"
                style={{
                  opacity: hover === null || isHover ? 1 : 0.45,
                  transform: isHover ? `translate(${(Math.cos(mid) * r * 0.08).toFixed(2)}px, ${(Math.sin(mid) * r * 0.08).toFixed(2)}px)` : 'translate(0px, 0px)',
                }}
                onMouseEnter={() => enter(i)}
                onFocus={() => enter(i)}
                onBlur={() => leave()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (hover === i) leave()
                    else enter(i)
                  }
                }}
              />
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hoveredSeg ? (
            <>
              <span className="text-lg font-extrabold text-foreground">{faNum(hoveredSeg.value)}</span>
              <span className="max-w-[82%] truncate text-[10px] text-muted-foreground">{hoveredSeg.label} • {faNum(hoveredPct)}٪</span>
            </>
          ) : (
            <>
              <span className="text-lg font-extrabold text-foreground">{centerValue || faNum(total)}</span>
              {centerLabel && <span className="text-[10px] text-muted-foreground">{centerLabel}</span>}
            </>
          )}
        </div>
        {hoveredSeg && (
          <div
            className="pointer-events-none absolute z-30 min-w-32 max-w-56 rounded-xl border border-[#c9a227]/40 bg-[#fffdf6] p-2.5 text-right shadow-xl"
            style={{ left: tipPos.x, top: tipPos.y, transform: tip ? 'translate(14px,-100%)' : 'translate(-50%,25%)' }}
          >
            <p className="text-[11px] font-black text-foreground">
              {hoveredSeg.label} — {faNum(hoveredSeg.value)} ({faNum(hoveredPct)}٪)
            </p>
            {hoveredSeg.meta?.map((m) => (
              <p key={m.k} className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                <span className="font-bold text-foreground/80">{m.k}: </span>
                {m.v}
              </p>
            ))}
          </div>
        )}
      </div>
      <ul className="space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li
            key={i}
            className="flex cursor-default items-center gap-2 transition-opacity duration-200"
            style={{ opacity: hover === null || hover === i ? 1 : 0.45 }}
            onMouseEnter={() => enter(i)}
            onMouseLeave={() => leave()}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-muted-foreground">{d.label}:</span>
            <span className="font-bold text-foreground">{faNum(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal progress-style list (e.g., leaderboard) */
export function RankBars({
  data,
  formatValue,
}: {
  data: { label: string; value: number; color?: string }[]
  formatValue?: (v: number) => string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={i}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-bold text-foreground">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-extrabold text-muted-foreground">
                {faNum(i + 1)}
              </span>
              {d.label}
            </span>
            <span className="font-extrabold text-[#8a6d10]">{formatValue ? formatValue(d.value) : faNum(d.value)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: `linear-gradient(90deg, ${d.color || '#0e7a4a'}, ${d.color || '#0e7a4a'}88)`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export { PALETTE, formatJalaliShort }
