import {
  useState, useEffect, useMemo, api, qs, useShell, toast, cn,
  Button, Input, Card, CardContent,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Checkbox,
  money, toman, fa, toEnDigits, toFaDigits, formatJalali, addJalaliDays, todayJalali, I,
  MoneyInput, NumInput,
} from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════════
   finance/invoices — «دفتر فاکتورها» (R12)
   ───────────────────────────────────────────────────────────────────
   دفتر فاکتورهای سودسنج، با گردش‌کار کاملِ خواستهٔ مالک — پیش‌نویس‌ها
   دیگر برای همیشه «پیش‌نویس» نمی‌مانند:

     ۱) پیش‌نویس (پیش‌فاکتور) — فاکتورنویس سودسنج می‌سازد
     ۲) تأیید تحویل — کارمندِ دریافت‌کننده، رسیدن کالا را تأیید می‌کند
        (هر کاربرِ واردشده؛ اصل R11 «همه باید بتوانند دریافت و تأیید کنند»)
     ۳) بررسی حسابداری — خانم درویشی (یا اگر سرش شلوغ بود، یکی از
        مدیرها): قیمت‌ها و حاشیهٔ سود را با تورم روزانه چک می‌کند،
        اقلام مشکل‌دار را رد (مرجوعی تأمین‌کننده) و بقیه را می‌پذیرد
     ۴) فاکتور خرید — سند خرید + موجودی/قیمت کالا + (در صورت انتخاب)
        ثبت در هلو — همه یک‌جا به‌روز می‌شود
     ۵) بایگانی سند — سند کاغذی در زون‌بند می‌نشیند، شماره‌های هلو و
        اسکن ثبت می‌شود و از همین صفحه قابل یافتن است («کاغذ در یک ثانیه»)
   ═══════════════════════════════════════════════════════════════════ */

const STATE_FA: Record<string, string> = {
  draft: 'پیش‌نویس', delivered: 'تحویل‌شده', reviewing: 'در بررسی حسابداری',
  final: 'فاکتور خرید', archived: 'بایگانی‌شده', cancelled: 'لغوشده',
}
const STATE_CLS: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600 border-stone-200',
  delivered: 'bg-teal-50 text-teal-800 border-teal-200',
  reviewing: 'bg-amber-100 text-amber-800 border-amber-200',
  final: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  archived: 'bg-emerald-600 text-white border-emerald-600',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
}
const REJECT_REASONS = ['قیمت چاپی متفاوت', 'تاریخ انقضا گذشته/نزدیک', 'شکسته/مخدوش', 'کالای اشتباه', 'کیفیت نامطلوب', 'سفارش نبود', 'دیگر']
const PAY_LABEL: Record<string, string> = { CASH: 'نقدی', CHEQUE: 'چک', POS: 'کارتخوان (POS)' }
const REVIEW_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC']
const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN']
const MARGIN_ROLES = ['OWNER', 'GM', 'ADMIN', 'ACC']
/* R13 — تأیید نهایی مدیر کل (خانم لطفی)؛ در نبودِ ایشان مالک/ادمین */
const GM_ROLES = ['GM', 'OWNER', 'ADMIN']

const STEPS: { key: string; label: string; actor: string }[] = [
  { key: 'draft', label: 'پیش‌نویس (پیش‌فاکتور)', actor: 'فاکتورنویس سودسنج' },
  { key: 'delivered', label: 'تحویل‌شده (ثبت سودسنج)', actor: 'فاکتورنویس سودسنج' },
  { key: 'reviewing', label: 'بررسی حسابداری', actor: 'حسابدار / مدیر' },
  { key: 'final', label: 'فاکتور خرید', actor: 'حسابدار / مدیر' },
  { key: 'gm', label: 'تأیید مدیر کل', actor: 'مدیر کل (خانم لطفی)' },
  { key: 'archived', label: 'بایگانی سند', actor: 'حسابدار / مدیر' },
]
/* R13 — گام تأیید مدیر کل: final بدون gmApproved → گام ۳؛ با تأیید → گام ۴؛ archived → ۵ */
function stepIndex(state: string, gmApproved?: string | null | boolean): number {
  if (state === 'archived') return 5
  if (state === 'final') return gmApproved ? 4 : 3
  if (state === 'reviewing') return 2
  if (state === 'delivered') return 1
  return 0
}

interface Row {
  id: string
  number: number
  supplierName: string | null
  note: string | null
  state: string
  status: string
  providerDocNumber: string | null
  purchaseOrderId: string | null
  itemCount: number
  acceptedCount: number
  rejectedCount: number
  totalCost: number
  revenue: number
  profit: number
  margin: number | null
  dateJalali: string | null
  createdAt: string
  finalizedAt: string | null
  gmApprovedAt: string | null
  gmPending: boolean
}
interface DetailItem {
  id: string
  productId: string | null
  barcode: string | null
  productName: string
  unit: string
  quantity: number
  totalCost: number
  unitCost: number
  printedPrice: number
  salePrice: number
  marginPct: number
  free100: boolean
  accepted: boolean
  rejectReason: string | null
  level: string
  product: { lastBuyPrice: number | null; lastPrintedPrice: number | null } | null
}
interface Detail {
  id: string
  number: number
  supplierName: string | null
  supplierId: string | null
  note: string | null
  state: string
  status: string
  archived: boolean
  dateJalali: string | null
  providerDocNumber: string | null
  purchaseOrderId: string | null
  order: { code: string; status: string; holooErp: string | null; payMethod: string } | null
  deliveredByName: string | null
  reviewedByName: string | null
  finalizedByName: string | null
  gmApprovedAt: string | null
  gmApprovedByName: string | null
  autoArchiveBinder: { id: string; name: string; code: string; shelf: string | null; cabinet: string | null } | null
  cancelledByName: string | null
  cancelReason: string | null
  holooInvoiceNo: string | null
  holooReceiptNo: string | null
  history: { at: string; by: string; action: string; label?: string; detail?: string }[]
  archive: {
    id: string
    title: string
    folio: string | null
    holooInvoiceNo: string | null
    holooReceiptNo: string | null
    hasScan: boolean
    scanName: string | null
    location: { binder: string; binderCode: string; shelf: string | null; cabinet: string | null } | null
  } | null
  items: DetailItem[]
}
interface BinderRow {
  id: string
  name: string
  code: string
  chain: string
  documentsCount: number
}

