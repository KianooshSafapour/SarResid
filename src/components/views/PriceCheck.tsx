'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import JsBarcode from 'jsbarcode'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliFull, todayIso } from '@/lib/jalali'
import { EmptyState, FaPriceInput } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { CATEGORY_EMOJI } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { BadgePercent, Printer, Download, CheckCircle2, Save, TriangleAlert, TrendingUp, Search, Tag, Flame, X, Camera } from 'lucide-react'
import { openBarcodeScanner } from '@/components/app/BarcodeScanner'

/**
 * تابلوی کنترل قیمت روزانه — پاسخ مستقیم به تورم روزانه ایران
 * هر روز: قیمت چاپ‌شده را با آخرین هزینه خرید واقعی مقایسه کنید، تیک بزنید یا قیمت جدید ثبت کنید.
 * margin = (printed − latest cost) / latest cost × 100 — قرمز <۱۰٪، زرد <۲۵٪، سبز ≥۲۵٪
 */
type Row = {
  id: string
  name: string
  barcodes: string[]
  category: string
  unit: string
  stock: number
  sellPrice: number
  cost: number
  deltaPct: number | null
  margin: number | null
  tone: 'red' | 'yellow' | 'green' | 'none'
  lastPriceCheck: string
  lastCheckedPrice: number
  daysSince: number | null
  checkedToday: boolean
  costHistory: { price: number; j: string }[]
}

type Summary = {
  total: number
  checkedToday: number
  remaining: number
  red: number
  yellow: number
  green: number
  avgMargin: number
  streak: number
}

const TONE = {
  red: { color: '#b3372f', bg: '#fee2e2', label: 'بحرانی' },
  yellow: { color: '#a16207', bg: '#fef9c3', label: 'کم‌حاشیه' },
  green: { color: '#0e7a4a', bg: '#dcfce7', label: 'سود مناسب' },
  none: { color: '#6b7280', bg: '#f3f4f6', label: 'بدون قیمت' },
}

const FILTERS = [
  { key: 'todo', label: '⏳ مانده امروز' },
  { key: 'red', label: '🔴 بحرانی' },
  { key: 'yellow', label: '🟡 کم‌حاشیه' },
  { key: 'green', label: '🟢 مناسب' },
  { key: 'checked', label: '✅ کنترل‌شده امروز' },
  { key: 'all', label: 'همه' },
] as const

function lastCheckLabel(row: Row) {
  if (row.checkedToday) return 'امروز کنترل شد ✓'
  if (row.daysSince === null) return 'هرگز کنترل نشده'
  if (row.daysSince === 1) return 'دیروز'
  if (row.daysSince > 1) return `${faNum(row.daysSince)} روز پیش`
  return '—'
}

