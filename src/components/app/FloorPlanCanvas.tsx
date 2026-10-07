'use client'

/**
 * FloorPlanCanvas — نمایشگر مشترک «پلان واقعی فروشگاه» (SVG خالص، بدون وابستگی خارجی)
 *
 * همان نقشه‌ای که در ویرایشگر «پلان فروشگاه» (FloorPlan) طراحی می‌شود را رندر می‌کند:
 *   • زمین چندضلعی (رئوس سانتی‌متری) یا مستطیل w×h اگر چندضلعی خالی باشد
 *   • بلوک‌های تجهیزات با چرخش حول مرکز (همسو با ویرایشگر)، رنگ از زون + گلیف نوع
 *   • کاور زون‌ها: قاب محدودهٔ هر زون + چیپ نام زون + وضعیت شمارش (ok/mismatch/inprogress)
 *   • درهای ورود/خروج با کمان بازشو (ENTRANCE / CHECKOUT)
 *
 * زون‌ها تعاملی هستند: کلیک روی هر بلوک/چیپ → onZoneClick(zoneName)
 *   highlightZones → خط‌چین طلایی | selectedZone → خط ضخیم طلایی + هاله
 * بلوک بدون زون = خاکستری خنثی و غیرقابل‌کلیک.
 *
 * رنگ زون: هش قطعی نام زون روی پالت برند (بدون آبی/بنفش) — همسو با hashZoneColor ویرایشگر پلان.
 * مقیاس‌پذیر: viewBox از محدودهٔ چندضلعی و preserveAspectRatio="xMidYMid meet".
 */

import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'

/* ───────────────────────────── types ───────────────────────────── */

export type Vertex = { x: number; y: number }

export type CanvasPlan = {
  id: string
  name: string
  width: number
  height: number
  /** JSON رئوس چندضلعی (رشتهٔ سرور) یا آرایهٔ رئوس — خالی/نامعتبر = مستطیل */
  shape?: string | Vertex[]
}

export type CanvasBlock = {
  id: string
  kind: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  label: string
  zoneName: string
}

export type ZoneState = 'none' | 'ok' | 'mismatch' | 'inprogress'

/* ─────────────────────────── constants ─────────────────────────── */

const WALL = '#0b2e20'
const GOLD = '#c9a227'
const INK = '#22352b'
const NEUTRAL = '#9c8b6a' // بلوک بدون زون — خاکستری خنثی
/** پالت زون — عیناً همان ویرایشگر پلان (بدون آبی/بنفش) */
const ZONE_PALETTE = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#2e6f6a', '#8a6d10', '#6b5b3e', '#a5573a', '#4d9a90', '#5a8f3c', '#9c8b6a']

/** رنگ وضعیت شمارش روی کاور زون */
const STATE_FA: Record<ZoneState, string> = { none: '', ok: '✓', mismatch: '⚠', inprogress: '⏳' }
const STATE_FILL: Record<ZoneState, string> = { none: '#77934a', ok: '#0e7a4a', mismatch: '#b3372f', inprogress: '#c9a227' }

/* ─────────────────────────── helpers ─────────────────────────── */

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/** هش قطعی نام زون → رنگ پالت (کپی عین hashZoneColor ویرایشگر پلان تا رنگ‌ها یکی بمانند) */
export function hashZoneColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return ZONE_PALETTE[h % ZONE_PALETTE.length]
}

