import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Textarea, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Checkbox, money, toEnDigits, toFaDigits, fa, faSlash, todayJalali, MoneyInput, NumInput, JalaliDate, I } from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════
   store/waste — «ضایعات و برگشت به تأمین‌کننده» هایپر زیتون (R9)
   تب ۱ «ضایعاتِ طرف‌حساب‌ها»: انتخاب طرف حساب از فهرستِ دارای ضایعات
   (با نشان «در انتظار») یا فهرست کامل تأمین‌کنندگان فعال؛ ثبت قلم
   جدید به نام همان تأمین‌کننده (کالا از بانک یا ثبت آزاد)، گردش کار
   PENDING → SELECTED (علامت‌گذاری در سفارش جدید) → RETURNED (پایان
   دریافت سفارش) + ویرایش/حذف/لغو انتخاب/«برگشت ثبت شد» دستی مدیران.
   تب ۲ «گزارش دوره‌ای»: قرارداد زندهٔ قدیمی (بازهٔ جلالی + علت) با
   کارت‌های جمع، نوارهای تفکیک علت، پرقیمت‌ترین اقلام و جدول کامل.
   فقط ایمپورت از '../lib/hz' — پالت stone/teal/emerald/amber/rose.
   ═══════════════════════════════════════════════════════════════ */

/* ── علت‌های ضایعات (کلید سرور + برچسب فارسی — همان REASON_LABELS بک‌اند) ── */
const REASONS: { key: string; label: string }[] = [
  { key: 'EXPIRED', label: 'منقضی' },
  { key: 'DAMAGED', label: 'آسیب‌دیده' },
  { key: 'SPOILED', label: 'فاسد' },
  { key: 'THEFT', label: 'سرقت' },
  { key: 'OTHER', label: 'سایر' },
]
const reasonLabelOf = (k: string): string => REASONS.find((r) => r.key === k)?.label ?? k

/** واحدهای وزنی — مقدار اعشاری مجاز (الگوی returns.tsx) */
const WEIGHT_UNITS = ['کیلوگرم', 'گرم', 'کیلو', 'لیتر', 'متر']

/** رشتهٔ ورودی (فارسی/انگلیسی/جداکننده‌دار) → عدد */
const num = (s: any): number => {
  const v = Number(toEnDigits(String(s ?? '')).replace(/[^\d.]/g, ''))
  return isFinite(v) ? v : 0
}

const NOTE_MAX = 300

/* ═══════════════ چیپ وضعیت گردش کار (سه حالت) ═══════════════ */
function StatusChip({ it }: { it: any }) {
  const st = String(it?.status ?? 'PENDING')
  if (st === 'SELECTED') {
    return (
      <span className="rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
        برگشت با سفارش بعدی{it?.orderCode ? <span className="font-mono" dir="ltr"> · سفارش {it.orderCode}</span> : null}
      </span>
    )
  }
  if (st === 'RETURNED') {
    return (
      <span className="rounded-md border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
        برگشت به تأمین‌کننده{it?.returnedAtJalali ? ` · ${faSlash(it.returnedAtJalali)}` : ''}
      </span>
    )
  }
  return (
    <span className="rounded-md border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">در انتظار</span>
  )
}

/* ═══════════════ انتخابگر طرف حساب (کامبوی جست‌وجو — الگوی SupplierCombo سفارش‌ها) ═══════════════
   فهرست = تأمین‌کنندگانِ دارای ضایعاتِ در انتظار (بالا، مرتب با تعداد در انتظار)
   + بقیهٔ تأمین‌کنندگان فعال (مرتب با نام) — همه در یک جست‌وجوی محلی. */
