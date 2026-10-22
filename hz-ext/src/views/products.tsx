import {
  useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn,
  Button, Input, Card, CardContent, CardHeader, CardTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  money, fa, toEnDigits, toFaDigits, formatJalali, I,
} from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════
   supply/products — «کالاها و بانک بارکد» (R4-8)
   جدول فشردهٔ کالاها (جست‌وجو + فیلتر گروه/واحد/وضعیت) + «شناسنامهٔ کالا»:
   سربرگ اطلاعات، کنترل واحد (مدیران؛ manualUnit)، دو نمودار SVG اختصاصی
   (گردش سفارش + روند موجودی/شمارش) و شبکهٔ حقایق سریع.
   پژوهش واحد شمارش: research/product-units-research.md
   ═══════════════════════════════════════════════════════════════ */

const ALLOWED_UNITS = ['عدد', 'کیلوگرم', 'گرم', 'بسته', 'دستی'] // §۳ پژوهش («شش‌تایی» عمداً حذف شد)
const MANAGE_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'] // آینهٔ canMutateProducts بک‌اند
const PAGE_SIZE = 24

const UNIT_CLS: Record<string, string> = {
  'عدد': 'bg-stone-100 text-stone-600 border-stone-200',
  'کیلوگرم': 'bg-teal-50 text-teal-800 border-teal-200',
  'دستی': 'bg-amber-50 text-amber-800 border-amber-200',
  'بسته': 'bg-violet-50 text-violet-800 border-violet-200',
  'گرم': 'bg-rose-50 text-rose-800 border-rose-200',
}

/* ── helpers ─────────────────────────────────────────────── */
function jslash(v: any): string {
  /** میلادی→جلالی با اسلش و ارقام فارسی: ۱۴۰۵/۰۷/۲۸ */
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    return toFaDigits(formatJalali(d).replace(/-/g, '/'))
  } catch { return '' }
}
function jstrSlash(v: any): string {
  /** رشتهٔ جلالی (۱۴۰۵-۰۷-۲۸ یا 1405/07/28) → ۱۴۰۵/۰۷/۲۸ */
  if (!v) return ''
  return toFaDigits(toEnDigits(String(v)).replace(/-/g, '/'))
}
function axisShort(l: string): string {
  /** ۱۴۰۵/۰۷/۲۳ → ۰۷/۲۳ (فقط برای برچسب محور) */
  return l && l.length >= 10 ? l.slice(5) : l
}

/* ── atoms ───────────────────────────────────────────────── */
function UnitBadge({ v, className }: { v?: string; className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold', UNIT_CLS[v ?? ''] || 'bg-stone-100 text-stone-600 border-stone-200', className)}>{v || '—'}</span>
}
function StatusBadge({ v }: { v?: string }) {
  const on = v === 'فعال'
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', on ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200')}>{v || '—'}</span>
}
function StockChip({ stock, level }: { stock: number; level?: number | null }) {
  const t = level && level > 0 ? level : 5
  const low = stock <= t
  const mid = !low && stock <= t * 2
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold',
      low ? 'bg-rose-50 text-rose-700 border-rose-200' : mid ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
      {low && <I.alertTriangle size={11} />} {fa(stock)} <span className="font-normal opacity-70">({low ? 'بحرانی' : mid ? 'کم' : 'کافی'})</span>
    </span>
  )
}

/* ═══════════════ نمودارهای SVG اختصاصی (بدون کتابخانهٔ خارجی) ═══════════════
   الگوی مالک در مخزن قدیمی: LineChart/BarChart با هاور و ارقام فارسی —
   بازنویسی‌شده در همین فایل (hz-ext فقط از پل '../lib/hz' ایمپورت می‌کند). */

interface FlowPoint { label: string; value: number; extra?: string }