function stateOf(r: Row | Detail | null): string {
  if (!r) return 'draft'
  return (r as Row).state || ((r as Detail).archived || r.status === 'archived' ? 'archived' : r.status)
}

export default function InvoicesView() {
  const { user: shellUser, refreshBadges, go } = useShell()
  const [meUser, setMeUser] = useState<{ id: string; role: string; fullName: string } | null>(null)
  const user = shellUser || meUser
  const role = String(user?.role ?? '')
  const canReview = REVIEW_ROLES.includes(role)
  const isManager = MANAGER_ROLES.includes(role)
  const canEditDraft = MARGIN_ROLES.includes(role)
  const canGm = GM_ROLES.includes(role)

  const [tab, setTab] = useState('active')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  /* R14: بایگانی خودکار — چک پیش‌فرض روشن؛ زون‌بندِ شرکت از سرور می‌آید */
  const [autoArchive, setAutoArchive] = useState(true)
  const [saveBinder, setSaveBinder] = useState(true)

  /* ویرایش بررسی (قیمت/پذیرش) */
  const [reviewEdits, setReviewEdits] = useState<Record<string, { totalCost?: number; printedPrice?: number; accepted?: boolean; rejectReason?: string }>>({})
  /* دیالوگ‌ها */
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [payMethod, setPayMethod] = useState('CASH')
  /* R17: مهلت چک خرید — پیش‌فرض و سقف: ۴۵ روز */
  const [chequeDays, setChequeDays] = useState('45')
  const [pushToHoloo, setPushToHoloo] = useState(true)
  const [holooEnabled, setHolooEnabled] = useState<boolean | null>(null)
  const [binders, setBinders] = useState<BinderRow[]>([])
  const [archForm, setArchForm] = useState({ binderId: '', folio: '', holooInvoiceNo: '', holooReceiptNo: '', scanDataUrl: '', scanName: '' })
  const [cancelReason, setCancelReason] = useState('')

  const load = useMemo(
    () => async () => {
      setLoading(true)
      try {
        const r = await api('/api/margin?' + qs({ status: tab, q }))
        if (r.ok) setRows((r.data?.invoices ?? []) as Row[])
        else toast.error(r.error || 'بارگذاری فاکتورها ناموفق بود')
      } finally {
        setLoading(false)
      }
    },
    [tab, q],
  )
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    void api('/api/auth/me').then((r: any) => { if (r.ok) setMeUser(r.data?.user ?? null) })
    void api('/api/holoo/status').then((r: any) => { setHolooEnabled(!!(r.ok && r.data?.enabled)) }).catch(() => setHolooEnabled(null))
  }, [])

  /* لینک عمیق ?open=<id> از اعلان‌ها */
  useEffect(() => {
    const m = (location.hash || '').match(/[?&]open=([a-zA-Z0-9_-]+)/)
    if (m) void openDetail(m[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openDetail(id: string) {
    setDetailLoading(true)
    setReviewEdits({})
    setFinalizeOpen(false)
    setArchiveOpen(false)
    setCancelOpen(false)
    try {
      const r = await api('/api/margin/' + id)
      if (r.ok) {
        setDetail(r.data?.invoice ?? null)
      } else {
        toast.error(r.error || 'فاکتور یافت نشد')
        setDetail(null)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  async function act(id: string, body: Record<string, unknown>, okMsg: string): Promise<boolean> {
    setBusy(true)
    try {
      const r = await api('/api/margin/' + id, { method: 'PATCH', body }) /* پل api خودش JSON می‌کند — body شیء است */
      if (r.ok) {
        toast.success(okMsg)
        if (refreshBadges) refreshBadges()
        await openDetail(id)
        await load()
        return true
      }
      toast.error(r.error || 'عملیات ناموفق بود')
      return false
    } finally {
      setBusy(false)
    }
  }

  /* ── بررسی: ویرایش ردیف‌ها ── */
  const reviewItems = useMemo(() => {
    if (!detail) return []
    return detail.items.map((it) => {
      const ed = reviewEdits[it.id] || {}
      const totalCost = ed.totalCost !== undefined ? ed.totalCost : it.totalCost
      const printedPrice = ed.printedPrice !== undefined ? ed.printedPrice : it.printedPrice
      const accepted = ed.accepted !== undefined ? ed.accepted : it.accepted !== false
      const sale = printedPrice
      const unitCost = it.quantity > 0 ? totalCost / it.quantity : 0
      const marginPct = it.free100 ? it.marginPct : unitCost > 0 ? ((sale - unitCost) / unitCost) * 100 : 0
      return { ...it, totalCost, printedPrice, accepted, unitCost, marginPct, rejectReason: ed.rejectReason ?? it.rejectReason }
    })
  }, [detail, reviewEdits])
  const acceptedRows = reviewItems.filter((r) => r.accepted)
  const rejectedRows = reviewItems.filter((r) => !r.accepted)
  const acceptedTotal = acceptedRows.reduce((s, r) => s + r.totalCost, 0)

  function editRow(id: string, patch: Partial<{ totalCost: number; printedPrice: number; accepted: boolean; rejectReason: string }>) {
    setReviewEdits((cur) => ({ ...cur, [id]: { ...(cur[id] || {}), ...patch } }))
  }

  async function saveReview() {
    if (!detail) return
    const items = reviewItems.map((r) => ({ id: r.id, accepted: r.accepted, rejectReason: r.rejectReason, totalCost: r.totalCost, printedPrice: r.printedPrice }))
    await act(detail.id, { action: 'review-save', items }, 'بررسی ذخیره شد')
  }

  /* ── فاکتور خرید ── */
  async function doFinalize() {
    if (!detail) return
    setBusy(true)
    try {
      const r = await api('/api/margin/' + detail.id, {
        method: 'PATCH',
        body: {
          action: 'finalize',
          payMethod,
          ...(payMethod === 'CHEQUE' ? { chequeDays: Number(toEnDigits(chequeDays)) || 45 } : {}),
          pushToHoloo,
        },
      })
      if (r.ok) {
        const cheque = r.data?.cheque
        toast.success(
          'فاکتور خرید ثبت شد — در انتظار تأیید مدیر کل (خانم لطفی)'
          + (cheque ? ` · چک ${fa(toEnDigits(chequeDays) || '45')} روزه تا سررسید ${fa(String(cheque.dueDate).replace(/-/g, '/'))} خودکار ثبت شد` : ''),
        )
        if (refreshBadges) refreshBadges()
        await openDetail(detail.id)
        await load()
        setFinalizeOpen(false)
      } else {
        toast.error(r.error || 'عملیات ناموفق بود')
      }
    } finally {
      setBusy(false)
    }
  }

  /* ── بایگانی ── */
  useEffect(() => {
    if (!archiveOpen) return
    void api('/api/archive/structure').then((r: any) => {
      if (!r.ok) { toast.error(r.error || 'ساختار آرشیو در دسترس نیست'); return }
      const flat: BinderRow[] = []
      for (const cab of r.data?.cabinets ?? []) {
        for (const sh of cab.shelves ?? []) {
          for (const b of sh.binders ?? []) {
            flat.push({ id: b.id, name: b.name, code: b.code, chain: `${cab.name} ‹ ${sh.name} ‹ ${b.name}`, documentsCount: b.documentsCount ?? 0 })
          }
        }
      }
      setBinders(flat)
      if (flat.length === 0) toast.warning('هنوز زون‌بندی تعریف نشده — از «آرشیو اسناد و مدارک» ساختار بسازید')
    })
  }, [archiveOpen])
  async function doArchive() {
    if (!detail) return
    if (!archForm.binderId) { toast.error('زون‌بند را انتخاب کنید'); return }
    const okDone = await act(
      detail.id,
      {
        action: 'archive',
        saveBinder,
        binderId: archForm.binderId,
        folio: archForm.folio || undefined,
        holooInvoiceNo: archForm.holooInvoiceNo || undefined,
        holooReceiptNo: archForm.holooReceiptNo || undefined,
        scan: archForm.scanDataUrl ? { dataUrl: archForm.scanDataUrl, name: archForm.scanName } : undefined,
      },
      'سند در بایگانی ثبت شد — کاغذ را در زون‌بند جا بدهید',
    )
    if (okDone) { setArchiveOpen(false); setSaveBinder(true); setArchForm({ binderId: '', folio: '', holooInvoiceNo: '', holooReceiptNo: '', scanDataUrl: '', scanName: '' }) }
  }
  function onScanFile(e: any) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 310_000) { toast.error('حجم عکس بیش از ~۳۰۰ کیلوبایت است — عکس کوچک‌تری بفرستید'); return }
    const rd = new FileReader()
    rd.onload = () => {
      const url = String(rd.result || '')
      if (url.length > 420_000) { toast.error('حجم اسکن بیش از حد مجاز است'); return }
      setArchForm((cur) => ({ ...cur, scanDataUrl: url, scanName: f.name }))
    }
    rd.readAsDataURL(f)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, draft: 0, delivered: 0, reviewing: 0, final: 0, archived: 0, cancelled: 0 }
    for (const r of rows) c[r.state] = (c[r.state] || 0) + 1
    c.active = (c.draft || 0) + (c.delivered || 0) + (c.reviewing || 0) + (c.final || 0)
    return c
  }, [rows])
  const TABS: { key: string; label: string }[] = [
    { key: 'active', label: 'باز' },
    { key: 'draft', label: 'پیش‌نویس' },
    { key: 'delivered', label: 'تحویل‌شده' },
    { key: 'reviewing', label: 'در بررسی' },
    { key: 'final', label: 'فاکتور خرید' },
    { key: 'archived', label: 'بایگانی‌شده' },
    { key: 'cancelled', label: 'لغوشده' },
  ]

  const dState = stateOf(detail)

  return (
    <div className="space-y-4">
      {/* ── هدر + توضیح گردش‌کار ── */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-bold text-base md:text-lg flex items-center gap-2">
                <I.receipt size={18} className="text-teal-700" /> دفتر فاکتورها — از پیش‌فاکتور تا بایگانی
              </h1>
              <p className="text-[12px] text-muted-foreground mt-1 leading-6">
                پیش‌فاکتورِ ثبت‌شده در «سودسنج» را کارمندِ دریافت‌کننده تأیید تحویل می‌کند؛ خانم درویشی (یا یکی از مدیرها)
                قیمت‌ها و حاشیهٔ سود را بررسی و اقلام مشکل‌دار را مرجوع می‌کند؛ فاکتور خرید نهایی می‌شود (موجودی + هلو)؛
                مدیر کل (خانم لطفی) سود و قیمت‌ها را نهایی تأیید می‌کند و قیمت‌ها در هلو منتشر می‌شود؛ سپس سند کاغذی در زون‌بند بایگانی می‌شود — همان‌جا هم پیدا.
              </p>
            </div>
            {canEditDraft ? (
              <Button variant="outline" className="gap-1.5 shrink-0" onClick={() => go('finance/builder')}>
                <I.plus size={15} /> پیش‌فاکتور جدید
              </Button>
            ) : null}
          </div>
          {/* استپر گردش‌کار */}
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {STEPS.map((s, i) => (
              <span key={s.key} className="inline-flex items-center gap-1">
                <span className={cn('rounded-full border px-2.5 py-1', i === STEPS.length - 1 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-stone-50 border-stone-200 text-stone-600')}>
                  {fa(i + 1)}. {s.label}
                  <span className="text-stone-400"> · {s.actor}</span>
                </span>
                {i < STEPS.length - 1 ? <span className="text-stone-300">‹</span> : null}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── تب‌ها + جستجو ── */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
              tab === t.key ? 'border-teal-600 bg-teal-600 text-white' : 'bg-white border-stone-200 text-stone-600 hover:border-teal-300',
            )}
          >
            {t.label}
            {counts[t.key] ? <span className={cn('ms-1', tab === t.key ? 'text-teal-100' : 'text-stone-400')}>({fa(counts[t.key])})</span> : null}
          </button>
        ))}
        <div className="flex-1" />
        <Input
          value={q}
          onChange={(e: any) => setQ(e.target.value)}
          placeholder="جستجو: تأمین‌کننده، شماره، سند تأمین‌کننده…"
          className="w-full sm:w-72"
        />
      </div>

      {/* ── جدول ── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">شماره</TableHead>
                <TableHead className="text-right">تأمین‌کننده</TableHead>
                <TableHead className="text-right">تاریخ</TableHead>
                <TableHead className="text-right">اقلام</TableHead>
                <TableHead className="text-right">جمع خرید</TableHead>
                <TableHead className="text-right">حاشیه</TableHead>
                <TableHead className="text-right">وضعیت</TableHead>
                <TableHead className="text-right">سند خرید</TableHead>
                <TableHead className="text-right">محل سند کاغذی</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">در حال بارگذاری…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10 leading-7">
                    فاکتوری در این وضعیت نیست.
                    {tab === 'draft' ? ' پیش‌فاکتور را از «سودسنج پیشرفته» ثبت کنید و پس از رسیدن کالا، اینجا تأیید تحویل بزنید.' : ''}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-stone-50" onClick={() => void openDetail(r.id)}>
                    <TableCell className="font-bold">#{fa(r.number)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.supplierName || '—'}</div>
                      {r.providerDocNumber ? <div className="text-[10px] text-stone-400">سند تأمین‌کننده {fa(r.providerDocNumber)}</div> : null}
                    </TableCell>
                    <TableCell className="text-[12px]">{r.dateJalali ? fa(r.dateJalali) : '—'}</TableCell>
                    <TableCell className="text-[12px]">
                      {fa(r.itemCount)} قلم
                      {r.rejectedCount ? <span className="text-rose-600"> · {fa(r.rejectedCount)} مرجوعی</span> : null}
                    </TableCell>
                    <TableCell className="text-[12px]">{money(r.totalCost)}</TableCell>
                    <TableCell className={cn('text-[12px] font-medium', (r.margin ?? 0) < 12 ? 'text-rose-600' : (r.margin ?? 0) < 21 ? 'text-amber-600' : 'text-emerald-700')}>
                      {r.margin == null ? '—' : `${fa(Math.round(r.margin * 100) / 100)}٪`}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px]', STATE_CLS[r.state])}>{STATE_FA[r.state]}</span>
                        {r.gmPending ? <span className="inline-block rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] text-violet-700" title="پیش از بایگانی، تأیید مدیر کل لازم است">در انتظار مدیر کل</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px]">{r.purchaseOrderId ? <span className="text-teal-700">ثبت‌شده</span> : '—'}</TableCell>
                    <TableCell className="text-[11px] text-emerald-700">{r.state === 'archived' ? 'در زون‌بند' : '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── دیالوگ جزئیات + گردش‌کار ── */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(o: boolean) => { if (!o) setDetail(null) }}>
        <DialogContent className="w-[97vw] max-w-[1700px] max-h-[94vh] overflow-y-auto">
          {detailLoading || !detail ? (
            <div className="py-16 text-center text-muted-foreground">در حال بارگذاری فاکتور…</div>
          ) : (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  فاکتور #{fa(detail.number)}
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', STATE_CLS[dState])}>{STATE_FA[dState]}</span>
                  {detail.order ? <span className="text-[10px] text-teal-700 border border-teal-200 rounded-full px-2 py-0.5">سند خرید {fa(detail.order.code)}</span> : null}
                </DialogTitle>
                <DialogDescription className="text-[12px] leading-6">
                  {detail.supplierName || 'بدون تأمین‌کننده'}
                  {detail.providerDocNumber ? ` · سند تأمین‌کننده ${fa(detail.providerDocNumber)}` : ''}
                  {detail.dateJalali ? ` · ${fa(detail.dateJalali)}` : ''}
                </DialogDescription>
              </DialogHeader>

              {/* استپر وضعیت */}
              <div className="flex items-center gap-1">
                {STEPS.map((s, i) => {
                  const cur = stepIndex(dState, detail.gmApprovedAt)
                  const cls = dState === 'cancelled'
                    ? 'bg-stone-100 text-stone-400 border-stone-200'
                    : i < cur ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : i === cur ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-stone-400 border-stone-200'
                  return (
                    <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
                      <span className={cn('rounded-lg border px-2 py-1 text-[10px] truncate w-full text-center', cls)} title={s.actor}>{s.label}</span>
                      {i < STEPS.length - 1 ? <span className="text-stone-300 text-[10px]">‹</span> : null}
                    </div>
                  )
                })}
              </div>

              {dState === 'cancelled' ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 leading-6">
                  این فاکتور توسط {detail.cancelledByName || 'مدیر'} لغو شده است{detail.cancelReason ? ` — علت: ${detail.cancelReason}` : ''}.
                </div>
              ) : null}

              {/* محل سند کاغذی (بایگانی‌شده) */}
              {dState === 'archived' && detail.archive?.location ? (
                <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 space-y-1">
                  <div className="text-[12px] font-bold text-emerald-800 flex items-center gap-1.5"><I.bookOpen size={14} /> محل سند کاغذی — «کاغذ را در یک ثانیه پیدا کن»</div>
                  <div className="text-[14px] font-bold text-emerald-900">
                    {detail.archive.location.cabinet ? `${detail.archive.location.cabinet} ‹ ` : ''}
                    {detail.archive.location.shelf ? `${detail.archive.location.shelf} ‹ ` : ''}
                    زون‌بند «{detail.archive.location.binder}»
                    {detail.archive.folio ? ` · برگه ${fa(detail.archive.folio)}` : ''}
                  </div>
                  <div className="text-[11px] text-emerald-700 flex flex-wrap gap-x-4 gap-y-1">
                    <span>کد زون‌بند: {fa(detail.archive.location.binderCode)}</span>
                    {detail.holooInvoiceNo ? <span>هلو فاکتور: {fa(detail.holooInvoiceNo)}</span> : null}
                    {detail.holooReceiptNo ? <span>هلو رسید: {fa(detail.holooReceiptNo)}</span> : null}
                    {detail.archive.hasScan ? <span className="text-teal-700">اسکن ضمیمه دارد ({detail.archive.scanName})</span> : null}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => { setDetail(null); go(`finance/archive?q=${encodeURIComponent(detail.supplierName || detail.number)}`) }}>
                      <I.search size={13} /> مشاهده در آرشیو
                    </Button>
                    {isManager ? (
                      <Button size="sm" variant="outline" className="h-8 text-[11px] border-amber-300 text-amber-700" disabled={busy} onClick={() => void act(detail.id, { action: 'unarchive' }, 'بایگانی باز شد — سند آرشیو مرتبط حذف شد')}>
                        بازکردن بایگانی
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* ── جدول اقلام (نمایش/بررسی) ── */}
              {(dState === 'delivered' || dState === 'reviewing') && canReview ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[12px] font-bold text-amber-800">بررسی حسابداری — قیمت‌ها را با نرخ روز چک کنید؛ اقلام مشکل‌دار را مرجوع (رد) کنید</div>
                    <Button size="sm" className="h-8 text-[11px]" disabled={busy} onClick={() => void saveReview()}>
                      <I.save size={13} /> ذخیرهٔ بررسی
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-stone-500 border-b border-stone-200">
                          <th className="text-right py-1.5 px-1">پذیرش</th>
                          <th className="text-right">کالا</th>
                          <th className="text-right">تعداد</th>
                          <th className="text-right">جمع خرید (ریال)</th>
                          <th className="text-right">قیمت چاپی</th>
                          <th className="text-right">بهای واحد</th>
                          <th className="text-right">سود</th>
                          <th className="text-right">علت مرجوعی</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewItems.map((it) => {
                          const pct = Math.round(it.marginPct * 100) / 100
                          const below = !it.free100 && pct < 12
                          return (
                            <tr key={it.id} className={cn('border-b border-stone-100', !it.accepted && 'bg-rose-50/70')}>
                              <td className="py-1.5 px-1">
                                <Checkbox
                                  checked={it.accepted}
                                  onCheckedChange={(v: boolean) => editRow(it.id, { accepted: !!v, ...(v ? {} : { rejectReason: it.rejectReason || 'قیمت چاپی متفاوت' }) })}
                                />
                              </td>
                              <td className="max-w-[160px]">
                                <div className="font-medium truncate" title={it.productName}>{it.productName}</div>
                                {it.barcode ? <div className="text-[9px] text-stone-400">{fa(it.barcode)}</div> : null}
                                {it.product?.lastBuyPrice ? <div className="text-[9px] text-stone-400">آخرین خرید: {money(it.product.lastBuyPrice)}</div> : null}
                              </td>
                              <td className="whitespace-nowrap">{fa(it.quantity)} {it.unit}</td>
                              <td>
                                <MoneyInput value={it.totalCost} onChange={(v: number) => editRow(it.id, { totalCost: v })} className="h-7 w-28 text-[11px]" />
                              </td>
                              <td>
                                {it.free100 ? <span className="text-[10px] text-stone-400">رایگان</span> : (
                                  <MoneyInput value={it.printedPrice} onChange={(v: number) => editRow(it.id, { printedPrice: v })} className="h-7 w-24 text-[11px]" />
                                )}
                              </td>
                              <td className="whitespace-nowrap text-stone-600">{money(Math.round(it.unitCost))}</td>
                              <td className={cn('font-bold whitespace-nowrap', below ? 'text-rose-600' : pct < 21 ? 'text-amber-600' : 'text-emerald-700')}>
                                {it.free100 ? `(${fa(Math.round(it.marginPct))}٪ رایگان)` : `${fa(pct)}٪`}
                              </td>
                              <td>
                                {it.accepted ? <span className="text-stone-300">—</span> : (
                                  <Select value={it.rejectReason || 'قیمت چاپی متفاوت'} onValueChange={(v: string) => editRow(it.id, { rejectReason: v })}>
                                    <SelectTrigger className="h-7 w-36 text-[10px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {REJECT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-1">{fa(acceptedRows.length)} قلم پذیرفته · جمع {money(acceptedTotal)} ریال</span>
                    {rejectedRows.length ? <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-1">{fa(rejectedRows.length)} قلم مرجوعی تأمین‌کننده</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" disabled={busy || acceptedRows.length === 0} onClick={() => { setPayMethod('CASH'); setChequeDays('45'); setFinalizeOpen(true) }}>
                      <I.check size={14} /> ثبت فاکتور خرید ({fa(acceptedRows.length)} قلم)
                    </Button>
                    {dState === 'delivered' ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(detail.id, { action: 'start-review' }, 'بررسی حسابداری آغاز شد')}>
                        شروع رسمی بررسی
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-stone-200">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-stone-500 bg-stone-50 border-b border-stone-200">
                        <th className="text-right py-1.5 px-2">کالا</th>
                        <th className="text-right">تعداد</th>
                        <th className="text-right">جمع خرید</th>
                        <th className="text-right">قیمت چاپی</th>
                        <th className="text-right">سود</th>
                        <th className="text-right">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr key={it.id} className={cn('border-b border-stone-100', it.accepted === false && 'bg-rose-50/70')}>
                          <td className="py-1.5 px-2 max-w-[220px]">
                            <div className="font-medium truncate" title={it.productName}>{it.productName}</div>
                            {it.barcode ? <div className="text-[9px] text-stone-400">{fa(it.barcode)}</div> : null}
                          </td>
                          <td className="whitespace-nowrap">{fa(it.quantity)} {it.unit}</td>
                          <td className="whitespace-nowrap">{money(it.totalCost)}</td>
                          <td className="whitespace-nowrap">{it.free100 ? 'رایگان' : money(it.printedPrice)}</td>
                          <td className={cn('font-bold whitespace-nowrap', it.level === 'CRITICAL' ? 'text-rose-600' : it.level === 'WARN' ? 'text-amber-600' : 'text-emerald-700')}>
                            {it.free100 ? `(${fa(Math.round(it.marginPct))}٪ رایگان)` : `${fa(Math.round(it.marginPct * 100) / 100)}٪`}
                          </td>
                          <td>
                            {it.accepted === false
                              ? <span className="text-[10px] text-rose-700">مرجوعی — {it.rejectReason}</span>
                              : <span className="text-[10px] text-emerald-700">پذیرفته</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── اقدامات بر اساس وضعیت ── */}
              <div className="flex flex-wrap gap-2">
                {dState === 'draft' ? (
                  /* R17: سند قدیمیِ «پیش‌نویس» — ثبت سودسنج = تحویل‌شده؛ گام تأیید تحویل حذف شد.
                     حسابدار/مدیر مستقیم بررسی را شروع می‌کند؛ ثبت‌کننده هم می‌تواند ویرایش کند. */
                  <>
                    {canReview ? (
                      <Button disabled={busy} onClick={() => void act(detail.id, { action: 'start-review' }, 'بررسی حسابداری آغاز شد — تحویل کالا: ثبت‌شده در سودسنج')}>
                        <I.search size={14} /> شروع بررسی حسابداری
                      </Button>
                    ) : (
                      <div className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 w-full">
                        کالا با ثبتِ این فاکتور در سودسنج تحویل‌شده فرض می‌شود — تأیید جداگانه لازم ندارد.
                        ادامهٔ کار با خانم درویشی یا مدیرها (دکمهٔ «بررسی حسابداری»).
                      </div>
                    )}
                    {canEditDraft ? (
                      <Button variant="outline" disabled={busy} onClick={() => { setDetail(null); go(`finance/builder?id=${detail.id}`) }}>
                        <I.pencil size={14} /> ویرایش در فاکتورنویس
                      </Button>
                    ) : null}
                    {isManager ? (
                      <Button variant="outline" className="border-rose-200 text-rose-700" disabled={busy} onClick={() => { setCancelReason(''); setCancelOpen(true) }}>
                        لغو فاکتور
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {dState === 'delivered' && !canReview ? (
                  <div className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 w-full">
                    کالا همزمان با ثبت سودسنج تحویل شده است — در انتظار بررسی حسابداری
                    (خانم درویشی یا یکی از مدیرها از دکمهٔ «بررسی حسابداری» ادامه می‌دهند).
                  </div>
                ) : null}
                {dState === 'final' && detail.gmApprovedAt ? (
                  <Button disabled={busy} onClick={() => { setArchForm({ binderId: '', folio: '', holooInvoiceNo: detail.holooInvoiceNo || '', holooReceiptNo: detail.holooReceiptNo || '', scanDataUrl: '', scanName: '' }); setArchiveOpen(true) }}>
                    <I.bookOpen size={14} /> بایگانی سند کاغذی
                  </Button>
                ) : null}
                {dState === 'final' && !detail.gmApprovedAt && canGm ? (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-2.5">
                    <Button
                      disabled={busy}
                      className="bg-violet-700 hover:bg-violet-800"
                      onClick={() => void act(detail.id, { action: 'gm-approve', autoArchive: autoArchive && !!detail.autoArchiveBinder }, detail.autoArchiveBinder && autoArchive ? 'تأیید مدیر کل انجام شد — قیمت‌ها منتشر و سند خودکار بایگانی شد' : 'تأیید مدیر کل انجام شد — قیمت‌ها در سر رسید و هلو به‌روز شد؛ آمادهٔ بایگانی')}
                    >
                      <I.shieldCheck size={14} /> تأیید مدیر کل (لطفی) و انتشار قیمت‌ها
                    </Button>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-violet-900" title="اگر برای این شرکت زون‌بند تعیین شده باشد، سند همان‌جا و با برگهٔ خودکارِ بعدی بایگانی می‌شود">
                      <Checkbox checked={autoArchive} onCheckedChange={(v: boolean) => setAutoArchive(v === true)} />
                      بایگانی خودکار
                    </label>
                    {detail.autoArchiveBinder ? (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800" title={detail.autoArchiveBinder.cabinet ? `${detail.autoArchiveBinder.cabinet} ‹ ${detail.autoArchiveBinder.shelf ?? ''}` : undefined}>
                        زون‌بندِ این شرکت: «{detail.autoArchiveBinder.name}» · برگهٔ بعدی خودکار
                      </span>
                    ) : (
                      <span className="text-[10px] leading-4 text-stone-500">
                        زون‌بندی برای این شرکت تعیین نشده — پس از تأیید، از «بایگانی سند کاغذی» بایگانی و ذخیرهٔ زون‌بند کنید تا فاکتورهای بعدی خودکار شوند.
                      </span>
                    )}
                  </div>
                ) : null}
                {dState === 'final' ? (
                  <div className={cn('w-full rounded-lg border p-3 text-[11px] leading-6', detail.gmApprovedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-violet-200 bg-violet-50 text-violet-800')}>
                    {detail.gmApprovedAt ? (
                      <>
                        تأیید مدیر کل انجام شد{detail.gmApprovedByName ? ` (${detail.gmApprovedByName})` : ''} — قیمت فروش (نهایی) و قیمت چاپی (قیمت فروش ۲) روی کالاها به‌روز و در هلو منتشر شد.
                        حالا سند کاغذی را در زون‌کن بایگانی و «بایگانی سند کاغذی» را بزنید.
                      </>
                    ) : (
                      <>
                        فاکتور خرید ثبت شده{detail.finalizedByName ? ` (${detail.finalizedByName})` : ''} — سند خرید{' '}
                        {detail.order ? <b>{fa(detail.order.code)}</b> : 'ثبت‌شده'} و موجودی به‌روز است.
                        {detail.holooInvoiceNo ? ` شماره فاکتور هلو: ${fa(detail.holooInvoiceNo)}.` : ''}
                        {' '}اکنون در انتظار تأیید نهایی مدیر کل (خانم لطفی) است؛ پس از تأیید، قیمت‌ها در هلو منتشر و بایگانی ممکن می‌شود.
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              {/* ── ردپای گردش‌کار ── */}
              {detail.history?.length ? (
                <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                  <div className="text-[11px] font-bold text-stone-600 mb-2">ردپای گردش‌کار</div>
                  <div className="space-y-1.5">
                    {[...detail.history].reverse().map((h, i) => {
                      /* تاریخ ردپا ISO است — formatJalali فقط Date می‌گیرد (درس‌آموختهٔ کارنامهٔ hz.d.ts) */
                      const hdt = h.at ? new Date(h.at) : null
                      /* R15: تاریخ + ساعت هر رویداد — «چه موقع دقیقاً» */
                      const htime = hdt && !isNaN(hdt.getTime()) ? fa(String(hdt.getHours()).padStart(2, '0') + ':' + String(hdt.getMinutes()).padStart(2, '0')) : ''
                      const hdate = hdt && !isNaN(hdt.getTime()) ? `${fa(formatJalali(hdt).replace(/-/g, '/'))}${htime ? ` · ${htime}` : ''}` : ''
                      return (
                      <div key={i} className="flex gap-2 text-[11px] leading-5">
                        <span className="text-stone-400 whitespace-nowrap">{hdate}</span>
                        <span className="font-medium text-stone-700 whitespace-nowrap">{h.label || h.action}:</span>
                        <span className="text-stone-600">{h.by}{h.detail ? ` — ${h.detail}` : ''}</span>
                      </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── دیالوگ ثبت فاکتور خرید ── */}
      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ثبت فاکتور خرید — #{fa(detail?.number ?? '')}</DialogTitle>
            <DialogDescription className="text-[12px] leading-6">
              {detail ? (
                <>
                  {fa(acceptedRows.length)} قلم پذیرفته ({money(acceptedTotal)} ریال)
                  {rejectedRows.length ? ` · ${fa(rejectedRows.length)} قلم مرجوعی (به تأمین‌کننده برمی‌گردد و وارد انبار نمی‌شود)` : ''}.
                  با ثبت، سند خرید تشکیل و موجودی به‌روز می‌شود و (در صورت انتخاب) فاکتور به هلو ارسال می‌شود. انتشار قیمت‌ها پس از تأیید مدیر کل انجام می‌شود.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-stone-600">روش پرداخت</label>
                <Select value={payMethod} onValueChange={(v: string) => { setPayMethod(v); if (v === 'CHEQUE' && !chequeDays) setChequeDays('45') }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">{PAY_LABEL.CASH}</SelectItem>
                    <SelectItem value="CHEQUE">{PAY_LABEL.CHEQUE}</SelectItem>
                    <SelectItem value="POS">{PAY_LABEL.POS}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <Checkbox checked={pushToHoloo} onCheckedChange={(v: boolean) => setPushToHoloo(!!v)} />
                  ارسال به هلو {holooEnabled === false ? <span className="text-[10px] text-amber-600">(اتصال فعال نیست — در صف می‌ماند)</span> : null}
                </label>
              </div>
            </div>
            {payMethod === 'CHEQUE' ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                <label className="text-[11px] font-medium text-amber-900">مهلت چک (روز) — سقف: ۴۵ روز</label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <NumInput value={chequeDays} onChange={(v: string) => setChequeDays(String(Math.min(45, Math.max(1, Number(toEnDigits(v)) || 45))))} placeholder="45" className="w-20" />
                  <span className="text-[11px] leading-5 text-amber-800">
                    چک {fa(toEnDigits(chequeDays) || '45')} روزه هنگام ثبت، خودکار در «چک‌ها» ثبت می‌شود —
                    سررسید: <b className="num">{fa(addJalaliDays(todayJalali(), Number(toEnDigits(chequeDays)) || 45).replace(/-/g, '/'))}</b>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeOpen(false)}>انصراف</Button>
            <Button disabled={busy} onClick={() => void doFinalize()}>
              <I.check size={14} /> ثبت نهایی فاکتور خرید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── دیالوگ بایگانی سند ── */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>بایگانی سند کاغذی — فاکتور #{fa(detail?.number ?? '')}</DialogTitle>
            <DialogDescription className="text-[12px] leading-6">
              سند کاغذی را در زون‌کن (زون‌بند) جا بدهید و جایگاهش را ثبت کنید تا از همین صفحه پیدا شود.
              شماره‌های هلو را هم همین‌جا ثبت کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-stone-600">زون‌بند (الزامی)</label>
              <Select value={archForm.binderId} onValueChange={(v: string) => setArchForm((c) => ({ ...c, binderId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="کابینت ‹ قفسه ‹ زون‌بند" /></SelectTrigger>
                <SelectContent>
                  {binders.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.chain} {b.documentsCount ? <span className="text-stone-400">({fa(b.documentsCount)} سند)</span> : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 text-[11px] font-bold text-emerald-800" title="زون‌بند انتخابی برای این شرکت ذخیره می‌شود؛ فاکتورهای بعدیِ همین شرکت با تأیید مدیر کل خودکار بایگانی می‌شوند">
              <Checkbox checked={saveBinder} onCheckedChange={(v: boolean) => setSaveBinder(v === true)} />
              این زون‌بند را برای این شرکت ذخیره کن — بایگانی خودکارِ فاکتورهای بعدی
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-medium text-stone-600">برگه/جیب</label>
                <Input value={archForm.folio} onChange={(e: any) => setArchForm((c) => ({ ...c, folio: e.target.value }))} placeholder="مثلاً ۱۲" className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-stone-600">هلو — شماره فاکتور</label>
                <Input value={archForm.holooInvoiceNo} onChange={(e: any) => setArchForm((c) => ({ ...c, holooInvoiceNo: e.target.value }))} placeholder="اگر ثبت شده" className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-stone-600">هلو — شماره رسید</label>
                <Input value={archForm.holooReceiptNo} onChange={(e: any) => setArchForm((c) => ({ ...c, holooReceiptNo: e.target.value }))} placeholder="اختیاری" className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-stone-600">اسکن سند (اختیاری — حداکثر ~۳۰۰KB)</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onScanFile} className="text-[11px]" />
                {archForm.scanDataUrl ? <span className="text-[10px] text-emerald-700">ضمیمه شد ✓</span> : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>انصراف</Button>
            <Button disabled={busy || !archForm.binderId} onClick={() => void doArchive()}>
              <I.bookOpen size={14} /> ثبت در بایگانی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── دیالوگ لغو ── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>لغو فاکتور #{fa(detail?.number ?? '')}</DialogTitle>
            <DialogDescription className="text-[12px]">برای لغو، علت را بنویسید (حداقل ۳ حرف) — این کار برگشت‌پذیر نیست.</DialogDescription>
          </DialogHeader>
          <Input value={cancelReason} onChange={(e: any) => setCancelReason(e.target.value)} placeholder="مثلاً: کل محموله مرجوع شد" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>انصراف</Button>
            <Button
              variant="destructive"
              disabled={busy || cancelReason.trim().length < 3}
              onClick={async () => { const okd = await act(detail!.id, { action: 'cancel', reason: cancelReason }, 'فاکتور لغو شد'); if (okd) setCancelOpen(false) }}
            >
              لغو فاکتور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
