import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Checkbox, fa, todayJalali, addJalaliDays, JALALI_MONTHS, jalaliMonthLength, jalaliToDate, WEEKDAY_FA, toEnDigits, toFaDigits, NumInput, JalaliDate, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   store/stockcount — انبارگردانی
   R8-COUNT: شمارش بر اساس کالا (اصلی) · برنامهٔ زمان‌بندی دوره‌ای
   + شمارش چرخشی خط/ناحیه (قدیمی — دست‌نخورده، تب سوم)
   ───────────────────────────────────────────────────────────── */

const PRODUCT_KINDS = ['GONDOLA', 'SHELF', 'FREEZER_ICECREAM', 'FRIDGE_CLOSED', 'FRIDGE_OPEN', 'FRIDGE_SHOWCASE', 'BAKERY', 'CUSTOM', 'AISLE', 'STORAGE', 'PRODUCE', 'DELI']

const STATUS_META: Record<string, { label: string; chip: string; dot: string }> = {
  SCHEDULED: { label: 'زمان‌بندی‌شده', chip: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-50 text-teal-700' },
  IN_PROGRESS: { label: 'در حال اجرا', chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-50 text-amber-700' },
  DONE: { label: 'انجام‌شده', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-50 text-emerald-700' },
  MISMATCH: { label: 'مغایرت', chip: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-50 text-rose-700' },
}

/* ─── R8-COUNT: دوره‌های شمارش کالا ─── */
const INTERVAL_OPTIONS = [7, 14, 30, 60, 90, 120, 180, 365]
const INTERVAL_LABELS: Record<number, string> = {
  7: 'هفتگی', 14: 'دوهفته‌ای', 30: 'ماهانه', 60: 'دوماهه', 90: 'فصلی', 120: 'چهارماهه', 180: 'شش‌ماهه', 365: 'سالانه',
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))
const monthOf = (dash: string) => String(dash || '').slice(0, 7)
const dayNum = (dash: string) => Number(String(dash || '').slice(8, 10))

/** تاریخ میل جلالی → متن بلند فارسی: «۲۷ مهر ۱۴۰۵» */
function longFa(dash: string): string {
  const m = String(dash || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return String(dash || '—')
  return `${toFaDigits(Number(m[3]))} ${JALALI_MONTHS[Number(m[2]) - 1] || ''} ${toFaDigits(Number(m[1]))}`
}

/** 0=شنبه … 6=جمعه */
function weekdayIdx(dash: string): number {
  try {
    const [y, m, d] = String(dash).split('-').map(Number)
    const dt = jalaliToDate(y, m, d)
    if (!dt || isNaN(dt.getTime())) return 0
    return (dt.getDay() + 1) % 7
  } catch { return 0 }
}
function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  let ny = y || 1405
  let nm = (mo || 1) + delta
  if (nm > 12) { ny += 1; nm = 1 }
  if (nm < 1) { ny -= 1; nm = 12 }
  return `${ny}-${pad2(nm)}`
}

/** R8-COUNT: فاصلهٔ یک تاریخ میل جلالی از امروز (مثبت = گذشته) */
function daysSinceJalali(dash: string): number | null {
  try {
    const [y, m, d] = String(dash).split('-').map(Number)
    const [ty, tm, td] = todayJalali().split('-').map(Number)
    const a = jalaliToDate(y, m, d)
    const b = jalaliToDate(ty, tm, td)
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null
    return Math.round((b.getTime() - a.getTime()) / 86400000)
  } catch { return null }
}

interface ExecItem { productId: string; name: string; barcode: string; unit: string; systemQty: number | null; countedQty: string }

/* ═════════════════════════════════════════════════════════════
   تب ۱ (اصلی) — شمارش بر اساس کالا
   ═════════════════════════════════════════════════════════════ */
function ProductCountTab() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [sel, setSel] = useState<any | null>(null)
  const [schedule, setSchedule] = useState<any | null>(null)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [recents, setRecents] = useState<any[]>([])
  const [recLoading, setRecLoading] = useState(true)
  const qtyBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { void loadRecents() }, [])

  /* با انتخاب کالا، ورودی شمارش فوکوس بگیرد */
  useEffect(() => {
    if (sel && qtyBoxRef.current) {
      const inp = qtyBoxRef.current.querySelector('input')
      if (inp) inp.focus()
    }
  }, [sel])

  useEffect(() => {
    const s = q.trim()
    if (s.length < 2) { setResults([]); return }
    const t = setTimeout(() => { void doSearch(s) }, 350)
    return () => clearTimeout(t)
  }, [q])

  async function doSearch(s: string) {
    setSearching(true)
    const r = await api(`/api/products${qs({ q: toEnDigits(s), pageSize: 20 })}`)
    setSearching(false)
    if (!r.ok) { setResults([]); return }
    const key = toEnDigits(s)
    const list: any[] = [...(r.data.items || [])]
    /* تطابق دقیق بارکد/کد همیشه اول فهرست */
    list.sort((a, b) => (b.code === key ? 1 : 0) - (a.code === key ? 1 : 0))
    setResults(list)
  }

  async function onEnter() {
    const s = toEnDigits(q.trim())
    /* بارکد داخلی فروشگاه می‌تواند ۴ رقمی باشد — تطابق دقیق اولویت دارد */
    if (/^\d{4,}$/.test(s)) {
      const r = await api(`/api/products/search${qs({ barcode: s })}`)
      if (r.ok) { void pick(r.data); return }
      toast.error(r.error || 'کالایی با این بارکد یافت نشد')
      return
    }
    if (results.length) void pick(results[0])
    else if (s.length >= 2) void doSearch(q.trim())
  }

  async function pick(p: any) {
    if (!p?.id) return
    setResults([]); setQty(''); setNote('')
    const [d, s] = await Promise.all([
      api(`/api/products/${p.id}`),
      api(`/api/stock-counts${qs({ schedules: '1', productId: p.id })}`),
    ])
    if (!d.ok) return toast.error(d.error || 'خطا در دریافت اطلاعات کالا')
    setSel(d.data)
    setSchedule(s.ok ? ((s.data.schedules || [])[0] ?? null) : null)
  }

  async function loadRecents() {
    setRecLoading(true)
    const r = await api(`/api/stock-counts${qs({ productCounts: '1', limit: 20 })}`)
    setRecLoading(false)
    if (r.ok) setRecents(r.data.counts || [])
  }

  const diff = useMemo(() => {
    if (!sel || qty === '') return null
    const c = Number(toEnDigits(qty))
    if (!Number.isFinite(c)) return null
    return c - (sel.stock ?? 0)
  }, [sel, qty])

  async function submit() {
    if (!sel) return toast.error('ابتدا یک کالا انتخاب کنید')
    if (qty === '' || !Number.isFinite(Number(toEnDigits(qty))) || Number(toEnDigits(qty)) < 0) {
      return toast.error('تعداد شمارش‌شده را درست وارد کنید')
    }
    const counted = Math.round(Number(toEnDigits(qty)))
    setSaving(true)
    const r = await api('/api/stock-counts', {
      method: 'POST',
      body: { action: 'count-product', productId: sel.id, countedQty: counted, note: note.trim() || null },
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت شمارش ناموفق بود')
    const cnt = r.data.count || {}
    const sch = r.data.schedule || null
    const d = Number(cnt.item?.diff ?? 0)
    const nextTxt = sch?.autoReschedule ? ` · شمارش بعدی: ${toFaDigits(sch.nextDueJalali)} (${toFaDigits(String(sch.intervalDays))} روزه)` : ''
    if (d !== 0) toast.warning(`ثبت شد — مغایرت ${d > 0 ? '+' : '−'}${fa(Math.abs(d))}؛ موجودی سامانه اصلاح شد${nextTxt}`)
    else toast.success(`ثبت شد — انطباق کامل${nextTxt}`)
    setSel({ ...sel, stock: counted, lastCountDate: r.data.product?.lastCountDate || todayJalali() })
    setSchedule(sch)
    setQty('')
    setNote('')
    void loadRecents()
  }

  return (
    <div className="space-y-4">
      {/* جستجو / اسکن کالا */}
      <div className="relative">
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e: any) => setQ(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); void onEnter() } }}
            placeholder="جستجوی نام کالا یا اسکن بارکد (Enter)…"
          />
          <Button variant="outline" size="icon" aria-label="جستجو" onClick={() => void doSearch(q.trim())}>
            {searching ? <I.loader size={16} className="animate-spin" /> : <I.search size={16} />}
          </Button>
        </div>
        {results.length > 0 && (
          <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
            {results.map((p) => (
              <button key={p.id} onClick={() => void pick(p)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-right hover:bg-stone-100">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                <span className="shrink-0 text-[10px] text-stone-400">{p.code || 'بدون کد'} · موجودی {fa(p.stock ?? 0)} {p.unit}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!sel ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
          <I.scan className="mx-auto mb-2 text-stone-300" size={30} />
          <p className="text-sm text-stone-500">کالای موردنظر را جستجو یا اسکن کنید — با انتخاب کالا، پنل شمارش باز می‌شود</p>
          <p className="mt-1 text-[11px] text-stone-400">پس از ثبت، موجودی سامانه اصلاح و شمارش بعدی خودکار زمان‌بندی می‌شود</p>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          {/* سربرگ کالا */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold">{sel.name}</span>
                {sel.code && <Badge variant="secondary" className="text-[10px]">{toFaDigits(sel.code)}</Badge>}
              </div>
              <div className="mt-0.5 text-[11px] text-stone-400">واحد {sel.unit} · فروش ماه: {fa(sel.monthlySold ?? 0)}</div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-stone-400">موجودی سیستم</div>
              <div className="text-2xl font-black text-stone-800">{fa(sel.stock ?? 0)} <span className="text-xs font-medium text-stone-400">{sel.unit}</span></div>
            </div>
          </div>

          {/* چیپ آخرین شمارش + برنامهٔ زمان‌بندی */}
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {sel.lastCountDate ? (
              <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">
                آخرین شمارش: {toFaDigits(sel.lastCountDate)}{daysSinceJalali(sel.lastCountDate) !== null ? ` — ${fa(daysSinceJalali(sel.lastCountDate)!)} روز پیش` : ''}
              </span>
            ) : (
              <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">هنوز شمارش نشده</span>
            )}
            {schedule && (
              <span className={cn('rounded-md px-2 py-1', schedule.active && schedule.nextDueJalali < todayJalali() ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700')}>
                <I.clock size={11} className="ml-0.5 inline" />
                برنامه: {INTERVAL_LABELS[schedule.intervalDays] || `${toFaDigits(String(schedule.intervalDays))} روزه`} · موعد بعدی: {toFaDigits(schedule.nextDueJalali)}
                {schedule.active ? '' : ' (غیرفعال)'}
              </span>
            )}
          </div>

          {/* ورودی شمارش + یادداشت */}
          <div className="grid gap-3 sm:grid-cols-[230px_1fr]">
            <div ref={qtyBoxRef}>
              <label className="mb-1 block text-xs text-stone-500">تعداد شمارش‌شده</label>
              <NumInput value={qty} onChange={setQty} className="h-12 text-lg font-black" unit={sel.unit} placeholder="۰" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">یادداشت (اختیاری)</label>
              <Input value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="مثلاً: ۲ عدد شکسته کنار پالت بود…" />
            </div>
          </div>

          {/* پیش‌نمایش مغایرت + ثبت */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2.5">
            {diff === null ? (
              <span className="text-xs text-stone-400">تعداد شمارش‌شده را وارد کنید تا مغایرت محاسبه شود</span>
            ) : diff === 0 ? (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><I.check size={15} /> بدون مغایرت</span>
            ) : (
              <span className="text-xs font-bold text-rose-700">
                مغایرت: {diff > 0 ? `+${fa(diff)}` : `−${fa(Math.abs(diff))}`} {sel.unit} {diff > 0 ? '(بیش از موجودی سیستم)' : '(کمبود موجودی)'}
              </span>
            )}
            <Button disabled={saving || qty === ''} className="gap-1.5" onClick={() => void submit()}>
              {saving ? <I.loader size={16} className="animate-spin" /> : <I.save size={16} />} ثبت شمارش و اصلاح موجودی
            </Button>
          </div>
          <p className="text-[10px] text-stone-400">
            ثبت شمارش کالا، موجودی سامانه را همان تعداد شمارش‌شده می‌کند، «آخرین شمارش» کالا را به‌روز می‌رساند و اگر برنامهٔ فعال داشته باشد، موعد شمارش بعدی خودکار جلو می‌افتد.
          </p>
        </div>
      )}

      {/* شمارش‌های اخیر کالا */}
      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-bold"><I.history size={15} /> شمارش‌های اخیر کالا</div>
        {recLoading ? (
          <p className="py-4 text-center text-xs text-stone-400"><I.loader size={14} className="ml-1 inline animate-spin" /> در حال دریافت…</p>
        ) : recents.length === 0 ? (
          <p className="py-4 text-center text-xs text-stone-400">هنوز شمارشی بر اساس کالا ثبت نشده است</p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {recents.map((c) => {
              const it = c.item
              const d = Number(it?.diff || 0)
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-100 bg-stone-50 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <span className="truncate text-xs font-bold">{it?.name || '—'}</span>
                    <span className="ms-2 text-[10px] text-stone-400">{toFaDigits(c.date || '')}{c.staffName ? ` · ${c.staffName}` : ''}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px]">
                    <span className="text-stone-500">سیستم {fa(it?.systemQty ?? 0)} ← شمارش {fa(it?.countedQty ?? 0)}</span>
                    {d === 0 ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">بدون مغایرت</span>
                    ) : (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700">{d > 0 ? `+${fa(d)}` : `−${fa(Math.abs(d))}`}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════
   تب ۲ — برنامهٔ زمان‌بندی شمارش کالاها (ویرایش: مدیران)
   ═════════════════════════════════════════════════════════════ */
function SchedulesTab({ isManager }: { isManager: boolean }) {
  const [filter, setFilter] = useState<'all' | 'overdue' | 'due'>('all')
  const [rows, setRows] = useState<any[]>([])
  const [summary, setSummary] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  /* ویرایش یک برنامه */
  const [editOpen, setEditOpen] = useState(false)
  const [editSch, setEditSch] = useState<any | null>(null)
  const [ef, setEf] = useState({ intervalDays: '30', nextDue: '', autoReschedule: true, note: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  /* افزودن گروهی کالاها */
  const [addOpen, setAddOpen] = useState(false)
  const [aq, setAq] = useState('')
  const [aResults, setAResults] = useState<any[]>([])
  const [aSearching, setASearching] = useState(false)
  const [picked, setPicked] = useState<any[]>([])
  const [aInterval, setAInterval] = useState('suggest')
  const [aAuto, setAAuto] = useState(true)
  const [savingAdd, setSavingAdd] = useState(false)

  useEffect(() => { void load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = aq.trim()
    if (!addOpen || s.length < 2) { setAResults([]); return }
    const t = setTimeout(() => { void doAddSearch(s) }, 350)
    return () => clearTimeout(t)
  }, [aq, addOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const r = await api(`/api/stock-counts${qs({ schedules: '1', filter })}`)
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت برنامه‌ها'); return }
    setRows(r.data.schedules || [])
    setSummary(r.data.summary || null)
  }

  async function doAddSearch(s: string) {
    setASearching(true)
    const r = await api(`/api/products${qs({ q: toEnDigits(s), pageSize: 20 })}`)
    setASearching(false)
    if (r.ok) setAResults((r.data.items || []).filter((p: any) => !picked.some((x) => x.id === p.id)))
    else setAResults([])
  }

  function togglePicked(p: any) {
    setPicked((prev) => (prev.some((x) => x.id === p.id)
      ? prev.filter((x) => x.id !== p.id)
      : [...prev, { id: p.id, name: p.name, code: p.code || '', unit: p.unit || 'عدد' }]))
  }

  async function toggleActive(s: any) {
    setBusyId(s.id)
    const r = await api('/api/stock-counts', { method: 'PATCH', body: { id: s.id, active: !s.active } })
    setBusyId(null)
    if (!r.ok) return toast.error(r.error || 'تغییر وضعیت ناموفق بود')
    toast.success(s.active ? `برنامهٔ «${s.productName}» غیرفعال شد` : `برنامهٔ «${s.productName}» فعال شد`)
    void load()
  }

  async function removeSch(s: any) {
    setBusyId(s.id)
    const r = await api(`/api/stock-counts${qs({ id: s.id })}`, { method: 'DELETE' })
    setBusyId(null)
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success(`برنامهٔ «${s.productName}» حذف شد`)
    void load()
  }

  function openEdit(s: any) {
    setEditSch(s)
    setEf({ intervalDays: String(s.intervalDays), nextDue: s.nextDueJalali || todayJalali(), autoReschedule: !!s.autoReschedule, note: s.note || '' })
    setEditOpen(true)
  }

  async function submitEdit() {
    if (!editSch) return
    setSavingEdit(true)
    const r = await api('/api/stock-counts', {
      method: 'PATCH',
      body: {
        id: editSch.id,
        intervalDays: Number(ef.intervalDays),
        nextDueJalali: ef.nextDue,
        autoReschedule: ef.autoReschedule,
        note: ef.note.trim() || null,
      },
    })
    setSavingEdit(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره ناموفق بود')
    toast.success(`برنامهٔ «${editSch.productName}» به‌روزرسانی شد`)
    setEditOpen(false)
    void load()
  }

  async function submitAdd() {
    if (!picked.length) return toast.error('حداقل یک کالا انتخاب کنید')
    setSavingAdd(true)
    const body: Record<string, unknown> = { action: 'schedule-products', productIds: picked.map((p) => p.id), autoReschedule: aAuto }
    if (aInterval !== 'suggest') body.intervalDays = Number(aInterval)
    const r = await api('/api/stock-counts', { method: 'POST', body })
    setSavingAdd(false)
    if (!r.ok) return toast.error(r.error || 'ثبت برنامه ناموفق بود')
    toast.success(`${fa(r.data.count ?? picked.length)} کالا به برنامهٔ شمارش اضافه شد`)
    setAddOpen(false); setPicked([]); setAq(''); setAResults([])
    void load()
  }

  return (
    <div className="space-y-3">
      {/* کارت‌های خلاصه */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-3 text-center">
          <div className="text-xl font-black text-stone-700">{fa(summary?.total ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-stone-500">کل برنامه‌ها</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
          <div className="text-xl font-black text-rose-700">{fa(summary?.overdue ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-rose-600">سررسید گذشته</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
          <div className="text-xl font-black text-amber-700">{fa(summary?.dueToday ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-amber-600">موعد امروز</div>
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-center">
          <div className="text-xl font-black text-teal-700">{fa(summary?.active ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-teal-600">فعال</div>
        </div>
      </div>

      {/* فیلتر + افزودن */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            { k: 'all', l: 'همه' },
            { k: 'overdue', l: 'سررسید گذشته' },
            { k: 'due', l: 'امروز' },
          ].map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k as 'all' | 'overdue' | 'due')} className={cn('rounded-lg border px-3 py-1.5 text-xs transition-colors', filter === f.k ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-emerald-400')}>{f.l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}><I.refresh size={14} /> به‌روزرسانی</Button>
          {isManager && (
            <Button size="sm" className="gap-1.5" onClick={() => { setAddOpen(true); setPicked([]); setAq(''); setAResults([]) }}>
              <I.plus size={14} /> افزودن کالاها به برنامه
            </Button>
          )}
        </div>
      </div>

      {/* جدول برنامه‌ها */}
      {loading ? (
        <p className="py-8 text-center text-sm text-stone-400"><I.loader size={16} className="ml-1 inline animate-spin" /> در حال دریافت برنامه‌ها…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
          <I.calendarDays className="mx-auto mb-2 text-stone-300" size={28} />
          <p className="text-sm text-stone-500">{filter === 'all' ? 'هنوز کالایی در برنامهٔ شمارش دوره‌ای نیست' : 'برنامه‌ای با این فیلتر نیست'}</p>
          {isManager && filter === 'all' && <p className="mt-1 text-[11px] text-stone-400">با «افزودن کالاها به برنامه» شروع کنید — دوره‌ها را هوشمند (بر پایهٔ فروش) یا دلخواه انتخاب کنید</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">کالا</TableHead>
                <TableHead className="whitespace-nowrap text-center">موجودی</TableHead>
                <TableHead className="text-center">دوره</TableHead>
                <TableHead className="text-center">آخرین شمارش</TableHead>
                <TableHead className="text-center">موعد بعدی</TableHead>
                <TableHead className="text-center">حالت</TableHead>
                <TableHead className="text-center">وضعیت</TableHead>
                {isManager && <TableHead className="text-center">عملیات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const overdue = !!s.overdue
                const dueToday = !!s.dueToday
                const late = overdue ? daysSinceJalali(s.nextDueJalali) : null
                const lc = s.lastCountJalali ? daysSinceJalali(s.lastCountJalali) : null
                const lastDiff = Number(s.lastDiff || 0)
                return (
                  <TableRow key={s.id} className={cn(!s.active && 'opacity-50', overdue && 'bg-rose-50/60', dueToday && 'bg-amber-50/60')}>
                    <TableCell className="max-w-56">
                      <div className="truncate text-xs font-bold">{s.productName}</div>
                      <div className="text-[10px] text-stone-400">
                        {s.barcode ? toFaDigits(s.barcode) : 'بدون بارکد'}
                        {s.priority === 'HIGH' && <span className="font-bold text-amber-600"> · پرگردش</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center text-xs">{fa(s.stock ?? 0)} <span className="text-[10px] text-stone-400">{s.unit}</span></TableCell>
                    <TableCell className="whitespace-nowrap text-center text-xs">
                      {INTERVAL_LABELS[s.intervalDays] || '—'} <span className="text-[10px] text-stone-400">({toFaDigits(String(s.intervalDays))} روز)</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center text-xs">
                      {s.lastCountJalali ? (
                        <div>
                          <div>{toFaDigits(s.lastCountJalali)}{lc !== null ? <span className="text-[10px] text-stone-400"> ({fa(lc)} روز پیش)</span> : null}</div>
                          {lastDiff !== 0
                            ? <span className="text-[10px] font-bold text-rose-600">مغایرت {lastDiff > 0 ? `+${fa(lastDiff)}` : `−${fa(Math.abs(lastDiff))}`}</span>
                            : <span className="text-[10px] text-emerald-600">بدون مغایرت</span>}
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-600">شمرده نشده</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center text-xs">
                      {overdue ? (
                        <span className="font-bold text-rose-700">{toFaDigits(s.nextDueJalali)}{late && late > 0 ? ` (${fa(late)} روز تأخیر)` : ''}</span>
                      ) : dueToday ? (
                        <span className="font-bold text-amber-700">امروز — {toFaDigits(s.nextDueJalali)}</span>
                      ) : (
                        <span>{toFaDigits(s.nextDueJalali)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cn('text-[10px]', s.autoReschedule ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-stone-200 bg-stone-50 text-stone-500')}>
                        {s.autoReschedule ? 'خودکار' : 'دستی'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {isManager ? (
                        <Button variant="outline" size="sm" disabled={busyId === s.id} className={cn('h-7 gap-1 px-2 text-[10px]', s.active ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-stone-300 text-stone-500 hover:bg-stone-100')} onClick={() => void toggleActive(s)}>
                          {busyId === s.id ? <I.loader size={12} className="animate-spin" /> : <I.circleDot size={12} />}
                          {s.active ? 'فعال' : 'غیرفعال'}
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">{s.active ? 'فعال' : 'غیرفعال'}</Badge>
                      )}
                    </TableCell>
                    {isManager && (
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" aria-label="ویرایش" className="h-7 w-7" onClick={() => openEdit(s)}><I.pencil size={13} /></Button>
                          <Button variant="ghost" size="icon" aria-label="حذف" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => void removeSch(s)}><I.trash size={13} /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {!isManager && <p className="text-center text-[11px] text-stone-400">مشاهده فقط — ویرایش برنامهٔ شمارش برای مدیران فعال است</p>}

      {/* دیالوگ ویرایش برنامه */}
      <Dialog open={editOpen} onOpenChange={(o: boolean) => setEditOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ویرایش برنامهٔ شمارش</DialogTitle>
            <DialogDescription>{editSch?.productName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-stone-500">دورهٔ شمارش</label>
              <Select value={ef.intervalDays} onValueChange={(v: string) => setEf((f) => ({ ...f, intervalDays: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{toFaDigits(String(n))} روز — {INTERVAL_LABELS[n]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">موعد شمارش بعدی</label>
              <JalaliDate value={ef.nextDue} onChange={(v: string) => setEf((f) => ({ ...f, nextDue: v }))} quickChips={[{ label: 'امروز', deltaDays: 0 }, { label: 'فردا', deltaDays: 1 }, { label: 'هفتهٔ آینده', deltaDays: 7 }]} />
              <p className="mt-1 text-[10px] text-stone-400">اگر دوره را عوض کنید و موعد را خالی بگذارید، از آخرین شمارش بازمحاسبه می‌شود</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2.5">
              <Checkbox checked={ef.autoReschedule} onCheckedChange={(v: any) => setEf((f) => ({ ...f, autoReschedule: !!v }))} />
              <span className="text-xs text-stone-600">پس از هر شمارش، موعد بعدی خودکار جلو برود</span>
            </label>
            <div>
              <label className="mb-1 block text-xs text-stone-500">یادداشت (اختیاری)</label>
              <Input value={ef.note} onChange={(e: any) => setEf((f) => ({ ...f, note: e.target.value }))} placeholder="مثلاً: کالای پرگردش — هفتگی چک شود" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>انصراف</Button>
            <Button disabled={savingEdit} className="gap-1.5" onClick={() => void submitEdit()}>
              {savingEdit ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ افزودن گروهی کالاها */}
      <Dialog open={addOpen} onOpenChange={(o: boolean) => setAddOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.sparkles size={17} /> افزودن کالاها به برنامهٔ شمارش</DialogTitle>
            <DialogDescription>
              کالاها را جستجو و انتخاب کنید؛ با «پیشنهاد هوشمند»، دورهٔ هر کالا بر پایهٔ گردش فروش ماهانه‌اش خودکار تعیین می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <div className="flex gap-2">
                <Input value={aq} onChange={(e: any) => setAq(e.target.value)} placeholder="جستجوی نام کالا یا بارکد…" />
                <Button variant="outline" size="icon" aria-label="جستجو" onClick={() => void doAddSearch(aq.trim())}>
                  {aSearching ? <I.loader size={16} className="animate-spin" /> : <I.search size={16} />}
                </Button>
              </div>
              {aResults.length > 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                  {aResults.map((p) => (
                    <button key={p.id} onClick={() => togglePicked(p)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-right hover:bg-stone-100">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                      <span className="shrink-0 text-[10px] text-stone-400">{p.code || ''} · موجودی {fa(p.stock ?? 0)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((p) => (
                  <button key={p.id} onClick={() => togglePicked(p)} className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700">
                    {p.name} <I.x size={11} />
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-stone-500">دورهٔ شمارش</label>
                <Select value={aInterval} onValueChange={setAInterval}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suggest">پیشنهاد هوشمند (بر پایهٔ فروش)</SelectItem>
                    {INTERVAL_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{toFaDigits(String(n))} روز — {INTERVAL_LABELS[n]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                  <Checkbox checked={aAuto} onCheckedChange={(v: any) => setAAuto(!!v)} />
                  <span className="text-xs text-stone-600">پس از هر شمارش، موعد بعدی خودکار جلو برود</span>
                </label>
              </div>
            </div>
            <p className="text-[10px] text-stone-400">
              پیشنهاد هوشمند: فروش ماهانه بیش از ۳۰۰ ← هفتگی · بیش از ۱۰۰ ← دوهفته‌ای · بیش از ۳۰ ← ماهانه · بیش از صفر ← دوماهه · بدون فروش ← چهارماهه
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>انصراف</Button>
            <Button disabled={savingAdd || !picked.length} className="gap-1.5" onClick={() => void submitAdd()}>
              {savingAdd ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />}
              افزودن{picked.length ? ` (${fa(picked.length)} کالا)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════
   نما — سه تب: شمارش کالا (اصلی) · برنامه زمان‌بندی · خط/ناحیه
   ═════════════════════════════════════════════════════════════ */
export default function StockCountView() {
  const { user } = useShell()
  const isManager = !!user && ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(user.role)

  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(monthOf(todayJalali()) || '1405-07')
  const [counts, setCounts] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [blocks, setBlocks] = useState<any[]>([])
  const [zones, setZones] = useState<string[]>([])

  /* افزودن زمان‌بندی */
  const [addOpen, setAddOpen] = useState(false)
  const [savingSch, setSavingSch] = useState(false)
  const [form, setForm] = useState({ date: todayJalali(), mode: 'block' as 'block' | 'zone', blockLabel: '', zoneName: '', staffId: '', note: '' })

  /* پیشنهاد خودکار */
  const [sugOpen, setSugOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [sugStaff, setSugStaff] = useState('')
  const [applying, setApplying] = useState({ active: false, done: 0, total: 0 })

  /* اجرا */
  const [execId, setExecId] = useState<string | null>(null)
  const [items, setItems] = useState<ExecItem[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [execNote, setExecNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<any | null>(null)

  /* گزارش */
  const [repFilter, setRepFilter] = useState('mismatch')
  const [expanded, setExpanded] = useState<Record<string, any[] | null>>({})
  const [lcQuery, setLcQuery] = useState('')
  const [lcResults, setLcResults] = useState<any[]>([])
  const [lcProduct, setLcProduct] = useState<any | null>(null)
  const [lcLoading, setLcLoading] = useState(false)

  useEffect(() => { void loadBase() }, [])
  useEffect(() => { void loadMonth() }, [month])

  async function loadBase() {
    const [roster, plans, hist] = await Promise.all([
      api('/api/auth/roster'),
      api('/api/store/floorplans'),
      api('/api/stock-counts'),
    ])
    if (roster.ok) setStaff((roster.data.users || []).filter((u: any) => u.active !== false))
    if (plans.ok) {
      const plan = (plans.data.plans || [])[0]
      const bl: any[] = plan ? (plan.blocks || []) : []
      const pb = bl.filter((b) => PRODUCT_KINDS.includes(b.kind) && b.label)
      setBlocks(pb)
      setZones(Array.from(new Set(bl.map((b) => b.zoneName).filter((z: string) => !!z))) as string[])
    }
    setHistory(hist.ok ? (hist.data.counts || []) : [])
  }

  async function loadMonth() {
    setLoading(true)
    const r = await api(`/api/stock-counts${qs({ month })}`)
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت شمارش‌ها'); return }
    setCounts(r.data.counts || [])
  }

  /* ─── تقویم ماه ─── */
  const [jy, jm] = month.split('-').map(Number)
  const mLen = jalaliMonthLength(jy || 1405, jm || 1)
  const firstIdx = weekdayIdx(`${month}-01`)
  const today = todayJalali()
  const byDay = useMemo(() => {
    const map: Record<number, any[]> = {}
    for (const c of counts) {
      const d = dayNum(c.scheduledFor || '')
      if (d >= 1) (map[d] = map[d] || []).push(c)
    }
    return map
  }, [counts])
  const cells: (number | null)[] = []
  for (let i = 0; i < firstIdx; i++) cells.push(null)
  for (let d = 1; d <= mLen; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const monthStats = useMemo(() => {
    let scheduled = 0, done = 0, mismatch = 0
    for (const c of counts) {
      if (c.status === 'MISMATCH') mismatch++
      else if (c.status === 'DONE') done++
      else scheduled++
    }
    return { scheduled, done, mismatch }
  }, [counts])

  function openAdd(date?: string) {
    setForm({ date: date || today, mode: 'block', blockLabel: blocks[0]?.label || '', zoneName: zones[0] || '', staffId: '', note: '' })
    setAddOpen(true)
  }

  async function submitSchedule() {
    const date = toEnDigits(form.date.trim()).replace(/\//g, '-')
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) return toast.error('تاریخ را به شکل ۱۴۰۵-۰۷-۰۱ وارد کنید')
    const target = form.mode === 'block' ? form.blockLabel : form.zoneName
    if (!target) return toast.error(form.mode === 'block' ? 'خط/بخش را انتخاب کنید' : 'ناحیه را انتخاب کنید')
    const st = staff.find((s) => s.id === form.staffId)
    setSavingSch(true)
    const r = await api('/api/stock-counts', {
      method: 'POST',
      body: {
        scheduledFor: date,
        blockLabel: form.mode === 'block' ? target : null,
        zoneName: form.mode === 'zone' ? target : null,
        staffId: st?.id || null,
        staffName: st?.fullName || null,
        note: form.note.trim() || null,
      },
    })
    setSavingSch(false)
    if (!r.ok) return toast.error(r.error || 'ثبت زمان‌بندی ناموفق بود')
    toast.success(`زمان‌بندی «${target}» برای ${longFa(date)} ثبت شد`)
    setAddOpen(false)
    void loadMonth(); void loadBase()
  }

  /* ─── پیشنهاد خودکار ─── */
  function buildSuggestions() {
    if (!blocks.length) return toast.error('ابتدا نقشه فروشگاه و خط‌های آن را تعریف کنید')
    const working: string[] = []
    for (let d = 1; d <= mLen; d++) {
      const date = `${month}-${pad2(d)}`
      if (weekdayIdx(date) !== 6) working.push(date) // جمعه تعطیل
    }
    const out: any[] = []
    for (let i = 0; i < working.length && i < blocks.length; i++) {
      const b = blocks[i]
      const date = working[i]
      const exists = counts.some((c) => c.scheduledFor === date && (c.blockLabel === b.label || (c.zoneName && c.zoneName === b.zoneName)))
      out.push({ date, blockLabel: b.label, zoneName: b.zoneName || '', exists })
    }
    setSuggestions(out)
    setApplying({ active: false, done: 0, total: 0 })
    setSugOpen(true)
  }

  async function postScheduleRow(s: any) {
    const st = staff.find((x) => x.id === sugStaff)
    const r = await api('/api/stock-counts', {
      method: 'POST',
      body: {
        scheduledFor: s.date,
        blockLabel: s.blockLabel,
        zoneName: s.zoneName || null,
        staffId: st?.id || null,
        staffName: st?.fullName || null,
        note: 'پیشنهاد خودکار سیستم',
      },
    })
    return r.ok
  }

  async function applyRow(s: any, i: number) {
    const okRow = await postScheduleRow(s)
    if (!okRow) return toast.error('ثبت این ردیف ناموفق بود')
    setSuggestions((prev) => prev.map((x, xi) => (xi === i ? { ...x, done: true } : x)))
    toast.success(`«${s.blockLabel}» زمان‌بندی شد`)
    void loadMonth(); void loadBase()
  }

  async function applyAll() {
    const rows = suggestions.map((s, i) => ({ ...s, i })).filter((s) => !s.done && !s.exists)
    if (!rows.length) return toast.info('ردیف جدیدی برای ثبت نیست')
    setApplying({ active: true, done: 0, total: rows.length })
    let okN = 0
    for (let k = 0; k < rows.length; k++) {
      const okRow = await postScheduleRow(rows[k])
      if (okRow) okN++
      setSuggestions((prev) => prev.map((x, xi) => (xi === rows[k].i ? { ...x, done: true } : x)))
      setApplying({ active: true, done: k + 1, total: rows.length })
    }
    setApplying({ active: false, done: okN, total: rows.length })
    if (okN === rows.length) toast.success(`${fa(okN)} زمان‌بندی برای ${JALALI_MONTHS[(jm || 1) - 1]} ثبت شد`)
    else toast.warning(`${fa(okN)} از ${fa(rows.length)} زمان‌بندی ثبت شد`)
    void loadMonth(); void loadBase()
  }

  /* ─── اجرای شمارش ─── */
  const allCounts = useMemo(() => {
    const seen = new Set<string>()
    const out: any[] = []
    for (const c of [...counts, ...history]) {
      if (c?.id && !seen.has(c.id)) { seen.add(c.id); out.push(c) }
    }
    return out
  }, [counts, history])
  const scheduledList = useMemo(
    () => allCounts.filter((c) => c.status === 'SCHEDULED').sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor))),
    [allCounts],
  )
  const execCount = useMemo(() => allCounts.find((c) => c.id === execId) || null, [allCounts, execId])

  function startExec(c: any) {
    setExecId(c.id)
    setItems([])
    setQuery(''); setResults([])
    setExecNote('')
    setResult(null)
  }

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(() => { void doSearch(q) }, 300)
    return () => clearTimeout(t)
  }, [query])

  async function doSearch(q: string) {
    setSearching(true)
    const r = await api(`/api/products/search${qs({ q: toEnDigits(q) })}`)
    setSearching(false)
    if (r.ok) setResults((r.data.products || []).slice(0, 8))
    else setResults([])
  }

  async function onScanEnter() {
    const q = toEnDigits(query.trim())
    /* بارکد داخلی فروشگاه می‌تواند ۴ رقمی باشد (مثلاً ۱۵۵۰) */
    if (/^\d{4,}$/.test(q)) {
      const r = await api(`/api/products/search${qs({ barcode: q })}`)
      if (r.ok) { void addProduct(r.data); return }
      toast.error(r.error || 'کالایی با این بارکد یافت نشد')
      return
    }
    if (results.length) void addProduct(results[0])
  }

  async function addProduct(p: any) {
    if (!p?.id) return
    if (items.some((it) => it.productId === p.id)) { setQuery(''); setResults([]); return toast.info('این کالا در فهرست شمارش هست') }
    setItems((prev) => [...prev, { productId: p.id, name: p.name || '', barcode: p.barcode || p.code || '', unit: p.unit || 'عدد', systemQty: null, countedQty: '' }])
    setQuery(''); setResults([])
    const d = await api(`/api/products/${p.id}`)
    if (d.ok && typeof d.data.stock === 'number') {
      setItems((prev) => prev.map((it) => (it.productId === p.id ? { ...it, systemQty: d.data.stock } : it)))
    }
  }

  function diffOf(it: ExecItem): number | null {
    if (it.countedQty === '' || it.systemQty === null || it.systemQty === undefined) return null
    const c = Number(toEnDigits(it.countedQty))
    if (!Number.isFinite(c)) return null
    return c - it.systemQty
  }

  async function submitCount() {
    if (!execId) return
    const rows = items.filter((it) => it.countedQty !== '')
    if (!rows.length) return toast.error('حداقل یک کالا را شمارش و مقدار آن را وارد کنید')
    const bad = rows.find((it) => !Number.isFinite(Number(toEnDigits(it.countedQty))))
    if (bad) return toast.error(`مقدار شمارش «${bad.name}» معتبر نیست`)
    setSaving(true)
    const r = await api(`/api/stock-counts/${execId}`, {
      method: 'POST',
      body: {
        date: todayJalali(),
        items: rows.map((it) => ({ productId: it.productId, countedQty: Number(toEnDigits(it.countedQty)) })),
        note: execNote.trim() || null,
      },
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت شمارش ناموفق بود')
    const cnt = r.data.count || r.data || {}
    if (cnt.status === 'MISMATCH') toast.warning(`شمارش ثبت شد — ${fa(cnt.mismatches || 0)} مغایرت`)
    else toast.success('شمارش ثبت شد — انطباق کامل')
    const d = await api(`/api/stock-counts/${execId}`)
    setResult(d.ok ? { count: d.data.count || cnt, items: d.data.items || [] } : { count: cnt, items: [] })
    void loadMonth(); void loadBase()
  }

  /* ─── گزارش ─── */
  const reportRows = useMemo(() => {
    const rows = allCounts.filter((c) => {
      if (repFilter === 'mismatch') return c.status === 'MISMATCH' || (c.mismatches || 0) > 0
      if (repFilter === 'done') return c.status === 'DONE'
      if (repFilter === 'scheduled') return c.status === 'SCHEDULED' || c.status === 'IN_PROGRESS'
      return true
    })
    return rows.sort((a, b) => String(b.scheduledFor).localeCompare(String(a.scheduledFor)))
  }, [allCounts, repFilter])

  async function toggleExpand(id: string) {
    if (expanded[id]) { setExpanded((p) => ({ ...p, [id]: null })); return }
    setExpanded((p) => ({ ...p, [id]: [] }))
    const r = await api(`/api/stock-counts/${id}`)
    setExpanded((p) => ({ ...p, [id]: r.ok ? (r.data.items || []) : null }))
    if (!r.ok) toast.error(r.error || 'خطا در دریافت اقلام')
  }

  async function pickLastCountProduct(p: any) {
    setLcLoading(true); setLcProduct(null); setLcResults([])
    const d = await api(`/api/products/${p.id}`)
    setLcLoading(false)
    if (!d.ok) return toast.error(d.error || 'خطا در دریافت اطلاعات کالا')
    setLcProduct(d.data)
  }

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      <Card data-tour="page">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Icon name="clipboard" size={18} /> انبارگردانی و شمارش</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="product">
            <TabsList className="mb-3">
              <TabsTrigger value="product">شمارش بر اساس کالا</TabsTrigger>
              <TabsTrigger value="schedules">برنامه زمان‌بندی</TabsTrigger>
              <TabsTrigger value="zone">شمارش خط/ناحیه</TabsTrigger>
            </TabsList>

            {/* ═══════════ تب ۱: شمارش بر اساس کالا (اصلی) ═══════════ */}
            <TabsContent value="product" className="space-y-3">
              <ProductCountTab />
            </TabsContent>

            {/* ═══════════ تب ۲: برنامه زمان‌بندی شمارش کالاها ═══════════ */}
            <TabsContent value="schedules" className="space-y-3">
              <SchedulesTab isManager={isManager} />
            </TabsContent>

            {/* ═══════════ تب ۳: شمارش خط/ناحیه (قدیمی) ═══════════ */}
            <TabsContent value="zone" className="space-y-3">
              {loading && counts.length === 0 ? (
                <div className="py-10 text-center text-sm text-stone-500">
                  <I.loader className="mx-auto mb-3 animate-spin" size={22} />
                  در حال دریافت برنامه انبارگردانی…
                </div>
              ) : (
              <Tabs defaultValue="schedule">
                <TabsList className="mb-3">
                  <TabsTrigger value="schedule">زمان‌بندی</TabsTrigger>
                  <TabsTrigger value="execute">اجرا</TabsTrigger>
                  <TabsTrigger value="report">گزارش</TabsTrigger>
                </TabsList>

                {/* ═══════════ تب زمان‌بندی ═══════════ */}
                <TabsContent value="schedule" className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" aria-label="ماه قبل" onClick={() => setMonth(shiftMonth(month, -1))}><I.chevronRight size={16} /></Button>
                      <div className="min-w-32 text-center text-sm font-bold">{JALALI_MONTHS[(jm || 1) - 1]} {toFaDigits(jy || 1405)}</div>
                      <Button variant="outline" size="icon" aria-label="ماه بعد" onClick={() => setMonth(shiftMonth(month, 1))}><I.chevronLeft size={16} /></Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="secondary" className="gap-1.5" onClick={buildSuggestions}><I.sparkles size={15} /> پیشنهاد خودکار</Button>
                      <Button className="gap-1.5" onClick={() => openAdd()}><I.plus size={15} /> افزودن زمان‌بندی</Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[11px] text-stone-500">
                    <span className="rounded-md bg-teal-50 px-2 py-1 text-teal-700">{fa(monthStats.scheduled)} زمان‌بندی‌شده</span>
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">{fa(monthStats.done)} انجام‌شده</span>
                    <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-700">{fa(monthStats.mismatch)} مغایرت</span>
                    <span className="rounded-md bg-stone-100 px-2 py-1">روزهای جمعه تعطیل شمرده می‌شوند</span>
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAY_FA.map((w) => <div key={w} className="pb-1 text-center text-[11px] font-medium text-stone-400">{w}</div>)}
                    {cells.map((d, i) => {
                      if (d === null) return <div key={`e${i}`} />
                      const date = `${month}-${pad2(d)}`
                      const isToday = date === today
                      const isFriday = weekdayIdx(date) === 6
                      const dayCounts = byDay[d] || []
                      return (
                        <button
                          key={d}
                          onClick={() => openAdd(date)}
                          className={cn(
                            'min-h-[96px] rounded-lg border p-1 text-right align-top transition-colors',
                            isToday ? 'border-emerald-500 bg-emerald-50' : isFriday ? 'border-stone-200 bg-stone-50' : 'border-stone-200 bg-white hover:border-emerald-400',
                          )}
                        >
                          <div className={cn('mb-1 text-xs font-bold', isToday ? 'text-emerald-700' : isFriday ? 'text-amber-600' : 'text-stone-500')}>{fa(d)}</div>
                          <div className="space-y-0.5">
                            {dayCounts.slice(0, 3).map((c: any) => (
                              <span key={c.id} className={cn('block truncate rounded px-1 text-[9px] leading-4', (STATUS_META[c.status] || STATUS_META.SCHEDULED).dot)}>
                                {c.blockLabel || c.zoneName}{c.staffName ? ` · ${c.staffName}` : ''}
                              </span>
                            ))}
                            {dayCounts.length > 3 && <span className="block px-1 text-[9px] leading-4 text-stone-400">+{fa(dayCounts.length - 3)} مورد دیگر</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {counts.length === 0 && (
                    <p className="py-4 text-center text-sm text-stone-400">هنوز زمان‌بندی‌ای برای {JALALI_MONTHS[(jm || 1) - 1]} ثبت نشده — با «پیشنهاد خودکار» خط‌ها را روی روزهای کاری پخش کنید</p>
                  )}
                </TabsContent>

                {/* ═══════════ تب اجرا ═══════════ */}
                <TabsContent value="execute" className="space-y-3">
                  {!execCount && (
                    <div className="space-y-2">
                      <p className="text-sm text-stone-500">یک شمارش زمان‌بندی‌شده را برای اجرا انتخاب کنید:</p>
                      {scheduledList.length === 0 ? (
                        <p className="py-8 text-center text-sm text-stone-400">شمارش زمان‌بندی‌شده‌ای در انتظار اجرا نیست</p>
                      ) : (
                        <div className="max-h-96 space-y-2 overflow-y-auto">
                          {scheduledList.map((c) => (
                            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white p-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-bold">{c.blockLabel || c.zoneName}</span>
                                  {c.zoneName && c.blockLabel && <Badge variant="secondary">{c.zoneName}</Badge>}
                                </div>
                                <div className="mt-0.5 text-[11px] text-stone-400">
                                  {longFa(c.scheduledFor)}{c.staffName ? ` · شمارشگر: ${c.staffName}` : ' · بدون تخصیص'}{c.note ? ` · ${c.note}` : ''}
                                </div>
                              </div>
                              <Button size="sm" className="gap-1.5" onClick={() => startExec(c)}><I.send size={14} /> شروع شمارش</Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {execCount && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold">{execCount.blockLabel || execCount.zoneName}</span>
                            {execCount.zoneName && execCount.blockLabel && <Badge variant="secondary">{execCount.zoneName}</Badge>}
                            <Badge variant="outline" className="border-teal-200 text-teal-700">زمان‌بندی: {longFa(execCount.scheduledFor)}</Badge>
                          </div>
                          {execCount.staffName && <div className="mt-1 text-[11px] text-stone-400">شمارشگر: {execCount.staffName}</div>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setExecId(null); setResult(null) }}>بازگشت به فهرست</Button>
                      </div>

                      {/* جستجو / اسکن کالا */}
                      <div className="relative">
                        <div className="flex gap-2">
                          <Input
                            value={query}
                            onChange={(e: any) => setQuery(e.target.value)}
                            onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); void onScanEnter() } }}
                            placeholder="جستجوی نام کالا یا اسکن بارکد (Enter)…"
                          />
                          <Button variant="outline" size="icon" aria-label="جستجو" onClick={() => void doSearch(query.trim())}>
                            {searching ? <I.loader size={16} className="animate-spin" /> : <I.search size={16} />}
                          </Button>
                        </div>
                        {results.length > 0 && (
                          <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                            {results.map((p) => (
                              <button key={p.id} onClick={() => void addProduct(p)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-right hover:bg-stone-100">
                                <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                                <span className="text-[10px] text-stone-400">{p.barcode || ''} · {p.unit}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* اقلام شمارش */}
                      {items.length === 0 ? (
                        <p className="py-6 text-center text-sm text-stone-400">هنوز کالایی افزوده نشده — کالا را جستجو یا اسکن کنید و مقدار شمارش‌شده را وارد نمایید</p>
                      ) : (
                        <div className="max-h-96 space-y-1.5 overflow-y-auto">
                          {items.map((it) => {
                            const diff = diffOf(it)
                            const mismatch = diff !== null && diff !== 0
                            return (
                              <div key={it.productId} className={cn('flex flex-wrap items-center gap-2 rounded-lg border p-2', mismatch ? 'border-rose-300 bg-rose-50' : 'border-stone-200 bg-white')}>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-bold">{it.name}</div>
                                  <div className="text-[10px] text-stone-400">{it.barcode || 'بدون بارکد'} · واحد {it.unit}</div>
                                </div>
                                <Badge variant="secondary" className="text-[11px]">سیستم: {it.systemQty === null || it.systemQty === undefined ? '…' : fa(it.systemQty)}</Badge>
                                <Input
                                  className="w-24"
                                  inputMode="numeric"
                                  value={it.countedQty}
                                  onChange={(e: any) => setItems((prev) => prev.map((x) => (x.productId === it.productId ? { ...x, countedQty: e.target.value } : x)))}
                                  placeholder="شمارش"
                                />
                                {diff === null ? (
                                  <span className="w-14 text-center text-[10px] text-stone-400">—</span>
                                ) : mismatch ? (
                                  <span className="w-14 text-center rounded bg-rose-100 px-1 py-0.5 text-[11px] font-bold text-rose-700">{diff > 0 ? `+${fa(diff)}` : `−${fa(Math.abs(diff))}`}</span>
                                ) : (
                                  <span className="w-14 text-center text-emerald-600"><I.check size={14} /></span>
                                )}
                                <Button variant="ghost" size="icon" aria-label="حذف" onClick={() => setItems((prev) => prev.filter((x) => x.productId !== it.productId))}><I.trash size={14} /></Button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-64 grow">
                          <label className="mb-1 block text-xs text-stone-500">یادداشت شمارش (اختیاری)</label>
                          <Input value={execNote} onChange={(e: any) => setExecNote(e.target.value)} placeholder="مثلاً: قفسه پایین خالی بود…" />
                        </div>
                        <Button disabled={saving || !items.some((it) => it.countedQty !== '')} className="gap-1.5" onClick={() => void submitCount()}>
                          {saving ? <I.loader size={16} className="animate-spin" /> : <I.save size={16} />} ثبت شمارش ({fa(items.filter((it) => it.countedQty !== '').length)} قلم)
                        </Button>
                      </div>

                      {/* نتیجه شمارش */}
                      {result && (
                        <div className={cn('rounded-xl border p-3', result.count.status === 'MISMATCH' ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50')}>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={cn('rounded-lg px-2 py-1 text-xs font-bold', result.count.status === 'MISMATCH' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>
                              {result.count.status === 'MISMATCH' ? 'مغایرت' : 'انطباق کامل'}
                            </span>
                            <span className="text-xs text-stone-500">{fa(result.count.itemsCounted || 0)} قلم شمارش شد · {fa(result.count.mismatches || 0)} مغایرت · {longFa(result.count.date || today)}</span>
                          </div>
                          {result.items.length > 0 && (
                            <div className="max-h-60 overflow-y-auto rounded-lg border border-stone-200 bg-white">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-right">کالا</TableHead>
                                    <TableHead className="text-center">سیستم</TableHead>
                                    <TableHead className="text-center">شمارش</TableHead>
                                    <TableHead className="text-center">اختلاف</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {result.items.map((it: any) => {
                                    const d = Number(it.diff || 0)
                                    return (
                                      <TableRow key={it.id} className={d !== 0 ? 'bg-rose-50' : ''}>
                                        <TableCell className="text-xs font-medium">{it.name}{it.product?.name ? '' : ''}</TableCell>
                                        <TableCell className="text-center text-xs">{fa(it.systemQty)}</TableCell>
                                        <TableCell className="text-center text-xs">{fa(it.countedQty)}</TableCell>
                                        <TableCell className="text-center">
                                          {d === 0 ? <span className="text-emerald-600"><I.check size={13} /></span> : <span className="text-[11px] font-bold text-rose-700">{d > 0 ? `+${fa(d)}` : `−${fa(Math.abs(d))}`}</span>}
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                          <p className="mt-2 text-[10px] text-stone-400">تصحیح موجودی در اختیار مدیر است — ثبت شمارش فقط مغایرت را گزارش می‌کند و «آخرین تاریخ شمارش» کالا را به‌روز می‌کند.</p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* ═══════════ تب گزارش ═══════════ */}
                <TabsContent value="report" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { k: 'mismatch', l: 'مغایرت‌دار' },
                        { k: 'done', l: 'انجام‌شده' },
                        { k: 'scheduled', l: 'در انتظار' },
                        { k: 'all', l: 'همه' },
                      ].map((f) => (
                        <button key={f.k} onClick={() => setRepFilter(f.k)} className={cn('rounded-lg border px-3 py-1.5 text-xs transition-colors', repFilter === f.k ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-emerald-400')}>{f.l}</button>
                      ))}
                    </div>
                    <span className="text-[11px] text-stone-400">{fa(reportRows.length)} رکورد</span>
                  </div>

                  {reportRows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-stone-400">رکوردی با این فیلتر نیست</p>
                  ) : (
                    <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                      {reportRows.map((c) => {
                        const st = STATUS_META[c.status] || STATUS_META.SCHEDULED
                        const ex = expanded[c.id]
                        return (
                          <div key={c.id} className="rounded-lg border border-stone-200 bg-white">
                            <button onClick={() => void toggleExpand(c.id)} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-right">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-bold">{c.blockLabel || c.zoneName}</span>
                                  <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', st.chip)}>{st.label}</span>
                                  {(c.mismatches || 0) > 0 && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{fa(c.mismatches)} مغایرت</span>}
                                </div>
                                <div className="mt-0.5 text-[11px] text-stone-400">
                                  {c.date ? `اجرا: ${longFa(c.date)} · ` : ''}زمان‌بندی: {longFa(c.scheduledFor)}{c.staffName ? ` · ${c.staffName}` : ''}
                                </div>
                              </div>
                              <span className="text-xs text-stone-400">{Array.isArray(ex) && ex.length === 0 ? <I.loader size={16} className="animate-spin" /> : <I.chevronDown size={16} />}</span>
                            </button>
                            {ex && ex.length > 0 && (
                              <div className="border-t border-stone-200 p-2">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-right">کالا</TableHead>
                                      <TableHead className="text-center">سیستم</TableHead>
                                      <TableHead className="text-center">شمارش</TableHead>
                                      <TableHead className="text-center">اختلاف</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {ex.map((it: any) => {
                                      const d = Number(it.diff || 0)
                                      return (
                                        <TableRow key={it.id} className={d !== 0 ? 'bg-rose-50' : ''}>
                                          <TableCell className="text-xs font-medium">{it.product?.name || it.name}</TableCell>
                                          <TableCell className="text-center text-xs">{fa(it.systemQty)}</TableCell>
                                          <TableCell className="text-center text-xs">{fa(it.countedQty)}</TableCell>
                                          <TableCell className="text-center text-xs">{d === 0 ? <span className="text-emerald-600">{fa(0)}</span> : <span className="font-bold text-rose-700">{d > 0 ? `+${fa(d)}` : `−${fa(Math.abs(d))}`}</span>}</TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                            {ex && ex.length === 0 && <div className="border-t border-stone-200 p-3 text-center text-xs text-stone-400">قلمی ثبت نشده است</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* آخرین شمارش هر کالا */}
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-bold"><I.history size={15} /> آخرین شمارش یک کالا</div>
                    <div className="flex gap-2">
                      <Input
                        value={lcQuery}
                        onChange={(e: any) => { setLcQuery(e.target.value); setLcProduct(null); setLcResults([]) }}
                        onKeyDown={(e: any) => { if (e.key === 'Enter' && lcResults.length) void pickLastCountProduct(lcResults[0]) }}
                        placeholder="نام یا بارکد کالا…"
                      />
                      <Button variant="outline" onClick={async () => {
                        const q = toEnDigits(lcQuery.trim())
                        if (q.length < 2) return toast.error('حداقل ۲ نویسه وارد کنید')
                        const r = await api(`/api/products/search${qs({ q })}`)
                        if (!r.ok) return toast.error(r.error || 'کالایی یافت نشد')
                        setLcResults((r.data.products || []).slice(0, 6))
                      }} className="gap-1.5"><I.search size={14} /> جستجو</Button>
                    </div>
                    {lcResults.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {lcResults.map((p) => (
                          <button key={p.id} onClick={() => void pickLastCountProduct(p)} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] hover:border-emerald-400">{p.name}</button>
                        ))}
                      </div>
                    )}
                    {lcLoading && <p className="mt-2 text-xs text-stone-400"><I.loader size={13} className="ml-1 inline animate-spin" /> در حال دریافت…</p>}
                    {lcProduct && (
                      <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-2 text-xs">
                        <span className="font-bold">{lcProduct.name}</span>
                        <span className="text-stone-400"> · موجودی سیستم: {fa(lcProduct.stock ?? 0)} {lcProduct.unit}</span>
                        <div className="mt-1 text-stone-600">
                          آخرین شمارش ثبت‌شده: {lcProduct.lastCountDate ? <span className="font-bold text-emerald-700">{longFa(lcProduct.lastCountDate)}</span> : <span className="text-amber-600">هنوز شمارش نشده</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ═══ دیالوگ افزودن زمان‌بندی (خط/ناحیه) ═══ */}
      <Dialog open={addOpen} onOpenChange={(o: boolean) => setAddOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>افزودن زمان‌بندی شمارش</DialogTitle>
            <DialogDescription>یک خط/بخش یا ناحیه را برای یک روز مشخص زمان‌بندی کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-stone-500">تاریخ (میل جلالی)</label>
              <div className="flex gap-2">
                <Input value={form.date} onChange={(e: any) => setForm((f) => ({ ...f, date: e.target.value }))} placeholder="۱۴۰۵-۰۷-۰۱" />
                <Button variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, date: todayJalali() }))}>امروز</Button>
                <Button variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, date: addJalaliDays(todayJalali(), 1) }))}>فردا</Button>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setForm((f) => ({ ...f, mode: 'block' }))} className={cn('rounded-lg border px-3 py-1.5 text-xs', form.mode === 'block' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-200 bg-white text-stone-600')}>خط / بخش</button>
              <button onClick={() => setForm((f) => ({ ...f, mode: 'zone' }))} className={cn('rounded-lg border px-3 py-1.5 text-xs', form.mode === 'zone' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-200 bg-white text-stone-600')}>ناحیه</button>
            </div>
            {form.mode === 'block' ? (
              <div>
                <label className="mb-1 block text-xs text-stone-500">خط / بخش</label>
                <Select value={form.blockLabel || undefined} onValueChange={(v: string) => setForm((f) => ({ ...f, blockLabel: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب خط…" /></SelectTrigger>
                  <SelectContent>
                    {blocks.map((b) => <SelectItem key={b.label} value={b.label}>{b.label}{b.zoneName ? ` · ${b.zoneName}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
                {blocks.length === 0 && <p className="mt-1 text-[10px] text-amber-600">خطی از نقشه فروشگاه دریافت نشد</p>}
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs text-stone-500">ناحیه</label>
                <Select value={form.zoneName || undefined} onValueChange={(v: string) => setForm((f) => ({ ...f, zoneName: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب ناحیه…" /></SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                  </SelectContent>
                </Select>
                {zones.length === 0 && <p className="mt-1 text-[10px] text-amber-600">ناحیه‌ای تعریف نشده است</p>}
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-stone-500">شمارشگر (اختیاری)</label>
              <Select value={form.staffId || undefined} onValueChange={(v: string) => setForm((f) => ({ ...f, staffId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب نفر…" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.honorific ? `${s.honorific} ` : ''}{s.fullName} — {s.title || s.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">یادداشت (اختیاری)</label>
              <Input value={form.note} onChange={(e: any) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="مثلاً: شمارش کامل قفسه بالا" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>انصراف</Button>
            <Button disabled={savingSch} onClick={() => void submitSchedule()} className="gap-1.5">
              {savingSch ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} ثبت زمان‌بندی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ پیشنهاد خودکار (خط/ناحیه) ═══ */}
      <Dialog open={sugOpen} onOpenChange={(o: boolean) => setSugOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.sparkles size={17} /> پیشنهاد خودکار زمان‌بندی</DialogTitle>
            <DialogDescription>
              خط‌های کالادار نقشه فروشگاه، به‌ترتیب، روی روزهای کاری {JALALI_MONTHS[(jm || 1) - 1]} پخش می‌شوند (جمعه‌ها حذف). ردیف‌ها را بازبینی و تک‌تک یا همه با هم ثبت کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-stone-500">شمارشگر پیشنهادی (اختیاری — برای همه ردیف‌ها)</label>
              <Select value={sugStaff || undefined} onValueChange={setSugStaff}>
                <SelectTrigger className="w-full"><SelectValue placeholder="بدون تخصیص…" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.honorific ? `${s.honorific} ` : ''}{s.fullName} — {s.title || s.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {applying.active && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-2">
                <div className="mb-1 text-xs text-teal-700">در حال ثبت {fa(applying.done)} از {fa(applying.total)}…</div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${applying.total ? (applying.done / applying.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}
            <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
              {suggestions.map((s, i) => (
                <div key={`${s.date}-${s.blockLabel}`} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2', s.done ? 'border-emerald-300 bg-emerald-50' : s.exists ? 'border-stone-200 bg-stone-50 opacity-70' : 'border-stone-200 bg-white')}>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold">{s.blockLabel}</div>
                    <div className="text-[10px] text-stone-400">{longFa(s.date)}{s.zoneName ? ` · ${s.zoneName}` : ''}</div>
                  </div>
                  {s.done ? (
                    <span className="text-[11px] font-bold text-emerald-700">ثبت شد ✓</span>
                  ) : s.exists ? (
                    <span className="text-[10px] text-stone-400">از قبل زمان‌بندی شده</span>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={applying.active} onClick={() => void applyRow(s, i)}>ثبت</Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSugOpen(false)}>بستن</Button>
            <Button disabled={applying.active || suggestions.every((s) => s.done || s.exists)} onClick={() => void applyAll()} className="gap-1.5">
              {applying.active ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} اعمال همه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
