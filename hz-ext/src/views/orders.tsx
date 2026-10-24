import { toFaDigits,
  useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn,
  Button, Input, Card, CardContent, CardHeader, CardTitle, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Popover,
  money, fa, toman, toEnDigits, todayJalali, addJalaliDays,
  formatJalaliLong, parseJalali, formatJalali, JALALI_MONTHS, jalaliMonthLength, WEEKDAY_FA, I,
  JalaliDate,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   supply/orders — «سفارش‌گذاری هوشمند» (نسخهٔ جدولی R3)
   جریان اصلی: انتخاب طرف حساب (نخستین کارت) → جست‌وجوی فازی کالا
   (مثل «بیژن») → جدول RTL نتایج (نام، موجودی، آخرین سفارش، قیمت،
   استپر «عدد»، استپر «کارتن») — هر +/− یا چیپ +N همان لحظه
   مستقیم در سبد می‌نشیند (بدون دکمهٔ «افزودن») → ثبت با تاریخ‌گیر
   جلالی و برآورد هزینه. سبد: استپر عدد/کارتن + قیمت قابل اصلاح.
   Tabs: سفارش جدید | سفارش‌ها | تقویم پرداخت
   ───────────────────────────────────────────────────────────── */

const PAY_LABEL: Record<string, string> = { CASH: 'نقدی', CHEQUE: 'چک', POS: 'کارتخوان (POS)' }
const PAY_CLS: Record<string, string> = {
  CASH: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CHEQUE: 'bg-amber-100 text-amber-700 border-amber-200',
  POS: 'bg-teal-50 text-teal-800 border-teal-200',
}
const ORDER_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس', SUBMITTED: 'در انتظار تأیید', APPROVED: 'تأیید‌شده (آماده دریافت)',
  RECEIVING: 'در حال دریافت', RECEIVED: 'دریافت‌شده', VERIFIED: 'راستی‌آزمایی‌شده',
  ACCOUNTED: 'ثبت‌شده در حسابداری', DONE: 'تکمیل‌شده', CANCELLED: 'لغو‌شده',
}
const ORDER_STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-stone-100 text-stone-600 border-stone-200',
  SUBMITTED: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  RECEIVING: 'bg-teal-50 text-teal-800 border-teal-200',
  RECEIVED: 'bg-teal-50 text-teal-800 border-teal-200',
  VERIFIED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ACCOUNTED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  DONE: 'bg-emerald-600 text-white border-emerald-600',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}
const CHEQUE_STATUS_FA: Record<string, string> = {
  PENDING_OWNER: 'در انتظار امضا', SIGNED: 'امضا‌شده', DELIVERED: 'تحویل‌شده',
  CLEARED: 'پرداخت‌شده', REJECTED: 'ردشده', RETURNED: 'برگشتی', BOUNCED: 'برگشت خورد',
}
const PLAN_STATUS_FA: Record<string, string> = { PLANNED: 'برنامه‌ریزی‌شده', CONFIRMED: 'تأیید‌شده', DONE: 'انجام‌شده' }

/* ── helpers ─────────────────────────────────────────────── */
function pad2(n: number) { return String(n).padStart(2, '0') }

