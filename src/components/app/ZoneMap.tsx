'use client'

/**
 * نقشهٔ گرافیکی فروشگاه — SVG خالص (بدون وابستگی)
 * چیدمان قطعی (deterministic) از هش نام زون — در هر رندر/نشست پایدار است:
 *   انبار پشتی بالا، فاسدشدنی کنار دیوار، خشک مرکز، راهروی قدرت وسط،
 *   صندوق‌ها نزدیک ورودی، زون تنفس نوار ورودی، در ورودی پایین.
 * اصول آندرهیل: زون تنفس (۳ تا ۵ متر اول ورود) فروش‌ساز نیست — «زون تنفس — فروش‌سنج نیست».
 * رنگ هر زون بر اساس وضعیت شمارش امروز + حالت نمایش بهره‌وری (شاخص سهم).
 * سبک از نظر RAM: فقط SVG ایستا + transition CSS — هیچ تایمر/انیمیشن سنگینی نیست
 * (فقط pulse خط‌چینِ مغایرت با CSS).
 */

import { useMemo, useState } from 'react'
import { CATEGORY_EMOJI } from '@/lib/constants'
import { faNum, faMoney } from '@/lib/jalali'
import { cn } from '@/lib/utils'

export type MapZone = {
  name: string
  type: string
  criticality: string
  countFrequency: string
  color: string
  minStaff: number
  ownerName: string
  backupName: string
}

export type MapStatus = { state: 'none' | 'ok' | 'mismatch' | 'inprogress' }

export type MapEfficiency = {
  sales30: number
  staffHours: number
  zoneSLH: number | null
  shareIndex: number | null
  band: 'balanced' | 'overstaffed' | 'underserved' | null
  salesTargetExcluded?: boolean
  countCompliance?: { lastDate: string; dueDate: string; overdue: boolean; cadenceDays: number }
}

const EMERALD = '#0e7a4a'
const GOLD = '#c9a227'
const OLIVE = '#77934a'
const ROSE = '#b3372f'
const INK = '#22352b'

const BAND_FA: Record<string, string> = {
  balanced: 'متعادل',
  overstaffed: 'نیروی بیش از فروش',
  underserved: 'فروش بیش از نیرو',
}

const TYPE_FA: Record<string, string> = {
  DECOMPRESSION: 'زون تنفس',
  POWER_AISLE: 'راهروی قدرت',
  PERISHABLE: 'فاسدشدنی',
  DRY: 'خشک',
  CHECKOUT: 'صندوق‌ها',
  BACKROOM: 'انبار پشتی',
}