/** نمودار خطی/سطحی گردش سفارش — شبکه + نشانگر + تولتیپ شناور (موس/لمس)، ارقام فارسی */
function FlowChart({ points, unit, height = 168, color = '#0e7a4a' }: { points: FlowPoint[]; unit?: string; height?: number; color?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const w = 300, h = 100
  if (points.length === 0) return null

  const values = points.map((p) => p.value)
  const max = Math.max(...values, 1)
  const niceMax = max <= 5 ? 6 : Math.ceil(max * 1.15)
  const X = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w)
  const Y = (v: number) => h - 8 - (v / niceMax) * (h - 20)
  const pts = points.map((p, i) => [X(i), Y(p.value)] as const)
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const areaPath = `${path} L${(pts[pts.length - 1] as any)[0]},${h} L${(pts[0] as any)[0]},${h} Z`

  const nearest = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const rel = Math.max(0, Math.min(rect.width, clientX - rect.left))
    setHover(Math.round((rel / rect.width) * (points.length - 1)))
  }
  const hi = hover !== null ? points[hover] : null
  const hp = hover !== null ? pts[hover] : null

  return (
    <div dir="ltr" className="relative w-full" style={{ height }} ref={boxRef}
      onMouseMove={(e: any) => nearest(e.clientX)} onMouseLeave={() => setHover(null)}
      onTouchStart={(e: any) => nearest(e.touches[0]?.clientX ?? 0)}
      onTouchMove={(e: any) => nearest(e.touches[0]?.clientX ?? 0)}
      onTouchEnd={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[86%] w-full" preserveAspectRatio="none">
        {/* شبکهٔ افقی */}
        {[0.25, 0.5, 0.75].map((f) => {
          const y = h - 8 - f * (h - 20)
          return <line key={f} x1="0" y1={y} x2={w} y2={y} stroke="#d6d3d1" strokeWidth="0.5" strokeDasharray="2 3" />
        })}
        <line x1="0" y1={h - 8} x2={w} y2={h - 8} stroke="#a8a29e" strokeWidth="0.8" />
        {/* سطح گرادیانی */}
        <defs>
          <linearGradient id="hzflow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#hzflow)" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={points.length > 30 ? 1.8 : 2.6} fill="#fff" stroke={color} strokeWidth="2" />)}
        {hp && hover !== null && (
          <>
            <line x1={hp[0]} y1="0" x2={hp[0]} y2={h - 8} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <circle cx={hp[0]} cy={hp[1]} r="4.6" fill={color} stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>
      {/* برچسب بیشینه + بازهٔ محور زمان */}
      <div dir="ltr" className="pointer-events-none absolute inset-x-0 top-0 flex justify-between text-[9px] text-stone-400">
        <span>{fa(niceMax)}</span><span>۰</span>
      </div>
      <div dir="ltr" className="mt-0.5 flex justify-between text-[9px] text-stone-400">
        <span>{axisShort(points[0]?.label ?? '')}</span>
        {points.length > 2 && <span className="hidden sm:inline">{axisShort(points[Math.floor((points.length - 1) / 2)]?.label ?? '')}</span>}
        <span>{axisShort(points[points.length - 1]?.label ?? '')}</span>
      </div>
      {hi && hp && (
        <div dir="rtl" className="pointer-events-none absolute z-30 min-w-28 max-w-52 -translate-x-1/2 rounded-xl bg-stone-900 px-2.5 py-1.5 text-[10px] font-bold leading-4 text-stone-50 shadow-xl"
          style={{ left: `${(hp[0] / w) * 100}%`, top: `${(hp[1] / h) * 82}%`, transform: hover === 0 ? 'translate(0,-120%)' : hover === points.length - 1 ? 'translate(-100%,-120%)' : 'translate(-50%,-120%)' }}>
          <span className="block">{hi.label}</span>
          <span className="block">{fa(hi.value)} {unit || 'عدد'}</span>
          {hi.extra && <span className="block opacity-75">{hi.extra}</span>}
        </div>
      )}
    </div>
  )
}

