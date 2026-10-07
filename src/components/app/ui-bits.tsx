'use client'

import { ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'
import { CATEGORY_EMOJI } from '@/lib/constants'

export { CATEGORY_EMOJI }
import { enDigits, faNum } from '@/lib/jalali'

export type AppCtx = {
  user: {
    id: string
    name: string
    role: string
    secondaryRoles: string[]
    color: string
    points: number
  } | null
  navigate: (view: string, param?: string) => void
  view: string
  param: string
  refreshNotifications: () => void
  socket: any | null
  socketReady: boolean
}

/** Section wrapper with Persian title + description + optional actions */
export function SectionCard({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('glow-card gold-glow-border arch-top rounded-2xl bg-card p-4 sm:p-6 fade-in-up', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {icon && (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">{icon}</span>
          )}
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

/** KPI stat tile */
export function StatCard({
  label,
  value,
  hint,
  tone = 'emerald',
  icon,
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'emerald' | 'gold' | 'terra' | 'rose' | 'olive' | 'stone'
  icon?: ReactNode
  onClick?: () => void
}) {
  const tones: Record<string, string> = {
    emerald: 'from-[#0e7a4a]/12 to-transparent text-[#0e7a4a]',
    gold: 'from-[#c9a227]/18 to-transparent text-[#8a6d10]',
    terra: 'from-[#c96f4a]/15 to-transparent text-[#a04c2a]',
    rose: 'from-[#b3372f]/12 to-transparent text-[#b3372f]',
    olive: 'from-[#77934a]/15 to-transparent text-[#5c7236]',
    stone: 'from-[#6d7a6e]/12 to-transparent text-[#556057]',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'glow-card rounded-2xl bg-card p-4 text-right w-full transition-all',
        onClick && 'cursor-pointer hover:-translate-y-0.5'
      )}
    >
      <div className={cn('flex items-center justify-between rounded-xl bg-gradient-to-l p-2 -m-1 mb-2', tones[tone])}>
        <span className="text-2xl font-extrabold">{typeof value === 'number' ? faNum(value) : value}</span>
        <span className="opacity-80">{icon}</span>
      </div>
      <div className="text-sm font-semibold text-foreground">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </button>
  )
}

/** Small colored pill */
export function Pill({ label, color, bg, className }: { label: string; color: string; bg?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap', className)}
      style={{ color, background: bg || color + '1a' }}
    >
      {label}
    </span>
  )
}

export function EmptyState({ emoji = '🫒', title, hint }: { emoji?: string; title: string; hint?: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border/70 bg-muted/30 py-10 px-6 text-center">
      {/* Kerman olive-branch watermark */}
      <svg className="olive-branch" width="150" height="110" viewBox="0 0 150 110" fill="none">
        <path d="M8 104 C40 88 74 62 96 28" stroke="#0e7a4a" strokeWidth="2.4" strokeLinecap="round" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i} transform={`translate(${18 + i * 13} ${96 - i * 12}) rotate(${-30 + i * 6})`}>
            <ellipse cx="0" cy="-10" rx="5.5" ry="11" fill="#77934a" />
          </g>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <circle key={`o${i}`} cx={40 + i * 16} cy={88 - i * 14} r="4.6" fill="#0e7a4a" />
        ))}
      </svg>
      <span className="relative z-10 text-4xl mb-2">{emoji}</span>
      <p className="relative z-10 font-bold text-foreground">{title}</p>
      {hint && <p className="relative z-10 text-xs text-muted-foreground mt-1 max-w-sm">{hint}</p>}
    </div>
  )
}

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initial = name?.trim()?.[0] || '؟'
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white shadow-inner"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}bb)`, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  )
}

/** Stock status: red (severe), yellow (almost out), green (ok) */
export function stockStatus(stock: number, reorder: number): { key: 'red' | 'yellow' | 'green'; color: string; label: string } {
  if (stock === 0) return { key: 'red', color: '#b3372f', label: 'ناموجود' }
  if (stock <= Math.ceil(reorder * 0.5)) return { key: 'red', color: '#b3372f', label: 'کمبود جدی' }
  if (stock <= reorder) return { key: 'yellow', color: '#b8860b', label: 'رو به اتمام' }
  return { key: 'green', color: '#0e7a4a', label: 'موجودی مناسب' }
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'جستجو…'}
        className="w-full rounded-xl border border-input bg-white/90 px-4 py-2.5 pl-10 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </div>
  )
}

export function Labeled({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-foreground/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm font-bold text-foreground">{v}</span>
    </div>
  )
}

/* ───────────────── FaPriceInput — ورودی عدد با ارقام فارسی و جداکننده هزارگان ─────────────────
 * Accepts typing in Persian (۰-۹), Arabic (٠-٩) or Latin (0-9); displays formatted
 * with thousand separators in Persian digits; onChange emits the raw number ('' when empty).
 */
export function FaPriceInput({
  value,
  onChange,
  className,
  disabled,
  placeholder,
  ariaLabel,
  title,
}: {
  value: number | ''
  onChange: (v: number | '') => void
  className?: string
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  title?: string
}) {
  const format = (n: number | '') => (n === '' || n === null || isNaN(n as number) ? '' : faNum(Math.round(n).toLocaleString('en-US')))
  const [text, setText] = useState(() => format(value))
  const [focused, setFocused] = useState(false)

  // resync when the prop changes from outside (e.g. reset, load) — official render-phase adjustment pattern
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    if (!focused) setText(format(value))
  }

  const handle = (raw: string) => {
    setText(raw)
    const cleaned = enDigits(raw).replace(/[^\d]/g, '')
    onChange(cleaned === '' ? '' : Number(cleaned))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      value={text}
      onChange={(e) => handle(e.target.value)}
      onFocus={(e) => { setFocused(true); e.currentTarget.select() }}
      onBlur={() => { setFocused(false); setText(format(value)) }}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      className={cn('fa-price-input text-center font-black tabular-nums outline-none transition disabled:opacity-70', className)}
    />
  )
}