function SupplierPicker(props: {
  suppliers: any[]
  wasteInfo: Record<string, { total: number; pending: number }>
  value: string
  onChange: (v: string) => void
}) {
  const { suppliers, wasteInfo, value, onChange } = props
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<any>(null)
  const listRef = useRef<any>(null)

  const norm = (s: any) => toEnDigits(String(s ?? '')).trim().toLowerCase()
  const nq = norm(q)

  /* اولِ فهرست: دارای ضایعات در انتظار (نزولی)؛ سپس بقیهٔ فعال‌ها (مرتب با نام) */
  const ordered = useMemo(() => {
    const withWaste = suppliers
      .filter((s) => (wasteInfo[s.id]?.pending ?? 0) > 0)
      .sort((a, b) => (wasteInfo[b.id]?.pending ?? 0) - (wasteInfo[a.id]?.pending ?? 0))
    const rest = suppliers.filter((s) => (wasteInfo[s.id]?.pending ?? 0) === 0)
    return [...withWaste, ...rest]
  }, [suppliers, wasteInfo])

  const filtered = useMemo(() => {
    if (!nq) return ordered
    return ordered.filter((s) => norm(s.name).includes(nq) || norm(s.code).includes(nq) || norm(s.phone).includes(nq))
  }, [ordered, nq])

  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])

  /* بستن با کلیک بیرون */
  useEffect(() => {
    if (!open) return
    const onDoc = (e: any) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  /* گزینهٔ فعال در دید بماند */
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector?.(`[data-idx="${active}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const sel = suppliers.find((s) => s.id === value) ?? null

  function choose(v: string) { onChange(v); setOpen(false) }
  function onKey(e: any) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % Math.max(1, filtered.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length)) }
    else if (e.key === 'Enter') { e.preventDefault(); const s = filtered[active]; if (s) choose(s.id) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div className="relative" ref={boxRef as any}>
      <Button type="button" variant="outline" role="combobox" aria-expanded={open}
        className="h-11 w-full justify-between"
        onClick={() => setOpen(!open)}>
        {sel ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-bold text-stone-700">{sel.name}</span>
            {(wasteInfo[sel.id]?.pending ?? 0) > 0 ? (
              <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                در انتظار {fa(wasteInfo[sel.id].pending)}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-sm text-stone-500">طرف حساب (تأمین‌کننده) را انتخاب کنید… <span className="text-[10px]">({fa(suppliers.length)} فعال)</span></span>
        )}
        <I.chevronDown size={16} className={cn('shrink-0 text-stone-400 transition-transform', open && 'rotate-180')} />
      </Button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-stone-200 bg-white p-2 shadow-xl" dir="rtl">
          <div className="relative mb-2">
            <I.search size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <Input autoFocus value={q} onChange={(e: any) => setQ(e.target.value)} onKeyDown={onKey}
              placeholder="جست‌وجوی نام / کد / تلفن طرف حساب…" className="h-10 pr-9 text-sm" />
          </div>
          <div ref={listRef} role="listbox" aria-label="فهرست طرف حساب‌ها" className="max-h-72 overflow-y-auto">
            {filtered.map((s, i) => {
              const isSel = s.id === value
              const w = wasteInfo[s.id]
              return (
                <button key={s.id} type="button" data-idx={String(i)} role="option" aria-selected={isSel}
                  onMouseEnter={() => setActive(i)} onClick={() => choose(s.id)}
                  className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-right transition-colors',
                    active === i && 'bg-stone-100', isSel && 'bg-emerald-50')}>
                  <span className="flex min-w-0 flex-col items-start">
                    <span className={cn('truncate text-sm', isSel ? 'font-bold text-emerald-800' : 'font-medium text-stone-700')}>{s.name}</span>
                    <span className="text-[10px] text-stone-400" dir="rtl">
                      {s.code ? fa(s.code) : ''}{s.phone ? ` · ${fa(s.phone)}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {(w?.pending ?? 0) > 0 ? (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">در انتظار {fa(w.pending)}</span>
                    ) : null}
                    {isSel && <I.check size={14} className="text-emerald-600" />}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-stone-400">طرف حسابی با «{fa(q)}» یافت نشد</p>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-stone-200 px-2 pt-1.5 text-[10px] text-stone-400">
            <span>{fa(filtered.length)} از {fa(suppliers.length)} فعال</span>
            <span dir="rtl">↑↓ حرکت · Enter انتخاب · Esc بستن</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════ دیالوگ افزودن قلم ضایعات ═══════════════ */
function AddWasteDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; supplier: any; onDone: () => void }) {
  const { open, onOpenChange, supplier, onDone } = props
  const [manual, setManual] = useState(false)
  const [product, setProduct] = useState<any | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [manualName, setManualName] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('EXPIRED')
  const [estValue, setEstValue] = useState('')
  const [estDirty, setEstDirty] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<any>(null)

  /* با هر بار شدن دیالوگ، فرم نو می‌شود */
  useEffect(() => {
    if (open) {
      setManual(false); setProduct(null); setQ(''); setResults(null); setManualName('')
      setQty(''); setReason('EXPIRED'); setEstValue(''); setEstDirty(false); setNote('')
    }
  }, [open])

  const decimals = product && WEIGHT_UNITS.includes(String(product.unit)) ? 3 : 0
  const qtyNum = num(qty)

  /* پیشنهاد ارزش = تعداد × آخرین قیمت خرید (یا فروش) */
  const estSuggest = useMemo(() => {
    if (manual || !product) return 0
    const up = Number(product.lastBuyPrice) || Number(product.sellPrice) || 0
    return Math.round(qtyNum * up)
  }, [manual, product, qtyNum])

  /* پیش‌پرکردن/به‌روزرسانی خودکار ارزش — تا وقتی کاربر دستی تغییرش نداده */
  useEffect(() => {
    if (estDirty) return
    if (!manual && product && estSuggest > 0) setEstValue(String(estSuggest))
    else if (!manual && !product) setEstValue('')
  }, [estDirty, manual, product, estSuggest])

  /* جست‌وجوی کالا — تأخیر ۳۰۰ms (الگوی سفارش‌گذاری) */
  function onQuery(v: string) {
    setQ(v)
    setResults(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    const t = toEnDigits(v).trim()
    if (t.length < 2) { setSearching(false); return }
    setSearching(true)
    timerRef.current = setTimeout(() => void doSearch(t), 300)
  }

  async function doSearch(t: string) {
    const r = await api('/api/products/search' + qs({ q: t, full: '1', limit: 12 }))
    setSearching(false)
    if (!r.ok) { toast.error(r.error || 'خطا در جست‌وجوی کالا'); setResults([]); return }
    setResults(r.data?.products ?? [])
  }

  /* Enter روی رقم‌های زیاد = جست‌وجوی بارکد دقیق */
  async function onSearchKey(e: any) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const t = toEnDigits(q).trim()
    if (/^\d{8,}$/.test(t)) {
      setSearching(true)
      const r = await api('/api/products/search' + qs({ barcode: t }))
      setSearching(false)
      if (r.ok && r.data?.id) { pickProduct(r.data); return }
    }
    if (t.trim().length >= 2) void doSearch(t)
  }

  function pickProduct(p: any) {
    setProduct(p)
    setQ('')
    setResults(null)
  }

  async function submit() {
    if (!supplier) return
    const name = manual ? manualName.trim() : String(product?.name ?? '').trim()
    if (!name) { toast.error('نام کالا را وارد کنید یا از فهرست انتخاب کنید'); return }
    if (!(qtyNum > 0)) { toast.error('تعداد را وارد کنید'); return }
    const body: any = { supplierId: supplier.id, name, qty: qtyNum, reason }
    if (!manual && product) body.productId = product.id
    const ev = num(estValue)
    if (String(estValue) !== '' && Number.isFinite(ev) && ev >= 0) body.estValue = ev
    const nt = note.trim()
    if (nt) body.note = nt
    setSaving(true)
    const r = await api('/api/store/waste', { method: 'POST', body })
    setSaving(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('قلم ضایعات ثبت شد')
    onDone()
    onOpenChange(false)
  }

  const canSubmit = (manual ? manualName.trim().length > 0 : !!product) && qtyNum > 0 && !saving

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <I.packagePlus size={18} /> افزودن قلم ضایعات
            {supplier ? <span className="text-sm font-normal text-stone-500">— {supplier.name}</span> : null}
          </DialogTitle>
          <DialogDescription>
            قلم به نام «{supplier?.name ?? '—'}» ثبت می‌شود و در صف برگشت با سفارش بعدی همان تأمین‌کننده قرار می‌گیرد.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* حالت ثبت: از بانک کالا یا آزاد */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
            <Checkbox checked={manual} onCheckedChange={(v: any) => { setManual(!!v); setProduct(null); setQ(''); setResults(null); setEstDirty(false) }} />
            <span className="font-bold text-stone-700">ثبت آزاد بدون کالا</span>
            <span className="text-[11px] text-stone-400">— برای کالایی که در بانک کالا نیست</span>
          </label>

          {!manual ? (
            product ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-emerald-800">{product.name}</p>
                  <p className="num text-[11px] text-stone-500" dir="rtl">
                    {toFaDigits(String(product.unit ?? 'عدد'))}
                    {product.lastBuyPrice ? ` · آخرین قیمت خرید: ${money(product.lastBuyPrice)} ریال` : ''}
                    {product.stock != null ? ` · موجودی: ${fa(product.stock)}` : ''}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 text-rose-600 hover:bg-rose-50"
                  onClick={() => { setProduct(null); setEstDirty(false) }}>
                  <I.x size={14} /> تغییر
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm">جست‌وجوی کالا <span className="text-rose-600">*</span></label>
                <div className="relative">
                  <I.search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <Input autoFocus value={q} onChange={(e: any) => onQuery(e.target.value)} onKeyDown={onSearchKey}
                    placeholder="نام یا بارکد کالا… (Enter = جست‌وجوی بارکد)" className="h-10 pr-9 text-sm" />
                  {searching ? <I.loader size={15} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-stone-400" /> : null}
                </div>
                {results && results.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-stone-200 bg-white">
                    {results.map((p) => (
                      <button key={p.id} type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-xs hover:bg-emerald-50"
                        onClick={() => pickProduct(p)}>
                        <span className="truncate font-medium text-stone-700">{p.name}</span>
                        <span className="shrink-0 text-stone-400" dir="rtl">
                          {p.lastBuyPrice ? `${money(p.lastBuyPrice)} ریال` : ''}{p.stock != null ? ` · موجودی ${fa(p.stock)}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {results && results.length === 0 && q.trim() ? (
                  <p className="text-[11px] text-stone-400">کالایی یافت نشد — «ثبت آزاد بدون کالا» را فعال کنید.</p>
                ) : null}
                {/* هشدار کم‌شدن موجودی انبار */}
                <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800">
                  <I.alertTriangle size={14} className="shrink-0" />
                  با انتخاب کالا از بانک، موجودی انبارِ همان کالا به همان تعداد کم می‌شود.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm">نام کالا <span className="text-rose-600">*</span></label>
              <Input value={manualName} onChange={(e: any) => setManualName(e.target.value)}
                placeholder="مثلاً: ظرف سفارشی مشتری" className="h-10 text-sm" />
              <p className="text-[11px] text-stone-400">واحد: عدد — کالا در بانک ثبت نمی‌شود و موجودی انبار تغییر نمی‌کند.</p>
            </div>
          )}

          {/* تعداد + علت */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm">تعداد <span className="text-rose-600">*</span></label>
              <NumInput className="h-10 text-sm" value={qty} onChange={(v: string) => setQty(v)}
                decimals={decimals} unit={product ? String(product.unit ?? 'عدد') : 'عدد'} placeholder="۱" />
              {product && decimals > 0 ? (
                <p className="text-[11px] text-emerald-600">واحد وزنی — اعشاری مجاز</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm">علت ضایعات</label>
              <Select dir="rtl" value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-10 text-sm" aria-label="علت ضایعات"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ارزش تخمینی */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-sm">
              <span>ارزش تخمینی (ریال)</span>
              {estValue === '' && estSuggest > 0 ? (
                <span className="text-[11px] text-stone-400">پیشنهاد: {money(estSuggest)} ریال</span>
              ) : null}
            </label>
            <MoneyInput className="h-10 text-sm" value={estValue} onChange={(v: string) => { setEstValue(v); setEstDirty(true) }}
              placeholder="۰" suffix="ریال" />
            <p className="text-[11px] text-stone-400">
              {manual
                ? 'برای کالای آزاد، ارزش را دستی وارد کنید (اختیاری).'
                : 'خالی بگذارید تا از «تعداد × آخرین قیمت خرید» همان کالا تخمین زده شود.'}
            </p>
          </div>

          {/* یادداشت */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-sm">
              <span>یادداشت</span>
              <span className="num text-[11px] text-stone-400">{fa(note.length)}/{toFaDigits(String(NOTE_MAX))}</span>
            </label>
            <Textarea value={note} onChange={(e: any) => setNote(String(e.target.value ?? '').slice(0, NOTE_MAX))}
              placeholder="اختیاری — مثلاً: بچ تولید ۸/۰۴، نیمهٔ پایین قفسه…" className="min-h-16 text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>انصراف</Button>
          <Button disabled={!canSubmit} onClick={() => void submit()} className="gap-1.5">
            {saving ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />}
            ثبت قلم ضایعات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════ دیالوگ ویرایش قلم (فقط در انتظار) ═══════════════ */
function EditWasteDialog(props: { item: any | null; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { item, onOpenChange, onDone } = props
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('EXPIRED')
  const [estValue, setEstValue] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const open = !!item

  useEffect(() => {
    if (item) {
      setQty(String(item.qty ?? ''))
      setReason(String(item.reason ?? 'OTHER'))
      setEstValue(item.estValue ? String(Math.round(Number(item.estValue))) : '')
      setNote(String(item.note ?? ''))
    }
  }, [item])

  const qtyNum = num(qty)

  async function submit() {
    if (!item) return
    if (!(qtyNum > 0)) { toast.error('تعداد را وارد کنید'); return }
    const body: any = { id: item.id, action: 'edit', qty: qtyNum, reason }
    if (String(estValue) !== '') body.estValue = num(estValue)
    body.note = note.trim()
    setSaving(true)
    const r = await api('/api/store/waste', { method: 'PATCH', body })
    setSaving(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('قلم ضایعات ویرایش شد')
    onDone()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><I.pencil size={17} /> ویرایش قلم ضایعات</DialogTitle>
          <DialogDescription>
            «{item?.name}» — فقط اقلام «در انتظار» قابل ویرایش هستند.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm">تعداد ({toFaDigits(String(item?.unit ?? 'عدد'))})</label>
            <NumInput className="h-10 text-sm" value={qty} onChange={(v: string) => setQty(v)} decimals={WEIGHT_UNITS.includes(String(item?.unit)) ? 3 : 0} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm">علت</label>
            <Select dir="rtl" value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-10 text-sm" aria-label="علت"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm">ارزش تخمینی (ریال)</label>
            <MoneyInput className="h-10 text-sm" value={estValue} onChange={(v: string) => setEstValue(v)} placeholder="۰" suffix="ریال" />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-sm">
              <span>یادداشت</span>
              <span className="num text-[11px] text-stone-400">{fa(note.length)}/{toFaDigits(String(NOTE_MAX))}</span>
            </label>
            <Textarea value={note} onChange={(e: any) => setNote(String(e.target.value ?? '').slice(0, NOTE_MAX))} className="min-h-16 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>انصراف</Button>
          <Button disabled={!(qtyNum > 0) || saving} onClick={() => void submit()} className="gap-1.5">
            {saving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیرهٔ تغییرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════ نمای اصلی ═══════════════ */
export default function WasteView() {
  const { user, go } = useShell()

  const [tab, setTab] = useState('parties')
  const [loading, setLoading] = useState(true)

  /* داده‌های پایه: فهرست تأمین‌کنندگان فعال + گروه‌های دارای ضایعات */
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])

  /* طرف حساب انتخاب‌شده + پروندهٔ ضایعاتش */
  const [supplierId, setSupplierId] = useState('')
  const [detail, setDetail] = useState<{ loading: boolean; data: any | null }>({ loading: false, data: null })

  /* دیالوگ‌ها */
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [delItem, setDelItem] = useState<{ item: any; reason: string } | null>(null)
  const [markItem, setMarkItem] = useState<any | null>(null)

  /* گزارش دوره‌ای (تب ۲) */
  const t0 = todayJalali()
  const [repFrom, setRepFrom] = useState(`${t0.slice(0, 7)}-01`)
  const [repTo, setRepTo] = useState(t0)
  const [repReason, setRepReason] = useState('ALL') /* ALL = همهٔ علت‌ها (SelectItem رادیکس مقدار خالی نمی‌پذیرد) */
  const [repLoading, setRepLoading] = useState(false)
  const [repData, setRepData] = useState<any | null>(null)

  const isMgr = !!user && ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(String(user.role))

  const wasteInfo = useMemo(() => {
    const m: Record<string, { total: number; pending: number }> = {}
    for (const g of groups) m[g.supplierId] = { total: g.total, pending: g.pending }
    return m
  }, [groups])

  const sel = detail.data?.supplier ?? null
  const items = useMemo(() => {
    const arr: any[] = Array.isArray(detail.data?.items) ? detail.data.items : []
    const order: Record<string, number> = { PENDING: 0, SELECTED: 1, RETURNED: 2 }
    return [...arr].sort((a, b) =>
      (order[String(a.status)] ?? 3) - (order[String(b.status)] ?? 3) ||
      String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }, [detail.data])

  /* ── بارگذاری‌ها ── */
  async function loadGroups() {
    const r = await api('/api/store/waste' + qs({ groups: '1' }))
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت گروه‌های ضایعات'); return }
    setGroups(r.data?.groups ?? [])
  }

  async function loadSuppliers() {
    const r = await api('/api/suppliers' + qs({ pageSize: '2400', sort: 'name', status: 'فعال' }))
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت تأمین‌کنندگان'); return }
    setSuppliers((r.data?.items ?? []).filter((s: any) => s.status === 'فعال'))
  }

  async function loadDetail(id: string) {
    if (!id) return
    setDetail({ loading: true, data: null })
    const r = await api('/api/store/waste' + qs({ supplierId: id }))
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت ضایعات طرف حساب'); setDetail({ loading: false, data: null }); return }
    setDetail({ loading: false, data: r.data })
  }

  function pickSupplier(id: string) {
    setSupplierId(id)
    if (id) void loadDetail(id)
    else setDetail({ loading: false, data: null })
  }

  /** پس از هر تغییر: پروندهٔ طرف حساب + گروه‌ها (شمارندهٔ «در انتظار») */
  function refreshAll() {
    void loadGroups()
    if (supplierId) void loadDetail(supplierId)
  }

  /* ── عملیات‌ها ── */
  async function revertItem(it: any) {
    const r = await api('/api/store/waste', { method: 'PATCH', body: { id: it.id, action: 'revert' } })
    if (!r.ok) { toast.error(r.error); return }
    toast.success('این قلم به حالت «در انتظار» برگشت')
    refreshAll()
  }

  async function submitMarkReturned() {
    if (!markItem) return
    const r = await api('/api/store/waste', { method: 'PATCH', body: { id: markItem.id, action: 'mark-returned' } })
    if (!r.ok) { toast.error(r.error); return }
    toast.success('برگشت به تأمین‌کننده ثبت شد')
    setMarkItem(null)
    refreshAll()
  }

  async function submitDelete() {
    if (!delItem) return
    const r = await api('/api/store/waste' + qs({ id: delItem.item.id }),
      { method: 'DELETE', body: { reason: delItem.reason.trim() || undefined } })
    if (!r.ok) { toast.error(r.error); return }
    toast.success('قلم ضایعات حذف شد')
    setDelItem(null)
    refreshAll()
  }

  /* ── گزارش دوره‌ای ── */
  async function loadReport() {
    if (repFrom && repTo && repFrom > repTo) { toast.error('تاریخ شروع باید پیش از تاریخ پایان باشد'); return }
    setRepLoading(true)
    const r = await api('/api/store/waste' + qs({ from: repFrom || undefined, to: repTo || undefined, reason: repReason !== 'ALL' ? repReason : undefined }))
    setRepLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت گزارش'); return }
    setRepData(r.data)
  }

  /* نخستین بارگذاری: گروه‌ها + تأمین‌کنندگان + گزارش ماه جاری */
  useEffect(() => {
    void (async () => {
      await Promise.all([loadGroups(), loadSuppliers()])
      setLoading(false)
      void loadReport()
    })()
  }, [])

  const summary = repData?.summary
  const repItems: any[] = Array.isArray(repData?.items) ? repData.items : []
  const maxReasonValue = Math.max(1, ...((summary?.byReason ?? []) as any[]).map((x) => Number(x.value) || 0))
  const reasonBarColor = (k: string): string =>
    k === 'EXPIRED' ? 'bg-amber-500'
      : k === 'DAMAGED' ? 'bg-rose-500'
        : k === 'SPOILED' ? 'bg-teal-500'
          : k === 'THEFT' ? 'bg-stone-500'
            : 'bg-emerald-600'

  /* ── رندر ── */
  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت داده‌های ضایعات…
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* ══ سربرگ ══ */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-emerald-800">
                <I.trash size={18} /> ضایعات و برگشت به تأمین‌کننده
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">
                ثبت ضایعات به نام طرف حساب‌ها و پیگیری برگشتشان با سفارش بعدی همان تأمین‌کننده.
              </p>
            </div>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">
              امروز {faSlash(t0)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v: string) => setTab(v)} dir="rtl">
        <TabsList>
          <TabsTrigger value="parties"><I.users size={14} className="ml-1 inline" /> ضایعاتِ طرف‌حساب‌ها</TabsTrigger>
          <TabsTrigger value="report"><I.barChart size={14} className="ml-1 inline" /> گزارش دوره‌ای</TabsTrigger>
        </TabsList>

        {/* ═══════ تب ۱: ضایعاتِ طرف‌حساب‌ها ═══════ */}
        <TabsContent value="parties" className="mt-4 space-y-4">

          {/* راهنمای گردش کار */}
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs leading-6 text-teal-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 font-bold"><I.info size={15} /> گردش کار برگشت ضایعات به تأمین‌کننده</p>
              <Button variant="outline" size="sm" className="gap-1 border-teal-200 text-teal-800 hover:bg-emerald-50"
                onClick={() => go('supply/orders')}>
                <I.handshake size={13} /> رفتن به سفارش‌گذاری
              </Button>
            </div>
            <ol className="mt-1 list-decimal space-y-0.5 pr-5">
              <li>هر قلم ضایعات به نام یک طرف حساب (تأمین‌کننده) ثبت می‌شود و «در انتظار» می‌ماند.</li>
              <li>در «سفارش جدید» (بخش سفارش‌گذاری) وقتی همین تأمین‌کننده انتخاب شود، اقلام «در انتظار» نمایش داده می‌شوند تا به مامور پخش اعلام شود؛ خانم لطفی علامت می‌زند کدام‌ها با سفارش بعدی برگردند — بقیه برای نوبت‌های بعدی می‌ماند.</li>
              <li>با پایان دریافت سفارش، وضعیت اقلام علامت‌خورده «برگشت به تأمین‌کننده» می‌شود.</li>
            </ol>
            <p className="mt-1 text-teal-800">اگر قلمی بدون سفارش، فیزیکی برگشت داده شد، مدیران می‌توانند همان‌جا «برگشت ثبت شد» را بزنند.</p>
          </div>

          {/* انتخاب طرف حساب + آمار + اقدامات */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.handshake size={18} /> طرف حساب
                {sel ? <Badge variant="secondary" className="text-[11px]">انتخاب‌شده</Badge> : null}
              </CardTitle>
              <p className="text-xs leading-5 text-stone-500">
                تأمین‌کننده‌های دارای ضایعاتِ در انتظار بالای فهرست می‌آیند؛ با جست‌وجو می‌توانید برای هر تأمین‌کنندهٔ فعالی قلم ثبت کنید.
              </p>
              <SupplierPicker suppliers={suppliers} wasteInfo={wasteInfo} value={supplierId} onChange={pickSupplier} />
            </CardHeader>
            {sel ? (
              <CardContent className="space-y-3 pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-xs">
                  <span className="font-bold text-stone-700">{sel.name}</span>
                  {sel.code ? <span className="text-stone-500">کد {fa(sel.code)}</span> : null}
                  {sel.phone ? <span dir="ltr" className="text-stone-500">{toFaDigits(sel.phone)}</span> : null}
                  {sel.classification ? <span className="text-stone-500">{sel.classification}</span> : null}
                  <span className="text-[11px] text-stone-500">تمام اقلام این طرف حساب با سفارش بعدی او برمی‌گردد</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">
                    در انتظار · {fa(detail.data?.stats?.counts?.pending ?? 0)} قلم · {money(detail.data?.stats?.value?.pending ?? 0)} ریال
                  </Badge>
                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10px] text-teal-800">
                    برگشت با سفارش بعدی · {fa(detail.data?.stats?.counts?.selected ?? 0)}
                  </Badge>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                    برگشته · {fa(detail.data?.stats?.counts?.returned ?? 0)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button className="gap-1.5" onClick={() => setAddOpen(true)} disabled={detail.loading}>
                    <I.packagePlus size={15} /> افزودن قلم ضایعات
                  </Button>
                  <Button variant="outline" className="gap-1" onClick={() => refreshAll()} disabled={detail.loading}>
                    <I.refresh size={14} /> به‌روزرسانی
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent className="pt-0">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-500">
                  ابتدا طرف حساب را انتخاب کنید تا ضایعاتش نمایش داده شود و بتوانید قلم جدید ثبت کنید.
                </div>
              </CardContent>
            )}
          </Card>

          {/* اقلام طرف حساب */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.package size={18} /> اقلام ضایعات
                {sel ? <span className="num text-sm font-normal text-stone-500">({fa(items.length)} قلم — {sel.name})</span> : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!sel ? (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-400">
                  <I.users className="mx-auto mb-2" size={26} />
                  طرف حسابی انتخاب نشده است.
                </div>
              ) : detail.loading ? (
                <p className="py-8 text-center text-sm text-stone-500">
                  <I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت…
                </p>
              ) : items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-400">
                  هنوز قلمی برای این طرف حساب ثبت نشده — با «افزودن قلم ضایعات» شروع کنید.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((it) => {
                    const st = String(it.status ?? 'PENDING')
                    const mine = it.userName === user?.fullName
                    const canTouch = isMgr || mine
                    return (
                      <div key={it.id} className="space-y-2 rounded-xl border bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-stone-700">{it.name}</span>
                          <StatusChip it={it} />
                          <span className="rounded-md border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">{it.reasonLabel}</span>
                          <span className="mr-auto num text-xs font-extrabold text-stone-700" dir="ltr">
                            {money(it.estValue)} <span className="text-[10px] font-normal text-stone-400">ریال</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                          <span dir="ltr" className="num">{faSlash(it.date)}</span>
                          <span className="num">{fa(it.qty)} {toFaDigits(String(it.unit ?? ''))}</span>
                          {it.barcode ? <span dir="ltr" className="num">بارکد {toFaDigits(it.barcode)}</span> : null}
                          {it.productId ? null : <span>ثبت آزاد</span>}
                          <span>ثبت: {it.userName ?? '—'}</span>
                          {st === 'SELECTED' && it.selectedByName ? (
                            <span className="text-teal-700">علامت‌گذاری: {it.selectedByName}{it.selectedAtJalali ? ` · ${faSlash(it.selectedAtJalali)}` : ''}</span>
                          ) : null}
                          {it.note ? <span className="max-w-full truncate" title={it.note}>یادداشت: {it.note}</span> : null}
                        </div>
                        {st !== 'RETURNED' || it.returnedAtJalali ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {st === 'PENDING' && canTouch ? (
                              <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditItem(it)}>
                                <I.pencil size={13} /> ویرایش
                              </Button>
                            ) : null}
                            {st === 'PENDING' && canTouch ? (
                              <Button variant="ghost" size="sm" className="gap-1 text-rose-600 hover:bg-rose-50" onClick={() => setDelItem({ item: it, reason: '' })}>
                                <I.trash size={13} /> حذف
                              </Button>
                            ) : null}
                            {st === 'PENDING' && isMgr ? (
                              <Button variant="outline" size="sm" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => setMarkItem(it)}>
                                <I.checkCheck size={13} /> برگشت ثبت شد
                              </Button>
                            ) : null}
                            {st === 'SELECTED' ? (
                              <Button variant="outline" size="sm" className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => void revertItem(it)}>
                                <I.history size={13} /> لغو انتخاب
                              </Button>
                            ) : null}
                            {st === 'RETURNED' ? (
                              <span className="num text-[11px] text-stone-400">برگشت فیزیکی: {it.returnedAtJalali ? faSlash(it.returnedAtJalali) : '—'}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ تب ۲: گزارش دوره‌ای ═══════ */}
        <TabsContent value="report" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><I.filter size={18} /> بازه و علت</CardTitle>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="block text-xs text-stone-500">از تاریخ</label>
                  <JalaliDate value={repFrom} onChange={setRepFrom} quickChips={[{ label: '۷ روز', deltaDays: -6 }, { label: '۳۰ روز', deltaDays: -29 }]} className="w-40" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-stone-500">تا تاریخ</label>
                  <JalaliDate value={repTo} onChange={setRepTo} className="w-40" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-stone-500">علت</label>
                  <Select dir="rtl" value={repReason} onValueChange={setRepReason}>
                    <SelectTrigger className="h-10 w-44 text-sm" aria-label="علت"><SelectValue placeholder="همهٔ علت‌ها" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">همهٔ علت‌ها</SelectItem>
                      {REASONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button className="gap-1" onClick={() => void loadReport()} disabled={repLoading}>
                    {repLoading ? <I.loader size={15} className="animate-spin" /> : <I.barChart size={15} />} اعمال گزارش
                  </Button>
                  <Button variant="outline" className="gap-1"
                    onClick={() => { setRepFrom(`${todayJalali().slice(0, 7)}-01`); setRepTo(todayJalali()); setRepReason('ALL') }}>
                    <I.refresh size={14} /> این ماه
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* کارت‌های جمع */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center">
                  <div className="text-xs text-stone-500">ارزش بازهٔ انتخابی</div>
                  <div className="num mt-1 text-xl font-black text-emerald-700" dir="ltr">
                    {money(summary?.totalValue ?? 0)} <span className="text-[11px] font-normal">ریال</span>
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center">
                  <div className="text-xs text-stone-500">تعداد اقلام</div>
                  <div className="num mt-1 text-xl font-black text-teal-700">{fa(summary?.count ?? 0)} <span className="text-[11px] font-normal">قلم</span></div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center">
                  <div className="text-xs text-stone-500">جمع ماه جاری</div>
                  <div className="num mt-1 text-xl font-black text-amber-700" dir="ltr">
                    {money(summary?.monthTotal ?? 0)} <span className="text-[11px] font-normal">ریال</span>
                  </div>
                </div>
              </div>

              {/* تفکیک علت */}
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-stone-700"><I.barChart size={15} /> تفکیک بر اساس علت</h3>
                {(summary?.byReason ?? []).length === 0 ? (
                  <p className="py-3 text-center text-xs text-stone-400">در این بازه قلمی ثبت نشده است.</p>
                ) : (
                  (summary?.byReason ?? []).map((r: any) => (
                    <div key={r.reason}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-stone-700">
                          {r.label} <span className="font-normal text-stone-400">({fa(r.count)} قلم)</span>
                        </span>
                        <span className="num font-bold text-stone-700" dir="ltr">{money(r.value)} <span className="text-[10px] font-normal text-stone-400">ریال</span></span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                        <div className={cn('h-full rounded-full', reasonBarColor(r.reason))}
                          style={{ width: `${Math.max(2, Math.round((Number(r.value) / maxReasonValue) * 100))}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* پرقیمت‌ترین اقلام */}
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-stone-700"><I.banknote size={15} /> پرقیمت‌ترین اقلام بازه</h3>
                {(summary?.topProducts ?? []).length === 0 ? (
                  <p className="py-3 text-center text-xs text-stone-400">—</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                    {(summary?.topProducts ?? []).map((p: any, i: number) => (
                      <div key={p.name} className={cn('flex items-center justify-between gap-2 px-3 py-2 text-xs', i > 0 && 'border-t border-stone-200')}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-600">{fa(i + 1)}</span>
                          <span className="truncate font-medium text-stone-700">{p.name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="num text-stone-500">{fa(p.qty)} عدد</span>
                          <span className="num font-bold text-stone-700" dir="ltr">{money(p.value)} <span className="text-[10px] font-normal text-stone-400">ریال</span></span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* جدول کامل اقلام */}
              <div className="max-h-96 overflow-y-auto rounded-xl border border-stone-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">تاریخ</TableHead>
                      <TableHead className="text-right">کالا</TableHead>
                      <TableHead className="text-right">علت</TableHead>
                      <TableHead className="text-center">تعداد</TableHead>
                      <TableHead className="text-right">ارزش</TableHead>
                      <TableHead className="text-right">طرف‌حساب</TableHead>
                      <TableHead className="text-center">وضعیت</TableHead>
                      <TableHead className="text-right">ثبت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-6 text-center text-sm text-stone-400">در این بازه قلمی ثبت نشده است.</TableCell>
                      </TableRow>
                    ) : repItems.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="num text-xs text-stone-500"><span dir="ltr">{faSlash(it.date)}</span></TableCell>
                        <TableCell className="text-xs">
                          <span className="font-medium text-stone-700">{it.name}</span>
                          {it.barcode ? <div className="num text-[10px] text-stone-400" dir="ltr">{toFaDigits(it.barcode)}</div> : null}
                        </TableCell>
                        <TableCell className="text-xs text-stone-600">{it.reasonLabel}</TableCell>
                        <TableCell className="num text-center text-xs">{fa(it.qty)} {toFaDigits(String(it.unit ?? ''))}</TableCell>
                        <TableCell className="num text-xs font-bold text-stone-700" dir="ltr">{money(it.estValue)}</TableCell>
                        <TableCell className="text-xs text-stone-600">{it.supplierName || '—'}</TableCell>
                        <TableCell className="text-center"><StatusChip it={it} /></TableCell>
                        <TableCell className="text-xs text-stone-500">{it.userName ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] text-stone-400">
                بازهٔ فعال: {faSlash(repData?.range?.from ?? repFrom)} تا {faSlash(repData?.range?.to ?? repTo)}
                {repReason !== 'ALL' ? ` — علت: ${reasonLabelOf(repReason)}` : ' — همهٔ علت‌ها'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ══ دیالوگ افزودن ══ */}
      <AddWasteDialog open={addOpen} onOpenChange={setAddOpen} supplier={sel} onDone={refreshAll} />

      {/* ══ دیالوگ ویرایش ══ */}
      <EditWasteDialog item={editItem} onOpenChange={(v: boolean) => { if (!v) setEditItem(null) }} onDone={refreshAll} />

      {/* ══ دیالوگ حذف ══ */}
      <Dialog open={!!delItem} onOpenChange={(v: boolean) => { if (!v) setDelItem(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.trash size={17} /> حذف قلم ضایعات</DialogTitle>
            <DialogDescription>
              «{delItem?.item?.name}» — {fa(delItem?.item?.qty ?? 0)} {toFaDigits(String(delItem?.item?.unit ?? ''))} · {reasonLabelOf(String(delItem?.item?.reason ?? ''))} · {money(delItem?.item?.estValue ?? 0)} ریال.
              دلیل حذف اختیاری است و در کارنامهٔ فعالیت ثبت می‌شود.
            </DialogDescription>
          </DialogHeader>
          <Input value={delItem?.reason ?? ''} onChange={(e: any) => setDelItem({ ...(delItem as any), reason: e.target.value })}
            placeholder="دلیل حذف (اختیاری) — مثلاً: ثبت اشتباه تکراری" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelItem(null)}>انصراف</Button>
            <Button variant="destructive" className="gap-1" onClick={() => void submitDelete()}>
              <I.trash size={14} /> حذف قطعی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ دیالوگ «برگشت ثبت شد» (مدیران) ══ */}
      <Dialog open={!!markItem} onOpenChange={(v: boolean) => { if (!v) setMarkItem(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.checkCheck size={17} /> ثبت برگشت فیزیکی</DialogTitle>
            <DialogDescription>
              این قلم بدون سفارش، فیزیکی به تأمین‌کننده برگشت داده شده است؟ وضعیت آن «برگشت به تأمین‌کننده» با تاریخ امروز ثبت می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs leading-5 text-emerald-800">
            <p className="font-bold">{markItem?.name}</p>
            <p className="num text-stone-600">
              {fa(markItem?.qty ?? 0)} {toFaDigits(String(markItem?.unit ?? ''))} · {markItem?.reasonLabel} · {money(markItem?.estValue ?? 0)} ریال
            </p>
            <p className="text-stone-500">طرف حساب: {markItem?.supplierName || '—'}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkItem(null)}>انصراف</Button>
            <Button className="gap-1" onClick={() => void submitMarkReturned()}>
              <I.checkCheck size={15} /> بله، برگشت ثبت شد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