interface CountRow { label: string; systemQty: number; countedQty: number; diff: number }

/** نمودار ستونیِ روند موجودی/شمارش — دو ستون جفتی (سیستم/شمارش) + تولتیپ */
function CountsBars({ rows, height = 150 }: { rows: CountRow[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  if (rows.length === 0) return null
  const max = Math.max(...rows.flatMap((r) => [r.systemQty, r.countedQty]), 1)
  return (
    <div dir="ltr" className="w-full" style={{ height }}>
      <div className="flex h-[86%] items-end gap-1.5 overflow-x-auto pb-1">
        {rows.map((r, i) => {
          const hs = Math.max(3, (r.systemQty / max) * (height - 44))
          const hc = Math.max(3, (r.countedQty / max) * (height - 44))
          const isH = hover === i
          return (
            <div key={i} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {isH && (
                <div dir="rtl" className="pointer-events-none absolute -top-1 z-20 min-w-32 max-w-48 rounded-xl bg-stone-900 px-2.5 py-1.5 text-[10px] font-bold leading-4 text-stone-50 shadow-xl">
                  <span className="block">{r.label}</span>
                  <span className="block">سیستم: {fa(r.systemQty)} · شمارش: {fa(r.countedQty)}</span>
                  <span className={cn('block', r.diff === 0 ? 'text-emerald-300' : 'text-rose-300')}>{r.diff === 0 ? 'بدون مغایرت' : `مغایرت ${r.diff > 0 ? '+' : '−'}${fa(Math.abs(r.diff))}`}</span>
                </div>
              )}
              <div className="w-full max-w-3.5 rounded-t-md transition-all duration-300" style={{ height: hs, background: 'linear-gradient(180deg,#0e7a4a,#0e7a4a99)', boxShadow: '0 3px 10px -3px #0e7a4a66', opacity: hover === null || isH ? 1 : 0.5 }} />
              <div className="w-full max-w-3.5 rounded-t-md transition-all duration-300" style={{ height: hc, background: 'linear-gradient(180deg,#c9a227,#c9a22799)', boxShadow: '0 3px 10px -3px #c9a22766', opacity: hover === null || isH ? 1 : 0.5 }} />
            </div>
          )
        })}
      </div>
      <div dir="ltr" className="mt-0.5 flex justify-between text-[9px] text-stone-400">
        <span>{rows[0]?.label}</span><span>{rows[rows.length - 1]?.label}</span>
      </div>
      <div dir="rtl" className="mt-1 flex items-center justify-center gap-3 text-[10px] text-stone-500">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#0e7a4a]" /> موجودی سیستم</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#c9a227]" /> شمارش فیزیکی</span>
      </div>
    </div>
  )
}

function ChartEmpty({ emoji, title, hint }: { emoji: string; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/60 px-4 py-7 text-center">
      <span className="text-2xl leading-none">{emoji}</span>
      <p className="mt-2 text-xs font-bold text-stone-600">{title}</p>
      <p className="mt-0.5 max-w-xs text-[11px] leading-4 text-stone-400">{hint}</p>
    </div>
  )
}

/* ═══════════════ کنترل واحد (شناسنامه) ═══════════════ */
function UnitControl({ unit, manualUnit, canManage, saving, onSave, onUnlock }: {
  unit: string; manualUnit: boolean; canManage: boolean; saving: boolean
  onSave: (u: string) => void; onUnlock: () => void
}) {
  const [sel, setSel] = useState(unit)
  useEffect(() => setSel(unit), [unit])
  if (!canManage) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
        <I.lock size={14} className="text-stone-400" />
        <span className="text-xs font-bold text-stone-600">واحد شمارش:</span>
        <UnitBadge v={unit} />
        <span className="text-[11px] text-stone-400">— تغییر واحد نیازمند دسترسی مدیر است</span>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/60 p-2.5">
      <span className="text-xs font-bold text-teal-900">واحد شمارش:</span>
      <Select value={sel} onValueChange={(v: string) => setSel(v)}>
        <SelectTrigger className="h-8 w-32" aria-label="انتخاب واحد"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ALLOWED_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8 gap-1" disabled={saving || sel === unit} onClick={() => onSave(sel)}>
        {saving ? <I.loader size={13} className="animate-spin" /> : <I.save size={13} />} ذخیرهٔ واحد
      </Button>
      {manualUnit ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
          <I.lock size={10} /> واحد دستی (مصون از قاعدهٔ خودکار)
          <button type="button" className="mr-1 rounded px-1 text-[10px] text-amber-700 underline decoration-dotted hover:bg-amber-100" onClick={onUnlock} disabled={saving}>
            رفع قفل
          </button>
        </span>
      ) : (
        <span className="text-[10px] text-stone-400">پس از ذخیره، این کالا از قواعد خودکار واحد مصون می‌شود</span>
      )}
    </div>
  )
}