/** tiny inline SVG trend of the product's last purchase costs — the inflation story at a glance */
function CostSpark({ points }: { points: { price: number; j: string }[] }) {
  if (points.length < 2) return null
  const w = 56
  const h = 20
  const pad = 2
  const min = Math.min(...points.map((p) => p.price))
  const max = Math.max(...points.map((p) => p.price))
  const span = max - min || 1
  const step = (w - pad * 2) / (points.length - 1)
  const coords = points.map((p, i) => [pad + i * step, h - pad - ((p.price - min) / span) * (h - pad * 2)] as const)
  const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ')
  const up = points[points.length - 1].price >= points[0].price
  const tip = points.map((p) => `${p.j}: ${faMoney(p.price)}`).join(' | ')
  const gid = `spark-${points.length}-${min}-${max}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="spark-line shrink-0" role="img" aria-label="روند هزینه خرید">
      <title>{tip}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={up ? '#c9a227' : '#0e7a4a'} />
          <stop offset="100%" stopColor={up ? '#b3372f' : '#12905a'} />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#${gid})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.2" fill={up ? '#b3372f' : '#0e7a4a'} />
    </svg>
  )
}

/** Code128 barcode rendered into a small SVG via JsBarcode — for the shelf label */
function LabelBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          displayValue: false,
          height: 30,
          width: 1.05,
          margin: 0,
          lineColor: '#111111',
        })
      } catch {
        /* invalid chars — leave the svg empty, the numeric text below is the fallback */
      }
    }
  }, [value])
  return <svg ref={ref} className="label-bc" />
}

export default function PriceCheckView({ ctx }: { ctx: AppCtx }) {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('todo')
  const [edits, setEdits] = useState<Record<string, number | ''>>({}) // productId → edited printed price
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [justVerified, setJustVerified] = useState<Record<string, boolean>>({})
  const [picked, setPicked] = useState<Set<string>>(new Set()) // rows selected for shelf labels
  const [copies, setCopies] = useState<Record<string, number>>({}) // productId → number of label copies (default 1)

  const load = async () => {
    setLoading(true)
    setErr('')
    try {
      const d = await api<{ rows: Row[]; summary: Summary }>('/api/price-check')
      setRows(d.rows)
      setSummary(d.summary)
    } catch (e: any) {
      setErr(e.message || 'خطا در دریافت تابلو')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = rows.filter((r) => {
      if (cat && r.category !== cat) return false
      if (q && !(r.name.toLowerCase().includes(q) || r.barcodes.some((b) => b.includes(q)))) return false
      if (filter === 'todo') return !r.checkedToday
      if (filter === 'checked') return r.checkedToday
      if (filter === 'red') return r.tone === 'red' && !r.checkedToday
      if (filter === 'yellow') return r.tone === 'yellow' && !r.checkedToday
      if (filter === 'green') return r.tone === 'green' && !r.checkedToday
      return true
    })
    const prio = (r: Row) => (r.checkedToday ? 3 : r.tone === 'red' ? 0 : r.tone === 'yellow' ? 1 : r.tone === 'none' ? 2 : 2)
    out = [...out].sort((a, b) => {
      const p = prio(a) - prio(b)
      if (p !== 0) return p
      if (!a.checkedToday) return (a.margin ?? 999) - (b.margin ?? 999)
      return a.name.localeCompare(b.name, 'fa')
    })
    return out
  }, [rows, search, cat, filter])

  const setEdit = (id: string, v: number | '') => setEdits((e) => ({ ...e, [id]: v }))

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const bumpCopy = (id: string, d: number) =>
    setCopies((c) => ({ ...c, [id]: Math.min(20, Math.max(1, (c[id] ?? 1) + d)) }))

  // scan-to-pick: با دوربین بارکد کالا را بخوان، همان ردیف برای چاپ لیبل انتخاب می‌شود
  const scanPick = () =>
    openBarcodeScanner((code) => {
      const r = rows.find((x) => x.barcodes.includes(code.trim()))
      if (!r) {
        toast.error(`کالایی با بارکد «${faNum(code.trim())}» پیدا نشد`)
        return
      }
      setPicked((s) => {
        if (s.has(r.id)) {
          toast.info(`«${r.name}» از قبل انتخاب است`)
          return s
        }
        const n = new Set(s)
        n.add(r.id)
        toast.success(`🏷️ «${r.name}» برای چاپ لیبل انتخاب شد`)
        return n
      })
    })

  const post = async (productIds: string[], action: 'verify' | 'reprice', sellPrice?: number) => {
    const res = await api<{ ok: boolean; streak?: number }>('/api/price-check', { method: 'POST', body: { productIds, action, sellPrice } })
    const streak = typeof res?.streak === 'number' ? res.streak : null
    if (streak !== null) setSummary((s) => (s && streak !== s.streak ? { ...s, streak } : s))
  }

  // the products whose labels are printed — selected rows × their copy counts
  const pickedRows = useMemo(() => rows.filter((r) => picked.has(r.id)), [rows, picked])
  const labelItems = useMemo(() => pickedRows.flatMap((r) => Array.from({ length: copies[r.id] ?? 1 }, () => r)), [pickedRows, copies])

  const verify = async (row: Row) => {
    setBusy((b) => ({ ...b, [row.id]: true }))
    try {
      await post([row.id], 'verify')
      setPicked((s) => {
        if (!s.has(row.id)) return s
        const n = new Set(s)
        n.delete(row.id)
        return n
      })
      setRows((arr) => arr.map((r) => (r.id === row.id ? { ...r, checkedToday: true, lastPriceCheck: todayIso(), lastCheckedPrice: r.sellPrice } : r)))
      setSummary((s) => (s ? { ...s, checkedToday: s.checkedToday + 1, remaining: Math.max(0, s.remaining - 1), red: row.tone === 'red' ? Math.max(0, s.red - 1) : s.red, yellow: row.tone === 'yellow' ? Math.max(0, s.yellow - 1) : s.yellow } : s))
      setJustVerified((j) => ({ ...j, [row.id]: true }))
      setTimeout(() => setJustVerified((j) => ({ ...j, [row.id]: false })), 1600)
      toast.success(`«${row.name}» کنترل شد ✅`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy((b) => ({ ...b, [row.id]: false }))
    }
  }

  const reprice = async (row: Row) => {
    const v = typeof edits[row.id] === 'number' ? (edits[row.id] as number) : 0
    if (!v || v <= 0) return toast.error('قیمت جدید را وارد کنید')
    setBusy((b) => ({ ...b, [row.id]: true }))
    try {
      await post([row.id], 'reprice', v)
      setRows((arr) => arr.map((r) => (r.id === row.id ? { ...r, sellPrice: v, checkedToday: true, lastPriceCheck: todayIso(), lastCheckedPrice: v } : r)))
      toast.info(`یادآوری: لیبل قفسه «${row.name}» را هم عوض کنید 🏷️`, { description: 'کالا را انتخاب و «چاپ لیبل قفسه» را بزنید' })
      setEdits((e) => {
        const n = { ...e }
        delete n[row.id]
        return n
      })
      setSummary((s) => (s ? { ...s, checkedToday: s.checkedToday + 1, remaining: Math.max(0, s.remaining - 1) } : s))
      setJustVerified((j) => ({ ...j, [row.id]: true }))
      setTimeout(() => setJustVerified((j) => ({ ...j, [row.id]: false })), 1600)
      toast.success(`قیمت چاپ‌شده «${row.name}» روی ${faMoney(v)} تومان ثبت شد ✅`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy((b) => ({ ...b, [row.id]: false }))
    }
  }

  const verifyAllGreen = async () => {
    const ids = rows.filter((r) => !r.checkedToday && r.tone === 'green').map((r) => r.id)
    if (!ids.length) return toast.info('کالای سبزِ کنترل‌نشده‌ای نیست')
    try {
      await post(ids, 'verify')
      const today = todayIso()
      setRows((arr) => arr.map((r) => (ids.includes(r.id) ? { ...r, checkedToday: true, lastPriceCheck: today, lastCheckedPrice: r.sellPrice } : r)))
      setSummary((s) => (s ? { ...s, checkedToday: s.checkedToday + ids.length, remaining: Math.max(0, s.remaining - ids.length), green: Math.max(0, s.green - ids.length) } : s))
      toast.success(`${faNum(ids.length)} کالای سبز یکجا تأیید شد ✅`)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const downloadXls = () => {
    const aoa: (string | number)[][] = [
      [`تابلوی کنترل قیمت روزانه — ${formatJalaliFull(todayIso())}`],
      [],
      ['کالا', 'بارکد', 'دسته', 'آخرین هزینه خرید', 'تغییر هزینه', 'قیمت چاپ‌شده', 'حاشیه سود ٪', 'وضعیت', 'آخرین کنترل'],
    ]
    for (const r of list) {
      aoa.push([
        r.name,
        r.barcodes[0] || '',
        r.category,
        r.cost,
        r.deltaPct === null ? '—' : `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%`,
        r.sellPrice,
        r.margin ?? '—',
        r.checkedToday ? 'کنترل‌شده امروز' : TONE[r.tone].label,
        lastCheckLabel(r),
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'کنترل قیمت')
    XLSX.writeFile(wb, `price-check-${todayIso()}.xlsx`)
    toast.success('فایل اکسل کنترل قیمت دانلود شد')
  }

  const printSheet = () => {
    // constrain page height while printing so the fixed print-area yields exactly one page
    document.body.classList.add('printing-sheet')
    const cleanup = () => {
      document.body.classList.remove('printing-sheet')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
    setTimeout(cleanup, 2000) // fallback if afterprint doesn't fire
  }

  // shelf labels — same sibling-hiding approach as the paper sheet, via body.printing-labels
  const printLabels = () => {
    if (!pickedRows.length) return toast.error('اول کالاها را با تیک انتخاب کنید')
    document.body.classList.add('printing-labels')
    const cleanup = () => {
      document.body.classList.remove('printing-labels')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
    setTimeout(cleanup, 2000)
  }

  // rows still needing physical verification today → the paper sheet
  const sheetRows = rows.filter((r) => !r.checkedToday)

  return (
    <div className="space-y-4">
      {/* ─── hero ─── */}
      <div className="pattern-girih relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0b2e20] via-[#11563a] to-[#0b2e20] p-4 text-white shadow-xl sm:p-5">
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c9a227]/20 text-[#e9c64a] shadow-inner">
              <BadgePercent size={26} />
            </div>
            <div>
              <h2 className="text-lg font-black sm:text-xl">تابلوی کنترل قیمت روزانه</h2>
              <p className="mt-0.5 text-[11px] font-bold text-white/75 sm:text-xs">{formatJalaliFull(todayIso())} — پاسخ سریع به تورم: قیمت چاپ‌شده در برابر آخرین هزینه خرید</p>
              {summary && summary.streak > 0 && (
                <span
                  className="fire-pulse mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#c9a227]/25 px-2.5 py-0.5 text-[10px] font-black text-[#ffd968] ring-1 ring-[#c9a227]/50"
                  title="روزهای پشت‌سرهم که کنترل قیمت کامل شده — از آرشیو صبح‌نامه‌ها"
                >
                  <Flame size={11} /> {faNum(summary.streak)} روز متوالی کنترل کامل
                </span>
              )}
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            {pickedRows.length > 0 && (
              <button onClick={printLabels} className="flex items-center gap-1.5 rounded-xl bg-[#e9c64a] px-3.5 py-2 text-[11px] font-extrabold text-[#0b2e20] shadow-md transition hover:bg-[#f2d35c]">
                <Tag size={14} /> چاپ لیبل قفسه ({faNum(labelItems.length)} لیبل)
              </button>
            )}
            <button onClick={verifyAllGreen} title="همه کالاهایی که حاشیه‌شان سبز است و امروز کنترل نشده‌اند، یکجا تأیید کن" className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-[11px] font-extrabold text-white backdrop-blur transition hover:bg-white/20">
              <CheckCircle2 size={14} /> تأیید یکجای سبزها
            </button>
            <button onClick={downloadXls} className="flex items-center gap-1.5 rounded-xl bg-[#c9a227] px-3.5 py-2 text-[11px] font-extrabold text-[#0b2e20] shadow-md transition hover:bg-[#d9b23a]">
              <Download size={14} /> اکسل
            </button>
            <button onClick={printSheet} className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-[11px] font-extrabold text-white backdrop-blur transition hover:bg-white/20">
              <Printer size={14} /> برگه کاغذی
            </button>
          </div>
        </div>
      </div>

      {/* ─── stat strip ─── */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child]:max-[500px]:col-span-2">
          {[
            { label: 'کل کالاها', value: summary.total, tone: 'bg-secondary/70 text-foreground', ring: 'ring-border' },
            { label: 'امروز کنترل‌شده ✓', value: summary.checkedToday, tone: 'bg-[#0e7a4a]/10 text-[#0e7a4a]', ring: 'ring-[#0e7a4a]/25' },
            { label: 'مانده امروز ⏳', value: summary.remaining, tone: 'bg-[#c9a227]/10 text-[#8a6d10]', ring: 'ring-[#c9a227]/30' },
            { label: 'حاشیه بحرانی 🔴', value: summary.red, tone: 'bg-[#b3372f]/10 text-[#b3372f]', ring: 'ring-[#b3372f]/25' },
            { label: 'میانگین حاشیه', value: `${faNum(summary.avgMargin)}٪`, tone: 'bg-[#77934a]/10 text-[#5a7038]', ring: 'ring-[#77934a]/30' },
          ].map((s) => (
            <div key={s.label} className={cn('rounded-2xl px-3 py-2.5 ring-1 transition hover:-translate-y-0.5 hover:shadow-md', s.tone, s.ring)}>
              <p className="text-base font-black">{typeof s.value === 'number' ? faNum(s.value) : s.value}</p>
              <p className="mt-0.5 text-[11px] font-bold opacity-80">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── toolbar ─── */}
      <div className="no-print space-y-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جست‌وجوی نام یا بارکد…"
              className="w-full rounded-xl border border-input bg-white py-2.5 pl-3 pr-9 text-xs font-bold outline-none focus:border-[#c9a227]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] font-bold transition',
                  filter === f.key ? 'border-[#c9a227] bg-[#8a6d10] text-white shadow-md shadow-[#c9a227]/25' : 'border-border bg-card text-foreground/70 hover:bg-secondary'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-2.5">
          <span className="text-[10px] font-bold text-muted-foreground">🏷️ چاپ لیبل:</span>
          <button
            onClick={() => setPicked(new Set(list.filter((r) => !r.checkedToday).map((r) => r.id)))}
            className="rounded-full border border-[#c9a227]/40 bg-[#c9a227]/10 px-3 py-1 text-[10px] font-bold text-[#8a6d10] transition hover:bg-[#c9a227]/20"
          >
            انتخاب همه مانده‌های همین فهرست
          </button>
          <button
            onClick={scanPick}
            className="scan-pulse flex items-center gap-1 rounded-full border border-[#0e7a4a]/40 bg-[#0e7a4a]/10 px-3 py-1 text-[10px] font-bold text-[#0e7a4a] transition hover:bg-[#0e7a4a]/20"
            title="بارکد کالا را اسکن کن تا همان ردیف انتخاب شود — برای موبایل هم کار می‌کند"
          >
            <Camera size={11} /> اسکن برای انتخاب
          </button>
          {pickedRows.length > 0 && (
            <button
              onClick={() => setPicked(new Set())}
              className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[10px] font-bold text-foreground/60 transition hover:bg-secondary"
            >
              <X size={11} /> پاک کردن انتخاب ({faNum(pickedRows.length)})
            </button>
          )}
          {pickedRows.length > 0 && (
            <button
              onClick={printLabels}
              className="flex items-center gap-1 rounded-full bg-[#e9c64a] px-3 py-1 text-[10px] font-extrabold text-[#0b2e20] shadow transition hover:bg-[#f2d35c]"
            >
              <Printer size={11} /> چاپ {faNum(labelItems.length)} لیبل
            </button>
          )}
        </div>
        {/* picked chips — تعداد نسخه هر لیبل را همین‌جا تنظیم کنید */}
        {pickedRows.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pickedRows.map((r) => (
              <span key={r.id} className="picked-chip flex items-center gap-1 rounded-full border border-[#c9a227]/50 bg-[#fdf6dd] py-0.5 pr-2.5 pl-1">
                <span className="max-w-36 truncate text-[10px] font-black text-[#6b5410]">{r.name}</span>
                <span className="flex items-center gap-0.5 rounded-full bg-white/80 px-1 py-0.5">
                  <button onClick={() => bumpCopy(r.id, -1)} className="stepper-btn !h-5 !w-5 text-[10px]" aria-label={`کاهش نسخه ${r.name}`}>−</button>
                  <span className="w-4 text-center text-[10px] font-black text-[#8a6d10]" title="تعداد نسخه لیبل">×{faNum(copies[r.id] ?? 1)}</span>
                  <button onClick={() => bumpCopy(r.id, +1)} className="stepper-btn !h-5 !w-5 text-[10px]" aria-label={`افزایش نسخه ${r.name}`}>+</button>
                </span>
                <button onClick={() => togglePick(r.id)} className="rounded-full p-0.5 text-[#b3372f]/70 transition hover:bg-[#b3372f]/10 hover:text-[#b3372f]" aria-label={`حذف ${r.name} از انتخاب`}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setCat('')} className={cn('rounded-full border px-3 py-1 text-[10px] font-bold transition', !cat ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/60 hover:bg-secondary')}>
              همه دسته‌ها
            </button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c === cat ? '' : c)} className={cn('rounded-full border px-3 py-1 text-[10px] font-bold transition', c === cat ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/60 hover:bg-secondary')}>
                {CATEGORY_EMOJI[c] || '📦'} {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── board ─── */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>
      ) : err ? (
        <EmptyState emoji="⚠️" title="خطا در بارگذاری" hint={err} />
      ) : list.length === 0 ? (
        <EmptyState emoji="🎉" title="همه چیز کنترل شده!" hint="امروز هیچ کالایی در این فیلتر نیست — دستِ همه درد نکند" />
      ) : (
        <div className="space-y-2.5">
          {list.map((r) => {
            const tone = TONE[r.tone]
            const edited = edits[r.id] !== undefined && edits[r.id] !== '' && edits[r.id] !== r.sellPrice
            const isPicked = picked.has(r.id)
            return (
              <div
                key={r.id}
                className={cn(
                  'price-row glow-card rounded-2xl border bg-card p-3 shadow-sm transition hover:shadow-md',
                  isPicked ? 'border-[#c9a227] row-picked ring-1 ring-[#c9a227]/40' : r.checkedToday ? 'border-[#0e7a4a]/30 row-verified' : 'border-border',
                  justVerified[r.id] && 'row-just-verified'
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  {/* label-print picker */}
                  <button
                    onClick={() => togglePick(r.id)}
                    role="checkbox"
                    aria-checked={isPicked}
                    aria-label={`انتخاب ${r.name} برای چاپ لیبل قفسه`}
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition',
                      isPicked ? 'border-[#c9a227] bg-[#c9a227] text-white shadow-md shadow-[#c9a227]/30' : 'border-border bg-white text-transparent hover:border-[#c9a227]/60'
                    )}
                    title="انتخاب برای چاپ لیبل قفسه"
                  >
                    <CheckCircle2 size={14} />
                  </button>

                  {/* identity */}
                  <div className="flex min-w-44 flex-1 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-2xl">{CATEGORY_EMOJI[r.category] || '📦'}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">{r.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {r.barcodes[0] && <span className="font-mono text-[9px] text-muted-foreground" dir="ltr">{r.barcodes[0]}</span>}
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold text-foreground/60">{CATEGORY_EMOJI[r.category] || '📦'} {r.category}</span>
                        {r.stock === 0 && <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[9px] font-bold text-[#b3372f]">ناموجود</span>}
                      </div>
                    </div>
                  </div>

                  {/* cost + inflation delta + trend spark */}
                  <div className="min-w-28 text-center">
                    <p className="text-[9px] font-bold text-muted-foreground">آخرین هزینه خرید</p>
                    <p className="text-sm font-black text-foreground/85">{r.cost > 0 ? faMoney(r.cost) : '—'}</p>
                    <div className="mt-0.5 flex items-center justify-center gap-1.5">
                      {r.deltaPct !== null && (
                        <span className={cn('flex items-center gap-0.5 text-[9px] font-black', r.deltaPct > 0 ? 'text-[#b3372f]' : 'text-[#0e7a4a]')} title="تغییر هزینه نسبت به خرید قبلی">
                          {r.deltaPct > 0 ? <TrendingUp size={10} /> : <TrendingUp size={10} className="rotate-180" />}
                          {r.deltaPct > 0 ? '+' : ''}{faNum(r.deltaPct)}٪
                        </span>
                      )}
                      {r.costHistory.length >= 2 && <CostSpark points={r.costHistory} />}
                    </div>
                  </div>

                  {/* printed price (editable) */}
                  <div className="min-w-32 text-center">
                    <p className="text-[9px] font-bold text-muted-foreground">قیمت چاپ‌شده (تومان)</p>
                    <FaPriceInput
                      value={edits[r.id] ?? (r.sellPrice || '')}
                      onChange={(v) => setEdit(r.id, v)}
                      disabled={r.checkedToday}
                      ariaLabel={`قیمت چاپ‌شده ${r.name}`}
                      title="ارقام فارسی یا انگلیسی — با جداکننده هزارگان"
                      className={cn(
                        'mt-0.5 w-28 rounded-xl border-2 px-2 py-1.5 text-sm',
                        edited ? 'border-[#c9a227] bg-[#fdf6dd]' : 'border-border bg-white focus:border-[#c9a227]',
                        r.checkedToday && 'opacity-70'
                      )}
                    />
                  </div>

                  {/* margin pill */}
                  <div className="min-w-24 text-center">
                    <p className="text-[9px] font-bold text-muted-foreground">حاشیه سود</p>
                    {r.margin !== null ? (
                      <span className="mt-0.5 inline-block rounded-full px-3 py-1 text-xs font-black" style={{ color: tone.color, background: tone.bg }} title={tone.label}>
                        {faNum(r.margin)}٪
                      </span>
                    ) : (
                      <span className="mt-0.5 inline-block text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* last check + actions */}
                  <div className="flex min-w-40 flex-1 items-center justify-end gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-bold',
                        r.checkedToday ? 'bg-[#0e7a4a]/10 text-[#0e7a4a]' : r.daysSince === null ? 'bg-[#b3372f]/10 text-[#b3372f]' : 'bg-secondary text-foreground/60'
                      )}
                    >
                      {lastCheckLabel(r)}
                    </span>
                    {edited ? (
                      <button
                        onClick={() => reprice(r)}
                        disabled={busy[r.id]}
                        className="flex items-center gap-1 rounded-xl bg-[#8a6d10] px-3.5 py-2 text-[11px] font-extrabold text-white shadow-md shadow-[#c9a227]/25 transition hover:bg-[#a3851a] disabled:opacity-50"
                      >
                        <Save size={13} /> ثبت قیمت جدید
                      </button>
                    ) : (
                      <button
                        onClick={() => verify(r)}
                        disabled={r.checkedToday || busy[r.id]}
                        className={cn(
                          'flex items-center gap-1 rounded-xl px-3.5 py-2 text-[11px] font-extrabold transition disabled:opacity-60',
                          r.checkedToday ? 'cursor-default bg-[#0e7a4a]/10 text-[#0e7a4a]' : 'bg-primary text-white shadow-md shadow-primary/25 hover:bg-[#12905a]'
                        )}
                      >
                        <CheckCircle2 size={13} /> {r.checkedToday ? 'کنترل شد' : 'کنترل شد ✓'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── legend ─── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/60 p-3 text-[11px] font-bold text-foreground/70">
        <span className="flex items-center gap-1.5"><TriangleAlert size={13} className="text-[#b3372f]" /> قرمز: حاشیه زیر {faNum(10)}٪ — باید قیمت جدید بچسبانید</span>
        <span className="rounded-full bg-[#a16207]/10 px-2 py-0.5 text-[#a16207]">زرد: زیر {faNum(25)}٪ — قابل بهبود</span>
        <span className="rounded-full bg-[#0e7a4a]/10 px-2 py-0.5 text-[#0e7a4a]">سبز: {faNum(25)}٪ و بالاتر</span>
        <span>▲ قرمز روی «آخرین هزینه» یعنی تأمین‌کننده گران‌تر از قبل فروخته — سیگنال تورم</span>
        <span className="flex items-center gap-1.5"><Tag size={13} className="text-[#c9a227]" /> با تیک یا 📷 اسکن، کالا انتخاب کنید — تعداد نسخه هر لیبل را روی چیپ تنظیم کنید</span>
      </div>

      {/* ─── printable shelf-label sheet (لیبل قفسه) — portal to body; body.printing-labels makes it the only flow content ─── */}
      {typeof document !== 'undefined' && labelItems.length > 0 && createPortal(
        <div className="label-portal label-sheet print-area scroll-gold" id="label-sheet">
          <div className="label-guide">
            <span>🫒 هایپر زیتون — لیبل قفسه ({faNum(labelItems.length)} لیبل / {faNum(pickedRows.length)} کالا) — {formatJalaliFull(todayIso())}</span>
            <span>هر برگه A۴: ۲۱ لیبل — با قیچی روی خط‌چین ببُرید</span>
          </div>
          <div className="label-grid">
            {labelItems.map((r, i) => (
              <div className="label-card" key={`${r.id}-${i}`}>
                <div className="label-brand">🫒 هایپر زیتون</div>
                <p className="label-name">{r.name}</p>
                <div className="label-price">{r.sellPrice > 0 ? faMoney(r.sellPrice) : '—'} <small>تومان</small></div>
                <div className="label-bc-wrap">
                  {r.barcodes[0] ? <LabelBarcode value={r.barcodes[0]} /> : <span className="label-no-bc">بدون بارکد</span>}
                  <span className="label-bcnum" dir="ltr">{r.barcodes[0] || ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* ─── printable paper sheet (برگه گشتن در فروشگاه) — portal به body تا در چاپ، تنها محتوای صفحه باشد ─── */}
      {typeof document !== 'undefined' && createPortal(
        <div className="price-sheet print-area" id="price-sheet">
        <div className="sheet-head">
          <div className="sheet-logo">🫒</div>
          <div>
            <h3>هایپر زیتون — برگه کنترل قیمت روزانه</h3>
            <p>{formatJalaliFull(todayIso())}</p>
          </div>
          <div className="sheet-meta">
            <span>مانده: {faNum(sheetRows.length)} قلم</span>
            <span>امضای کنترل‌کننده: ....................</span>
          </div>
        </div>
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="w-8">☐</th>
              <th>کالا</th>
              <th className="w-28">بارکد</th>
              <th className="w-24">آخرین هزینه</th>
              <th className="w-24">قیمت چاپ‌شده فعلی</th>
              <th className="w-16">حاشیه</th>
              <th className="w-20">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {sheetRows.map((r) => (
              <tr key={r.id}>
                <td className="check-cell"></td>
                <td className="name-cell">{r.name}</td>
                <td className="mono-cell" dir="ltr">{r.barcodes[0] || '—'}</td>
                <td>{r.cost > 0 ? faMoney(r.cost) : '—'}</td>
                <td className="write-cell">{r.sellPrice > 0 ? faMoney(r.sellPrice) : '............'}</td>
                <td>{r.margin !== null ? `${faNum(r.margin)}٪` : '—'}</td>
                <td style={{ color: TONE[r.tone].color, fontWeight: 800 }}>{TONE[r.tone].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sheet-foot">قیمت‌های اصلاح‌شده را همان‌جا روی برگه بنویسید و پس از چسباندن برچسب، در سامانه «ثبت قیمت جدید» بزنید — صبح‌ بخیر باغ زیتون 🌿</p>
        </div>,
        document.body
      )}
    </div>
  )
}
