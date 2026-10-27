import {
  useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn,
  Button, Input, Card, CardContent, CardHeader, CardTitle, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  money, fa, toEnDigits, toFaDigits, formatJalali, MoneyInput, I,
} from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════
   supply/products — «کالاها و بانک بارکد» (R4-8)
   جدول فشردهٔ کالاها (جست‌وجو + فیلتر گروه/واحد/وضعیت) + «شناسنامهٔ کالا»:
   سربرگ اطلاعات، کنترل واحد (مدیران؛ manualUnit)، دو نمودار SVG اختصاصی
   (گردش سفارش + روند موجودی/شمارش) و شبکهٔ حقایق سریع.
   پژوهش واحد شمارش: research/product-units-research.md
   ═══════════════════════════════════════════════════════════════ */

const ALLOWED_UNITS = ['عدد', 'کیلوگرم', 'گرم', 'بسته', 'دستی'] // §۳ پژوهش («شش‌تایی» عمداً حذف شد)

/* ═══ R7: سامانهٔ مدیریت واحدها — واحدها از /api/units (قابل تعریف توسط مدیر) ═══ */
let UNITS_CACHE: string[] | null = null
function useUnitNames(): string[] {
  const [units, setUnits] = useState<string[]>(UNITS_CACHE || ALLOWED_UNITS)
  useEffect(() => {
    if (UNITS_CACHE) return
    let alive = true
    api('/api/units').then((r: any) => {
      if (r.ok && alive) {
        const names = (r.data?.units || []).filter((u: any) => u.active !== false).map((u: any) => u.name)
        if (names.length) { UNITS_CACHE = names; setUnits(names) }
      }
    }).catch(() => { /* آفلاین — با پنج واحد پایه */ })
    return () => { alive = false }
  }, [])
  return units
}
function refreshUnitsCache() { UNITS_CACHE = null }

const UNIT_KIND_FA: Record<string, string> = { count: 'عددی (صحیح)', weight: 'وزنی (اعشاری)', volume: 'حجمی (اعشاری)' }