/* ═══════════════ «شناسنامهٔ کالا» ═══════════════ */
function PassportDialog({ id, open, onOpenChange, onSaved }: { id: string | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { user } = useShell()
  const canManage = MANAGE_ROLES.includes(user?.role ?? '')
  const [loading, setLoading] = useState(false)
  const [savingUnit, setSavingUnit] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [circ, setCirc] = useState<any>(null)

  const load = (pid: string) => {
    setLoading(true); setDetail(null); setCirc(null)
    Promise.all([api(`/api/products/${pid}`), api(`/api/products/${pid}/circulation`)])
      .then(([d, c]: any[]) => {
        if (d.ok) setDetail(d.data); else toast.error(d.error || 'کالا دریافت نشد')
        if (c.ok) setCirc(c.data); else setCirc(null)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (open && id) load(id) }, [open, id])

  /* ── نگاشت داده→نمودار (خروجی همان چیزی است که رندر می‌شود) ── */
  const flowPoints: FlowPoint[] = useMemo(() => {
    if (!circ?.buys) return []
    const byDay = new Map<string, { qty: number; received: number; at: string }>()
    for (const b of circ.buys as any[]) {
      const key = jslash(b.orderedAt) || jslash(b.createdAt) || '—'
      const cur = byDay.get(key) ?? { qty: 0, received: 0, at: b.orderedAt }
      cur.qty += Number(b.qty ?? 0)
      cur.received += Number(b.receivedQty ?? 0)
      byDay.set(key, cur)
    }
    return [...byDay.entries()]
      .sort((a, b) => new Date(a[1].at).getTime() - new Date(b[1].at).getTime())
      .map(([day, v]) => ({ label: day, value: v.qty, extra: `دریافت‌شده: ${fa(v.received)}` }))
  }, [circ])

  const countRows: CountRow[] = useMemo(() => {
    if (!circ?.counts) return []
    return (circ.counts as any[])
      .map((c) => ({ label: jstrSlash(c.dateJalali) || '—', systemQty: Number(c.systemQty ?? 0), countedQty: Number(c.countedQty ?? 0), diff: Number(c.diff ?? 0) }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), 'fa', { numeric: true }))
  }, [circ])

  const p = detail
  const s = circ?.summary
  const threshold = p ? (p.reorderLevel ?? p.lowStockThreshold ?? 5) : 5
  const lowStock = p ? Number(p.stock ?? 0) <= Number(threshold) : false
  const unit = (p?.unit ?? circ?.product?.unit) || 'عدد'

  const saveUnit = (u: string) => {
    if (!p) return
    setSavingUnit(true)
    api(`/api/products/${p.id}`, { method: 'PATCH', body: { unit: u, manualUnit: true } })
      .then((r: any) => {
        if (r.ok) { toast.success(`واحد «${u}» ذخیره شد — این کالا از قاعدهٔ خودکار مصون است`); load(p.id); onSaved() }
        else toast.error(r.error || 'ذخیره نشد')
      })
      .finally(() => setSavingUnit(false))
  }
  const unlockUnit = () => {
    if (!p) return
    setSavingUnit(true)
    api(`/api/products/${p.id}`, { method: 'PATCH', body: { manualUnit: false } })
      .then((r: any) => {
        if (r.ok) { toast.success('قفل برداشته شد — قاعدهٔ خودکار در اجرای بعدی اعمال می‌شود'); load(p.id); onSaved() }
        else toast.error(r.error || 'ذخیره نشد')
      })
      .finally(() => setSavingUnit(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <I.scan size={18} /> شناسنامهٔ کالا — {p?.name ?? (loading ? '…' : '')}
          </DialogTitle>
          <DialogDescription>اطلاعات، گردش سفارش و روند موجودی همین کالا — همهٔ اعداد فارسی و تاریخ‌ها جلالی</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-10 text-center text-sm text-stone-500"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال دریافت شناسنامه…</p>
        ) : !p ? (
          <p className="py-10 text-center text-sm text-stone-400">کالا یافت نشد</p>
        ) : (
          <div className="max-h-[68vh] space-y-4 overflow-y-auto pl-1">
            {/* ── سربرگ اطلاعات ── */}
            <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-black text-stone-800">{p.name}</span>
                {lowStock && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                    <I.alertTriangle size={10} /> زیر حد سفارش مجدد ({fa(p.stock)} از {fa(threshold)})
                  </span>
                )}
                {p.active === false && <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">غیرفعال</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                <span>کد: <b dir="ltr" className="text-stone-700">{p.code ? fa(p.code) : '—'}</b></span>
                <span className="inline-flex items-center gap-1"><I.barChart size={11} /> فروش ماهانه (آخرین آمار): <b className="text-stone-700">{fa(p.monthlySold ?? 0)} {unit}</b></span>
                <span>پیش‌فرض سفارش: <b className="text-stone-700">{fa(p.defaultOrderQty ?? 6)} {unit}</b>{p.unitsPerCarton ? ` · کارتن ${fa(p.unitsPerCarton)}تایی` : ''}</span>
              </div>
              {Array.isArray(p.barcodes) && p.barcodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-stone-400">بانک بارکد:</span>
                  {p.barcodes.slice(0, 6).map((b: any, i: number) => (
                    <span key={i} dir="ltr" className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px]', b.isPrimary ? 'border-emerald-300 bg-emerald-50 font-bold text-emerald-800' : 'border-stone-200 bg-white text-stone-500')}>
                      {fa(b.code)}
                    </span>
                  ))}
                  {p.barcodes.length > 6 && <span className="text-[10px] text-stone-400">+{fa(p.barcodes.length - 6)}</span>}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1">
                {[p.mainGroup, p.subGroup, p.category].filter((x) => x && String(x).trim()).map((g, i, arr) => {
                  const uniq = arr.indexOf(g) === i
                  return uniq ? <span key={String(g)} className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] text-stone-600">{g}</span> : null
                })}
                <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] text-stone-600">واحد: {unit}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'قیمت فروش', value: `${money(p.sellPrice)} ریال`, cls: 'text-stone-800' },
                  { label: 'آخرین قیمت خرید', value: `${money(p.lastBuyPrice)} ریال`, cls: 'text-stone-800' },
                  { label: 'موجودی', value: `${fa(p.stock)} ${unit}`, cls: lowStock ? 'text-rose-700' : 'text-emerald-700' },
                  { label: 'حد سفارش مجدد', value: p.reorderLevel != null ? `${fa(p.reorderLevel)} ${unit}` : '—', cls: 'text-stone-700' },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg border border-stone-200 bg-white p-2">
                    <div className="text-[10px] text-stone-400">{c.label}</div>
                    <div dir="rtl" className={cn('text-xs font-bold', c.cls)}>{c.value}</div>
                  </div>
                ))}
              </div>
              <UnitControl unit={unit} manualUnit={!!p.manualUnit} canManage={canManage} saving={savingUnit} onSave={saveUnit} onUnlock={unlockUnit} />
            </div>

            {/* ── نمودار ۱: گردش سفارش (خرید) ── */}
            <section className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-black text-emerald-800"><I.trendingUp size={14} /> گردش سفارش (خرید)</p>
                {s && (
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                    {fa(s.buyCount)} سفارش · جمع {fa(s.totalOrdered)} {unit}
                  </span>
                )}
              </div>
              {flowPoints.length >= 2 ? (
                <>
                  <FlowChart points={flowPoints} unit={unit} />
                  <p className="mt-1.5 text-center text-[10px] text-stone-400">انگشت یا موس را روی نمودار بکشید — تاریخ شمسی و تعداد همان روز نمایش داده می‌شود</p>
                </>
              ) : flowPoints.length === 1 ? (
                <div className="rounded-xl border border-emerald-200 bg-white/70 p-3 text-center">
                  <p className="text-xs font-bold text-emerald-800">فقط یک ثبت سفارش</p>
                  <p dir="rtl" className="mt-1 text-[11px] text-stone-600">{flowPoints[0].label} — {fa(flowPoints[0].value)} {unit}</p>
                  <p className="mt-1 text-[10px] text-stone-400">با ثبت سفارش دوم، نمودار خطی ساخته می‌شود</p>
                </div>
              ) : (
                <ChartEmpty emoji="🚚" title="سفارش ثبت‌شده‌ای برای این کالا نیست" hint="به‌محض ثبت سفارش خرید، نمودار گردش همین‌جا ساخته می‌شود" />
              )}
            </section>

            {/* ── نمودار ۲: روند موجودی/شمارش + آمار صادقانه ── */}
            <section className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-black text-amber-900"><I.layers size={14} /> روند موجودی و شمارش</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-stone-700">
                    فروش ماهانه (آخرین آمار): {fa(s?.monthlySold ?? p.monthlySold ?? 0)} {unit}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-stone-700">
                    سفارش‌های ثبت‌شده: {fa(s?.buyCount ?? 0)} (جمع {fa(s?.totalOrdered ?? 0)})
                  </span>
                </div>
              </div>
              {countRows.length > 0 ? (
                <>
                  <CountsBars rows={countRows} />
                  <p className="mt-1.5 text-center text-[10px] text-stone-400">ستون‌ها بر پایهٔ تاریخ انبارگردانی‌اند — روی هر جفت ستون هاور کنید</p>
                </>
              ) : (
                <ChartEmpty emoji="🫙" title="انبارگردانی ثبت‌شده‌ای برای این کالا نیست" hint="در صفحهٔ «انبارگردانی و شمارش» اگر شمارش ثبت شود، روند موجودی همین‌جا ساخته می‌شود" />
              )}
              <p className="mt-2 rounded-lg bg-white/70 p-2 text-[10px] leading-4 text-stone-500">
                «فروش ماهانه» آخرین آمار ثابت است (نیست سری زمانی)؛ به همین دلیل به‌صورت جدا و با برچسب صادقانه کنار نمودار آمده و داخل ستون‌ها جعل نمی‌شود.
              </p>
            </section>

            {/* ── حقایق سریع ── */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'آخرین قیمت خرید', value: `${money(s?.lastBuyPrice ?? p.lastBuyPrice)} ریال`, icon: I.banknote },
                { label: 'حاشیه کنترل‌ها (سودسنج)', value: `${fa(circ?.margins?.length || p.printedPriceCount || 0)} کنترل`, icon: I.shieldCheck },
                { label: 'آخرین انبارگردانی', value: (countRows.length ? countRows[countRows.length - 1].label : jstrSlash(p.lastCountDate)) || '—', icon: I.history },
                { label: 'زمان تأمین', value: `${fa(p.leadTimeDays ?? 1)} روز`, icon: I.timer },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-stone-200 bg-white p-2.5">
                  <div className="flex items-center gap-1 text-[10px] text-stone-400"><c.icon size={11} /> {c.label}</div>
                  <div dir="rtl" className="mt-0.5 text-xs font-bold text-stone-800">{c.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>بستن</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════ نمای اصلی ═══════════════ */
export default function ProductsView() {
  const { user } = useShell()
  const [meta, setMeta] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [qEff, setQEff] = useState('')
  const [mainGroup, setMainGroup] = useState('')
  const [subGroup, setSubGroup] = useState('')
  const [unit, setUnit] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [passport, setPassport] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => { api('/api/products?meta=1').then((r: any) => { if (r.ok) setMeta(r.data) }) }, [])

  /* جست‌وجو با تأخیر ۳۵۰ms */
  useEffect(() => {
    const t = setTimeout(() => { setQEff(q.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const my = ++seq.current
    setLoading(true)
    api('/api/products' + qs({ q: qEff || undefined, mainGroup: mainGroup || undefined, subGroup: subGroup || undefined, unit: unit || undefined, status: status || undefined, page, pageSize: PAGE_SIZE }))
      .then((r: any) => {
        if (my !== seq.current) return
        if (r.ok) { setRows(r.data.items ?? []); setTotal(r.data.total ?? 0); setPages(r.data.pages ?? 1) }
        else toast.error(r.error || 'دریافت فهرست کالاها ناموفق بود')
      })
      .finally(() => { if (my === seq.current) setLoading(false) })
  }, [qEff, mainGroup, subGroup, unit, status, page])

  const groupOptions = useMemo(() => {
    const mgs = (meta?.mainGroups ?? []) as any[]
    const sgs = (meta?.subGroups ?? []) as any[]
    return { mgs, sgs }
  }, [meta])

  const refresh = () => { setPage((x) => x); seq.current++; const my = seq.current; api('/api/products' + qs({ q: qEff || undefined, mainGroup: mainGroup || undefined, subGroup: subGroup || undefined, unit: unit || undefined, status: status || undefined, page, pageSize: PAGE_SIZE })).then((r: any) => { if (my === seq.current && r.ok) { setRows(r.data.items ?? []); setTotal(r.data.total ?? 0) } }) }
  const filtersOn = !!(qEff || mainGroup || subGroup || unit || status)

  return (
    <div className="space-y-4">
      {/* سربرگ + چیپ‌های شمارش */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-stone-900 text-stone-50"><I.package size={16} /></span>
            کالاها و بانک بارکد
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-600">{fa(meta?.total ?? total)} کالا</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700"><I.alertTriangle size={11} /> کم‌موجود: {fa(meta?.lowStock ?? 0)}</span>
            {filtersOn && <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">نتیجهٔ فیلتر: {fa(total)}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* جست‌وجو + فیلترها */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <I.search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="جست‌وجو: نام / کد / بارکد…" className="pr-9 pl-3" aria-label="جستجوی کالا" />
            </div>
            <Select value={mainGroup || 'all'} onValueChange={(v: string) => { setMainGroup(v === 'all' ? '' : v); setSubGroup(''); setPage(1) }}>
              <SelectTrigger className="w-44" aria-label="فیلتر گروه اصلی"><SelectValue placeholder="گروه اصلی" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ گروه‌های اصلی</SelectItem>
                {groupOptions.mgs.map((g) => <SelectItem key={g.name} value={g.name}>{g.name} ({fa(g.count)})</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={subGroup || 'all'} onValueChange={(v: string) => { setSubGroup(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-44" aria-label="فیلتر زیرگروه"><SelectValue placeholder="زیرگروه" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ زیرگروه‌ها</SelectItem>
                {groupOptions.sgs.map((g) => <SelectItem key={g.name} value={g.name}>{g.name} ({fa(g.count)})</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={unit || 'all'} onValueChange={(v: string) => { setUnit(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-32" aria-label="فیلتر واحد"><SelectValue placeholder="واحد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ واحدها</SelectItem>
                {ALLOWED_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status || 'all'} onValueChange={(v: string) => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-32" aria-label="فیلتر وضعیت"><SelectValue placeholder="وضعیت" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
                <SelectItem value="فعال">فعال</SelectItem>
                <SelectItem value="غیر فعال">غیر فعال</SelectItem>
              </SelectContent>
            </Select>
            {(filtersOn || page !== 1) && (
              <Button variant="ghost" size="sm" className="gap-1 text-stone-500" onClick={() => { setQ(''); setQEff(''); setMainGroup(''); setSubGroup(''); setUnit(''); setStatus(''); setPage(1) }}>
                <I.x size={13} /> پاک‌کردن فیلترها
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1" onClick={refresh}><I.refresh size={13} /> به‌روزرسانی</Button>
          </div>

          {/* جدول فشرده */}
          <div className="rounded-xl border border-stone-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead className="text-right">نام</TableHead>
                  <TableHead className="text-right">واحد</TableHead>
                  <TableHead className="text-right">موجودی</TableHead>
                  <TableHead className="text-right">قیمت فروش</TableHead>
                  <TableHead className="text-right">آخرین خرید</TableHead>
                  <TableHead className="text-right">حد سفارش مجدد</TableHead>
                  <TableHead className="text-right">وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-stone-400"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-stone-400">کالایی با این فیلترها یافت نشد</TableCell></TableRow>
                ) : rows.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setPassport(p.id)}>
                    <TableCell className="max-w-64">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-bold text-stone-800">{p.name}</span>
                        <span dir="ltr" className="text-[10px] text-stone-400">
                          {p.code ? fa(p.code) : 'بدون کد'}{p.barcodeCount > 1 ? ` · ${fa(p.barcodeCount)} بارکد` : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell><UnitBadge v={p.unit} /></TableCell>
                    <TableCell><StockChip stock={p.stock} level={p.reorderLevel} /></TableCell>
                    <TableCell dir="rtl" className="whitespace-nowrap text-xs font-bold text-stone-700">{money(p.sellPrice)} <span className="text-[9px] font-normal text-stone-400">ریال</span></TableCell>
                    <TableCell dir="rtl" className="whitespace-nowrap text-xs text-stone-600">{money(p.lastBuyPrice)} <span className="text-[9px] font-normal text-stone-400">ریال</span></TableCell>
                    <TableCell className="text-xs text-stone-600">{p.reorderLevel != null ? <span className="font-bold">{fa(p.reorderLevel)}</span> : <span className="text-stone-300">—</span>}</TableCell>
                    <TableCell><StatusBadge v={p.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* صفحه‌بندی */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-stone-500">صفحهٔ {fa(page)} از {fa(pages)} · {fa(total)} کالا</p>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((x) => Math.max(1, x - 1))} className="gap-1">
                <I.chevronRight size={14} /> قبلی
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((x) => Math.min(pages, x + 1))} className="gap-1">
                بعدی <I.chevronLeft size={14} />
              </Button>
            </div>
          </div>
          <p className="text-[10px] leading-4 text-stone-400">
            روی هر ردیف کلیک کنید تا «شناسنامهٔ کالا» با نمودار گردش سفارش و روند موجودی باز شود.
            {MANAGE_ROLES.includes(user?.role ?? '') ? ' تغییر واحد شمارش در شناسنامه انجام می‌شود و کالا را از قاعدهٔ خودکار مصون می‌کند.' : ''}
          </p>
        </CardContent>
      </Card>

      <PassportDialog id={passport} open={passport !== null} onOpenChange={(o) => { if (!o) setPassport(null) }} onSaved={refresh} />
    </div>
  )
}