/** تیره‌کردن رنگ هگز برای خط دور بلوک (ضریب ۰..۱ از رنگ اصلی) */
function shade(hex: string, f: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** پارس امن shape — رشتهٔ JSON یا آرایه؛ کمتر از ۳ رأس = [] (مستطیلی) */
export function parsePlanShape(raw: string | Vertex[] | null | undefined): Vertex[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const out: Vertex[] = []
  for (const v of arr) {
    const x = Number((v as Vertex)?.x)
    const y = Number((v as Vertex)?.y)
    if (isFinite(x) && isFinite(y)) out.push({ x, y })
  }
  return out.length >= 3 ? out : []
}

function polyBBox(verts: Vertex[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const v of verts) {
    if (v.x < minX) minX = v.x
    if (v.y < minY) minY = v.y
    if (v.x > maxX) maxX = v.x
    if (v.y > maxY) maxY = v.y
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

/** bbox یک بلوک با احتساب چرخش (۰/۹۰/۱۸۰/۲۷۰ حول مرکز — همسو با ویرایشگر) */
function blockBBox(b: { x: number; y: number; w: number; h: number; rotation: number }) {
  const rot = ((Math.round(b.rotation) % 360) + 360) % 360
  const swap = rot === 90 || rot === 270
  const w = swap ? b.h : b.w
  const h = swap ? b.w : b.h
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy }
}

/**
 * قلمرو (footprint) یک زون = اجتماع bbox بلوک‌های آن زون.
 * برای «زون‌های خارج از نقشه» null برمی‌گرداند.
 */
export function zoneFootprint(
  blocks: Array<Pick<CanvasBlock, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'zoneName'>>,
  zoneName: string
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false
  for (const b of blocks) {
    if (!b.zoneName || b.zoneName !== zoneName) continue
    const bb = blockBBox(b)
    found = true
    if (bb.x < minX) minX = bb.x
    if (bb.y < minY) minY = bb.y
    if (bb.x + bb.w > maxX) maxX = bb.x + bb.w
    if (bb.y + bb.h > maxY) maxY = bb.y + bb.h
  }
  if (!found) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** گلیف سادهٔ هر نوع تجهیز */
function kindGlyph(kind: string): string {
  switch (kind) {
    case 'FRIDGE_CLOSED':
    case 'FRIDGE_OPEN':
    case 'FRIDGE_SHOWCASE':
      return '🧊'
    case 'FREEZER_ICECREAM':
      return '🍨'
    case 'CASHIER_U':
      return '🛒'
    case 'CHECKOUT':
      return '💳'
    case 'STORAGE':
      return '📦'
    case 'PRODUCE':
      return '🥬'
    case 'BAKERY':
      return '🥖'
    case 'DELI':
      return '🍗'
    case 'ENTRANCE':
      return '🚪'
    case 'GONDOLA':
      return '▥'
    case 'SHELF':
      return '▤'
    case 'AISLE':
      return '↔'
    default:
      return '⬚'
  }
}

/** کمان بازشوی در — جهت بازشدن به سمت داخل زمین تعیین می‌شود */
function doorArc(bb: { x: number; y: number; w: number; h: number }, ground: { minX: number; minY: number; maxX: number; maxY: number }) {
  const cx = bb.x + bb.w / 2
  const cy = bb.y + bb.h / 2
  // نزدیک‌ترین دیوار زمین به مرکز درب → کمان به سمت داخل باز می‌شود
  const d = {
    top: Math.abs(bb.y - ground.minY),
    bottom: Math.abs(ground.maxY - (bb.y + bb.h)),
    left: Math.abs(bb.x - ground.minX),
    right: Math.abs(ground.maxX - (bb.x + bb.w)),
  }
  const nearest = (Object.entries(d) as Array<[keyof typeof d, number]>).sort((a, b) => a[1] - b[1])[0][0]
  const horizontal = nearest === 'top' || nearest === 'bottom'
  if (horizontal) {
    const x1 = bb.x
    const x2 = bb.x + bb.w
    const r = Math.max(bb.w, 1)
    if (nearest === 'bottom') return `M ${x1} ${cy} A ${r} ${r} 0 0 1 ${x2} ${cy}` // به بالا (داخل)
    return `M ${x1} ${cy} A ${r} ${r} 0 0 0 ${x2} ${cy}` // به پایین (داخل)
  }
  const y1 = bb.y
  const y2 = bb.y + bb.h
  const r = Math.max(bb.h, 1)
  if (nearest === 'right') return `M ${cx} ${y1} A ${r} ${r} 0 0 1 ${cx} ${y2}` // به چپ (داخل)
  return `M ${cx} ${y1} A ${r} ${r} 0 0 0 ${cx} ${y2}` // به راست (داخل)
}

/* ─────────────────────────── component ─────────────────────────── */

export default function FloorPlanCanvas({
  plan,
  blocks = [],
  zoneColors,
  zoneStatus,
  highlightZones = [],
  selectedZone,
  onZoneClick,
  compact = false,
  maxW,
}: {
  plan: CanvasPlan
  blocks?: CanvasBlock[]
  zoneColors?: Record<string, string>
  zoneStatus?: Record<string, { state: ZoneState }>
  highlightZones?: string[]
  selectedZone?: string
  onZoneClick?: (zoneName: string) => void
  /** حالت فشرده: بدون گلیف/برچسب بلوک — فقط مستطیل‌های رنگی */
  compact?: boolean
  maxW?: number
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  /* زمین: چندضلعی یا مستطیل + محدودهٔ viewBox */
  const { verts, ground, S } = useMemo(() => {
    const v = parsePlanShape(plan?.shape)
    const bb =
      v.length >= 3
        ? polyBBox(v)
        : {
            minX: 0,
            minY: 0,
            maxX: Math.max(200, Number(plan?.width) || 1200),
            maxY: Math.max(200, Number(plan?.height) || 800),
            w: Math.max(200, Number(plan?.width) || 1200),
            h: Math.max(200, Number(plan?.height) || 800),
          }
    // بزرگ‌ترین بعد → مقیاس فونت‌ها مستقل از اندازهٔ فیزیکی پلان
    return { verts: v, ground: bb, S: Math.max(bb.w, bb.h) }
  }, [plan?.shape, plan?.width, plan?.height])

  const fsChip = clamp(S / 60, 11, 42) // برچسب چیپ زون
  const fsBlock = clamp(S / 85, 8, 26) // برچسب کوچک بلوک
  const fsGlyph = clamp(S / 70, 9, 34) // گلیف تجهیز
  const strokeW = clamp(S / 500, 1, 4)

  /* کاور زون‌ها: فقط زون‌هایی که در zoneStatus آمده‌اند (دادهٔ شمارش دارند) */
  const footprints = useMemo(() => {
    if (!zoneStatus) return [] as Array<{ name: string; fp: { x: number; y: number; w: number; h: number }; state: ZoneState }>
    const names = new Set<string>()
    for (const b of blocks) if (b.zoneName) names.add(b.zoneName)
    const out: Array<{ name: string; fp: { x: number; y: number; w: number; h: number }; state: ZoneState }> = []
    for (const name of names) {
      const st = zoneStatus[name]
      if (!st) continue
      const fp = zoneFootprint(blocks, name)
      if (fp) out.push({ name, fp, state: st.state || 'none' })
    }
    return out
  }, [blocks, zoneStatus])

  const pad = S * 0.035 + 14
  const vb = `${ground.minX - pad} ${ground.minY - pad} ${ground.w + pad * 2} ${ground.h + pad * 2}`
  const highlights = new Set(highlightZones)

  const clickZone = (name: string) => {
    if (onZoneClick && name) onZoneClick(name)
  }

  return (
    <div
      className={cn('overflow-x-auto rounded-2xl border border-border/60 bg-[#faf7ee] p-2 scroll-gold')}
      style={maxW ? { maxWidth: maxW } : undefined}
    >
      <svg
        viewBox={vb}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block h-auto w-full min-w-[520px]"
        style={{ maxHeight: compact ? 320 : 560 }}
        role="img"
        aria-label={`پلان فروشگاه — ${plan?.name || 'طبقه'}`}
      >
        <style>{`@keyframes fpc-pulse{0%,100%{opacity:.9}50%{opacity:.45}}.fpc-cell{transition:fill-opacity .25s ease,stroke .25s ease}.fpc-mismatch{animation:fpc-pulse 1.6s ease-in-out infinite}.fpc-hit{cursor:pointer}`}</style>
        <defs>
          <filter id={`fpc-glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={S / 130} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── زمین فروشگاه: چندضلعی واقعی یا مستطیل ── */}
        {verts.length >= 3 ? (
          <polygon
            points={verts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="#ffffff"
            stroke={WALL}
            strokeWidth={strokeW * 2.2}
            strokeLinejoin="round"
          />
        ) : (
          <rect x={ground.minX} y={ground.minY} width={ground.w} height={ground.h} rx={S / 60} fill="#ffffff" stroke={WALL} strokeWidth={strokeW * 2.2} />
        )}

        {/* ── کاور قلمرو زون‌ها (زیر بلوک‌ها — نرم و نیمه‌شفاف) ── */}
        {footprints.map(({ name, fp, state }) => {
          const sel = selectedZone === name
          const hi = highlights.has(name)
          const isSelOrHi = sel || hi
          return (
            <g key={`fp-${name}`} className={cn(onZoneClick && 'fpc-hit')} onClick={onZoneClick ? () => clickZone(name) : undefined}>
              <title>{`زون ${name}${STATE_FA[state] ? ` — وضعیت شمارش: ${STATE_FA[state]}` : ''}`}</title>
              <rect
                x={fp.x - S / 160}
                y={fp.y - S / 160}
                width={fp.w + S / 80}
                height={fp.h + S / 80}
                rx={S / 90}
                fill={STATE_FILL[state] || zoneColors?.[name] || hashZoneColor(name)}
                fillOpacity={sel ? 0.2 : state === 'none' ? 0.07 : 0.12}
                stroke={isSelOrHi ? GOLD : shade(STATE_FILL[state] || '#77934a', 0.9)}
                strokeWidth={sel ? strokeW * 2.6 : hi ? strokeW * 1.8 : strokeW}
                strokeDasharray={hi && !sel ? `${S / 55} ${S / 90}` : undefined}
                filter={sel ? `url(#fpc-glow-${uid})` : undefined}
                className={cn('fpc-cell', state === 'mismatch' && !sel && 'fpc-mismatch')}
              />
            </g>
          )
        })}

        {/* ── بلوک‌های تجهیزات ── */}
        {blocks.map((b) => {
          const zn = (b.zoneName || '').trim()
          const color = zn ? zoneColors?.[zn] || hashZoneColor(zn) : NEUTRAL
          const bb = blockBBox(b)
          const bigEnough = Math.min(bb.w, bb.h) >= S / 22
          const wideEnough = Math.max(bb.w, bb.h) >= S / 5 && Math.min(bb.w, bb.h) >= S / 12
          const isDoor = b.kind === 'ENTRANCE' || b.kind === 'CHECKOUT'
          const rot = `rotate(${Math.round(b.rotation) % 360} ${b.x + b.w / 2} ${b.y + b.h / 2})`
          return (
            <g
              key={b.id || `${b.kind}-${b.x}-${b.y}`}
              transform={rot}
              className={cn(zn && onZoneClick && 'fpc-hit')}
              onClick={zn && onZoneClick ? () => clickZone(zn) : undefined}
            >
              <title>{[b.label || kindGlyph(b.kind), zn ? `زون: ${zn}` : 'بدون زون'].filter(Boolean).join(' — ')}</title>
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={Math.min(b.w, b.h) / 8}
                fill={color}
                fillOpacity={zn ? 0.5 : 0.3}
                stroke={shade(color, 0.68)}
                strokeWidth={strokeW}
                className="fpc-cell"
              />
              {/* نمای سادهٔ نوع تجهیز */}
              {!compact && b.kind === 'GONDOLA' && (
                <>
                  <line x1={b.x + b.w * 0.14} y1={b.y + b.h * 0.26} x2={b.x + b.w * 0.86} y2={b.y + b.h * 0.26} stroke={shade(color, 0.6)} strokeWidth={strokeW * 1.4} strokeDasharray={`${S / 130} ${S / 110}`} />
                  <line x1={b.x + b.w * 0.14} y1={b.y + b.h * 0.74} x2={b.x + b.w * 0.86} y2={b.y + b.h * 0.74} stroke={shade(color, 0.6)} strokeWidth={strokeW * 1.4} strokeDasharray={`${S / 130} ${S / 110}`} />
                </>
              )}
              {!compact && b.kind === 'SHELF' && (
                <line x1={b.x + b.w * 0.08} y1={b.y + b.h / 2} x2={b.x + b.w * 0.92} y2={b.y + b.h / 2} stroke={shade(color, 0.65)} strokeWidth={strokeW * 1.3} />
              )}
              {!compact && b.kind === 'AISLE' && (
                <line x1={b.x + b.w * 0.16} y1={b.y + b.h / 2} x2={b.x + b.w * 0.84} y2={b.y + b.h / 2} stroke={shade(color, 0.65)} strokeWidth={strokeW * 1.2} strokeDasharray={`${S / 90} ${S / 70}`} opacity={0.6} />
              )}
              {!compact && b.kind === 'CASHIER_U' && (
                <path
                  d={`M ${b.x + b.w * 0.2} ${b.y + b.h * 0.16} L ${b.x + b.w * 0.2} ${b.y + b.h * 0.84} L ${b.x + b.w * 0.8} ${b.y + b.h * 0.84} L ${b.x + b.w * 0.8} ${b.y + b.h * 0.16}`}
                  fill="none"
                  stroke={shade(color, 0.55)}
                  strokeWidth={Math.min(b.w, b.h) / 7}
                  strokeLinecap="round"
                />
              )}
              {/* کمان بازشوی در ورود/خروج */}
              {!compact && isDoor && (
                <path d={doorArc(bb, ground)} fill="none" stroke={GOLD} strokeWidth={strokeW * 1.6} strokeDasharray={`${S / 110} ${S / 130}`} opacity={0.85} />
              )}
              {/* گلیف تجهیز — فقط بلوک‌های به‌قدرکافی بزرگ */}
              {!compact && bigEnough && (
                <text
                  x={b.x + b.w / 2}
                  y={b.y + b.h / 2 + fsGlyph * 0.34}
                  textAnchor="middle"
                  fontSize={fsGlyph}
                  opacity={0.85}
                  style={{ pointerEvents: 'none' }}
                >
                  {kindGlyph(b.kind)}
                </text>
              )}
              {/* برچسب کوچک — فقط بلوک‌های بزرگ */}
              {!compact && wideEnough && b.label && (
                <text
                  x={b.x + b.w / 2}
                  y={b.y + b.h - fsBlock * 0.35}
                  textAnchor="middle"
                  fontSize={fsBlock}
                  fontWeight="bold"
                  fill={INK}
                  opacity={0.75}
                  style={{ pointerEvents: 'none' }}
                >
                  {b.label.length > 18 ? b.label.slice(0, 17) + '…' : b.label}
                </text>
              )}
            </g>
          )
        })}

        {/* ── چیپ نام زون + وضعیت، بالای لبهٔ قلمرو هر زون ── */}
        {footprints.map(({ name, fp, state }) => {
          const sel = selectedZone === name
          const znColor = zoneColors?.[name] || hashZoneColor(name)
          const label = `${STATE_FA[state] ? STATE_FA[state] + ' ' : ''}${name}`
          const chipW = label.length * fsChip * 0.62 + fsChip * 0.9
          const chipH = fsChip * 1.7
          const chipX = fp.x + fp.w / 2 - chipW / 2
          const chipY = fp.y - chipH / 2
          return (
            <g
              key={`chip-${name}`}
              className={cn('fpc-hit')}
              onClick={onZoneClick ? () => clickZone(name) : undefined}
              role="button"
              aria-label={`زون ${name}`}
            >
              <rect x={chipX} y={chipY} width={chipW} height={chipH} rx={chipH / 2} fill={sel ? GOLD : znColor} stroke="#ffffff" strokeWidth={strokeW} opacity={0.95} />
              <text x={chipX + chipW / 2} y={chipY + chipH * 0.68} textAnchor="middle" fontSize={fsChip} fontWeight="black" fill="#ffffff" style={{ pointerEvents: 'none' }}>
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