/** دیالوگ مدیریت واحدها — ساخت/ویرایش/غیرفعال‌سازی/حذف واحد */
function UnitsManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [nf, setNf] = useState({ name: '', kind: 'count' })
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')

  async function load() {
    setLoading(true)
    const r = await api('/api/units')
    setLoading(false)
    if (r.ok) { setUnits(r.data?.units || []); UNITS_CACHE = (r.data?.units || []).filter((u: any) => u.active !== false).map((u: any) => u.name) }
  }
  useEffect(() => { if (open) void load() }, [open])

  async function create() {
    if (nf.name.trim().length < 1) return toast.error('نام واحد را وارد کنید')
    setBusy(true)
    const r = await api('/api/units', { method: 'POST', body: { name: nf.name.trim(), kind: nf.kind } })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'ثبت ناموفق بود')
    toast.success(`واحد «${nf.name.trim()}» ساخته شد`)
    setNf({ name: '', kind: 'count' })
    void load()
  }

  async function toggleActive(u: any) {
    const r = await api('/api/units', { method: 'PATCH', body: { id: u.id, active: !u.active } })
    if (!r.ok) return toast.error(r.error || 'تغییر ناموفق بود')
    void load()
  }

  async function rename(u: any) {
    if (editName.trim() === u.name) { setEditingId(''); return }
    const r = await api('/api/units', { method: 'PATCH', body: { id: u.id, name: editName.trim() } })
    if (!r.ok) return toast.error(r.error || 'تغییر ناموفق بود')
    toast.success('نام واحد به‌روزرسانی شد')
    setEditingId('')
    void load()
  }

  async function remove(u: any) {
    if (!window.confirm(`حذف واحد «${u.name}»؟ (فقط وقتی ممکن است که هیچ کالایی از آن استفاده نکند)`)) return
    const r = await api(`/api/units?id=${u.id}`, { method: 'DELETE' })
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success('واحد حذف شد')
    void load()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><I.settings size={17} /> مدیریت واحدهای شمارش</DialogTitle>
          <DialogDescription>واحد جدید بسازید یا واحدهای موجود را ویرایش کنید — واحدهای وزنی مقدار اعشاری می‌پذیرند (مثلاً ۰٫۷۲ کیلوگرم)</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* فرم ساخت */}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-teal-200 bg-teal-50/60 p-2.5">
            <div className="grow">
              <label className="mb-1 block text-[11px] font-bold text-teal-900">نام واحد جدید</label>
              <Input value={nf.name} onChange={(e: any) => setNf({ ...nf, name: e.target.value })} placeholder="مثلاً: کارتن، شاخه، لیوان…" maxLength={30} />
            </div>
            <div className="w-40">
              <label className="mb-1 block text-[11px] font-bold text-teal-900">نوع</label>
              <Select dir="rtl" value={nf.kind} onValueChange={(v: string) => setNf({ ...nf, kind: v })}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">عددی (صحیح)</SelectItem>
                  <SelectItem value="weight">وزنی (اعشاری)</SelectItem>
                  <SelectItem value="volume">حجمی (اعشاری)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void create()}>
              {busy ? <I.loader size={14} className="animate-spin" /> : <I.plus size={14} />} افزودن
            </Button>
          </div>
          {/* فهرست */}
          {loading ? (
            <p className="py-4 text-center text-sm text-stone-400"><I.loader size={16} className="mx-auto animate-spin" /></p>
          ) : (
            <div className="space-y-1.5">
              {units.map((u) => (
                <div key={u.id} className={cn('flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2', u.active ? 'border-stone-200 bg-white' : 'border-stone-200 bg-stone-100 opacity-60')}>
                  {editingId === u.id ? (
                    <>
                      <Input className="h-8 w-36" value={editName} onChange={(e: any) => setEditName(e.target.value)} maxLength={30} />
                      <Button size="sm" className="h-8 gap-1" onClick={() => void rename(u)}><I.check size={13} /> ذخیره</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId('')}>انصراف</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-bold text-stone-700">{u.name}</span>
                      <Badge variant="outline" className="text-[10px]">{UNIT_KIND_FA[u.kind] || u.kind}</Badge>
                      {!u.active && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-600">غیرفعال</Badge>}
                      <span className="mr-auto flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="ویرایش نام" onClick={() => { setEditingId(u.id); setEditName(u.name) }}><I.pencil size={13} /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={u.active ? 'غیرفعال کردن' : 'فعال کردن'} onClick={() => void toggleActive(u)}>
                          {u.active ? <I.eye size={13} /> : <I.eyeOff size={13} />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600" title="حذف" onClick={() => void remove(u)}><I.trash size={13} /></Button>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
const MANAGE_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'] // آینهٔ canMutateProducts بک‌اند
const PAGE_SIZES = [24, 48, 96] // R8: اندازهٔ صفحهٔ جدول

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
  const unitNames = useUnitNames() // R7: واحدهای سامانه (قابل تعریف)
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
          {unitNames.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
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

/* ═══════════════ R5-F: فرم ثبت/ویرایش کالا ═══════════════ */

/** ورودی عددی: نمایش فارسی، پذیرش فارسی+لاتین، ذخیرهٔ ASCII — dir=ltr (قاعدهٔ ارقام) */
function NumInput(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel?: string
  suffix?: string
  className?: string
}) {
  const { value, onChange, placeholder, ariaLabel, suffix, className } = props
  return (
    <div className="relative w-full">
      <Input
        dir="ltr"
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder={placeholder ? toFaDigits(placeholder) : undefined}
        className={cn('font-mono tabular-nums', suffix ? 'pl-10' : '', className)}
        value={value ? toFaDigits(value) : ''}
        onChange={(e: any) => onChange(toEnDigits(String(e.target.value ?? '')).replace(/[^\d]/g, ''))}
      />
      {suffix && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">{suffix}</span>
      )}
    </div>
  )
}

/** انتخاب گروه با متن آزاد: فهرست موجود + گزینهٔ «گروه جدید…» که به ورودی متنی تبدیل می‌شود */
function GroupField(props: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { label, options, value, onChange, placeholder } = props
  const isKnown = !value || options.includes(value)
  const [free, setFree] = useState(!isKnown) // مقدار خارج از فهرست = حالت متنی
  useEffect(() => { setFree(!(!value || options.includes(value))) }, [value, options])
  const NEW = '__new__'
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-stone-600">{label}</label>
      {free ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={value}
            onChange={(e: any) => onChange(e.target.value)}
            placeholder={placeholder || 'گروه جدید را بنویسید…'}
            aria-label={`${label} (متن آزاد)`}
          />
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => { setFree(false); if (!options.includes(value)) onChange('') }}>
            <I.layoutGrid size={13} /> فهرست
          </Button>
        </div>
      ) : (
        <Select value={value || 'none'} onValueChange={(v: string) => { if (v === NEW) setFree(true); else onChange(v === 'none' ? '' : v) }}>
          <SelectTrigger className="w-full" aria-label={label}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— بدون گروه —</SelectItem>
            {options.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            <SelectItem value={NEW}>
              <span className="inline-flex items-center gap-1 text-emerald-700"><I.pencil size={12} /> گروه جدید (تایپ دستی)…</span>
            </SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

/** دیالوگ ثبت/ویرایش کالا — همان فرم برای هر دو حالت (editId=null ⇒ ثبت) */
function ProductFormDialog(props: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editId: string | null
  groupOptions: { mgs: any[]; sgs: any[] }
  sections: { label: string; zone: string | null }[]
  onSaved: () => void
}) {
  const { open, onOpenChange, editId, groupOptions, sections, onSaved } = props
  const isEdit = !!editId
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const unitNames = useUnitNames() // R7: واحدهای سامانه
  /* R5-P4: فهرست تأمین‌کننده‌ها برای فیلد اختیاری «تأمین‌کنندهٔ اصلی» */
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  /* مقادیر ASCII در state؛ نمایش همیشه فارسی */
  const [f, setF] = useState({
    name: '', code: '', barcode: '',
    mainGroup: '', subGroup: '', unit: 'عدد',
    sectionLabel: '', supplierId: '',
    sellPrice: '', lastBuyPrice: '', stock: '', reorderLevel: '', defaultOrderQty: '6', unitsPerCarton: '',
    active: true,
  })
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }))

  /* باز شدن: ویرایش ⇒ دریافت و پیش‌پرکردن؛ ثبت ⇒ خالی + دریافت تأمین‌کننده‌ها */
  useEffect(() => {
    if (!open) return
    setErr('')
    api('/api/suppliers?pageSize=2400')
      .then((r: any) => { if (r.ok) setSuppliers((r.data.items ?? []).map((s: any) => ({ id: s.id, name: s.name }))) })
      .catch(() => {})
    if (!editId) {
      setF({ name: '', code: '', barcode: '', mainGroup: '', subGroup: '', unit: 'عدد', sectionLabel: '', supplierId: '', sellPrice: '', lastBuyPrice: '', stock: '', reorderLevel: '', defaultOrderQty: '6', unitsPerCarton: '', active: true })
      return
    }
    setLoading(true)
    api(`/api/products/${editId}`)
      .then((r: any) => {
        if (!r.ok) { toast.error(r.error || 'کالا دریافت نشد'); onOpenChange(false); return }
        const p = r.data
        const bank: string[] = Array.isArray(p.barcodes) ? p.barcodes.map((b: any) => String(b.code ?? '')) : []
        const code = p.code ? String(p.code) : ''
        const primaryBarcode = bank.find((b) => b && b !== code) ?? ''
        setF({
          name: p.name ?? '',
          code,
          barcode: primaryBarcode,
          mainGroup: p.mainGroup ?? '',
          subGroup: p.subGroup ?? '',
          unit: p.unit && (unitNames.includes(p.unit) || ALLOWED_UNITS.includes(p.unit)) ? p.unit : (p.unit || 'عدد'),
          sectionLabel: p.sectionLabel ?? '', // R5-P4
          supplierId: p.supplierId ?? '', // R5-P4
          sellPrice: p.sellPrice != null ? String(Math.round(Number(p.sellPrice))) : '',
          lastBuyPrice: p.lastBuyPrice != null ? String(Math.round(Number(p.lastBuyPrice))) : '',
          stock: p.stock != null ? String(Math.round(Number(p.stock))) : '',
          reorderLevel: p.reorderLevel != null ? String(Math.round(Number(p.reorderLevel))) : '',
          defaultOrderQty: p.defaultOrderQty != null ? String(Math.round(Number(p.defaultOrderQty))) : '6',
          unitsPerCarton: p.unitsPerCarton != null && Number(p.unitsPerCarton) > 0 ? String(Math.round(Number(p.unitsPerCarton))) : '',
          active: p.active !== false,
        })
      })
      .finally(() => setLoading(false))
  }, [open, editId])

  const nameBad = !f.name.trim()
  const barcodeBad = !!f.barcode && !/^\d{4,20}$/.test(f.barcode)

  const payload = () => ({
    name: f.name.trim(),
    code: f.code || null,
    barcode: f.barcode || null,
    unit: f.unit,
    mainGroup: f.mainGroup.trim() || null,
    subGroup: f.subGroup.trim() || null,
    sectionLabel: f.sectionLabel || null, // R5-P4: بخش فروشگاه (اختیاری)
    supplierId: f.supplierId || null, // R5-P4: تأمین‌کنندهٔ اصلی (اختیاری)
    sellPrice: f.sellPrice === '' ? 0 : Number(f.sellPrice),
    lastBuyPrice: f.lastBuyPrice === '' ? 0 : Number(f.lastBuyPrice),
    stock: f.stock === '' ? 0 : Math.round(Number(f.stock)),
    reorderLevel: f.reorderLevel === '' ? null : Math.round(Number(f.reorderLevel)),
    defaultOrderQty: f.defaultOrderQty === '' ? 6 : Math.round(Number(f.defaultOrderQty)),
    /* R9: تعداد در هر کارتن — پیش‌فرض کارتن این کالا در سفارش‌گذاری (۰/خالی = نامشخص؛ دیالوگ اندازهٔ کارتن می‌پرسد) */
    unitsPerCarton: f.unitsPerCarton === '' ? 0 : Math.max(0, Math.round(Number(f.unitsPerCarton) || 0)),
    active: f.active,
    status: f.active ? 'فعال' : 'غیر فعال',
  })

  function showWarnings(ws: any) {
    if (Array.isArray(ws) && ws.length) {
      for (const w of ws) toast.warning(String(w))
    }
  }

  function save() {
    if (nameBad) { setErr('نام کالا الزامی است'); return }
    if (barcodeBad) { setErr('بارکد باید فقط رقم باشد (۴ تا ۲۰ رقم)'); return }
    setErr('')
    setSaving(true)
    const body = payload()
    const req = isEdit
      ? api(`/api/products/${editId}`, { method: 'PATCH', body })
      : api('/api/products', { method: 'POST', body })
    req.then((r: any) => {
      if (!r.ok) { toast.error(r.error || 'ذخیره انجام نشد'); setErr(String(r.error || 'ذخیره انجام نشد')); return }
      showWarnings(r.data?.warnings)
      toast.success(isEdit ? `«${body.name}» به‌روزرسانی شد` : `کالای «${body.name}» ثبت شد`)
      onOpenChange(false)
      onSaved()
    }).finally(() => setSaving(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {isEdit ? <><I.pencil size={18} /> ویرایش کالا</> : <><I.packagePlus size={18} /> کالای جدید</>}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'مشخصات کالا را اصلاح کنید — کد و بارکد تکراری قبول نمی‌شود' : 'نام الزامی است؛ بقیهٔ فیلدها اختیاری — اعداد را فارسی یا انگلیسی تایپ کنید'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-10 text-center text-sm text-stone-500"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال دریافت کالا…</p>
        ) : (
          <div className="max-h-[68vh] space-y-4 overflow-y-auto pl-1">
            {/* نام + واحد + وضعیت */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">نام کالا <span className="text-rose-600">*</span></label>
                <Input value={f.name} onChange={(e: any) => set('name', e.target.value)} placeholder="مثلاً: شیرین‌بیژن وافل کاکائویی" aria-label="نام کالا" className={cn(nameBad && open && 'border-rose-300')} autoFocus={!isEdit} />
                {nameBad && open && <p className="text-[11px] text-rose-600">نام کالا الزامی است</p>}
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">واحد شمارش</label>
                <Select value={f.unit} onValueChange={(v: string) => set('unit', v)}>
                  <SelectTrigger className="w-full" aria-label="واحد شمارش"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {unitNames.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-stone-400">واحدها را مدیران در «مدیریت واحدها» تعریف می‌کنند</p>
              </div>
            </div>

            {/* کد + بارکد */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">کد کالا (کد هولو / بارکد اصلی)</label>
                <NumInput value={f.code} onChange={(v: string) => set('code', v)} placeholder="مثلاً 12345" ariaLabel="کد کالا" />
                <p className="text-[10px] text-stone-400">اختیاری — اگر خالی بماند، بارکد اصلی همان بارکد پایین است</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">بارکد (اسکن صندوق)</label>
                <NumInput value={f.barcode} onChange={(v: string) => set('barcode', v)} placeholder="مثلاً 6261234567890" ariaLabel="بارکد" className={cn(barcodeBad && 'border-rose-300')} />
                {barcodeBad
                  ? <p className="text-[11px] text-rose-600">بارکد فقط باید رقم باشد (۴ تا ۲۰ رقم)</p>
                  : <p className="text-[10px] text-stone-400">اختیاری — فقط رقم؛ تکراری قبول نمی‌شود</p>}
              </div>
            </div>

            {/* گروه‌ها */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <GroupField label="گروه اصلی" options={groupOptions.mgs.map((g: any) => g.name)} value={f.mainGroup} onChange={(v: string) => set('mainGroup', v)} placeholder="گروه اصلی جدید…" />
              <GroupField label="گروه فرعی" options={groupOptions.sgs.map((g: any) => g.name)} value={f.subGroup} onChange={(v: string) => set('subGroup', v)} placeholder="گروه فرعی جدید…" />
            </div>

            {/* R5-P4: بخش فروشگاه + تأمین‌کنندهٔ اصلی */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">بخش فروشگاه (قفسه)</label>
                <Select value={f.sectionLabel || 'none'} onValueChange={(v: string) => set('sectionLabel', v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-full" aria-label="بخش فروشگاه"><SelectValue placeholder="انتخاب بخش…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون بخش مشخص —</SelectItem>
                    {sections.map((s) => (
                      <SelectItem key={s.label} value={s.label}>{s.label}{s.zone ? ` (${s.zone})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-stone-400">اختیاری — بخش‌های کالادار نقشهٔ فروشگاه؛ برای کنترل تاریخ و چیدمان استفاده می‌شود</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">تأمین‌کنندهٔ اصلی (اختیاری)</label>
                <Select value={f.supplierId || 'none'} onValueChange={(v: string) => set('supplierId', v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-full" aria-label="تأمین‌کنندهٔ اصلی"><SelectValue placeholder="انتخاب تأمین‌کننده…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون تأمین‌کنندهٔ مشخص —</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-stone-400">در سفارش‌گذاری، قیمت این تأمین‌کننده برای مقایسه نشان داده می‌شود</p>
              </div>
            </div>

            {/* قیمت‌ها — R7: جداکنندهٔ هزارگان خودکار */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">قیمت فروش (ریال)</label>
                <MoneyInput value={f.sellPrice} onChange={(v: string) => set('sellPrice', v)} placeholder="۲۵٬۰۰۰" suffix="ریال" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">قیمت آخرین خرید (ریال)</label>
                <MoneyInput value={f.lastBuyPrice} onChange={(v: string) => set('lastBuyPrice', v)} placeholder="۲۰٬۰۰۰" suffix="ریال" />
              </div>
            </div>

            {/* موجودی/حد سفارش/پیش‌فرض سفارش */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">موجودی</label>
                <NumInput value={f.stock} onChange={(v: string) => set('stock', v)} placeholder="0" ariaLabel="موجودی" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">حد سفارش مجدد</label>
                <NumInput value={f.reorderLevel} onChange={(v: string) => set('reorderLevel', v)} placeholder="—" ariaLabel="حد سفارش مجدد" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">پیش‌فرض سفارش</label>
                <NumInput value={f.defaultOrderQty} onChange={(v: string) => set('defaultOrderQty', v)} placeholder="6" ariaLabel="تعداد پیش‌فرض سفارش" />
                <p className="text-[10px] text-stone-400">تعداد «عدد» هنگام سفارش‌گذاری</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">تعداد در هر کارتن</label>
                <NumInput value={f.unitsPerCarton} onChange={(v: string) => set('unitsPerCarton', v)} placeholder="۱۲" ariaLabel="تعداد در هر کارتن" />
                <p className="text-[10px] text-stone-400">اندازهٔ کارتن این کالا — خالی = نامشخص (هنگام سفارش پرسیده می‌شود و پس از اولین پاسخ ذخیره می‌شود)</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-600">وضعیت</label>
                {/* R10: رادیو-پییل استاندارد — هم‌سان با بقیهٔ سامانه */}
                <div className="flex items-stretch gap-1.5 rounded-xl border border-stone-200 bg-stone-100/60 p-1.5">
                  {([true, false] as const).map((a) => {
                    const on = f.active === a
                    return (
                      <button key={String(a)} type="button" onClick={() => set('active', a)} role="radio" aria-checked={on}
                        className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all touch-target',
                          on ? 'bg-white shadow-sm ring-1 ' + (a ? 'text-emerald-800 ring-primary/40' : 'text-rose-700 border-rose-300') : 'text-stone-500 hover:bg-white/60 hover:text-stone-700')}>
                        <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          on ? (a ? 'border-emerald-600' : 'border-rose-500') : 'border-stone-300')}>
                          {on && <span className={cn('h-1.5 w-1.5 rounded-full', a ? 'bg-emerald-600' : 'bg-rose-500')} />}
                        </span>
                        {a ? 'فعال' : 'غیرفعال'}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-stone-400">کالای غیرفعال در سفارش‌گذاری پیشنهاد نمی‌شود</p>
              </div>
            </div>

            {err && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-bold text-rose-700">{err}</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>بستن</Button>
          <Button onClick={save} disabled={saving || nameBad || barcodeBad || loading} className="gap-1.5">
            {saving ? <I.loader size={14} className="animate-spin" /> : isEdit ? <I.save size={14} /> : <I.packagePlus size={14} />}
            {isEdit ? 'ذخیرهٔ تغییرات' : 'ثبت کالا'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════ «شناسنامهٔ کالا» ═══════════════ */
function PassportDialog({ id, open, onOpenChange, onSaved, onEdit }: { id: string | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void; onEdit: (id: string) => void }) {
  const { user } = useShell()
  const canManage = MANAGE_ROLES.includes(user?.role ?? '')
  const [loading, setLoading] = useState(false)
  const [savingUnit, setSavingUnit] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [circ, setCirc] = useState<any>(null)
  const [trades, setTrades] = useState<any>(null) // R7: سابقهٔ خرید/فروش واقعی هلو

  const load = (pid: string) => {
    setLoading(true); setDetail(null); setCirc(null); setTrades(null)
    Promise.all([api(`/api/products/${pid}`), api(`/api/products/${pid}/circulation`), api(`/api/trades?productId=${pid}`)])
      .then(([d, c, t]: any[]) => {
        if (d.ok) setDetail(d.data); else toast.error(d.error || 'کالا دریافت نشد')
        if (c.ok) setCirc(c.data); else setCirc(null)
        if (t.ok) setTrades(t.data); else setTrades(null)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (open && id) load(id) }, [open, id])

  /* R7: سری ماهانهٔ خرید/فروش هلو — تیر تا مهر ۱۴۰۵ */
  const MONTH_FA: Record<string, string> = {
    '1405-04': 'تیر', '1405-05': 'مرداد', '1405-06': 'شهریور', '1405-07': 'مهر',
    '1405-08': 'آبان', '1405-09': 'آذر', '1405-10': 'دی', '1405-11': 'بهمن', '1405-12': 'اسفند',
    '1405-01': 'فروردین', '1405-02': 'اردیبهشت', '1405-03': 'خرداد',
  }
  const tradeBuyPoints: FlowPoint[] = useMemo(() =>
    ((trades?.series || []) as any[]).map((r) => ({ label: MONTH_FA[r.month] || r.month, value: Math.round(Number(r.buyQty || 0) * 100) / 100, extra: `میانگین فی خرید: ${money(r.buyAvgPrice || 0)} ریال` })),
    [trades])
  const tradeSellPoints: FlowPoint[] = useMemo(() =>
    ((trades?.series || []) as any[]).map((r) => ({ label: MONTH_FA[r.month] || r.month, value: Math.round(Number(r.sellQty || 0) * 100) / 100, extra: `گردش فروش: ${money(r.sellRevenue || 0)} ریال` })),
    [trades])

  /* ── R13: روند قیمت — فی خرید/فروش واقعی هر ماه + نشانگرهای تورم ── */
  const priceBuyPoints: FlowPoint[] = useMemo(() =>
    ((trades?.series || []) as any[]).filter((r) => Number(r.buyAvgPrice || 0) > 0)
      .map((r) => ({ label: MONTH_FA[r.month] || r.month, value: Math.round(Number(r.buyAvgPrice || 0)), extra: `میانگین فی خرید ${MONTH_FA[r.month] || r.month}: ${money(r.buyAvgPrice)} ریال` })),
    [trades])
  const priceSellPoints: FlowPoint[] = useMemo(() =>
    ((trades?.series || []) as any[]).filter((r) => Number(r.sellAvgPrice || 0) > 0)
      .map((r) => ({ label: MONTH_FA[r.month] || r.month, value: Math.round(Number(r.sellAvgPrice || 0)), extra: `میانگین فی فروش ${MONTH_FA[r.month] || r.month}: ${money(r.sellAvgPrice)} ریال` })),
    [trades])
  const priceTrend = useMemo(() => {
    const pct = (pts: FlowPoint[]) => {
      if (pts.length < 2) return null
      const first = pts[0].value
      const last = pts[pts.length - 1].value
      const prev = pts[pts.length - 2].value
      if (!first || !last) return null
      return {
        total: Math.round(((last - first) / first) * 1000) / 10,
        last: Math.round(((last - prev) / prev) * 1000) / 10,
        first,
        lastPrice: last,
      }
    }
    return { buy: pct(priceBuyPoints), sell: pct(priceSellPoints) }
  }, [priceBuyPoints, priceSellPoints])

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
            {canManage && p && (
              <Button size="sm" variant="outline" className="h-7 gap-1 border-teal-200 text-teal-800 hover:bg-teal-50" onClick={() => onEdit(p.id)}>
                <I.pencil size={12} /> ویرایش کالا
              </Button>
            )}
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
                <span>کد: <b dir="ltr" className="text-stone-700">{p.code ? toFaDigits(p.code) : '—'}</b></span>
                {p.sectionLabel && <span>بخش: <b className="text-stone-700">{p.sectionLabel}</b></span>}
                {p.supplierName && <span>تأمین‌کنندهٔ اصلی: <b className="text-stone-700">{p.supplierName}</b></span>}
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

            {/* ── R7: سابقهٔ واقعی خرید/فروش از دادهٔ هلو (تیر تا مهر ۱۴۰۵) ── */}
            <section className="rounded-xl border border-teal-200/70 bg-teal-50/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-black text-teal-900"><I.history size={14} /> سابقهٔ واقعی خرید و فروش (هلو — ۱۴۰۵)</p>
                {trades?.series?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-teal-800">
                      جمع خرید: {fa(Math.round(trades.series.reduce((a: number, r: any) => a + Number(r.buyQty || 0), 0) * 100) / 100)} {unit}
                    </span>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-teal-800">
                      جمع فروش: {fa(Math.round(trades.series.reduce((a: number, r: any) => a + Number(r.sellQty || 0), 0) * 100) / 100)} {unit}
                    </span>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                      گردش فروش: {money(trades.series.reduce((a: number, r: any) => a + Number(r.sellRevenue || 0), 0))} ریال
                    </span>
                  </div>
                )}
              </div>
              {trades?.series?.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10px] font-bold text-stone-500">مقدار خرید (هر ماه)</p>
                    <FlowChart points={tradeBuyPoints} unit={unit} height={130} color="#0d9488" />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold text-stone-500">مقدار فروش (هر ماه)</p>
                    <FlowChart points={tradeSellPoints} unit={unit} height={130} color="#0e7a4a" />
                  </div>
                </div>
              ) : (
                <ChartEmpty emoji="📊" title="سابقهٔ هلو برای این کالا ثبت نشده" hint="دادهٔ خرید/فروش تیر تا مهر ۱۴۰۵ از هلو درون‌ریزی شده — اگر این کالا در آن دوره معامله نشده باشد نموداری نیست" />
              )}
            </section>

            {/* ── R13: روند قیمت (تورم) — فی خرید/فروش واقعی + نشانگرها ── */}
            <section className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-black text-rose-900"><I.trendingUp size={14} /> روند قیمت — چقدر گران شده؟ (دادهٔ واقعی هلو)</p>
                {priceTrend.buy || priceTrend.sell ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {priceTrend.buy ? (
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-rose-800">
                        فی خرید از {money(priceTrend.buy.first)} به {money(priceTrend.buy.lastPrice)} ({fa(priceTrend.buy.total > 0 ? '+' : '')}{fa(priceTrend.buy.total)}٪)
                      </span>
                    ) : null}
                    {priceTrend.sell ? (
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                        فی فروش از {money(priceTrend.sell.first)} به {money(priceTrend.sell.lastPrice)} ({fa(priceTrend.sell.total > 0 ? '+' : '')}{fa(priceTrend.sell.total)}٪)
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {priceBuyPoints.length >= 1 || priceSellPoints.length >= 1 ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[10px] font-bold text-stone-500">فی خرید هر ماه (ریال)</p>
                      <FlowChart points={priceBuyPoints} unit="ریال" height={130} color="#be123c" />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-bold text-stone-500">فی فروش هر ماه (ریال)</p>
                      <FlowChart points={priceSellPoints} unit="ریال" height={130} color="#0e7a4a" />
                    </div>
                  </div>
                  {/* نشانگرهای تورم ماه‌به‌ماه */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(trades?.series || []).slice(-3).map((r: any, i: number, arr: any[]) => {
                      const prev = i > 0 ? arr[i - 1] : null
                      const bPrev = prev?.buyAvgPrice || 0
                      const bCur = r.buyAvgPrice || 0
                      const chg = bPrev > 0 && bCur > 0 ? Math.round(((bCur - bPrev) / bPrev) * 1000) / 10 : null
                      return (
                        <span key={r.month} className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-bold text-stone-700">
                          {MONTH_FA[r.month] || r.month}
                          {chg === null ? '' : chg >= 0
                            ? <span className="text-rose-600"> ↗ {fa(chg)}٪</span>
                            : <span className="text-emerald-600"> ↘ {fa(Math.abs(chg))}٪</span>}
                        </span>
                      )
                    })}
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-800">قیمت چاپی امروز: {money(p?.sellPrice2 ?? 0)} ریال</span>
                    <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold text-sky-800">قیمت فروش (نهایی): {money(p?.sellPrice ?? 0)} ریال</span>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-stone-400">میانگین فیِ فاکتورهای واقعی هر ماه — تیر تا آبان ۱۴۰۵</p>
                </>
              ) : (
                <ChartEmpty emoji="💹" title="قیمت ثبت‌شده‌ای برای این کالا نیست" hint="اگر این کالا در فایل‌های خرید/فروش هلو معامله شده باشد، روند قیمت همین‌جا ساخته می‌شود" />
              )}
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
  const canManage = MANAGE_ROLES.includes(user?.role ?? '')
  const unitNames = useUnitNames() // R7: واحدهای سامانه
  const [unitsOpen, setUnitsOpen] = useState(false) // R7: دیالوگ مدیریت واحدها
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
  const [pageSize, setPageSize] = useState(24) // R8: ۲۴/۴۸/۹۶ کالا در هر صفحه
  const [lowStock, setLowStock] = useState(false) // R8: فیلتر «کم‌موجود» (کالاهای فعالِ زیر حد سفارش مجدد)
  const [pageInput, setPageInput] = useState('1') // R8: ورودی شمارهٔ صفحه (ارقام فارسی مجاز)
  const [pageBad, setPageBad] = useState(false) // R8: ورودی نامعتبر ⇒ قرمزی + لرزش + بازگشت
  const pageInputRef = useRef<HTMLInputElement | null>(null)
  const [passport, setPassport] = useState<string | null>(null)
  /* R5-F: فرم ثبت/ویرایش کالا — formId=null ⇒ ثبت، رشته ⇒ ویرایش همان کالا */
  const [formOpen, setFormOpen] = useState(false)
  const [formId, setFormId] = useState<string | null>(null)
  const seqRef = useRef(0)

  useEffect(() => { api('/api/products?meta=1').then((r: any) => { if (r.ok) setMeta(r.data) }) }, [])

  /* جست‌وجو با تأخیر ۳۵۰ms */
  useEffect(() => {
    const t = setTimeout(() => { setQEff(q.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [q])

  /* اعمال پاسخ فهرست — اگر داده کم شده و صفحهٔ فعلی از بازه خارج شد، به آخرین صفحهٔ معتبر برمی‌گردد */
  function applyList(r: any, targetPage: number) {
    if (!r.ok) { toast.error(r.error || 'دریافت فهرست کالاها ناموفق بود'); return }
    setRows(r.data.items ?? [])
    setTotal(r.data.total ?? 0)
    const real = Math.max(1, Number(r.data.pages ?? 1) || 1)
    setPages(real)
    if (targetPage > real) setPage(real)
  }

  useEffect(() => {
    const my = ++seqRef.current
    setLoading(true)
    api('/api/products' + qs({
      q: qEff || undefined, mainGroup: mainGroup || undefined, subGroup: subGroup || undefined,
      unit: unit || undefined, status: status || undefined,
      lowStock: lowStock ? 1 : undefined, page, pageSize, // R8: فیلتر کم‌موجود + اندازهٔ صفحه
    }))
      .then((r: any) => {
        if (my !== seqRef.current) return
        applyList(r, page)
      })
      .finally(() => { if (my === seqRef.current) setLoading(false) })
  }, [qEff, mainGroup, subGroup, unit, status, lowStock, page, pageSize])

  /* ورودی شمارهٔ صفحه با صفحهٔ فعال هم‌گام بماند (پس از پرش با دکمه‌ها) */
  useEffect(() => { setPageInput(String(page)) }, [page])

  const groupOptions = useMemo(() => {
    const mgs = (meta?.mainGroups ?? []) as any[]
    const sgs = (meta?.subGroups ?? []) as any[]
    return { mgs, sgs }
  }, [meta])

  /* R5-P4: بخش‌های کالادار نقشه (برای فرم ثبت/ویرایش) */
  const sections = useMemo(() => (meta?.sections ?? []) as { label: string; zone: string | null }[], [meta])

  /* R5-P4: فعال/غیرفعال‌سازی سریع هر ردیف (soft) */
  const [toggling, setToggling] = useState<string | null>(null)
  function toggleActive(p: any) {
    const next = p.active === false
    const msg = next ? `کالای «${p.name}» فعال شود؟` : `کالای «${p.name}» غیرفعال شود؟\n(کالای غیرفعال در سفارش‌گذاری پیشنهاد نمی‌شود اما ردیفش حفظ می‌شود)`
    if (!window.confirm(msg)) return
    setToggling(p.id)
    api(`/api/products/${p.id}`, { method: 'PATCH', body: { active: next } })
      .then((r: any) => {
        if (r.ok) { toast.success(next ? `«${p.name}» فعال شد` : `«${p.name}» غیرفعال شد`); refreshAll() }
        else toast.error(r.error || 'تغییر وضعیت انجام نشد')
      })
      .finally(() => setToggling(null))
  }

  const refresh = () => {
    const my = ++seqRef.current
    api('/api/products' + qs({
      q: qEff || undefined, mainGroup: mainGroup || undefined, subGroup: subGroup || undefined,
      unit: unit || undefined, status: status || undefined,
      lowStock: lowStock ? 1 : undefined, page, pageSize,
    })).then((r: any) => { if (my === seqRef.current) applyList(r, page) })
  }
  /* R5-F: پس از ثبت/ویرایش، متا (شمارش‌ها + فهرست گروه‌ها) هم تازه شود */
  const refreshAll = () => {
    refresh()
    api('/api/products?meta=1').then((r: any) => { if (r.ok) setMeta(r.data) })
  }
  const filtersOn = !!(qEff || mainGroup || subGroup || unit || status || lowStock)

  /* R8: پرش با ورودی شمارهٔ صفحه — ارقام فارسی مجاز (toEnDigits)؛ نامعتبر/خارج از بازه ⇒ لرزش + قرمزی + بازگشت */
  function applyPageInput() {
    const n = parseInt(toEnDigits(pageInput).replace(/[^\d]/g, ''), 10)
    if (Number.isFinite(n) && n >= 1 && n <= pages) {
      setPageBad(false)
      setPageInput(String(n))
      if (n !== page) setPage(n)
      return
    }
    if (pageInput === '') { setPageInput(String(page)); return } // خالی = بی‌تغییر
    setPageBad(true)
    try {
      pageInputRef.current?.animate(
        [
          { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
          { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' },
        ],
        { duration: 320, easing: 'ease-in-out' },
      )
    } catch { /* Web Animations در دسترس نیست */ }
    setTimeout(() => { setPageBad(false); setPageInput(String(page)) }, 650)
  }

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
                {unitNames.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
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
            {/* R8: فیلتر «کم‌موجود» — کالاهای فعالِ زیر حد سفارش مجدد (آستانهٔ اختصاصی ← حد هلو ← ۵) */}
            <button
              type="button"
              aria-pressed={lowStock}
              onClick={() => { setLowStock((v) => !v); setPage(1) }}
              title="فقط کالاهای فعال که موجودی‌شان به حد سفارش مجدد رسیده یا کمتر است — با جست‌وجو و بقیهٔ فیلترها ترکیب می‌شود"
              className={cn('inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors',
                lowStock ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50')}>
              <I.alertTriangle size={14} className={lowStock ? 'text-rose-500' : 'text-stone-400'} />
              کم‌موجود
              {lowStock && (
                <span className="rounded-full bg-rose-600 px-1.5 py-px text-[10px] font-black leading-4 text-white">{fa(total)}</span>
              )}
            </button>
            {(filtersOn || page !== 1) && (
              <Button variant="ghost" size="sm" className="gap-1 text-stone-500" onClick={() => { setQ(''); setQEff(''); setMainGroup(''); setSubGroup(''); setUnit(''); setStatus(''); setLowStock(false); setPage(1) }}>
                <I.x size={13} /> پاک‌کردن فیلترها
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1" onClick={refreshAll}><I.refresh size={13} /> به‌روزرسانی</Button>
            {canManage && (
              <Button variant="outline" size="sm" className="gap-1" title="تعریف و مدیریت واحدهای شمارش" onClick={() => { refreshUnitsCache(); setUnitsOpen(true) }}>
                <I.settings size={14} /> واحدها
              </Button>
            )}
            {canManage && (
              <Button size="sm" className="gap-1 bg-emerald-700 hover:bg-emerald-800" onClick={() => { setFormId(null); setFormOpen(true) }}>
                <I.packagePlus size={14} /> کالای جدید
              </Button>
            )}
          </div>

          {/* جدول فشرده */}
          <div className="relative rounded-xl border border-stone-200">
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
                  {canManage && <TableHead className="text-center">عملیات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow><TableCell colSpan={canManage ? 8 : 7} className="py-10 text-center text-sm text-stone-400"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={canManage ? 8 : 7} className="py-10 text-center text-sm text-stone-400">کالایی با این فیلترها یافت نشد</TableCell></TableRow>
                ) : rows.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setPassport(p.id)}>
                    <TableCell className="max-w-64">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-bold text-stone-800">{p.name}</span>
                        <span dir="ltr" className="text-[10px] text-stone-400">
                          {p.code ? toFaDigits(p.code) : 'بدون کد'}{p.barcodeCount > 1 ? ` · ${fa(p.barcodeCount)} بارکد` : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell><UnitBadge v={p.unit} /></TableCell>
                    <TableCell><StockChip stock={p.stock} level={p.reorderLevel} /></TableCell>
                    <TableCell dir="rtl" className="whitespace-nowrap text-xs font-bold text-stone-700">{money(p.sellPrice)} <span className="text-[9px] font-normal text-stone-400">ریال</span></TableCell>
                    <TableCell dir="rtl" className="whitespace-nowrap text-xs text-stone-600">{money(p.lastBuyPrice)} <span className="text-[9px] font-normal text-stone-400">ریال</span></TableCell>
                    <TableCell className="text-xs text-stone-600">{p.reorderLevel != null ? <span className="font-bold">{fa(p.reorderLevel)}</span> : <span className="text-stone-300">—</span>}</TableCell>
                    <TableCell><StatusBadge v={p.status} /></TableCell>
                    {canManage && (
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 gap-1 border-teal-200 text-teal-800 hover:bg-teal-50"
                            onClick={(e: any) => { e.stopPropagation(); setFormId(p.id); setFormOpen(true) }}>
                            <I.pencil size={12} /> ویرایش
                          </Button>
                          <Button size="sm" variant="outline"
                            className={cn('h-7 gap-1', p.active === false ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-rose-200 text-rose-600 hover:bg-rose-50')}
                            disabled={toggling === p.id}
                            title={p.active === false ? 'فعال‌سازی کالا' : 'غیرفعال‌سازی (حذف نرم)'}
                            onClick={(e: any) => { e.stopPropagation(); toggleActive(p) }}>
                            {toggling === p.id ? <I.loader size={12} className="animate-spin" /> : p.active === false ? <I.check size={12} /> : <I.x size={12} />}
                            {p.active === false ? 'فعال' : 'غیرفعال'}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* R8: هنگام تعویض صفحه/فیلتر (ردیف‌های موجود) — پوشش ظریف بارگذاری */}
            {loading && rows.length > 0 && (
              <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-white/60">
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-bold text-stone-500 shadow-sm">
                  <I.loader size={12} className="animate-spin" /> در حال دریافت…
                </span>
              </div>
            )}
          </div>

          {/* R8: صفحه‌بندی کامل — اولین / قبلی / ورودی شمارهٔ صفحه / بعدی / آخرین + اندازهٔ صفحه */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            {/* شمار نتایج */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-600">
                <I.package size={12} className="text-stone-400" /> {fa(total)} کالا
              </span>
              {Number(meta?.total ?? 0) > total && (
                <span className="text-[11px] text-stone-400">از {fa(Number(meta?.total ?? 0))} کالای کل</span>
              )}
            </div>
            {/* کنترل‌های صفحه */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5" disabled={page <= 1} onClick={() => setPage(1)} title="اولین صفحه">
                <I.arrowRight size={14} /> <span className="hidden sm:inline">اولین صفحه</span>
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5" disabled={page <= 1} onClick={() => setPage((x) => Math.max(1, x - 1))} title="صفحهٔ قبل">
                <I.chevronRight size={14} /> <span className="hidden sm:inline">قبلی</span>
              </Button>
              <span className="flex items-center gap-1.5">
                <Input
                  ref={pageInputRef}
                  dir="ltr"
                  inputMode="numeric"
                  aria-label="شمارهٔ صفحه"
                  title={`شمارهٔ صفحه (۱ تا ${toFaDigits(pages)}) — با Enter یا کلیک بیرون اعمال می‌شود`}
                  placeholder="۱"
                  className={cn('h-8 w-16 text-center font-black tabular-nums', pageBad && 'border-rose-400 text-rose-600')}
                  value={pageInput ? toFaDigits(pageInput) : ''}
                  onChange={(e: any) => setPageInput(toEnDigits(String(e.target.value ?? '')).replace(/[^\d]/g, ''))}
                  onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); applyPageInput() } }}
                  onBlur={() => { if (!pageBad) applyPageInput() }}
                />
                <span className="whitespace-nowrap text-[11px] font-medium text-stone-500">از {fa(pages)}</span>
              </span>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5" disabled={page >= pages} onClick={() => setPage((x) => Math.min(pages, x + 1))} title="صفحهٔ بعد">
                <span className="hidden sm:inline">بعدی</span> <I.chevronLeft size={14} />
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5" disabled={page >= pages} onClick={() => setPage(pages)} title="آخرین صفحه">
                <span className="hidden sm:inline">آخرین صفحه</span> <I.arrowLeft size={14} />
              </Button>
              {/* اندازهٔ صفحه */}
              <span className="mx-1 hidden h-5 w-px bg-stone-200 sm:block" />
              <Select value={String(pageSize)} onValueChange={(v: string) => { setPageSize(Number(v) || 24); setPage(1) }}>
                <SelectTrigger className="h-8 w-24 text-xs" aria-label="تعداد کالا در هر صفحه"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{toFaDigits(n)} کالا</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[10px] leading-4 text-stone-400">
            روی هر ردیف کلیک کنید تا «شناسنامهٔ کالا» با نمودار گردش سفارش و روند موجودی باز شود.
            با فیلتر «کم‌موجود» فقط کالاهای فعالِ زیر حد سفارش مجدد دیده می‌شوند و شمارهٔ صفحه را می‌توانید مستقیم تایپ کنید.
            {canManage ? ' با «کالای جدید» و «ویرایش» می‌توانید کالا ثبت و اصلاح کنید؛ تغییر واحد شمارش در شناسنامه انجام می‌شود و کالا را از قاعدهٔ خودکار مصون می‌کند.' : ''}
          </p>
        </CardContent>
      </Card>

      <PassportDialog id={passport} open={passport !== null} onOpenChange={(o) => { if (!o) setPassport(null) }} onSaved={refreshAll}
        onEdit={(id: string) => { setPassport(null); setFormId(id); setFormOpen(true) }} />

      {/* R7: مدیریت واحدهای شمارش */}
      <UnitsManagerDialog open={unitsOpen} onOpenChange={(o) => { setUnitsOpen(o); if (!o) { refreshUnitsCache(); refresh() } }} />

      {/* R5-F: فرم ثبت/ویرایش — روی شناسنامه باز می‌شود */}
      <ProductFormDialog open={formOpen} onOpenChange={(o) => { if (!o) setFormOpen(false) }} editId={formId} groupOptions={groupOptions} sections={sections} onSaved={refreshAll} />
    </div>
  )
}