/** هش قطعی رشته → عدد (برای ترتیب پایدار زون‌ها) */
function hashName(s: string): number {
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

type Box = { x: number; y: number; w: number; h: number }

/** چیدمان سادهٔ شبکه‌ای داخل یک قلمرو (row-major با ترتیب هش‌پایدار) */
function layoutBucket(names: string[], area: Box, cols: number, gap = 7): Map<string, Box> {
  const out = new Map<string, Box>()
  const ordered = [...names].sort((a, b) => hashName(a) - hashName(b))
  const rows = Math.max(1, Math.ceil(ordered.length / cols))
  const cw = (area.w - gap * (cols - 1)) / cols
  const ch = (area.h - gap * (rows - 1)) / rows
  ordered.forEach((name, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    out.set(name, { x: area.x + c * (cw + gap), y: area.y + r * (ch + gap), w: cw, h: ch })
  })
  return out
}

function bandColor(band: string | null | undefined): string {
  if (band === 'overstaffed') return GOLD
  if (band === 'underserved') return ROSE
  return OLIVE
}

function stateFill(state: MapStatus['state'] | undefined, zoneColor: string, effView: boolean, band: string | null | undefined) {
  if (effView) return { fill: bandColor(band), opacity: 0.75 }
  switch (state) {
    case 'ok':
      return { fill: EMERALD, opacity: 0.85 }
    case 'mismatch':
      return { fill: ROSE, opacity: 0.85 }
    case 'inprogress':
      return { fill: GOLD, opacity: 0.55 }
    default:
      return { fill: zoneColor, opacity: 0.2 }
  }
}

export default function ZoneMap({
  zones,
  statuses,
  efficiency,
  onZoneSelect,
  selected,
}: {
  zones: MapZone[]
  statuses: Record<string, MapStatus>
  efficiency?: Record<string, MapEfficiency>
  onZoneSelect: (zoneName: string) => void
  selected?: string
}) {
  const [effView, setEffView] = useState(false)
  const hasEff = !!efficiency && Object.keys(efficiency).length > 0

  const positions = useMemo(() => {
    const byType = new Map<string, string[]>()
    for (const z of zones) {
      const t = TYPE_FA[z.type] ? z.type : 'DRY'
      if (!byType.has(t)) byType.set(t, [])
      byType.get(t)!.push(z.name)
    }
    const map = new Map<string, Box>()
    // انبار پشتی — نوار بالا
    const back = byType.get('BACKROOM') || []
    if (back.length) for (const [k, v] of layoutBucket(back, { x: 128, y: 16, w: 546, h: 58 }, Math.min(back.length, 4))) map.set(k, v)
    // فاسدشدنی — ستون کنار دیوار (چپ)
    const perish = byType.get('PERISHABLE') || []
    if (perish.length) for (const [k, v] of layoutBucket(perish, { x: 16, y: 84, w: 100, h: 310 }, 1)) map.set(k, v)
    // خشک — مرکز، دو نوار (بالای و زیر راهروی قدرت)
    const dry = byType.get('DRY') || []
    if (dry.length) {
      const half = Math.ceil(dry.length / 2)
      const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(dry.length))))
      for (const [k, v] of layoutBucket(dry.slice(0, half), { x: 126, y: 84, w: 548, h: 138 }, cols)) map.set(k, v)
      if (dry.length > half)
        for (const [k, v] of layoutBucket(dry.slice(half), { x: 126, y: 300, w: 548, h: 94 }, cols)) map.set(k, v)
    }
    // راهروی قدرت — راهروی میانی
    const power = byType.get('POWER_AISLE') || []
    if (power.length) for (const [k, v] of layoutBucket(power, { x: 126, y: 232, w: 548, h: 58 }, Math.min(power.length, 3))) map.set(k, v)
    // صندوق‌ها — نزدیک ورودی
    const checkout = byType.get('CHECKOUT') || []
    if (checkout.length) for (const [k, v] of layoutBucket(checkout, { x: 126, y: 404, w: 548, h: 46 }, Math.min(checkout.length, 5))) map.set(k, v)
    // زون تنفس — نوار ورودی
    const decomp = byType.get('DECOMPRESSION') || []
    if (decomp.length) for (const [k, v] of layoutBucket(decomp, { x: 126, y: 460, w: 548, h: 42 }, Math.min(decomp.length, 3))) map.set(k, v)
    // انواع ناشناخته → نوار پایین مرکز
    const known = new Set(['BACKROOM', 'PERISHABLE', 'DRY', 'POWER_AISLE', 'CHECKOUT', 'DECOMPRESSION'])
    const other = zones.filter((z) => !known.has(z.type)).map((z) => z.name)
    if (other.length) for (const [k, v] of layoutBucket(other, { x: 126, y: 300, w: 548, h: 94 }, Math.min(other.length, 4))) map.set(k, v)
    return map
  }, [zones])

  const decompExists = zones.some((z) => z.type === 'DECOMPRESSION')

  return (
    <div>
      {hasEff && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEffView((v) => !v)}
            className={cn(
              'min-h-[44px] rounded-xl px-4 py-2 text-xs font-black transition active:scale-95',
              effView ? 'bg-[#77934a] text-white shadow-md' : 'border border-border bg-card text-foreground hover:border-[#77934a]/50'
            )}
          >
            {effView ? '✓ نمای بهره‌وری روشن' : 'نمای بهره‌وری (شاخص سهم)'}
          </button>
          <span className="text-[11px] text-muted-foreground">
            شاخص سهم = سهم فروش زون ÷ سهم ساعت‌کار زون — تعادل ۰٫۷ تا ۱٫۳
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-[#faf7ee] p-2 scroll-gold">
        <svg viewBox="0 0 690 566" className="mx-auto block h-auto w-full min-w-[560px] max-w-3xl" role="img" aria-label="نقشهٔ فروشگاه">
          <style>{`@keyframes hzmap-pulse{0%,100%{opacity:.85}50%{opacity:.45}}.hzmap-cell{transition:fill-opacity .3s ease,stroke .3s ease}.hzmap-mismatch{animation:hzmap-pulse 1.6s ease-in-out infinite}`}</style>

          {/* بدنهٔ فروشگاه */}
          <rect x="8" y="8" width="674" height="522" rx="16" fill="#ffffff" stroke="#0b2e20" strokeWidth="2.5" />
          <text x="345" y="30" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0b2e20" opacity="0.55">
            هایپر زیتون — نمای بالا
          </text>

          {/* انبار پشتی */}
          <text x="26" y="38" fontSize="10" fill={INK} opacity="0.6">انبار پشتی</text>

          {/* دیوار فاسدشدنی */}
          <text x="66" y="80" textAnchor="middle" fontSize="10" fill={INK} opacity="0.6">دیوار سرد</text>

          {/* راهروی اصلی */}
          <text x="345" y="226" textAnchor="middle" fontSize="9" fill={INK} opacity="0.45">— راهروی اصلی —</text>

          {/* در ورودی (پایین وسط) */}
          <rect x="295" y="530" width="100" height="12" rx="5" fill={GOLD} />
          <text x="345" y="558" textAnchor="middle" fontSize="11" fontWeight="black" fill="#8a6d10">
            ▲ در ورودی
          </text>
          <path d="M 345 528 L 345 516" stroke={GOLD} strokeWidth="2" strokeDasharray="3 3" />

          {/* زون‌ها */}
          {zones.map((z) => {
            const box = positions.get(z.name)
            if (!box) return null
            const st = statuses[z.name]?.state || 'none'
            const eff = effView && efficiency ? efficiency[z.name] : undefined
            const { fill, opacity } = stateFill(st, z.color, effView, eff?.band)
            const isDecomp = z.type === 'DECOMPRESSION'
            const mismatch = st === 'mismatch' && !effView
            const isSelected = selected === z.name
            const shortName = z.name.length > 11 ? z.name.slice(0, 10) + '…' : z.name
            const ownerFirst = (z.ownerName || '').split(' ')[0] || ''
            const dots = Math.min(4, z.minStaff)
            const extra = z.minStaff - dots
            const emoji = CATEGORY_EMOJI[z.name] || (isDecomp ? '🌿' : '📦')
            const tooltip = [
              `${emoji} ${z.name} — ${TYPE_FA[z.type] || z.type}`,
              `مالک: ${z.ownerName || 'تعیین نشده'}${z.backupName ? ` | جانشین: ${z.backupName}` : ''}`,
              `شدت: ${z.criticality} — شمارش: ${z.countFrequency === 'WEEKLY' ? 'هفتگی' : z.countFrequency === 'BIWEEKLY' ? 'دوهفتگی' : 'ماهانه'} — حداقل نیرو: ${faNum(z.minStaff)}`,
              eff
                ? `فروش ۳۰ روزه: ${faMoney(eff.sales30)} | ساعت‌کار هفته: ${faNum(eff.staffHours)} | ZoneSLH: ${eff.zoneSLH === null ? '—' : faNum(eff.zoneSLH)} | شاخص سهم: ${eff.shareIndex === null ? '—' : faNum(eff.shareIndex)}${eff.band ? ` (${BAND_FA[eff.band]})` : ''}${eff.salesTargetExcluded ? ' | زون تنفس: از هدف فروش مستثنا' : ''}`
                : `وضعیت شمارش امروز: ${st === 'ok' ? 'مطابق ✓' : st === 'mismatch' ? 'مغایر ⚠' : st === 'inprogress' ? 'در جریان' : 'ثبت نشده'}`,
            ].join('\n')
            return (
              <g
                key={z.name}
                onClick={() => onZoneSelect(z.name)}
                className="cursor-pointer"
                role="button"
                aria-label={`زون ${z.name}`}
              >
                <title>{tooltip}</title>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx="9"
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={mismatch ? ROSE : isSelected ? '#0b2e20' : isDecomp ? GOLD : '#0e7a4a55'}
                  strokeWidth={isSelected ? 3 : mismatch || isDecomp ? 2 : 1.2}
                  strokeDasharray={isDecomp ? '6 4' : undefined}
                  className={cn('hzmap-cell', mismatch && 'hzmap-mismatch')}
                />
                {/* شدت A/B/C */}
                <circle cx={box.x + 11} cy={box.y + 11} r="8" fill="#0b2e20" fillOpacity="0.85" />
                <text x={box.x + 11} y={box.y + 14.5} textAnchor="middle" fontSize="9" fontWeight="black" fill="#faf7ee">
                  {z.criticality}
                </text>
                {/* نام زون */}
                <text
                  x={box.x + box.w / 2}
                  y={box.y + box.h / 2 - 3}
                  textAnchor="middle"
                  fontSize={box.h > 60 ? 12 : 11}
                  fontWeight="bold"
                  fill={INK}
                  style={{ pointerEvents: 'none' }}
                >
                  {emoji} {shortName}
                </text>
                {/* چیپ مالک */}
                {ownerFirst && (
                  <text
                    x={box.x + box.w / 2}
                    y={box.y + box.h / 2 + 11}
                    textAnchor="middle"
                    fontSize="9"
                    fill={INK}
                    opacity="0.75"
                    style={{ pointerEvents: 'none' }}
                  >
                    👤 {ownerFirst}
                  </text>
                )}
                {/* حداقل نیرو — نقطه‌ها */}
                {z.minStaff > 0 && (
                  <text x={box.x + 8} y={box.y + box.h - 6} fontSize="9" fill={GOLD} style={{ pointerEvents: 'none' }}>
                    {'●'.repeat(dots)}
                    {extra > 0 ? `+${faNum(extra)}` : ''}
                  </text>
                )}
              </g>
            )
          })}

          {/* یادداشت آندرهیل روی نوار تنفس */}
          {decompExists && (
            <text x="345" y="512" textAnchor="middle" fontSize="9.5" fontStyle="italic" fill="#8a6d10">
              زون تنفس — فروش‌سنج نیست (۳–۵ متر اول ورود)
            </text>
          )}
        </svg>
      </div>

      {/* راهنما */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border/60 bg-card px-4 py-3 text-[11px]">
        {!effView ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded" style={{ background: '#77934a33', border: '1px solid #77934a' }} /> امروز ثبت نشده
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded" style={{ background: '#0e7a4ad9' }} /> شمارش مطابق ✓
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded" style={{ background: '#b3372fd9' }} /> مغایر ⚠ (چشمک)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded" style={{ background: '#c9a2278c' }} /> در جریان
            </span>
            <span className="flex items-center gap-1.5 text-[#8a6d10]">● حداقل نیروی زون</span>
            <span className="flex items-center gap-1.5">A/B/C شدت شمارش</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded" style={{ background: OLIVE }} /> متعادل (۰٫۷–۱٫۳)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded" style={{ background: GOLD }} /> نیروی بیش از فروش (&lt;۰٫۷)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded" style={{ background: ROSE }} /> فروش بیش از نیرو (&gt;۱٫۳)
            </span>
          </>
        )}
      </div>

      {/* یادداشت علمی — زون تنفس آندرهیل */}
      <div className="mt-2 rounded-2xl border border-[#c9a227]/40 bg-[#c9a227]/10 px-4 py-3 text-[11px] leading-6 text-[#8a6d10]">
        <b>زون تنفس (Decompression Zone):</b> طبق پژوهش‌های رفتار مشتری (Paco Underhill)، ۳ تا ۵ متر اول ورودی فروشگاه
        «فروش‌ساز» نیست — مشتری هنوز در حال تطبیق خود با فضاست. این نوار عمداً بدون قفسهٔ فروش و بدون هدف فروش نگه داشته
        می‌شود؛ علامت‌گذاری قیمت یا شمارش فروش در آن معنا ندارد. شمارش کالایی آن (در صورت وجود) فقط برای موجودی است.
      </div>
    </div>
  )
}