function normDate(s: string): string {
  const v = toEnDigits(String(s || '')).trim().replace(/\//g, '-')
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return v
  return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`
}

function numify(raw: string): number {
  return Number(toEnDigits(String(raw)).replace(/[^\d]/g, '')) || 0
}

/** تاریخ شمسی با ارقام فارسی و «/» — هرگز خط تیره */
function faDate(s: string | null | undefined): string {
  return toFaDigits(String(s ?? '')).replace(/-/g, '/')
}

function jShort(v: any): string {
  try {
    const d = new Date(v)
    return isNaN(d.getTime()) ? '' : toFaDigits(formatJalali(d)).replace(/-/g, '/')
  } catch { return '' }
}

/* ── atoms ───────────────────────────────────────────────── */
function PayBadge({ v }: { v?: string }) {
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', PAY_CLS[v ?? ''] || 'bg-stone-100 text-stone-600 border-stone-200')}>{PAY_LABEL[v ?? ''] || v}</span>
}

function OrderStatusBadge({ v }: { v?: string }) {
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', ORDER_STATUS_CLS[v ?? ''] || 'bg-stone-100 text-stone-600 border-stone-200')}>{ORDER_STATUS_FA[v ?? ''] || v}</span>
}

/** موجودی — قرمز بحرانی / کهربایی کم / سبز کافی */
function StockView({ stock, threshold }: { stock: number; threshold: number | null | undefined }) {
  const t = threshold && threshold > 0 ? threshold : 6
  const low = stock <= t
  const mid = !low && stock <= t * 2
  const cls = low ? 'bg-rose-100 text-rose-700 border-rose-200' : mid ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
  const label = low ? 'بحرانی' : mid ? 'کم' : 'کافی'
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold', cls)}>
      <I.package size={12} /> {fa(stock)} — {label}
    </span>
  )
}

/* ── استپر تایپی: دکمه‌های ± + ورود مستقیم عدد (هم فارسی هم انگلیسی) ── */
function NumStepper(props: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  hint?: string
  /** تغییر این عدد = پالس بصری روی مقدار (بازخورد افزودن سریع) */
  bumpKey?: number
  disabled?: boolean
}) {
  const { value, onChange, min = 0, max = 9999, step = 1, hint, bumpKey = 0, disabled } = props
  const [txt, setTxt] = useState<string | null>(null) // null = نمایش مقدار والد
  const [big, setBig] = useState(false)

  /* هر تغییر بیرونی مقدار (دکمه / چیپ / والد) متنِ در حال ویرایش را رها می‌کند */
  useEffect(() => { setTxt(null) }, [value])

  /* پالس بصری: بزرگ‌شدن لحظه‌ای عدد هنگام افزودن سریع */
  useEffect(() => {
    if (!bumpKey) return
    setBig(true)
    const t = setTimeout(() => setBig(false), 320)
    return () => clearTimeout(t)
  }, [bumpKey])

  const shown = txt ?? toFaDigits(String(value))
  const btn = 'flex h-9 w-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 active:scale-95 disabled:opacity-30'
  const commit = (n: number) => onChange(Math.max(min, Math.min(max, n)))
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-1" dir="rtl">
        <button type="button" className={btn} disabled={disabled || value <= min}
          onClick={() => { setTxt(null); commit(value - step) }}
          aria-label="کم کردن" title="کم کردن (یک واحد)">
          <I.minus size={14} />
        </button>
        <input
          dir="ltr"
          inputMode="numeric"
          disabled={disabled}
          aria-label={hint || 'مقدار'}
          className="num h-9 w-16 rounded-md border-0 bg-transparent text-center text-sm font-bold tabular-nums text-stone-700 focus:outline-none"
          style={{ transform: big ? 'scale(1.18)' : 'scale(1)', transition: 'transform 210ms cubic-bezier(.34,1.56,.64,1)' }}
          value={shown}
          onChange={(e: any) => {
            const cleaned = toEnDigits(String(e.target.value ?? '')).replace(/[^\d]/g, '')
            setTxt(toFaDigits(cleaned))
            commit(Number(cleaned) || 0)
          }}
          onBlur={() => setTxt(null)}
        />
        <button type="button" className={btn} disabled={disabled || value >= max}
          onClick={() => { setTxt(null); commit(value + step) }}
          aria-label="زیاد کردن" title="زیاد کردن (یک واحد)">
          <I.plus size={14} />
        </button>
      </div>
      {hint && <span className="text-[9.5px] text-stone-400">{hint}</span>}
    </div>
  )
}

/* ── کمبوباکس تأمین‌کننده: جست‌وجوی زنده + فهرست بازشو در «یک» کنترل ──
   دکمهٔ ماشه = مقدار فعلی؛ پنل = جست‌وجو (نام/کد/تلفن) + گزینهٔ سنجاق‌شدهٔ «بدون تأمین‌کننده»؛
   کیبورد: ↑/↓ جابه‌جایی گزینهٔ فعال (با چرخش)، Enter انتخاب، Esc بستن؛ کلیک بیرون می‌بندد. */
function SupplierCombo(props: { suppliers: any[]; value: string; onChange: (v: string) => void }) {
  const { suppliers, value, onChange } = props
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<any>(null)
  const listRef = useRef<any>(null)

  const norm = (s: any) => toEnDigits(String(s ?? '')).trim().toLowerCase()
  const nq = norm(q)
  const filtered = useMemo(() => {
    if (!nq) return suppliers
    return suppliers.filter((s: any) =>
      norm(s.name).includes(nq) || norm(s.code).includes(nq) || norm(s.phone).includes(nq))
  }, [suppliers, nq])

  /* کل باز شدن: جست‌وجوی تازه + گزینهٔ فعال روی «بدون تأمین‌کننده» */
  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])

  /* بستن با کلیک بیرون (همان الگوی تاریخ‌گیر جلالی) */
  useEffect(() => {
    if (!open) return
    const onDoc = (e: any) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  /* گزینهٔ فعال همیشه در دید بماند */
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector?.(`[data-idx="${active}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const total = filtered.length + 1 // + گزینهٔ سنجاق‌شدهٔ «بدون تأمین‌کننده»
  const sel = suppliers.find((s: any) => s.id === value) ?? null
  const bal = (s: any) =>
    (s?.balance ?? 0) < 0 ? { t: 'بدهی', cls: 'bg-rose-100 text-rose-700' }
      : (s?.balance ?? 0) > 0 ? { t: 'اعتبار', cls: 'bg-emerald-100 text-emerald-700' }
        : { t: 'بدون بدهی', cls: 'bg-stone-100 text-stone-500' }

  function choose(v: string) { onChange(v); setOpen(false) }
  function onKey(e: any) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % total) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + total) % total) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (active <= 0) choose('none')
      else { const s = filtered[active - 1]; if (s) choose(s.id) }
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <Popover open={open} onOpenChange={(v: boolean) => setOpen(v)}>
      <div className="relative" ref={boxRef as any}>
        {/* ماشه: مقدار فعلی یا «بدون تأمین‌کننده» */}
        <Button type="button" variant="outline" role="combobox" aria-expanded={open}
          className="h-11 w-full justify-between"
          onClick={() => setOpen(!open)}>
          {sel ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-bold text-stone-700">{sel.name}</span>
              <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold', bal(sel).cls)}>{bal(sel).t}</span>
            </span>
          ) : value === 'none' ? (
            <span className="text-sm text-stone-600">بدون تأمین‌کنندهٔ مشخص</span>
          ) : (
            <span className="text-sm text-stone-400">بدون تأمین‌کننده <span className="text-[10px]">({fa(suppliers.length)} فعال)</span></span>
          )}
          <I.chevronDown size={16} className={cn('shrink-0 text-stone-400 transition-transform', open && 'rotate-180')} />
        </Button>

        {open && (
          <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-stone-200 bg-white p-2 shadow-xl" dir="rtl">
            <div className="relative mb-2">
              <I.search size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
              <Input autoFocus value={q} onChange={(e: any) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="جست‌وجوی نام / کد / تلفن تأمین‌کننده…" className="h-10 pr-9 text-sm" />
            </div>
            <div ref={listRef} role="listbox" aria-label="فهرست تأمین‌کنندگان" className="max-h-64 overflow-y-auto">
              {/* گزینهٔ سنجاق‌شده: بدون تأمین‌کنندهٔ مشخص */}
              <button type="button" data-idx="0" role="option" aria-selected={value === 'none'}
                onMouseEnter={() => setActive(0)} onClick={() => choose('none')}
                className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-right transition-colors',
                  active === 0 && 'bg-stone-100', value === 'none' && 'bg-emerald-50 font-bold text-emerald-800')}>
                <span className="flex items-center gap-1.5 text-sm text-stone-600">
                  <I.x size={13} className="shrink-0 text-stone-400" />
                  <span>بدون تأمین‌کنندهٔ مشخص</span>
                </span>
                {value === 'none' && <I.check size={14} className="shrink-0 text-emerald-600" />}
              </button>
              {filtered.map((s: any, i: number) => {
                const ai = i + 1
                const isSel = s.id === value
                const b = bal(s)
                return (
                  <button key={s.id} type="button" data-idx={String(ai)} role="option" aria-selected={isSel}
                    onMouseEnter={() => setActive(ai)} onClick={() => choose(s.id)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-right transition-colors',
                      active === ai && 'bg-stone-100', isSel && 'bg-emerald-50')}>
                    <span className="flex min-w-0 flex-col items-start">
                      <span className={cn('truncate text-sm', isSel ? 'font-bold text-emerald-800' : 'font-medium text-stone-700')}>{s.name}</span>
                      <span className="text-[10px] text-stone-400" dir="rtl">
                        {s.code ? fa(s.code) : ''}{s.phone ? ` · ${fa(s.phone)}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', b.cls)}>{b.t}</span>
                      {isSel && <I.check size={14} className="text-emerald-600" />}
                    </span>
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-stone-400">تأمین‌کننده‌ای با «{fa(q)}» یافت نشد</p>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-stone-200 px-2 pt-1.5 text-[10px] text-stone-400">
              <span>{fa(filtered.length)} از {fa(suppliers.length)} فعال</span>
              <span dir="rtl">↑↓ حرکت · Enter انتخاب · Esc بستن</span>
            </div>
          </div>
        )}
      </div>
    </Popover>
  )
}

/* ═════════ دیالوگ گردش کالا ═════════ */
function CirculationDialog({ open, onOpenChange, productId }: { open: boolean; onOpenChange: (o: boolean) => void; productId: string | null }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (!open || !productId) { setData(null); return }
    setLoading(true)
    api(`/api/products/${productId}/circulation`)
      .then((r: any) => { if (r.ok) setData(r.data); else { toast.error(r.error || 'گردش کالا دریافت نشد'); setData(null) } })
      .finally(() => setLoading(false))
  }, [open, productId])

  const s = data?.summary
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <I.barChart size={18} /> گردش کالا — {data?.product?.name ?? '…'}
          </DialogTitle>
          <DialogDescription>خرید، انبار و قیمت‌گذاری این کالا در یک نگاه — برای تصمیم سفارش</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-stone-500"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال دریافت گردش کالا…</p>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-stone-400">داده‌ای یافت نشد</p>
        ) : (
          <div className="max-h-96 space-y-4 overflow-y-auto">
            {/* خلاصه */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: 'موجودی فعلی', value: `${fa(s.stock)} ${data.product.unit ?? ''}`, cls: s.stock <= (s.lowStockThreshold ?? 6) ? 'text-rose-700' : 'text-emerald-700' },
                { label: 'آخرین قیمت خرید', value: `${money(data.product.lastBuyPrice)} ریال` },
                { label: 'قیمت فروش', value: `${money(data.product.sellPrice)} ریال` },
                { label: 'فروش ماه اخیر', value: `${fa(s.monthlySold ?? 0)} عدد` },
                { label: 'دفعات خرید', value: `${fa(s.buyCount)} سفارش` },
                { label: 'زمان تأمین', value: `${fa(data.product.leadTimeDays ?? 1)} روز` },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-stone-200 bg-stone-50 p-2">
                  <div className="text-[11px] text-stone-500">{c.label}</div>
                  <div className={cn('text-sm font-bold', c.cls ?? 'text-stone-700')}>{c.value}</div>
                </div>
              ))}
            </div>

            {s.avgBuyPrice != null && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-2.5 text-[11px] text-teal-800">
                بازهٔ بهای واحد در سودسنج: از {money(s.minBuyPrice)} تا {money(s.maxBuyPrice)} ریال (میانگین {money(s.avgBuyPrice)})
              </div>
            )}

            {/* تأمین‌کنندگان */}
            {Array.isArray(data.suppliers) && data.suppliers.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-bold text-stone-600">تأمین‌کنندگان این کالا</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.suppliers.map((sp: any, i: number) => {
                    const min = Math.min(...data.suppliers.map((x: any) => x.unitPrice ?? Infinity))
                    return (
                      <span key={i} className={cn('rounded-lg border px-2.5 py-1 text-[11px]',
                        sp.isPrimary ? 'border-teal-200 bg-teal-50 font-bold text-teal-800'
                        : (sp.unitPrice ?? 0) === min && data.suppliers.length > 1 ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-800'
                        : 'border-stone-200 bg-white text-stone-600')}>
                        {sp.supplierName} · <span dir="ltr">{money(sp.unitPrice)}</span> ریال{sp.perCarton ? ` · کارتن ×${fa(sp.perCarton)}` : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* خریدها */}
            <div>
              <div className="mb-1.5 text-xs font-bold text-stone-600">سفارش‌ها و دریافت‌ها</div>
              {data.buys.length === 0 ? (
                <p className="rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-400">سفارشی برای این کالا ثبت نشده</p>
              ) : (
                <div className="space-y-1.5">
                  {data.buys.slice(0, 8).map((b: any, i: number) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-stone-200 p-2 text-[11px]">
                      <span className="font-mono font-bold" dir="ltr">{b.orderCode}</span>
                      <span className="text-stone-500">{b.supplierName || '—'}</span>
                      <span dir="ltr" className="text-stone-500">{jShort(b.orderedAt)}</span>
                      <span className="font-bold text-stone-700">
                        {fa(b.qty)} عدد{b.cartonQty ? ` (${fa(b.cartonQty)} کارتن)` : ''}
                      </span>
                      <span dir="ltr" className="font-bold text-stone-700">{money(b.unitBuyPrice)}</span>
                      <span className={cn('rounded px-1.5 py-0.5',
                        b.status === 'DONE' ? 'bg-emerald-100 text-emerald-700'
                        : b.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700')}>
                        {ORDER_STATUS_FA[b.status] ?? b.status}
                      </span>
                      {b.deliveryDate && <span dir="ltr" className="text-stone-400">تحویل: {faDate(b.deliveryDate)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* سودسنج */}
            <div>
              <div className="mb-1.5 text-xs font-bold text-stone-600">کنترل‌های سودسنج (بهای واحد ← قیمت چاپی)</div>
              {data.margins.length === 0 ? (
                <p className="rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-400">کنترل قیمتی ثبت نشده</p>
              ) : (
                <div className="space-y-1.5">
                  {data.margins.slice(0, 6).map((m: any, i: number) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-stone-200 p-2 text-[11px]">
                      <span dir="ltr" className="text-stone-500">{m.dateJalali ? fa(m.dateJalali) : jShort(m.createdAt)}</span>
                      <span>{fa(m.quantity)} عدد</span>
                      <span dir="ltr">بهای واحد: <b>{money(m.unitCost)}</b></span>
                      <span dir="ltr">چاپی: <b>{money(m.printedPrice)}</b></span>
                      {m.marginPct != null && (
                        <span className={cn('rounded px-1.5 py-0.5 font-bold',
                          m.marginPct < 12 ? 'bg-rose-100 text-rose-700' : m.marginPct < 21 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
                          {fa(Math.round(m.marginPct))}٪
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* انبارگردانی */}
            <div>
              <div className="mb-1.5 text-xs font-bold text-stone-600">انبارگردانی‌ها</div>
              {data.counts.length === 0 ? (
                <p className="rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-400">انبارگردانی ثبت نشده</p>
              ) : (
                <div className="space-y-1.5">
                  {data.counts.slice(0, 6).map((c: any, i: number) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-stone-200 p-2 text-[11px]">
                      <span dir="ltr" className="text-stone-500">{c.dateJalali ? fa(c.dateJalali) : '—'}</span>
                      <span>سیستم: <b>{fa(c.systemQty)}</b></span>
                      <span>شمارش: <b>{fa(c.countedQty)}</b></span>
                      <span className={cn('rounded px-1.5 py-0.5 font-bold',
                        c.diff === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                        {c.diff === 0 ? 'بدون مغایرت' : `${c.diff > 0 ? '+' : '−'}${fa(Math.abs(c.diff))}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ═════════ نمای اصلی ═════════ */
export default function OrdersView() {
  const { user, refreshBadges } = useShell()

  const [tab, setTab] = useState('new')
  const [loading, setLoading] = useState(true)

  /* جست‌وجوی فازی کالا */
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [circOf, setCircOf] = useState<string | null>(null)
  const [cartonAsk, setCartonAsk] = useState<any | null>(null) // {product, size, cartons} — درخواست اندازهٔ کارتن
  const searchTimer = useRef<any>(null)

  /* R5-F: حذف rowAmts — سطر جست‌وجو مستقیم به سبد می‌نویسد؛ سبد تنها منبع حقیقت است */
  /* اندازهٔ کارتن آموخته‌شده در همین نشست (پس از دیالوگ «اندازهٔ کارتن») */
  const [upcKnown, setUpcKnown] = useState<Record<string, number>>({})
  /* پالس بصری «افزودن سریع» (+N عدد / +۱ کارتن / +N تایی سبد) — کلید → شمارنده */
  const [bump, setBump] = useState<Record<string, number>>({})

  /* سبد خرید */
  const [cart, setCart] = useState<any[]>([])
  const [deliveryDate, setDeliveryDate] = useState(addJalaliDays(todayJalali(), 1))
  const [payMethod, setPayMethod] = useState('CASH')
  const [note, setNote] = useState('')
  const [defQty, setDefQty] = useState(6)
  const [defCarton, setDefCarton] = useState(1)
  const [busy, setBusy] = useState(false)

  /* تأمین‌کنندهٔ سفارش (اختیاری — برای یکجاسازی پرداخت) */
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState('')

  /* فهرست سفارش‌ها */
  const [list, setList] = useState<any[] | null>(null)
  const [counts, setCounts] = useState<any>(null)
  const [statusF, setStatusF] = useState('open')
  const [listQ, setListQ] = useState('')

  /* دیالوگ‌ها */
  const [cancelDlg, setCancelDlg] = useState<any>(null)
  const [receiveDlg, setReceiveDlg] = useState<any>(null)

  /* تقویم پرداخت */
  const t0 = todayJalali()
  const [cal, setCal] = useState({ jy: +t0.slice(0, 4), jm: +t0.slice(5, 7) })
  const [plans, setPlans] = useState<any[]>([])
  const [cheques, setCheques] = useState<any[]>([])
  const [calErr, setCalErr] = useState('')
  const [calLoading, setCalLoading] = useState(false)
  const [selDay, setSelDay] = useState<string | null>(null)

  useEffect(() => {
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function init() {
    await Promise.all([loadSuppliers(''), loadDefaults(), loadList(), loadCheques(), loadCalendar(cal.jy, cal.jm)])
    setLoading(false)
  }

  /* ── بارگذاری‌ها ── */
  async function loadSuppliers(tq: string) {
    // R7: همهٔ تأمین‌کنندگان فعال یکجا (نه فقط ۱۰۰تای اول) — طرف‌حساب‌هایی مثل «بانی چاو» دیگر گم نمی‌شوند
    const r = await api('/api/suppliers' + qs({ pageSize: 2400, sort: 'name', status: 'فعال', q: tq || undefined }))
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت تأمین‌کنندگان'); return }
    setSuppliers((r.data?.items ?? []).filter((s: any) => s.status === 'فعال'))
  }

  async function loadDefaults() {
    const r = await api('/api/defaults')
    if (!r.ok) return
    const d = r.data?.defaults ?? {}
    const nq = Number(d['order.qty'] ?? d['orderQty'] ?? d['defaults:order.qty'])
    const nc = Number(d['order.carton'] ?? d['orderCarton'] ?? d['defaults:order.carton'])
    if (nq > 0) setDefQty(nq)
    if (nc >= 0) setDefCarton(nc)
  }

  async function loadList(status?: string) {
    const st = status ?? statusF
    const r = await api('/api/orders' + qs({ status: st === 'all' ? '' : st, q: listQ || undefined, pageSize: 50 }))
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت سفارش‌ها'); setList([]); return }
    setList(r.data?.items ?? [])
    setCounts(r.data?.counts ?? null)
  }

  async function loadCheques() {
    const r = await api('/api/cheques')
    if (r.ok) setCheques(r.data?.items ?? [])
  }

  async function loadCalendar(jy: number, jm: number) {
    setCalLoading(true)
    const len = jalaliMonthLength(jy, jm)
    const r = await api('/api/payment-plans' + qs({ from: `${jy}-${pad2(jm)}-01`, to: `${jy}-${pad2(jm)}-${pad2(len)}` }))
    if (r.ok) { setPlans(r.data?.plans ?? []); setCalErr('') }
    else { setPlans([]); setCalErr(r.error || 'برنامه‌های پرداخت دریافت نشد') }
    setCalLoading(false)
  }

  /* ── جست‌وجوی فازی (با تأخیر ۳۰۰ms) ── */
  function onQuery(v: string) {
    setQ(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const t = toEnDigits(v).trim()
    if (t.length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    searchTimer.current = setTimeout(() => void doSearch(t), 300)
  }

  async function doSearch(t: string) {
    const r = await api('/api/products/search' + qs({ q: t, full: '1', limit: 20 }))
    setSearching(false)
    if (!r.ok) { toast.error(r.error || 'خطا در جست‌وجو'); setResults([]); return }
    setResults(r.data?.products ?? [])
  }

  /* ── قیمت/کارتن بهینه + اندازهٔ کارتن مؤثر ── */
  function bestPrice(p: any): number {
    const prim = (p.suppliers ?? []).find((s: any) => s.isPrimary && s.status === 'فعال')
    const cheap = (p.suppliers ?? []).filter((s: any) => s.status === 'فعال').sort((a: any, b: any) => (a.unitPrice ?? 0) - (b.unitPrice ?? 0))[0]
    return Number(prim?.unitPrice ?? cheap?.unitPrice ?? p.lastBuyPrice ?? 0) || 0
  }

  function bestCarton(p: any): number {
    const withC = (p.suppliers ?? []).find((s: any) => (s.perCarton ?? 0) > 0)
    return Number(withC?.perCarton ?? p.unitsPerCarton ?? 0) || 0
  }

  /** اندازهٔ کارتن مؤثر: اندازهٔ آموخته‌شدهٔ همین نشست ← بهترین مقدار کالا */
  function rowUpc(p: any): number {
    return Number(upcKnown[p.id] ?? bestCarton(p)) || 0
  }

  /* ═══ R5-F: افزودن مستقیم — سطر جست‌وجو همان کنترل سبد است ═══
     هر تغییر استپر/چیپ بلافاصله در سطر سبد می‌نشیند؛ سطر ۰-صفر خودکار حذف می‌شود. */
  function applyRow(p: any, next: { units?: number; cartons?: number; upc?: number }) {
    setCart((c) => {
      const idx = c.findIndex((l) => l.productId === p.id)
      const units = Math.max(0, Math.round(Number(next.units ?? 0) || 0))
      const cartons = Math.max(0, Math.round(Number(next.cartons ?? 0) || 0))
      if (idx === -1) {
        if (units < 1 && cartons < 1) return c // هیچ سطری برای ساخت نیست
        const unitPrice = bestPrice(p)
        const upc = Number(next.upc ?? rowUpc(p)) || 0
        return [...c, {
          productId: p.id,
          name: p.name,
          barcode: p.barcode ?? null,
          unit: p.unit ?? 'عدد',
          unitPrice,
          upc,
          sellPrice: Number(p.sellPrice ?? 0) || 0,
          stock: Number(p.stock ?? 0),
          lowThreshold: p.lowStockThreshold ?? null,
          qty: units,
          cartonQty: cartons,
        }]
      }
      const line = c[idx]
      const nq = next.units !== undefined ? units : Number(line.qty ?? 0)
      const nc = next.cartons !== undefined ? cartons : Number(line.cartonQty ?? 0)
      if (nq < 1 && nc < 1) return c.filter((_, i) => i !== idx) // سطر صفر-صفر = حذف از سبد
      const patch: any = {}
      if (next.units !== undefined) patch.qty = nq
      if (next.cartons !== undefined) patch.cartonQty = nc
      if (next.upc !== undefined) patch.upc = next.upc
      return c.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    })
  }

  /** استپر «عدد» سطر — مقدار فعلی را از سبد می‌خواند و تغییر را همان‌جا می‌نویسد */
  function rowUnitsChange(p: any, v: number) {
    applyRow(p, { units: Math.max(0, Math.round(v || 0)) })
  }

  /** استپر «کارتن» سطر — افزایش با اندازهٔ ناشناس ⇒ دیالوگ اندازهٔ کارتن */
  function rowCartonChange(p: any, v: number) {
    const line = cart.find((l) => l.productId === p.id)
    const cur = Number(line?.cartonQty ?? 0)
    const n = Math.max(0, Math.round(v || 0))
    if (n > cur && rowUpc(p) <= 0) {
      setCartonAsk({ product: p, size: '12', cartons: Math.max(n, 1) })
      return
    }
    applyRow(p, { cartons: n, upc: rowUpc(p) || undefined })
  }

  /* ── افزودن سریع (چیپ‌های +N) — با پالس بصری، بدون توست ── */
  function quickAddUnits(p: any, n: number) {
    const line = cart.find((l) => l.productId === p.id)
    const cur = Number(line?.qty ?? 0)
    applyRow(p, { units: cur + Math.max(1, Math.round(n)) })
    setBump((m) => ({ ...m, [`u:${p.id}`]: (m[`u:${p.id}`] || 0) + 1 }))
  }

  function quickAddCarton(p: any) {
    const line = cart.find((l) => l.productId === p.id)
    const cur = Number(line?.cartonQty ?? 0)
    const add = Math.max(1, Math.round(defCarton || 1)) // پیش‌فرض کارتن از تنظیمات (order.carton)
    const next = cur + add
    if (rowUpc(p) <= 0) {
      setCartonAsk({ product: p, size: '12', cartons: next })
      return
    }
    applyRow(p, { cartons: next, upc: rowUpc(p) })
    setBump((m) => ({ ...m, [`b:${p.id}`]: (m[`b:${p.id}`] || 0) + 1 }))
  }

  function confirmCartonAsk() {
    if (!cartonAsk) return
    const size = numify(cartonAsk.size)
    if (size < 1) { toast.error('تعداد در هر کارتن را وارد کنید'); return }
    const p = cartonAsk.product
    const cartons = Math.max(1, Math.round(Number(cartonAsk.cartons ?? 1) || 1))
    setUpcKnown((m) => ({ ...m, [p.id]: size }))
    applyRow(p, { cartons, upc: size })
    setBump((m) => ({ ...m, [`b:${p.id}`]: (m[`b:${p.id}`] || 0) + 1 }))
    setCartonAsk(null)
  }

  function editLine(idx: number, field: string, raw: string) {
    const n = numify(raw)
    setCart((c) => c.map((l, i) => (i === idx ? { ...l, [field]: n } : l)))
  }

  function removeLine(idx: number) {
    setCart((c) => c.filter((_, i) => i !== idx))
  }

  const lineCost = (l: any) =>
    (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) +
    (Number(l.cartonQty) || 0) * (Number(l.upc) || 0) * (Number(l.unitPrice) || 0)

  const lineUnits = (l: any) => (Number(l.qty) || 0) + (Number(l.cartonQty) || 0) * (Number(l.upc) || 0)

  const total = useMemo(() => cart.reduce((s, l) => s + lineCost(l), 0), [cart])

  /* ── ثبت سفارش ── */
  async function submitOrder() {
    if (!cart.length) return toast.error('سبد خرید خالی است')
    const bad = cart.find((l) => (l.qty || 0) < 1 && (l.cartonQty || 0) < 1)
    if (bad) return toast.error(`تعداد «${bad.name}» را مشخص کنید`)
    const dd = normDate(deliveryDate)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dd)) return toast.error('تاریخ تحویل را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

    const sup = suppliers.find((s) => s.id === supplierId)
    const items = cart.map((l) => ({
      productId: l.productId,
      name: l.name,
      barcode: l.barcode,
      qty: lineUnits(l),
      unitBuyPrice: l.unitPrice,
      printedPrice: l.sellPrice || l.unitPrice,
      cartonQty: l.cartonQty,
      unitsPerCarton: l.upc,
      lineTotal: lineCost(l),
    }))
    const itemsTotal = items.reduce((s: number, it: any) => s + it.qty * it.unitBuyPrice, 0)
    const itemsSummary = cart
      .map((l) => `${l.name}: ${fa(l.qty || 0)} عدد${l.cartonQty ? ` + ${fa(l.cartonQty)} کارتن ×${fa(l.upc || 0)}` : ''}`)
      .join('؛ ')

    setBusy(true)
    const r = await api('/api/orders', {
      method: 'POST',
      body: {
        supplierId: supplierId && supplierId !== 'none' ? supplierId : null,
        deliveryDate: dd,
        payMethod,
        note: [itemsSummary && `اقلام: ${itemsSummary}`, note.trim() && `یادداشت: ${note.trim()}`].filter(Boolean).join(' — ') || null,
        items,
        submit: true,
      },
    })
    if (!r.ok) { setBusy(false); return toast.error(r.error || 'ثبت سفارش انجام نشد') }
    const code = r.data?.code ?? ''
    if (payMethod !== 'CASH') {
      const pp = await api('/api/payment-plans', {
        method: 'POST',
        body: { date: dd, kind: payMethod, amount: itemsTotal, orderCode: code || null, supplierName: sup?.name ?? null },
      })
      if (!pp.ok) toast.warning(`سفارش ثبت شد اما برنامه پرداخت ثبت نشد: ${pp.error || ''}`)
      else toast.success(`سفارش ${code} ثبت شد — برنامه پرداخت (${PAY_LABEL[payMethod]}) برای ${faDate(dd)} در تقویم ثبت شد`)
    } else {
      toast.success(`سفارش ${code} ثبت شد — جمع تقریبی ${money(itemsTotal)} ریال`)
    }
    setCart([])
    setNote('')
    setBusy(false)
    refreshBadges?.()
    void loadList()
    void loadCalendar(cal.jy, cal.jm)
    setTab('list')
  }

  /* ── اکشن‌های سفارش ── */
  async function orderAction(o: any, action: string, extra?: Record<string, any>) {
    const r = await api(`/api/orders/${o.id}`, { method: 'PATCH', body: { action, ...extra } })
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return }
    const d = r.data ?? {}
    toast.success(`${o.code}: ${ORDER_STATUS_FA[d.status ?? o.status] ?? 'انجام شد'}`)
    setList((prev) => (prev ?? []).map((x) => (x.id === o.id ? { ...x, ...d } : x)))
    refreshBadges?.()
    void loadCalendar(cal.jy, cal.jm)
  }

  async function openReceive(o: any) {
    setReceiveDlg({ order: o, items: null })
    const r = await api(`/api/orders/${o.id}`)
    if (!r.ok) { toast.error(r.error || 'جزئیات سفارش دریافت نشد'); setReceiveDlg(null); return }
    setReceiveDlg({
      order: o,
      items: (r.data?.items ?? []).map((it: any) => ({ id: it.id, name: it.name, qty: it.qty, receivedQty: it.qty })),
    })
  }

  async function confirmReceive() {
    if (!receiveDlg?.order || !receiveDlg?.items) return
    const r = await api(`/api/orders/${receiveDlg.order.id}`, {
      method: 'PATCH',
      body: { action: 'receive', items: receiveDlg.items.map((i: any) => ({ id: i.id, receivedQty: i.receivedQty, status: 'RECEIVED' })) },
    })
    if (!r.ok) { toast.error(r.error || 'ثبت دریافت انجام نشد'); return }
    const mm = (r.data as any)?.mismatch ?? 0
    toast.success(mm ? `دریافت ثبت شد — ${fa(mm)} قلم مغایرت داشت` : 'دریافت ثبت شد — همه اقلام کامل دریافت شد')
    const oid = receiveDlg.order.id
    setReceiveDlg(null)
    setList((prev) => (prev ?? []).map((x) => (x.id === oid ? { ...x, ...(r.data ?? {}) } : x)))
  }

  async function planAction(p: any, status: string) {
    const r = await api(`/api/payment-plans/${p.id}`, { method: 'PATCH', body: { status } })
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return }
    setPlans((prev) => prev.map((x) => (x.id === p.id ? (r.data?.plan ?? { ...x, status }) : x)))
    toast.success(status === 'CONFIRMED' ? 'برنامه پرداخت تأیید شد' : 'پرداخت «انجام‌شده» علامت خورد')
  }

  /* ── تقویم ── */
  function shiftMonth(delta: number) {
    let { jy, jm } = cal
    jm += delta
    if (jm < 1) { jm = 12; jy -= 1 } else if (jm > 12) { jm = 1; jy += 1 }
    setCal({ jy, jm })
    setSelDay(null)
    void loadCalendar(jy, jm)
  }

  /* ── داده‌های مشتق ── */
  const monthLen = jalaliMonthLength(cal.jy, cal.jm)
  const firstCol = useMemo(() => {
    const d = parseJalali(`${cal.jy}-${pad2(cal.jm)}-01`)
    return d ? (d.getDay() + 1) % 7 : 0
  }, [cal])
  const cells: any[] = useMemo(() => {
    const out: any[] = []
    for (let i = 0; i < firstCol; i++) out.push(null)
    for (let d = 1; d <= monthLen; d++) {
      const ds = `${cal.jy}-${pad2(cal.jm)}-${pad2(d)}`
      const dayPlans = plans.filter((p) => p.date === ds)
      const dayCheques = cheques.filter((c) => c.dueDate === ds && c.selfIssued === true)
      out.push({ d, ds, dayPlans, dayCheques })
    }
    return out
  }, [cal, plans, cheques, monthLen, firstCol])

  const dayPlans = selDay ? plans.filter((p) => p.date === selDay) : []
  const dayCheques = selDay ? cheques.filter((c) => c.dueDate === selDay && c.selfIssued === true) : []
  const monthTotal = useMemo(() => plans.reduce((s, p) => s + (p.amount || 0), 0), [plans])
  const today = todayJalali()

  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت داده‌های سفارش‌گذاری…
      </CardContent></Card>
    )
  }

  const supSelected = suppliers.find((s) => s.id === supplierId) ?? null

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v: string) => setTab(v)} dir="rtl">
        <TabsList>
          <TabsTrigger value="new">سفارش جدید</TabsTrigger>
          <TabsTrigger value="list">سفارش‌ها</TabsTrigger>
          <TabsTrigger value="calendar">تقویم پرداخت</TabsTrigger>
        </TabsList>

        {/* ══ سفارش جدید — جدولی + طرف حساب ══ */}
        <TabsContent value="new" className="mt-4 space-y-4">

          {/* طرف حساب (تأمین‌کننده) — نخستین کارت سربرگ سفارش */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.handshake size={18} /> طرف حساب (تأمین‌کننده)
                {supplierId && supplierId !== 'none' && <Badge variant="secondary" className="text-[11px]">انتخاب‌شده</Badge>}
              </CardTitle>
              <p className="text-xs leading-5 text-stone-500">
                تأمین‌کنندهٔ این سفارش را همین ابتدا مشخص کنید (اختیاری) — در کادر زیر همان‌جا تایپ کنید (نام / کد / تلفن) و از فهرست بازشو انتخاب کنید؛ کلیدهای ↑↓ و Enter هم کار می‌کند.
              </p>
              <SupplierCombo suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
            </CardHeader>
            {supplierId && supplierId !== 'none' && supSelected ? (
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-xs">
                  <span className="font-bold text-stone-700">{supSelected.name}</span>
                  <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold',
                    (supSelected.balance ?? 0) < 0 ? 'bg-rose-100 text-rose-700' : (supSelected.balance ?? 0) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600')}>
                    {(supSelected.balance ?? 0) < 0 ? `بدهی: ${money(Math.abs(supSelected.balance))} ریال` : (supSelected.balance ?? 0) > 0 ? `اعتبار: ${money(supSelected.balance)} ریال` : 'بدون بدهی'}
                  </span>
                  {supSelected.phone && <span dir="ltr" className="text-stone-500">{toFaDigits(supSelected.phone)}</span>}
                  <span className="text-[11px] text-stone-500">تمام اقلام این سبد روی همین طرف حساب ثبت می‌شود</span>
                </div>
              </CardContent>
            ) : supplierId === 'none' ? (
              <CardContent className="pt-0">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-500">
                  این سفارش بدون طرف حساب مشخص ثبت می‌شود — اگر فاکتور خرید دارید، بهتر است تأمین‌کننده را انتخاب کنید.
                </div>
              </CardContent>
            ) : null}
          </Card>

          {/* جست‌وجوی سریع کالا */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.search size={18} /> جست‌وجوی سریع کالا
              </CardTitle>
              <p className="text-xs leading-5 text-stone-500">
                اسم کالا را بنویسید (مثلاً «بیژن») — موجودی، آخرین سفارش و قیمت خرید در جدول زیر نمایش داده می‌شود؛ با +/− یا چیپ‌های +N، همان ردیف مستقیم در سبد می‌نشیند (دکمهٔ جداگانه‌ای لازم نیست).
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <I.search size={17} className="absolute top-1/2 right-3 -translate-y-1/2 text-stone-400" />
                  <Input
                    autoFocus
                    value={q}
                    onChange={(e: any) => onQuery(e.target.value)}
                    placeholder="نام کالا — مثلاً: بیژن، شیر، چیپس…"
                    className="h-12 pr-10 text-base"
                  />
                  {searching && <I.loader size={16} className="absolute top-1/2 left-3 -translate-y-1/2 animate-spin text-stone-400" />}
                </div>
                {q && (
                  <Button variant="ghost" className="text-rose-600" onClick={() => { setQ(''); setResults(null) }}>
                    <I.x size={16} />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {results === null ? (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-center">
                  <I.search className="mx-auto mb-2 text-stone-400" size={26} />
                  <p className="text-sm font-medium text-stone-500">جست‌وجو کنید تا کالاها در جدول با موجودی و سابقهٔ سفارش نمایش داده شوند</p>
                  <p className="mt-1 text-[11px] text-stone-400">حداقل ۲ حرف بنویسید — نتیجه‌ها همین‌جا، بدون رفت‌وبرگشت ظاهر می‌شوند</p>
                </div>
              ) : results.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">
                  کالایی با «{fa(q)}» یافت نشد — املای نام را بررسی کنید یا از فهرست کامل کالاها استفاده کنید
                </p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
                    <span>{fa(results.length)} کالا — هر +/− یا چیپ +N همان لحظه در سبد اعمال می‌شود</span>
                    <span>کلیک روی نام کالا = گردش کالا</span>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto overflow-x-auto rounded-xl border border-stone-200 bg-white">
<table dir="rtl" className="w-full min-w-[920px] text-sm">
                      <thead>
                        <tr>
                          <th className="sticky top-0 z-10 h-10 whitespace-nowrap border-b bg-white px-2 text-right align-middle text-[11px] font-bold text-stone-500">نام کالا</th>
                          <th className="sticky top-0 z-10 h-10 whitespace-nowrap border-b bg-white px-2 text-center align-middle text-[11px] font-bold text-stone-500">کد / بارکد</th>
                          <th className="sticky top-0 z-10 h-10 whitespace-nowrap border-b bg-white px-2 text-center align-middle text-[11px] font-bold text-stone-500">واحد</th>
                          <th className="sticky top-0 z-10 h-10 whitespace-nowrap border-b bg-white px-2 text-center align-middle text-[11px] font-bold text-stone-500">موجودی</th>
                          <th className="sticky top-0 z-10 h-10 whitespace-nowrap border-b bg-white px-2 text-center align-middle text-[11px] font-bold text-stone-500">قیمت واحد</th>
                          <th className="sticky top-0 z-10 h-10 whitespace-nowrap border-b bg-white px-2 text-center align-middle text-[11px] font-bold text-stone-500">تعداد (عدد)</th>
                          <th className="sticky top-0 z-10 h-10 whitespace-nowrap border-b bg-white px-2 text-center align-middle text-[11px] font-bold text-stone-500">کارتن</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((p: any) => {
                          /* R5-F: سبد تنها منبع حقیقت — مقدارهای این سطر از سطر سبد خوانده می‌شود */
                          const line = cart.find((l) => l.productId === p.id) ?? null
                          const inCart = !!line
                          const amtUnits = Number(line?.qty ?? 0)
                          const amtCartons = Number(line?.cartonQty ?? 0)
                          const price = bestPrice(p)
                          const upc = rowUpc(p) || Number(line?.upc ?? 0) || 0
                          const last = p.lastOrder
                          const hasSup = (p.suppliers ?? []).some((s: any) => s.status === 'فعال' && s.unitPrice != null)
                          return (
                            <tr key={p.id} className={cn('border-b transition-colors even:bg-[#FBF9F3] last:border-b-0', inCart ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-emerald-50/50')}>
                              {/* ۱. نام کالا — نخستین ستون (در RTL = راست‌ترین) — کلیک = گردش کالا */}
                              <td className="p-2 align-middle">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button type="button" className="flex items-start gap-1 text-right text-sm font-bold text-stone-700 transition-colors hover:text-emerald-800" onClick={() => setCircOf(p.id)} title="نمایش گردش کالا">
                                    <span>{p.name}</span>
                                    <I.barChart size={12} className="mt-1 shrink-0 text-stone-400" />
                                  </button>
                                  {inCart && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                      <I.check size={11} /> در سبد
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-stone-400">
                                  {p.mainGroup && <span>{p.mainGroup}</span>}
                                  {(p.monthlySold ?? 0) > 0 && <span>· فروش ماه: {fa(p.monthlySold)}</span>}
                                </div>
                                {last ? (
                                  <div className="mt-0.5 whitespace-nowrap text-[11px] leading-4 text-stone-500">
                                    آخرین سفارش: <span dir="ltr">{jShort(last.orderedAt)}</span> · {fa(last.qty)} عدد{last.cartonQty ? ` + ${fa(last.cartonQty)} کارتن` : ''}
                                    <span className={last.receivedAt ? 'text-emerald-700' : 'text-amber-700'}>
                                      {' '}— {last.receivedAt ? `دریافت: ${jShort(last.receivedAt)}` : last.deliveryDate ? `تحویل: ${faDate(last.deliveryDate)}` : 'در انتظار دریافت'}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="mt-0.5 text-[11px] text-stone-400">سفارش قبلی ندارد</div>
                                )}
                                {(p.suppliers ?? []).length > 1 && (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                    <span className="text-[10px] text-stone-400">تأمین‌کنندگان:</span>
                                    {p.suppliers.map((s: any, i: number) => {
                                      const min = Math.min(...p.suppliers.map((x: any) => x.unitPrice ?? Infinity))
                                      return (
                                        <span key={i} className={cn('rounded-md border px-1.5 py-0.5 text-[10px]',
                                          (s.unitPrice ?? 0) === min ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-800' : 'border-stone-200 bg-white text-stone-500')}>
                                          {s.supplierName} · <span dir="ltr">{money(s.unitPrice)}</span>
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}
                              </td>
                              {/* ۲. کد / بارکد — ارقام با dir=ltr */}
                              <td className="p-2 text-center align-middle">
                                <div dir="ltr" className="whitespace-nowrap font-mono text-[12px] font-bold text-stone-700">
                                  {p.barcode || p.code ? toFaDigits(p.barcode ?? p.code) : '—'}
                                </div>
                                {p.bankBarcode ? (
                                  <div dir="ltr" className="whitespace-nowrap font-mono text-[10px] text-stone-400" title="بارکد بانک بارکد">
                                    {fa(p.bankBarcode)}
                                  </div>
                                ) : null}
                              </td>
                              {/* ۳. واحد */}
                              <td className="p-2 text-center align-middle">
                                <span className="inline-flex shrink-0 items-center rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">
                                  {p.unit ?? 'عدد'}
                                </span>
                              </td>
                              {/* ۴. موجودی */}
                              <td className="p-2 text-center align-middle">
                                <StockView stock={p.stock ?? 0} threshold={p.lowStockThreshold ?? null} />
                              </td>
                              {/* ۵. قیمت واحد */}
                              <td className="p-2 text-center align-middle">
                                <div className="whitespace-nowrap">
                                  <span className="text-sm font-bold text-stone-700"><span dir="ltr">{money(price)}</span></span>
                                  <span className="text-[10px] font-normal text-stone-400"> ریال</span>
                                </div>
                                <div className="text-[10px] text-stone-400">{hasSup ? 'نماینده' : 'آخرین خرید'}</div>
                              </td>
                              {/* ۶. تعداد (عدد) — استپر + چیپ‌ها؛ نوشتن مستقیم در سبد */}
                              <td className="p-2 text-center align-middle">
                                <NumStepper min={0} step={1} value={amtUnits}
                                  bumpKey={bump[`u:${p.id}`] || 0}
                                  onChange={(v: number) => rowUnitsChange(p, v)} />
                                <div className="mt-1 flex items-center justify-center gap-1">
                                  <button type="button" title={`افزودن ${fa(defQty)} عدد به همین ردیف`}
                                    onClick={() => quickAddUnits(p, defQty)}
                                    className="h-9 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95">
                                    +{fa(defQty)}
                                  </button>
                                  <button type="button" title={`افزودن ${fa(defQty * 2)} عدد به همین ردیف`}
                                    onClick={() => quickAddUnits(p, defQty * 2)}
                                    className="h-9 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95">
                                    +{fa(defQty * 2)}
                                  </button>
                                </div>
                              </td>
                              {/* ۷. کارتن — استپر + چیپ؛ نوشتن مستقیم در سبد */}
                              <td className="p-2 text-center align-middle">
                                <NumStepper min={0} step={1} value={amtCartons}
                                  hint={upc > 0 ? `× ${fa(upc)}` : 'اندازهٔ کارتن؟'}
                                  bumpKey={bump[`b:${p.id}`] || 0}
                                  onChange={(v: number) => rowCartonChange(p, v)} />
                                <div className="mt-1 flex items-center justify-center">
                                  <button type="button" title={`افزودن ${fa(Math.max(1, defCarton || 1))} کارتن به همین ردیف`}
                                    onClick={() => quickAddCarton(p)}
                                    className="h-9 rounded-full border border-amber-200 bg-amber-50 px-3 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100 active:scale-95">
                                    +{fa(Math.max(1, defCarton || 1))} کارتن
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* سبد خرید */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.carton size={18} /> سبد سفارش
                {cart.length > 0 && <Badge variant="secondary" className="text-[11px]">{fa(cart.length)} قلم</Badge>}
                {cart.length > 0 && (
                  <span className="text-xs font-normal text-stone-500">
                    · جمع تقریبی: <b className="text-emerald-700">{money(total)} ریال</b> ≈ {toman(total)} تومان
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">
                  سبد خالی است — در نتایج جست‌وجو، +/− یا چیپ‌های +N را بزنید؛ همان لحظه به سبد اضافه می‌شود
                </p>
              ) : (
                <div className="space-y-3">
                  {cart.map((l, idx) => {
                    const cost = lineCost(l)
                    return (
                      <div key={l.productId} className="space-y-2 rounded-xl border border-stone-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-stone-700">{l.name} <span className="text-[11px] font-normal text-stone-400">({l.unit})</span></div>
                            <div className="mt-0.5 text-[11px] text-stone-400">موجودی فعلی: {fa(l.stock)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StockView stock={l.stock} threshold={l.lowThreshold} />
                            <Button variant="ghost" size="icon" className="text-rose-500 hover:bg-rose-50" onClick={() => removeLine(idx)}>
                              <I.trash size={15} />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                          <div>
                            <span className="mb-1 block text-[11px] text-stone-500">تعداد (عدد)</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <NumStepper value={l.qty ?? 0} min={0} step={1}
                                bumpKey={bump[`c:${l.productId}`] || 0}
                                onChange={(v: number) => editLine(idx, 'qty', String(v))} />
                              <button type="button" title={`افزودن ${fa(defQty)} عدد به همین قلم سبد`}
                                onClick={() => {
                                  editLine(idx, 'qty', String((l.qty || 0) + defQty))
                                  setBump((m) => ({ ...m, [`c:${l.productId}`]: (m[`c:${l.productId}`] || 0) + 1 }))
                                }}
                                className="h-9 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95">
                                +{fa(defQty)} تایی
                              </button>
                            </div>
                          </div>
                          <div>
                            <span className="mb-1 block text-[11px] text-stone-500">کارتن</span>
                            <NumStepper value={l.cartonQty ?? 0} min={0} step={1}
                              hint={(l.upc ?? 0) > 0 ? `× ${fa(l.upc)} در کارتن` : undefined}
                              bumpKey={bump[`cb:${l.productId}`] || 0}
                              onChange={(v: number) => editLine(idx, 'cartonQty', String(v))} />
                          </div>
                          <label className="block">
                            <span className="mb-1 block text-[11px] text-stone-500">در هر کارتن</span>
                            <Input dir="ltr" className="w-20 font-mono" inputMode="numeric" value={String(l.upc ?? 0)}
                              onChange={(e: any) => editLine(idx, 'upc', e.target.value)} placeholder="؟" />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[11px] text-stone-500">قیمت واحد (ریال)</span>
                            <Input dir="ltr" className="w-32 font-mono" inputMode="numeric" value={String(l.unitPrice ?? 0)}
                              onChange={(e: any) => editLine(idx, 'unitPrice', e.target.value)} />
                          </label>
                          <div className="text-left">
                            <div className="text-[11px] text-stone-500">جمع سطر — {fa(lineUnits(l))} عدد</div>
                            <div className="text-sm font-bold text-stone-700">
                              {money(cost)} <span className="text-[10px] font-normal text-stone-400">ریال ≈ {toman(cost)} تومان</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ثبت نهایی */}
              {cart.length > 0 && (
                <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-stone-700">جمع کل تقریبی سفارش</span>
                    <span className="text-lg font-black text-emerald-700">
                      {money(total)}
                      <span className="text-xs font-normal"> ریال</span>
                      <span className="text-xs font-normal text-stone-400"> ≈ {toman(total)} تومان</span>
                    </span>
                  </div>
                  <p className="text-[11px] leading-4 text-stone-500">
                    برآورد بر پایهٔ آخرین قیمت خرید / قیمت نماینده است — قیمت هر سطر را می‌توانید همان‌جا اصلاح کنید؛ قیمت اصلاح‌شده با سفارش ثبت و هنگام دریافت در کارت کالا به‌روز می‌شود.
                  </p>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-600">تاریخ تحویل مورد انتظار</label>
                      <JalaliDate
                        value={deliveryDate}
                        onChange={(v: string) => setDeliveryDate(v)}
                        quickChips={[
                          { label: 'امروز', deltaDays: 0 },
                          { label: 'فردا', deltaDays: 1 },
                          { label: 'هفتهٔ آینده', deltaDays: 7 },
                        ]}
                      />
                      <p className="mt-1.5 text-[11px] text-stone-400">میان‌برهای «امروز / فردا / هفتهٔ آینده» داخل تقویم بازشو در دسترس است</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-600">روش پرداخت</label>
                      <div className="flex rounded-lg border border-stone-200 bg-white p-1 gap-1">
                        {(['CASH', 'CHEQUE', 'POS'] as const).map((m) => (
                          <button key={m} type="button" onClick={() => setPayMethod(m)}
                            className={cn('flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                              payMethod === m ? 'bg-emerald-600 text-white' : 'text-stone-600 hover:bg-stone-100')}>
                            {PAY_LABEL[m]}
                          </button>
                        ))}
                      </div>
                      {payMethod !== 'CASH' && (
                        <p className="mt-2 text-[11px] text-amber-700">
                          <I.banknote size={12} className="inline align-middle" /> برنامه پرداخت ({PAY_LABEL[payMethod]}) به مبلغ {money(total)} ریال برای تاریخ تحویل در تقویم ثبت می‌شود
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-600">یادداشت سفارش</label>
                      <Input value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="اختیاری…" />
                    </div>
                  </div>

                  <p className="text-[11px] leading-4 text-stone-500">
                    طرف حساب این سفارش: <b className="text-stone-700">{supSelected ? supSelected.name : 'بدون تأمین‌کنندهٔ مشخص'}</b> — از کارت «طرف حساب (تأمین‌کننده)» در ابتدای همین تب تغییر دهید.
                  </p>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-3">
                    <Button variant="outline" onClick={() => setCart([])} className="gap-1 text-rose-600">
                      <I.trash size={15} /> خالی کردن سبد
                    </Button>
                    <Button disabled={busy} onClick={() => void submitOrder()} className="gap-2">
                      {busy ? <I.loader size={16} className="animate-spin" /> : <I.send size={16} />}
                      ثبت سفارش ({fa(cart.length)} قلم · {money(total)} ریال)
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ سفارش‌ها ══ */}
        <TabsContent value="list" className="mt-4">
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base"><I.receipt size={18} /> سفارش‌ها</CardTitle>
                <div className="flex gap-2">
                  <Input className="w-52" value={listQ} onChange={(e: any) => setListQ(e.target.value)}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') void loadList() }}
                    placeholder="جست‌وجو کد/تأمین‌کننده…" />
                  <Button variant="outline" size="sm" onClick={() => void loadList()} className="gap-1"><I.refresh size={14} /> به‌روزرسانی</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'open', label: 'در انتظار تأیید', n: counts?.open },
                  { key: 'active', label: 'در جریان', n: counts?.active },
                  { key: 'done', label: 'تکمیل‌شده', n: counts?.done },
                  { key: 'cancelled', label: 'لغو‌شده', n: counts?.cancelled },
                  { key: 'all', label: 'همه', n: counts?.all },
                ].map((c) => (
                  <button key={c.key} type="button"
                    onClick={() => { setStatusF(c.key); void loadList(c.key) }}
                    className={cn('rounded-lg border px-3 py-1 text-xs transition-colors',
                      statusF === c.key ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-200 text-stone-600 hover:border-emerald-400')}>
                    {c.label} {c.n != null ? fa(c.n) : ''}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {list === null ? (
                <p className="py-8 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت…</p>
              ) : list.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">سفارشی با این فیلترها یافت نشد</p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">کد</TableHead>
                        <TableHead className="text-right">تأمین‌کننده</TableHead>
                        <TableHead className="text-right">تحویل</TableHead>
                        <TableHead className="text-center">پرداخت</TableHead>
                        <TableHead className="text-center">اقلام</TableHead>
                        <TableHead className="text-right">مبلغ</TableHead>
                        <TableHead className="text-center">وضعیت</TableHead>
                        <TableHead className="text-center">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs"><span dir="ltr" className="font-mono font-bold">{o.code}</span></TableCell>
                          <TableCell className="text-xs font-medium">{o.supplierName || '—'}</TableCell>
                          <TableCell className="text-xs text-stone-500"><span dir="ltr">{o.deliveryDate ? faDate(o.deliveryDate) : '—'}</span></TableCell>
                          <TableCell className="text-center"><PayBadge v={o.payMethod} /></TableCell>
                          <TableCell className="text-center text-xs">{fa(o.itemsCount ?? 0)}</TableCell>
                          <TableCell className="text-xs">
                            <span className="font-bold text-stone-700">{money(o.totalAmount)}</span>
                            <span className="text-[10px] text-stone-400"> ریال ≈ {toman(o.totalAmount)} تومان</span>
                          </TableCell>
                          <TableCell className="text-center"><OrderStatusBadge v={o.status} /></TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-center gap-1">
                              {o.status === 'DRAFT' && (
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => void orderAction(o, 'submit')}><I.send size={13} /> ارسال</Button>
                              )}
                              {o.status === 'SUBMITTED' && (
                                <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => void orderAction(o, 'approve')}><I.check size={13} /> تأیید</Button>
                              )}
                              {o.status === 'APPROVED' && (
                                <Button size="sm" variant="outline" className="gap-1 border-teal-200 text-teal-700 hover:bg-emerald-50" onClick={() => void orderAction(o, 'start-receive')}><I.package size={13} /> شروع دریافت</Button>
                              )}
                              {o.status === 'RECEIVING' && (
                                <Button size="sm" variant="outline" className="gap-1 border-teal-200 text-teal-700 hover:bg-emerald-50" onClick={() => void openReceive(o)}><I.package size={13} /> ثبت دریافت</Button>
                              )}
                              {o.status === 'RECEIVED' && (
                                <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => void orderAction(o, 'verify')}><I.eye size={13} /> راستی‌آزمایی</Button>
                              )}
                              {o.status === 'VERIFIED' && (
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => void orderAction(o, 'account')}><I.banknote size={13} /> ثبت حسابداری</Button>
                              )}
                              {o.status === 'ACCOUNTED' && (
                                <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => void orderAction(o, 'final-approve')}><I.check size={13} /> بستن</Button>
                              )}
                              {['DRAFT', 'SUBMITTED', 'APPROVED'].includes(o.status) && (
                                <Button size="sm" variant="ghost" className="gap-1 text-rose-600 hover:bg-rose-50" onClick={() => setCancelDlg({ order: o, reason: '' })}>
                                  <I.x size={13} /> لغو
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ تقویم پرداخت ══ */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} className="gap-1">
                  <I.chevronRight size={16} /> ماه قبل
                </Button>
                <CardTitle>{JALALI_MONTHS[cal.jm - 1]} {toFaDigits(String(cal.jy))}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} className="gap-1">
                  ماه بعد <I.chevronLeft size={16} />
                </Button>
              </div>
              <div className="text-xs text-stone-500">
                {fa(plans.length)} برنامه پرداخت در این ماه · جمع {money(monthTotal)} ریال
                {calErr && <span className="text-rose-600"> · {calErr}</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {calLoading ? (
                <p className="py-6 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت تقویم…</p>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-stone-500">
                    {WEEKDAY_FA.map((w) => <div key={w} className="py-1">{w}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((c, i) =>
                      c === null ? (
                        <div key={`b${i}`} />
                      ) : (
                        <button key={c.ds} type="button" onClick={() => setSelDay(c.ds)}
                          className={cn('relative min-h-16 rounded-lg border p-1.5 text-right transition-colors',
                            selDay === c.ds ? 'border-emerald-500 bg-emerald-50'
                            : c.ds === today ? 'border-emerald-300 bg-emerald-50/50'
                            : 'border-stone-200 bg-white hover:border-emerald-400')}>
                          <span className={cn('text-xs', c.ds === today ? 'font-black text-emerald-700' : 'text-stone-600')}>{fa(c.d)}</span>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {[...new Set(c.dayPlans.map((p: any) => p.kind))].map((k) => (
                              <span key={k as string} title={PAY_LABEL[k as string]}
                                className={cn('h-1.5 w-1.5 rounded-full', k === 'CHEQUE' ? 'bg-amber-500' : k === 'POS' ? 'bg-teal-500' : 'bg-emerald-500')} />
                            ))}
                            {c.dayCheques.length > 0 && (
                              <span title={`${fa(c.dayCheques.length)} چک سررسید`} className="text-rose-500"><I.banknote size={13} /></span>
                            )}
                          </div>
                        </button>
                      ),
                    )}
                  </div>

                  {selDay && (
                    <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-stone-700">
                          {(() => { const jd = parseJalali(selDay); return jd ? toFaDigits(formatJalaliLong(jd)) : faDate(selDay) })()}
                        </div>
                        <span dir="ltr" className="text-xs text-stone-400">{faDate(selDay)}</span>
                      </div>

                      {dayPlans.length === 0 && dayCheques.length === 0 && (
                        <p className="py-2 text-center text-sm text-stone-400">برای این روز برنامه‌ای ثبت نشده</p>
                      )}

                      {dayPlans.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <PayBadge v={p.kind} />
                            <span className="text-sm font-bold text-stone-700">{money(p.amount)} ریال</span>
                            <span className="text-[11px] text-stone-400">≈ {toman(p.amount)} تومان</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                            {p.orderCode && <span dir="ltr" className="font-mono">{p.orderCode}</span>}
                            {p.supplierName && <span>{p.supplierName}</span>}
                            <span className={cn('rounded-md px-1.5 py-0.5',
                              p.status === 'DONE' ? 'bg-emerald-100 text-emerald-700'
                              : p.status === 'CONFIRMED' ? 'bg-teal-50 text-teal-800' : 'bg-stone-100 text-stone-600')}>
                              {PLAN_STATUS_FA[p.status] ?? p.status}
                            </span>
                            {p.status === 'PLANNED' && (
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-teal-200 text-teal-700" onClick={() => void planAction(p, 'CONFIRMED')}>تأیید</Button>
                            )}
                            {p.status === 'CONFIRMED' && (
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-emerald-300 text-emerald-700" onClick={() => void planAction(p, 'DONE')}><I.check size={13} /> انجام شد</Button>
                            )}
                          </div>
                        </div>
                      ))}

                      {dayCheques.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                              <I.banknote size={12} /> چک سررسید
                            </span>
                            <span dir="ltr" className="text-xs font-mono font-bold text-stone-700">{c.number}</span>
                            <span className="text-sm font-bold text-stone-700">{money(c.amount)} ریال</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                            {c.recipient && <span>{c.recipient}</span>}
                            <span className={cn('rounded-md px-1.5 py-0.5',
                              c.status === 'CLEARED' ? 'bg-emerald-100 text-emerald-700'
                              : ['BOUNCED', 'REJECTED', 'RETURNED'].includes(c.status) ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700')}>
                              {CHEQUE_STATUS_FA[c.status] ?? c.status}
                            </span>
                            <span className={cn((c.daysLeft ?? 0) < 0 ? 'text-rose-600' : 'text-stone-400')}>
                              {(c.daysLeft ?? 0) > 0 ? `${fa(c.daysLeft)} روز مانده` : (c.daysLeft ?? 0) === 0 ? 'امروز' : `${fa(Math.abs(c.daysLeft ?? 0))} روز گذشته`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* دیالوگ گردش کالا */}
      <CirculationDialog open={!!circOf} onOpenChange={(v: boolean) => { if (!v) setCircOf(null) }} productId={circOf} />

      {/* دیالوگ اندازهٔ کارتن */}
      <Dialog open={!!cartonAsk} onOpenChange={(v: boolean) => { if (!v) setCartonAsk(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>اندازهٔ کارتن — {cartonAsk?.product?.name}</DialogTitle>
            <DialogDescription>
              تعداد در هر کارتن برای این کالا ثبت نشده. لطفاً از روی جعبهٔ کالا وارد کنید تا برای دفعات بعد به یاد سپرده شود.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input dir="ltr" className="w-28 text-center font-mono" inputMode="numeric" autoFocus
              value={String(cartonAsk?.size ?? '')}
              onChange={(e: any) => setCartonAsk((a: any) => ({ ...a, size: e.target.value }))}
              onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); confirmCartonAsk() } }} />
            <span className="text-sm text-stone-600">عدد در هر کارتن</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCartonAsk(null)}>انصراف</Button>
            <Button onClick={() => confirmCartonAsk()} className="gap-1">
              <I.carton size={14} /> ثبت اندازه و افزودن کارتن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ لغو سفارش */}
      <Dialog open={!!cancelDlg} onOpenChange={(v: boolean) => { if (!v) setCancelDlg(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>لغو سفارش {cancelDlg?.order?.code}</DialogTitle>
            <DialogDescription>دلیل لغو الزامی است (حداقل ۳ حرف).</DialogDescription>
          </DialogHeader>
          <Input value={cancelDlg?.reason ?? ''} onChange={(e: any) => setCancelDlg({ ...cancelDlg, reason: e.target.value })}
            placeholder="مثلاً: تأمین‌کننده کالا را ندارد" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDlg(null)}>انصراف</Button>
            <Button
              variant="destructive"
              disabled={(cancelDlg?.reason ?? '').trim().length < 3}
              onClick={() => {
                if (!cancelDlg) return
                void orderAction(cancelDlg.order, 'cancel', { reason: cancelDlg.reason.trim() })
                setCancelDlg(null)
              }}
              className="gap-1">
              <I.x size={14} /> لغو سفارش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ثبت دریافت */}
      <Dialog open={!!receiveDlg} onOpenChange={(v: boolean) => { if (!v) setReceiveDlg(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ثبت دریافت {receiveDlg?.order?.code}</DialogTitle>
            <DialogDescription>تعداد دریافت‌شدهٔ هر قلم را وارد کنید — مغایرت با سفارش به‌عنوان «کسری» ثبت می‌شود.</DialogDescription>
          </DialogHeader>
          {receiveDlg?.items === null ? (
            <p className="py-6 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت اقلام…</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {receiveDlg?.items?.map((it: any, i: number) => (
                <div key={it.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
                  <span className="flex-1 text-xs font-medium text-stone-700">
                    {it.name} <span className="text-[11px] text-stone-400">(سفارش: {fa(it.qty)})</span>
                  </span>
                  <Input dir="ltr" className="w-24 font-mono" inputMode="numeric" value={String(it.receivedQty ?? 0)}
                    onChange={(e: any) => setReceiveDlg((d: any) => ({ ...d, items: d.items.map((x: any, j: number) => (j === i ? { ...x, receivedQty: numify(e.target.value) } : x)) }))} />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDlg(null)}>انصراف</Button>
            <Button disabled={!receiveDlg?.items} onClick={() => void confirmReceive()} className="gap-1">
              <I.check size={14} /> ثبت دریافت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
