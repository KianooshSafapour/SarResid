import { useState, useEffect, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Tabs, TabsList, TabsTrigger, money, fa, toEnDigits, toFaDigits, formatJalali, MoneyInput, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   supply/suppliers — «تأمین‌کنندگان و اشخاص» (R8-SUPPLIERS)
   جایگزین ماژول فروزن انبار←تأمین‌کنندگان و اشخاص. دو تب:
     ۱) طرف حساب‌ها: جدول کامل ۱۱۸۰+ طرف حساب (نام/کد/تلفن/
        طبقه‌بندی/مانده/حد اعتبار/سفارش‌ها) + جست‌وجوی سرور
        (نام/کد/تلفن) + فیلتر طبقه‌بندی و وضعیت + مرتب‌سازی +
        صفحه‌بندی کامل (ورودی شمارهٔ صفحه + آخرین صفحه).
        ✦ رفع ایراد کشنده: دکمهٔ وضعیت در هر ردیف —
          فعال → «غیرفعال کردن» (شبح) · غیرفعال → «فعال‌سازی
          مجدد» (سبز برجسته) — PATCH /api/suppliers/[id] {status}
        پروندهٔ طرف حساب: کلیک ردیف → اطلاعات کامل (کد اقتصادی،
        شناسهٔ ملی، کد پستی، آخرین پرداخت) + سوابق سفارش + ویرایش.
     ۲) نمایندگان فروش: انتقالی از مالی←آرشیو اسناد (R7) — همان
        API ‏/api/archive/reps (CRUD + سوابق اسناد).
        ✦ R10: هر نماینده می‌تواند «تأمین‌کنندگان و اشخاصی که برایشان
          کار می‌کند» را ساختاریافته انتخاب کند (supplierIds ← سقف ۴۰؛
          GET نام/کد را رزولو می‌کند) — چیپ‌های قابل کلیک در جدول،
          چندانتخاب‌گر با جست‌وجو در دیالوگ ثبت/ویرایش، و بخش
          «نمایندگان فروش» در پروندهٔ طرف حساب. فیلد «شرکت» متنی
          برای سازگاری با داده‌های قدیمی باقی مانده است.
   ثبت/ویرایش/تغییر وضعیت: OWNER/GM/ADMIN/EXEC/ACC
   دسترسی نما: OWNER/GM/ADMIN/EXEC/ACC/PM/SK/HC
   ───────────────────────────────────────────────────────────── */

/* ═══════════ ثابت‌ها ═══════════ */

/** نقش‌های مجاز به ثبت/ویرایش/فعال‌سازی (mirrors canMutateSuppliers در API) */
const MUTATE_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC']
/** نقش‌های دارای دسترسی به آرشیو (تب نمایندگان فروش) */
const ARCHIVE_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC']

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

/** انواع سند آرشیو — برای سوابق نمایندهٔ فروش */
const DOC_KINDS: { key: string; label: string; cls: string }[] = [
  { key: 'ORDER', label: 'سفارش خرید', cls: 'border-stone-200 bg-stone-100 text-stone-600' },
  { key: 'INVOICE', label: 'فاکتور خرید', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { key: 'RECEIPT', label: 'رسید پرداخت', cls: 'border-teal-200 bg-teal-50 text-teal-700' },
  { key: 'CHEQUE', label: 'چک', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  { key: 'RETURN', label: 'مرجوعی', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  { key: 'OTHER', label: 'سایر', cls: 'border-stone-200 bg-stone-100 text-stone-600' },
]
const kindMeta = (k: string) => DOC_KINDS.find((x) => x.key === k) || DOC_KINDS[DOC_KINDS.length - 1]

/** فیلتر وضعیت: همه / فعال / غیر فعال (مقادیر دقیق API) */
const STATUS_FILTERS = [
  { key: 'ALL', label: 'همه', sel: 'text-stone-800' },
  { key: 'فعال', label: 'فعال', sel: 'text-emerald-700' },
  { key: 'غیر فعال', label: 'غیر فعال', sel: 'text-rose-700' },
]

const SORTS = [
  { key: 'name', label: 'نام (الفبا)' },
  { key: 'balance', label: 'مانده حساب (بیشترین)' },
  { key: 'creditLimit', label: 'حد اعتبار (بیشترین)' },
]

/* ═══════════ راهنماها ═══════════ */

/** ۱۴۰۵-۰۸-۰۲ → ۱۴۰۵/۰۸/۰۲ (رشتهٔ جلالی) */
function faDate(v?: string | null): string {
  if (!v) return '—'
  return toFaDigits(String(v).replace(/-/g, '/'))
}

/** ISO → ۱۴۰۵/۰۸/۰۲ */
function isoFa(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  return toFaDigits(formatJalali(d).replace(/-/g, '/'))
}

/** ورودی فقط-رقم: نمایش فارسی، ذخیرهٔ لاتین — برای کد / تلفن / شناسه‌ها */
function DigitInput(props: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const { value, onChange, placeholder, className } = props
  return (
    <Input dir="ltr" className={cn('num h-9 text-center text-sm', className)} value={toFaDigits(value)}
      placeholder={placeholder ? toFaDigits(placeholder) : ''}
      onChange={(e: any) => onChange(toEnDigits(e.target.value).replace(/[^\d]/g, ''))} />
  )
}

/** مانده: منفی = بدهی (رز) · مثبت = اعتبار (سبز) — هم‌راستا با سفارش‌گذاری */
function balanceInfo(b: number | null | undefined): { debt: boolean; mag: number } | null {
  if (b === null || b === undefined || b === 0) return null
  return b < 0 ? { debt: true, mag: Math.abs(b) } : { debt: false, mag: b }
}

/* ═══════════ R10: تأمین‌کنندگانِ مرتبط با نماینده ═══════════ */

/** سقف انتخاب تأمین‌کننده برای هر نماینده (هماهنگ با API) */
const REP_SUP_CAP = 40

/** نرمال‌سازی متن فارسی برای جست‌وجو (ی/ک عربی، نیم‌فاصله، فاصله‌ها) */
function normFa(s: string): string {
  return String(s || '').replace(/\u200c/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase()
}

/* ═══════════ شکل داده‌ها ═══════════ */

interface SupRow {
  id: string
  name: string
  code: string | null
  phone: string | null
  job: string | null
  classification: string | null
  balance: number | null
  creditLimit: number
  status: string
  ordersCount: number
}

interface SupOrder {
  id: string
  code: string
  status: string
  deliveryDate: string | null
  totalAmount: number
  createdAt: string
  itemsCount: number
}

interface SupDetail {
  id: string
  name: string
  code: string | null
  phone: string | null
  job: string | null
  classification: string | null
  intermediary: string | null
  balance: number | null
  creditLimit: number
  economicCode: string | null
  nationalId: string | null
  postalCode: string | null
  lastPaymentAmount: number
  lastPaymentDate: string | null
  status: string
  note: string | null
  createdAt: string
  orders: SupOrder[]
}

interface RepItem {
  id: string
  name: string
  mobile?: string | null
  company?: string | null
  title?: string | null
  note?: string | null
  active: boolean
  documentsCount: number
  /** R10: تأمین‌کنندگانی که این نماینده برایشان کار می‌کند (رزولو‌شده از supplierIdsJson) */
  suppliers?: { id: string; name: string; code: string | null }[]
}

/** سند آرشیو در سوابق نماینده (فهرست سبک /api/archive) */
interface HistDoc {
  id: string
  kind: string
  title: string
  dateJalali?: string | null
  amount: number
  repRole?: string | null
  folio?: string | null
  location?: {
    binder: { name: string; code: string }
    shelf: { name: string } | null
    cabinet: { name: string } | null
  } | null
}

/* ═══════════ نما ═══════════ */

export default function SuppliersView() {
  const { user } = useShell()
  const canMutate = MUTATE_ROLES.includes(String(user?.role || ''))
  const canArchive = ARCHIVE_ROLES.includes(String(user?.role || ''))

  /* ── تب فعال ── */
  const [tab, setTab] = useState('list')

  /* ── فهرست طرف حساب‌ها ── */
  const [q, setQ] = useState('')
  const [qEff, setQEff] = useState('')
  const [fClass, setFClass] = useState('ALL')
  const [fStatus, setFStatus] = useState('ALL')
  const [fSort, setFSort] = useState('name')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [pageJump, setPageJump] = useState('')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<SupRow[]>([])
  const [classifications, setClassifications] = useState<{ name: string; count: number }[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [counts, setCounts] = useState<{ all: number; active: number; inactive: number }>({ all: 0, active: 0, inactive: 0 })
  const reqSeq = useRef(0)
  const [busyId, setBusyId] = useState('')

  /* ── دیالوگ پروندهٔ طرف حساب ── */
  const [detailId, setDetailId] = useState('')
  const [detail, setDetail] = useState<SupDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  /* ── دیالوگ ثبت/ویرایش طرف حساب ── */
  const emptyForm = {
    id: '', name: '', code: '', phone: '', job: '',
    classification: 'NONE', classificationCustom: '',
    intermediary: '', balance: '', balanceSign: 'credit', creditLimit: '',
    economicCode: '', nationalId: '', postalCode: '', note: '',
    status: 'فعال',
  }
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<any>({ ...emptyForm })
  const [savingForm, setSavingForm] = useState(false)

  /* ── نمایندگان فروش (انتقالی از آرشیو) ── R10: فهرست همیشه کامل بارگذاری می‌شود
     (جست‌وجوی جدول سمت کلاین است) تا بخش «نمایندگان فروش» پروندهٔ طرف حساب‌ها همیشه درست باشد */
  const [reps, setReps] = useState<RepItem[]>([])
  const [repQ, setRepQ] = useState('')
  const [repsLoading, setRepsLoading] = useState(false)

  const emptyRep = { id: '', name: '', mobile: '', company: '', title: '', note: '', active: true, supplierIds: [] as string[] }
  const [repOpen, setRepOpen] = useState(false)
  const [repForm, setRepForm] = useState<any>({ ...emptyRep })
  const [savingRep, setSavingRep] = useState(false)

  /* R10: استخر انتخاب تأمین‌کننده در دیالوگ نماینده — یک‌بار و با کش */
  const [supPool, setSupPool] = useState<{ id: string; name: string; code: string | null }[]>([])
  const [supPoolLoading, setSupPoolLoading] = useState(false)
  const [repSupQ, setRepSupQ] = useState('')

  const [repHist, setRepHist] = useState<RepItem | null>(null)
  const [repHistDocs, setRepHistDocs] = useState<HistDoc[]>([])
  const [repHistLoading, setRepHistLoading] = useState(false)

  /* ═══════════ بارگذاری داده‌ها ═══════════ */

  useEffect(() => {
    const t = setTimeout(() => setQEff(q), 400)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setPage(1)
    void loadList(1)
  }, [qEff, fClass, fStatus, fSort, pageSize])

  useEffect(() => { void loadCounts() }, [])
  /* R10: بار کامل (بدون q) — جست‌وجوی جدول سمت کلاین؛ بار مجدد پس از ذخیره/حذف با loadReps() */
  useEffect(() => { if (canArchive) void loadReps() }, [])

  /** فهرست طرف حساب‌ها — صفحهٔ صریح + seq-guard ضد پاسخ کهنه */
  async function loadList(p = page) {
    const seq = ++reqSeq.current
    setLoading(true)
    const r = await api(`/api/suppliers${qs({
      q: qEff || undefined,
      classification: fClass !== 'ALL' ? fClass : undefined,
      status: fStatus !== 'ALL' ? fStatus : undefined,
      sort: fSort,
      page: String(p),
      pageSize: String(pageSize),
    })}`)
    if (seq !== reqSeq.current) return /* پاسخ کهنه */
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری طرف حساب‌ها ناموفق بود'); return }
    setItems(r.data?.items || [])
    setTotal(r.data?.total || 0)
    setPages(r.data?.pages || 1)
    if (r.data?.classifications) setClassifications(r.data.classifications)
  }

  /** شمارش سه‌گانه برای چیپ‌های وضعیت (سه درخواست سبک pageSize=1) */
  async function loadCounts() {
    const [rAll, rAct, rIn] = await Promise.all([
      api('/api/suppliers?pageSize=1'),
      api(`/api/suppliers${qs({ status: 'فعال', pageSize: '1' })}`),
      api(`/api/suppliers${qs({ status: 'غیر فعال', pageSize: '1' })}`),
    ])
    setCounts({
      all: rAll.ok ? rAll.data?.total ?? 0 : 0,
      active: rAct.ok ? rAct.data?.total ?? 0 : 0,
      inactive: rIn.ok ? rIn.data?.total ?? 0 : 0,
    })
  }

  function gotoPage(p: number) {
    const target = Math.min(Math.max(1, p), pages)
    setPage(target)
    void loadList(target)
  }

  function jumpToPage() {
    const n = Number(pageJump)
    if (!n || n < 1 || n > pages) return toast.error(`شمارهٔ صفحه باید بین ۱ تا ${fa(pages)} باشد`)
    setPageJump('')
    gotoPage(n)
  }

  /** ✦ رفع ایراد کشنده: تغییر وضعیت فعال ↔ غیر فعال (PATCH) */
  async function toggleStatus(row: SupRow) {
    const next = row.status === 'فعال' ? 'غیر فعال' : 'فعال'
    setBusyId(row.id)
    const r = await api(`/api/suppliers/${row.id}`, { method: 'PATCH', body: { status: next } })
    setBusyId('')
    if (!r.ok) return toast.error(r.error || 'تغییر وضعیت انجام نشد')
    toast.success(next === 'فعال' ? `«${row.name}» دوباره فعال شد` : `«${row.name}» غیرفعال شد`)
    void loadList(page)
    void loadCounts()
    /* اگر پروندهٔ همین طرف حساب باز است، تازه‌اش کن */
    if (detailId === row.id) void openDetail(row.id)
  }

  /* ═══════════ پروندهٔ طرف حساب ═══════════ */

  async function openDetail(id: string) {
    setDetailId(id)
    setDetail(null)
    setDetailLoading(true)
    const r = await api(`/api/suppliers/${id}`)
    setDetailLoading(false)
    if (!r.ok) {
      toast.error(r.error || 'دریافت پروندهٔ طرف حساب ناموفق بود')
      setDetailId('')
      return
    }
    setDetail(r.data)
  }

  /* ═══════════ ثبت / ویرایش طرف حساب ═══════════ */

  function openCreate() {
    setForm({ ...emptyForm })
    setFormOpen(true)
  }

  function openEdit(d: SupDetail) {
    const bal = balanceInfo(d.balance)
    const known = classifications.some((c) => c.name === d.classification)
    setForm({
      id: d.id,
      name: d.name || '',
      code: d.code || '',
      phone: d.phone || '',
      job: d.job || '',
      classification: d.classification ? (known ? d.classification : 'CUSTOM') : 'NONE',
      classificationCustom: d.classification && !known ? d.classification : '',
      intermediary: d.intermediary || '',
      balance: bal ? String(bal.mag) : '',
      balanceSign: bal ? (bal.debt ? 'debt' : 'credit') : 'credit',
      creditLimit: d.creditLimit > 0 ? String(Math.round(d.creditLimit)) : '',
      economicCode: d.economicCode || '',
      nationalId: d.nationalId || '',
      postalCode: d.postalCode || '',
      note: d.note || '',
      status: d.status === 'فعال' ? 'فعال' : 'غیر فعال',
    })
    setDetailId('') /* پرونده بسته می‌شود؛ بعد از ذخیره دوباره باز می‌شود */
    setFormOpen(true)
  }

  async function submitForm() {
    if (!form.name.trim()) return toast.error('نام طرف حساب الزامی است')
    if (form.classification === 'CUSTOM' && !form.classificationCustom.trim()) return toast.error('طبقه‌بندی دستی را وارد کنید یا از فهرست انتخاب کنید')
    setSavingForm(true)
    const mag = Number(toEnDigits(form.balance || '0').replace(/[^\d]/g, '')) || 0
    const body: any = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      phone: form.phone.trim() || null,
      job: form.job.trim() || null,
      classification: form.classification === 'NONE'
        ? null
        : form.classification === 'CUSTOM'
          ? (form.classificationCustom.trim() || null)
          : form.classification,
      intermediary: form.intermediary.trim() || null,
      balance: form.balance === '' ? null : form.balanceSign === 'debt' ? -mag : mag,
      creditLimit: Number(toEnDigits(form.creditLimit || '0').replace(/[^\d]/g, '')) || 0,
      economicCode: form.economicCode.trim() || null,
      nationalId: form.nationalId.trim() || null,
      postalCode: form.postalCode.trim() || null,
      note: form.note.trim() || null,
    }
    const isEdit = !!form.id
    if (isEdit) body.status = form.status
    const r = isEdit
      ? await api(`/api/suppliers/${form.id}`, { method: 'PATCH', body })
      : await api('/api/suppliers', { method: 'POST', body })
    setSavingForm(false)
    if (!r.ok) return toast.error(r.error || 'ذخیرهٔ طرف حساب انجام نشد')
    toast.success(isEdit ? `«${form.name.trim()}» به‌روزرسانی شد` : `«${form.name.trim()}» ثبت شد`)
    setFormOpen(false)
    void loadList(page)
    void loadCounts()
    if (isEdit) void openDetail(form.id)
  }

  /* ═══════════ نمایندگان فروش ═══════════ */

  /** فهرست کامل (بدون فیلتر سرور) — سمت کلاین با repQ فیلتر می‌شود */
  async function loadReps() {
    if (!canArchive) return
    setRepsLoading(true)
    const r = await api('/api/archive/reps')
    setRepsLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری نمایندگان ناموفق بود'); return }
    setReps(r.data?.items || [])
  }

  /** R10: استخر تأمین‌کنندگانِ فعال برای چندانتخاب‌گر دیالوگ نماینده (یک‌بار، با کش)
   *  ادغامی با قبلی‌ها — تأمین‌کنندگانِ غیرفعالِ از قبل انتخاب‌شده (که در فهرست فعال‌ها نیستند) حفظ می‌شوند */
  async function loadSupPool() {
    setSupPoolLoading(true)
    const r = await api('/api/suppliers' + qs({ pageSize: 2400, sort: 'name', status: 'فعال' }))
    setSupPoolLoading(false)
    if (!r.ok) { toast.error(r.error || 'دریافت فهرست طرف حساب‌ها ناموفق بود'); return }
    const fetched = (r.data?.items ?? []).map((s: any) => ({ id: s.id as string, name: s.name as string, code: (s.code ?? null) as string | null }))
    setSupPool((prev) => {
      const seen = new Set(prev.map((s) => s.id))
      return [...prev, ...fetched.filter((s) => !seen.has(s.id))]
    })
  }

  /* با باز شدن دیالوگ، استخر را یک‌بار بگیر (کش) و جست‌وجوی قبلی را پاک کن */
  useEffect(() => {
    if (!repOpen) return
    setRepSupQ('')
    if (!supPool.length && !supPoolLoading) void loadSupPool()
  }, [repOpen])

  function openRepCreate() { setRepForm({ ...emptyRep }); setRepOpen(true) }
  function openRepEdit(rep: RepItem) {
    setRepForm({
      id: rep.id, name: rep.name, mobile: rep.mobile || '', company: rep.company || '',
      title: rep.title || '', note: rep.note || '', active: rep.active,
      supplierIds: (rep.suppliers || []).map((s) => s.id),
    })
    /* تأمین‌کنندگانِ غیرفعالِ از قبل انتخاب‌شده هم در استخر بیایند تا چیپ‌شان دیده شود */
    const known = new Set(supPool.map((s) => s.id))
    const extra = (rep.suppliers || []).filter((s) => !known.has(s.id)).map((s) => ({ id: s.id, name: s.name, code: s.code }))
    if (extra.length) setSupPool((pool) => [...pool, ...extra])
    setRepOpen(true)
  }

  /** افزودن/حذف یک تأمین‌کننده از فرم نماینده (سقف ۴۰) */
  function toggleRepSup(id: string, add: boolean) {
    setRepForm((f: any) => {
      const cur: string[] = f.supplierIds || []
      const next = add
        ? (cur.includes(id) || cur.length >= REP_SUP_CAP ? cur : [...cur, id])
        : cur.filter((x) => x !== id)
      return { ...f, supplierIds: next }
    })
  }

  async function submitRep() {
    if (!repForm.name.trim()) return toast.error('نام نماینده را وارد کنید')
    setSavingRep(true)
    const body = {
      name: repForm.name.trim(),
      mobile: repForm.mobile.trim() || null,
      company: repForm.company.trim() || null,
      title: repForm.title.trim() || null,
      note: repForm.note.trim() || null,
      active: !!repForm.active,
      supplierIds: (repForm.supplierIds || []) as string[], // R10
    }
    const r = repForm.id
      ? await api('/api/archive/reps', { method: 'PUT', body: { ...body, id: repForm.id } })
      : await api('/api/archive/reps', { method: 'POST', body })
    setSavingRep(false)
    if (!r.ok) return toast.error(r.error || 'ذخیرهٔ نماینده انجام نشد')
    toast.success(repForm.id ? 'نماینده به‌روزرسانی شد' : 'نماینده ثبت شد')
    setRepOpen(false)
    void loadReps()
  }

  async function delRep(rep: RepItem) {
    if (!window.confirm(`نمایندهٔ «${rep.name}» حذف شود؟ سندهای ثبت‌شده با نام او باقی می‌مانند.`)) return
    const r = await api(`/api/archive/reps?id=${rep.id}`, { method: 'DELETE' })
    if (!r.ok) return toast.error(r.error || 'حذف انجام نشد')
    toast.success('نماینده حذف شد')
    void loadReps()
  }

  async function toggleRep(rep: RepItem) {
    const r = await api('/api/archive/reps', { method: 'PUT', body: { id: rep.id, active: !rep.active } })
    if (!r.ok) return toast.error(r.error || 'تغییر وضعیت انجام نشد')
    void loadReps()
  }

  async function openRepHistory(rep: RepItem) {
    setRepHist(rep)
    setRepHistDocs([])
    setRepHistLoading(true)
    const r = await api(`/api/archive?repId=${rep.id}&pageSize=100&sort=date`)
    setRepHistLoading(false)
    if (!r.ok) { toast.error(r.error || 'دریافت سوابق ناموفق بود'); return }
    setRepHistDocs(r.data?.items || [])
  }

  /* ═══════════ رندر ═══════════ */

  const hasFilter = !!qEff || fClass !== 'ALL' || fStatus !== 'ALL'
  const colCount = canMutate ? 8 : 7
  const countOf = (key: string) => key === 'ALL' ? counts.all : key === 'فعال' ? counts.active : counts.inactive

  /* R10: فیلتر سمت کلاینِ جدول نمایندگان (نام/موبایل/شرکت/سمت/یادداشت + نامِ تأمین‌کنندگانِ مرتبط) */
  const repsShown = (() => {
    const t = normFa(toEnDigits(repQ))
    if (!t) return reps
    return reps.filter((r) =>
      normFa(toEnDigits(`${r.name} ${r.company || ''} ${r.title || ''} ${r.note || ''}`)).includes(t)
      || (r.mobile || '').includes(toEnDigits(repQ).trim())
      || (r.suppliers || []).some((s) => normFa(s.name).includes(t) || (s.code || '').includes(toEnDigits(repQ).trim())))
  })()

  /* R10: چیپ‌های انتخاب‌شده در دیالوگ نماینده — به ترتیب انتخاب، رزولو از استخر */
  const repSelSups = ((repForm.supplierIds || []) as string[])
    .map((id) => supPool.find((s) => s.id === id))
    .filter((s): s is { id: string; name: string; code: string | null } => !!s)

  /* R10: نتایج جست‌وجوی چندانتخاب‌گر — فقط مواردِ هنوز انتخاب‌نشده */
  const repSupResults = (() => {
    const t = normFa(toEnDigits(repSupQ))
    if (!t) return []
    const sel = new Set((repForm.supplierIds || []) as string[])
    return supPool
      .filter((s) => !sel.has(s.id))
      .filter((s) => normFa(s.name).includes(t) || (s.code || '').includes(toEnDigits(repSupQ).trim()))
      .slice(0, 12)
  })()

  /** سلول مانده — بدهی رز / اعتبار سبز */
  function balanceCell(b: number | null | undefined) {
    const bi = balanceInfo(b)
    if (!bi) return <span className="num text-xs text-stone-400">۰</span>
    return (
      <div className="leading-tight">
        <div className={cn('text-[11px] font-bold', bi.debt ? 'text-rose-600' : 'text-emerald-600')}>
          {bi.debt ? 'بدهی' : 'اعتبار'}
        </div>
        <div className={cn('num text-xs font-extrabold', bi.debt ? 'text-rose-700' : 'text-emerald-700')}>
          {money(bi.mag)}
        </div>
      </div>
    )
  }

  function statusBadge(status: string) {
    const ok = status === 'فعال'
    return (
      <Badge variant="outline" className={ok
        ? 'border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700'
        : 'border-stone-300 bg-stone-100 text-[10px] text-stone-500'}>
        {ok ? 'فعال' : 'غیر فعال'}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      {/* ═══════ سربرگ + آمار ═══════ */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-emerald-900">
                <I.handshake size={18} /> تأمین‌کنندگان و اشخاص
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">
                دفتر طرف حساب‌های تجاری هایپر زیتون — تأمین‌کنندگان، اشخاص و نمایندگان فروش؛ مانده، حد اعتبار و سوابق سفارش.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">کل · {fa(counts.all)}</Badge>
              <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10px] text-teal-700">فعال · {fa(counts.active)}</Badge>
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-700">غیر فعال · {fa(counts.inactive)}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="list"><I.store size={14} className="ml-1 inline" /> طرف حساب‌ها</TabsTrigger>
          <TabsTrigger value="reps"><I.users size={14} className="ml-1 inline" /> نمایندگان فروش</TabsTrigger>
        </TabsList>

        {/* ═══════════ تب ۱: طرف حساب‌ها ═══════════ */}
        {tab === 'list' && (
          <div className="space-y-3 pt-3">
            {/* نوار ابزار */}
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-60 flex-1">
                    <I.search size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <Input
                      value={q}
                      onChange={(e: any) => setQ(e.target.value)}
                      placeholder="جست‌وجو: نام طرف حساب، کد، شماره تلفن…"
                      className="h-11 border-emerald-300 bg-emerald-50/40 pr-9 text-sm font-semibold placeholder:font-normal placeholder:text-stone-400 focus:border-emerald-500"
                    />
                  </div>
                  {canMutate && (
                    <Button className="h-11 gap-1.5" onClick={openCreate}><I.plus size={15} /> طرف حساب جدید</Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* طبقه‌بندی */}
                  <Select dir="rtl" value={fClass} onValueChange={setFClass}>
                    <SelectTrigger className="h-8 w-44 text-xs" aria-label="فیلتر طبقه‌بندی"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">همهٔ طبقه‌بندی‌ها</SelectItem>
                      {classifications.map((c) => (
                        <SelectItem key={c.name} value={c.name}>{c.name} · {fa(c.count)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* مرتب‌سازی */}
                  <Select dir="rtl" value={fSort} onValueChange={setFSort}>
                    <SelectTrigger className="h-8 w-44 text-xs" aria-label="مرتب‌سازی"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SORTS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {/* چیپ‌های وضعیت */}
                  <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                    {STATUS_FILTERS.map((s) => (
                      <button key={s.key} type="button" onClick={() => setFStatus(s.key)}
                        className={cn('num rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors',
                          fStatus === s.key ? cn('bg-white shadow-sm', s.sel) : 'text-stone-500 hover:text-stone-700')}>
                        {s.label} · {fa(countOf(s.key))}
                      </button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => { void loadList(page); void loadCounts() }}>
                    <I.refresh size={13} /> به‌روزرسانی
                  </Button>
                  {hasFilter && (
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-stone-500"
                      onClick={() => { setQ(''); setFClass('ALL'); setFStatus('ALL') }}>
                      <I.x size={13} /> پاک‌کردن فیلترها
                    </Button>
                  )}
                  <span className="mr-auto num text-[11px] text-stone-500">
                    {loading ? '…' : `${fa(total)} طرف حساب`}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* جدول طرف حساب‌ها */}
            <Card>
              <CardContent className="p-0">
                <Table dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead>نام / کد</TableHead>
                      <TableHead className="text-center">تلفن</TableHead>
                      <TableHead>طبقه‌بندی</TableHead>
                      <TableHead className="text-left">مانده (ریال)</TableHead>
                      <TableHead className="text-left">حد اعتبار</TableHead>
                      <TableHead className="text-center">سفارش‌ها</TableHead>
                      <TableHead className="text-center">وضعیت</TableHead>
                      {canMutate && <TableHead className="text-center">عملیات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && items.length === 0 ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={`sk-${i}`}>
                          {Array.from({ length: colCount }).map((__, j) => (
                            <TableCell key={j}><div className="mx-auto h-4 w-full max-w-28 animate-pulse rounded bg-stone-100" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={colCount} className="py-10 text-center text-sm text-stone-400">
                          {hasFilter
                            ? 'طرف حسابی با این فیلترها یافت نشد — عبارت دیگری را جست‌وجو کنید یا فیلترها را پاک کنید.'
                            : <>هنوز طرف حسابی ثبت نشده —{' '}
                              {canMutate
                                ? <button className="font-bold text-emerald-700 underline" onClick={openCreate}>ثبت اولین طرف حساب</button>
                                : 'از مدیران بخواهید طرف حساب‌ها را وارد کنند.'}
                            </>}
                        </TableCell>
                      </TableRow>
                    ) : items.map((row) => {
                      const ok = row.status === 'فعال'
                      return (
                        <TableRow key={row.id}
                          className={cn('cursor-pointer hover:bg-emerald-50/40', !ok && 'bg-stone-50/70')}
                          onClick={() => void openDetail(row.id)}>
                          <TableCell>
                            <div className={cn('max-w-56 truncate text-sm font-bold', ok ? 'text-stone-800' : 'text-stone-500')}>{row.name}</div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              {row.code ? <span dir="ltr" className="num text-[10px] text-stone-500">کد {toFaDigits(row.code)}</span> : null}
                              {row.job ? <span className="truncate text-[10px] text-stone-400">· {row.job}</span> : null}
                            </div>
                          </TableCell>
                          <TableCell className="num text-center text-xs text-stone-600" dir="ltr">
                            {row.phone ? toFaDigits(row.phone) : <span className="text-stone-300">—</span>}
                          </TableCell>
                          <TableCell>
                            {row.classification
                              ? <span className="text-[11px] font-semibold text-teal-800">{row.classification}</span>
                              : <span className="text-xs text-stone-300">—</span>}
                          </TableCell>
                          <TableCell className="text-left">{balanceCell(row.balance)}</TableCell>
                          <TableCell className="num text-left text-xs font-semibold text-stone-600">
                            {row.creditLimit > 0 ? money(row.creditLimit) : <span className="text-stone-300">—</span>}
                          </TableCell>
                          <TableCell className="num text-center text-xs font-bold text-stone-700">{fa(row.ordersCount)}</TableCell>
                          <TableCell className="text-center">{statusBadge(row.status)}</TableCell>
                          {canMutate && (
                            <TableCell className="text-center">
                              {ok ? (
                                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-stone-500 hover:bg-rose-50 hover:text-rose-700"
                                  disabled={busyId === row.id} title="غیرفعال کردن — هر زمان می‌توانید دوباره فعال کنید"
                                  onClick={(e: any) => { e.stopPropagation(); void toggleStatus(row) }}>
                                  <I.eyeOff size={13} /> غیرفعال کردن
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" className="h-7 gap-1 border-emerald-300 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                                  disabled={busyId === row.id} title="فعال‌سازی مجدد این طرف حساب"
                                  onClick={(e: any) => { e.stopPropagation(); void toggleStatus(row) }}>
                                  <I.eye size={13} /> فعال‌سازی مجدد
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {/* صفحه‌بندی: قبلی/بعدی + اندازهٔ صفحه + ورودی شمارهٔ صفحه + آخرین صفحه */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-2">
                  <p className="num text-[11px] text-stone-500">صفحهٔ {fa(page)} از {fa(pages)} · {fa(total)} طرف حساب</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Select dir="rtl" value={String(pageSize)} onValueChange={(v: string) => setPageSize(Number(v))}>
                      <SelectTrigger className="h-7 w-28 text-[11px]" aria-label="تعداد در صفحه"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['24', '48', '96'].map((n) => <SelectItem key={n} value={n}>{fa(Number(n))} در صفحه</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-7 gap-1" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>
                      <I.chevronRight size={13} /> قبلی
                    </Button>
                    <div className="flex items-center gap-1">
                      <Input dir="ltr" className="num h-7 w-14 px-1 text-center text-[11px]" value={pageJump}
                        placeholder={toFaDigits(page)}
                        onChange={(e: any) => setPageJump(toEnDigits(e.target.value).replace(/[^\d]/g, ''))}
                        onKeyDown={(e: any) => { if (e.key === 'Enter') jumpToPage() }} />
                      <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={jumpToPage}>برو</Button>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 gap-1" disabled={page >= pages} onClick={() => gotoPage(page + 1)}>
                      بعدی <I.chevronLeft size={13} />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" disabled={page >= pages} onClick={() => gotoPage(pages)}>
                      آخرین صفحه <I.arrowLeft size={13} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <p className="text-[10px] leading-4 text-stone-400">
              روی هر ردیف کلیک کنید تا پروندهٔ کامل طرف حساب (کد اقتصادی، شناسهٔ ملی، آخرین پرداخت و سوابق سفارش) باز شود.
              {canMutate ? ' غیرفعال‌کردن قابل بازگشت است — با «فعال‌سازی مجدد» طرف حساب به فهرست فعال‌ها برمی‌گردد.' : ' فعال/غیرفعال‌سازی و ویرایش توسط مدیران انجام می‌شود.'}
            </p>
          </div>
        )}

        {/* ═══════════ تب ۲: نمایندگان فروش ═══════════ */}
        {tab === 'reps' && (
          <div className="space-y-3 pt-3">
            {!canArchive ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <I.lock size={26} className="mx-auto mb-2 text-stone-400" />
                  <p className="text-sm font-bold text-stone-600">نمایندگان فروش به آرشیو اسناد متصل است</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-stone-400">
                    فهرست نمایندگان (کسانی که چک/نقد می‌گیرند یا مرجوعی می‌آورند) فقط برای نقش‌های
                    مالک، مدیر کل، مدیر، مدیر اجرایی و حسابدار قابل مشاهده است.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-2 p-4">
                    <div className="relative min-w-52 flex-1">
                      <I.search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                      <Input value={repQ} onChange={(e: any) => setRepQ(e.target.value)} placeholder="جست‌وجوی نماینده (نام، موبایل، شرکت، سمت، تأمین‌کننده…)…" className="h-9 pr-9 text-sm" />
                    </div>
                    <span className="num text-xs text-stone-500">
                      {repQ ? `${fa(repsShown.length)} از ${fa(reps.length)}` : fa(reps.length)} نماینده
                    </span>
                    <Button size="sm" className="gap-1.5" onClick={openRepCreate}><I.plus size={14} /> نمایندهٔ جدید</Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-0">
                    <Table dir="rtl">
                      <TableHeader>
                        <TableRow>
                          <TableHead>نام</TableHead>
                          <TableHead className="text-center">موبایل</TableHead>
                          <TableHead>شرکت</TableHead>
                          <TableHead>سمت</TableHead>
                          <TableHead className="text-center">اسناد</TableHead>
                          <TableHead className="text-center">وضعیت</TableHead>
                          <TableHead className="text-center">عملیات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {repsLoading && reps.length === 0 ? (
                          Array.from({ length: 4 }).map((_, i) => (
                            <TableRow key={`rsk-${i}`}>
                              {Array.from({ length: 7 }).map((__, j) => (
                                <TableCell key={j}><div className="mx-auto h-4 w-full max-w-24 animate-pulse rounded bg-stone-100" /></TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : repsShown.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-stone-400">
                            {repQ ? 'نماینده‌ای با این عبارت یافت نشد.' : 'نماینده‌ای ثبت نشده — نمایندگان فروش (کسانی که چک/نقد می‌گیرند یا مرجوعی می‌آورند) را اضافه کنید.'}
                          </TableCell></TableRow>
                        ) : repsShown.map((rep) => (
                          <TableRow key={rep.id}>
                            <TableCell>
                              <button className="text-sm font-bold text-stone-800 hover:text-emerald-700 hover:underline" onClick={() => void openRepHistory(rep)}>
                                {rep.name}
                              </button>
                              {rep.note ? <div className="max-w-48 truncate text-[10px] text-stone-400">{rep.note}</div> : null}
                              {/* R10: تأمین‌کنندگانِ مرتبط — چیپ‌های قابل کلیک (پروندهٔ طرف حساب باز می‌شود) */}
                              {(rep.suppliers?.length ?? 0) > 0 && (
                                <div className="mt-1 flex max-w-64 flex-wrap items-center gap-1">
                                  {(rep.suppliers || []).slice(0, 3).map((s) => (
                                    <button key={s.id} type="button"
                                      title={`پروندهٔ طرف حساب «${s.name}»${s.code ? ` — کد ${toFaDigits(s.code)}` : ''} — کلیک: باز کردن پرونده`}
                                      className="max-w-32 truncate rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-800 transition-colors hover:bg-teal-100"
                                      onClick={() => void openDetail(s.id)}>
                                      {s.name}
                                    </button>
                                  ))}
                                  {(rep.suppliers || []).length > 3 && (
                                    <span className="num rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[9px] font-bold text-stone-500"
                                      title={(rep.suppliers || []).map((s) => s.name).join(' · ')}>
                                      +{fa((rep.suppliers || []).length - 3)} دیگر
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="num text-center text-xs text-stone-600" dir="ltr">{rep.mobile ? toFaDigits(rep.mobile) : '—'}</TableCell>
                            <TableCell className="max-w-40 truncate text-xs text-stone-600">{rep.company || '—'}</TableCell>
                            <TableCell className="text-xs text-stone-600">{rep.title || '—'}</TableCell>
                            <TableCell className="num text-center text-xs font-bold text-emerald-700">{fa(rep.documentsCount)}</TableCell>
                            <TableCell className="text-center">
                              <button onClick={() => void toggleRep(rep)} title="تغییر وضعیت">
                                <Badge variant="outline" className={rep.active
                                  ? 'border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700'
                                  : 'border-stone-200 bg-stone-100 text-[10px] text-stone-500'}>
                                  {rep.active ? 'فعال' : 'غیرفعال'}
                                </Badge>
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="سوابق اسناد" onClick={() => void openRepHistory(rep)}><I.history size={14} className="text-emerald-700" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="ویرایش" onClick={() => openRepEdit(rep)}><I.pencil size={13} className="text-stone-600" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="حذف" onClick={() => void delRep(rep)}><I.trash size={13} className="text-rose-600" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <p className="text-[10px] leading-4 text-stone-400">
                  نمایندگان فروش در ثبت سند آرشیو هم استفاده می‌شوند (دریافت چک/نقد، تحویل مرجوعی…) — سوابق کامل هر سند در مالی ← آرشیو اسناد.
                </p>
              </>
            )}
          </div>
        )}
      </Tabs>

      {/* ═══════════ دیالوگ پروندهٔ طرف حساب ═══════════ */}
      <Dialog open={!!detailId} onOpenChange={(o: boolean) => { if (!o) { setDetailId(''); setDetail(null) } }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          {detailLoading && !detail ? (
            <div className="space-y-3">
              <div className="h-6 w-48 animate-pulse rounded bg-stone-100" />
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-stone-100" />)}
              </div>
              <div className="h-24 animate-pulse rounded bg-stone-100" />
            </div>
          ) : detail && (() => {
            const bi = balanceInfo(detail.balance)
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <I.handshake size={17} className="text-emerald-700" />
                    <span className="text-sm">{detail.name}</span>
                    {statusBadge(detail.status)}
                    {detail.code ? (
                      <span dir="ltr" className="num rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        {toFaDigits(detail.code)}
                      </span>
                    ) : null}
                  </DialogTitle>
                  <DialogDescription>پروندهٔ طرف حساب — اطلاعات کامل، مانده و سوابق سفارش</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  {/* مانده + اعتبار + آخرین پرداخت */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className={cn('rounded-xl border p-3 text-center', bi?.debt ? 'border-rose-200 bg-rose-50/60' : 'border-emerald-200 bg-emerald-50/60')}>
                      <div className="text-[10px] font-bold text-stone-500">مانده حساب</div>
                      <div className={cn('num mt-1 text-base font-extrabold', bi?.debt ? 'text-rose-700' : 'text-emerald-700')}>
                        {bi ? `${bi.debt ? 'بدهی ' : 'اعتبار '}${money(bi.mag)}` : '۰'}
                      </div>
                      <div className="text-[9px] text-stone-400">ریال</div>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-center">
                      <div className="text-[10px] font-bold text-stone-500">حد اعتبار</div>
                      <div className="num mt-1 text-base font-extrabold text-stone-700">
                        {detail.creditLimit > 0 ? money(detail.creditLimit) : '—'}
                      </div>
                      <div className="text-[9px] text-stone-400">{detail.creditLimit > 0 ? 'ریال' : 'بدون حد'}</div>
                    </div>
                    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 text-center">
                      <div className="text-[10px] font-bold text-stone-500">آخرین پرداخت</div>
                      <div className="num mt-1 text-base font-extrabold text-teal-800">
                        {detail.lastPaymentAmount > 0 ? money(detail.lastPaymentAmount) : '—'}
                      </div>
                      <div className="num text-[9px] text-stone-400">{detail.lastPaymentAmount > 0 ? isoFa(detail.lastPaymentDate) : 'پرداختی ثبت نشده'}</div>
                    </div>
                  </div>

                  {/* اطلاعات هویتی */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-stone-200 p-3 text-xs sm:grid-cols-3">
                    {[
                      ['تلفن', detail.phone ? toFaDigits(detail.phone) : '—'],
                      ['شغل / حرفه', detail.job || '—'],
                      ['طبقه‌بندی', detail.classification || '—'],
                      ['واسطه', detail.intermediary || '—'],
                      ['کد اقتصادی', detail.economicCode ? toFaDigits(detail.economicCode) : '—'],
                      ['شناسهٔ ملی', detail.nationalId ? toFaDigits(detail.nationalId) : '—'],
                      ['کد پستی', detail.postalCode ? toFaDigits(detail.postalCode) : '—'],
                      ['تاریخ ثبت', isoFa(detail.createdAt)],
                      ['وضعیت', detail.status === 'فعال' ? 'فعال' : 'غیر فعال'],
                    ].map(([kk, vv]) => (
                      <div key={kk}>
                        <div className="text-[10px] text-stone-400">{kk}</div>
                        <div className={cn('mt-0.5 font-bold', kk === 'تلفن' ? 'num' : '', 'text-stone-700')} dir={kk === 'تلفن' || kk === 'کد اقتصادی' || kk === 'شناسهٔ ملی' || kk === 'کد پستی' ? 'ltr' : undefined}>
                          {vv}
                        </div>
                      </div>
                    ))}
                  </div>

                  {detail.note ? (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-6 text-stone-700">
                      <b>یادداشت:</b> {detail.note}
                    </div>
                  ) : null}

                  {/* سوابق سفارش */}
                  <div className="rounded-xl border border-stone-200 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-stone-600">
                      <I.package size={13} /> سفارش‌های ثبت‌شده ({fa(detail.orders.length)})
                    </p>
                    {detail.orders.length === 0 ? (
                      <p className="text-center text-xs text-stone-400">سفارشی برای این طرف حساب ثبت نشده است.</p>
                    ) : (
                      <div className="max-h-56 space-y-1.5 overflow-y-auto pl-1">
                        {detail.orders.map((o) => (
                          <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-100 bg-white px-2.5 py-1.5 text-xs">
                            <span dir="ltr" className="num font-bold text-stone-700">{toFaDigits(o.code)}</span>
                            <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-medium', ORDER_STATUS_CLS[o.status] || 'bg-stone-100 text-stone-600 border-stone-200')}>
                              {ORDER_STATUS_FA[o.status] || o.status}
                            </span>
                            <span className="num text-[10px] text-stone-400">{fa(o.itemsCount)} قلم</span>
                            <span className="num mr-auto text-[10px] text-stone-500">تحویل: {faDate(o.deliveryDate)}</span>
                            <span className="num text-[11px] font-bold text-stone-700">{money(o.totalAmount)} ریال</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* R10: نمایندگان فروشِ متصل به این طرف حساب (فقط-خواندنی) */}
                  {canArchive && (() => {
                    const linked = reps.filter((r) => (r.suppliers || []).some((s) => s.id === detail.id))
                    return (
                      <div className="rounded-xl border border-stone-200 p-3">
                        <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-bold text-stone-600">
                          <I.users size={13} /> نمایندگان فروش ({fa(linked.length)})
                        </p>
                        {linked.length === 0 ? (
                          <p className="text-center text-xs text-stone-400">
                            نماینده‌ای به این طرف حساب متصل نشده — از تب «نمایندگان فروش» و گزینهٔ «تأمین‌کنندگان مرتبط» می‌توانید اضافه کنید.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {linked.map((r) => (
                              <span key={r.id} className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border px-2 py-1 text-[11px]',
                                r.active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-stone-100 text-stone-500')}>
                                <span className="font-bold">{r.name}</span>
                                {r.mobile ? <span dir="ltr" className="num text-[10px] text-stone-500">{toFaDigits(r.mobile)}</span> : null}
                                {r.title ? <span className="text-[9px] text-stone-400">· {r.title}</span> : null}
                                <span className={cn('text-[9px] font-bold', r.active ? 'text-emerald-700' : 'text-stone-400')}>{r.active ? '· فعال' : '· غیرفعال'}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-[10px] leading-4 text-stone-400">
                          نماینده‌هایی که «تأمین‌کنندگان مرتبط»شان شامل این طرف حساب است — افزودن/ویرایش از تب «نمایندگان فروش».
                        </p>
                      </div>
                    )
                  })()}

                  {canMutate && (
                    <DialogFooter className="mt-1">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-stone-500 hover:bg-rose-50 hover:text-rose-700"
                        disabled={busyId === detail.id}
                        onClick={() => void toggleStatus({ id: detail.id, name: detail.name, code: detail.code, phone: detail.phone, job: detail.job, classification: detail.classification, balance: detail.balance, creditLimit: detail.creditLimit, status: detail.status, ordersCount: 0 })}>
                        {detail.status === 'فعال'
                          ? <><I.eyeOff size={14} /> غیرفعال کردن</>
                          : <><I.eye size={14} /> فعال‌سازی مجدد</>}
                      </Button>
                      <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
                        <Button className="gap-1.5" onClick={() => openEdit(detail)}>
                          <I.pencil size={14} /> ویرایش اطلاعات
                        </Button>
                      </div>
                    </DialogFooter>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ ثبت/ویرایش طرف حساب ═══════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <I.handshake size={17} className="text-emerald-700" />
              {form.id ? 'ویرایش طرف حساب' : 'ثبت طرف حساب جدید'}
            </DialogTitle>
            <DialogDescription>
              {form.id ? 'اطلاعات هویتی، مالی و تماس این طرف حساب را اصلاح کنید.' : 'طرف حساب جدید (تأمین‌کننده یا شخص تجاری) با وضعیت «فعال» ثبت می‌شود.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-3">
              <label className="mb-1 block text-xs text-stone-500">نام طرف حساب <span className="text-rose-500">*</span></label>
              <Input value={form.name} onChange={(e: any) => setForm((f: any) => ({ ...f, name: e.target.value }))}
                placeholder="مثلاً: شرکت بانی چاو (لاین سس و سولیکو)" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">کد طرف حساب</label>
              <DigitInput value={form.code} onChange={(v: string) => setForm((f: any) => ({ ...f, code: v }))} placeholder="مثلاً 00451" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">تلفن</label>
              <DigitInput value={form.phone} onChange={(v: string) => setForm((f: any) => ({ ...f, phone: v }))} placeholder="مثلاً 03432112345" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">شغل / حرفه</label>
              <Input value={form.job} onChange={(e: any) => setForm((f: any) => ({ ...f, job: e.target.value }))} placeholder="مثلاً: تأمین‌کنندهٔ لبنیات" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">طبقه‌بندی</label>
              <Select dir="rtl" value={form.classification} onValueChange={(v: string) => setForm((f: any) => ({ ...f, classification: v }))}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون طبقه‌بندی —</SelectItem>
                  {classifications.map((c) => <SelectItem key={c.name} value={c.name}>{c.name} · {fa(c.count)}</SelectItem>)}
                  <SelectItem value="CUSTOM">سایر (دستی)…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.classification === 'CUSTOM' && (
              <div>
                <label className="mb-1 block text-xs text-stone-500">طبقه‌بندی دستی <span className="text-rose-500">*</span></label>
                <Input value={form.classificationCustom} onChange={(e: any) => setForm((f: any) => ({ ...f, classificationCustom: e.target.value }))}
                  placeholder="مثلاً: شهرک صنعتی" />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-stone-500">واسطه</label>
              <Input value={form.intermediary} onChange={(e: any) => setForm((f: any) => ({ ...f, intermediary: e.target.value }))} placeholder="مثلاً: آقای رضایی" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">کد اقتصادی</label>
              <DigitInput value={form.economicCode} onChange={(v: string) => setForm((f: any) => ({ ...f, economicCode: v }))} placeholder="۴۱۱۲…" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">شناسهٔ ملی</label>
              <DigitInput value={form.nationalId} onChange={(v: string) => setForm((f: any) => ({ ...f, nationalId: v }))} placeholder="۱۰ رقم" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">کد پستی</label>
              <DigitInput value={form.postalCode} onChange={(v: string) => setForm((f: any) => ({ ...f, postalCode: v }))} placeholder="۱۰ رقم" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">حد اعتبار (ریال)</label>
              <MoneyInput value={form.creditLimit} onChange={(v: string) => setForm((f: any) => ({ ...f, creditLimit: v }))} suffix="ریال" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-stone-500">مانده حساب (ریال)</label>
              <div className="flex gap-1.5">
                <Select dir="rtl" value={form.balanceSign} onValueChange={(v: string) => setForm((f: any) => ({ ...f, balanceSign: v }))}>
                  <SelectTrigger className="h-9 w-28 flex-none text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debt">بدهی (منفی)</SelectItem>
                    <SelectItem value="credit">اعتبار (مثبت)</SelectItem>
                  </SelectContent>
                </Select>
                <MoneyInput value={form.balance} onChange={(v: string) => setForm((f: any) => ({ ...f, balance: v }))} suffix="ریال" />
              </div>
              <p className="mt-1 text-[10px] text-stone-400">خالی بگذارید تا مانده صفر درج شود.</p>
            </div>
            {form.id && (
              <div>
                <label className="mb-1 block text-xs text-stone-500">وضعیت</label>
                <Select dir="rtl" value={form.status} onValueChange={(v: string) => setForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="فعال">فعال</SelectItem>
                    <SelectItem value="غیر فعال">غیر فعال</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 sm:col-span-3">
              <label className="mb-1 block text-xs text-stone-500">یادداشت</label>
              <Textarea rows={2} value={form.note} onChange={(e: any) => setForm((f: any) => ({ ...f, note: e.target.value }))}
                placeholder="هر نکته‌ای دربارهٔ این طرف حساب…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>انصراف</Button>
            <Button disabled={savingForm} onClick={() => void submitForm()} className="gap-1.5">
              {savingForm ? 'در حال ذخیره…' : form.id ? 'ذخیرهٔ تغییرات' : 'ثبت طرف حساب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ نمایندهٔ فروش ═══════════ */}
      <Dialog open={repOpen} onOpenChange={setRepOpen}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.user size={16} className="text-emerald-700" /> {repForm.id ? 'ویرایش نماینده' : 'نمایندهٔ فروش جدید'}</DialogTitle>
            <DialogDescription>نمایندگان تأمین‌کنندگان: کسانی که چک/نقد می‌گیرند، مرجوعی می‌آورند یا کالا تحویل می‌دهند.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-stone-500">نام و نام خانوادگی <span className="text-rose-500">*</span></label>
              <Input value={repForm.name} onChange={(e: any) => setRepForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="مثلاً: رضا احمدی" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">موبایل</label>
              <Input dir="ltr" className="num h-9 text-center text-sm" value={toFaDigits(repForm.mobile)}
                onChange={(e: any) => setRepForm((f: any) => ({ ...f, mobile: toEnDigits(e.target.value).replace(/[^\d]/g, '') }))}
                placeholder="۰۹۱۲۳۴۵۶۷۸۹" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">شرکت / تأمین‌کننده (متن آزاد)</label>
              <Input value={repForm.company} onChange={(e: any) => setRepForm((f: any) => ({ ...f, company: e.target.value }))} placeholder="مثلاً: کاله" />
              <p className="mt-1 text-[10px] leading-4 text-stone-400">
                متن آزاد برای سازگاری با داده‌های قدیمی — اتصالِ ساختاریافته به طرف حساب‌ها از فهرست «تأمین‌کنندگان مرتبط» پایین انجام می‌شود.
              </p>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-stone-500">سمت</label>
              <Input value={repForm.title} onChange={(e: any) => setRepForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="مثلاً: نمایندهٔ فروش · راننده" />
            </div>

            {/* ═══ R10: چندانتخاب‌گر تأمین‌کنندگانِ مرتبط ═══ */}
            <div className="col-span-2 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-stone-600">
                  <I.store size={13} className="text-teal-700" />
                  تأمین‌کنندگان مرتبط
                </label>
                <Badge variant="outline" className={cn('num border-teal-200 text-[9px]',
                  (repForm.supplierIds || []).length ? 'bg-teal-50 text-teal-700' : 'bg-stone-50 text-stone-400')}>
                  {fa((repForm.supplierIds || []).length)} از {fa(REP_SUP_CAP)}
                </Badge>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-stone-400">
                طرف حساب‌هایی که این نماینده برایشان کار می‌کند — با کلیک روی هر چیپ در جدول، پروندهٔ همان طرف حساب باز می‌شود.
              </p>

              {/* چیپ‌های انتخاب‌شده */}
              {repSelSups.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {repSelSups.map((s) => (
                    <span key={s.id} className="flex items-center gap-0.5 rounded-md border border-teal-200 bg-teal-50 py-0.5 pr-2 pl-1 text-[11px] font-bold text-teal-800">
                      <span className="max-w-40 truncate">{s.name}</span>
                      <button type="button" title="حذف از فهرست" onClick={() => toggleRepSup(s.id, false)}
                        className="rounded p-0.5 text-teal-600 hover:bg-teal-100 hover:text-rose-600">
                        <I.x size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* جست‌وجو */}
              <div className="relative mt-2">
                <I.search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <Input value={repSupQ} onChange={(e: any) => setRepSupQ(e.target.value)}
                  placeholder="جست‌وجوی طرف حساب (نام یا کد)…" className="h-8 border-stone-300 bg-white pr-8 text-xs" />
              </div>

              {/* نتایج */}
              {supPoolLoading ? (
                <p className="mt-2 text-center text-[11px] text-stone-400">در حال دریافت فهرست طرف حساب‌ها…</p>
              ) : !repSupQ.trim() ? (
                <p className="mt-2 text-[10px] leading-4 text-stone-400">برای انتخاب، نام یا کد طرف حساب را جست‌وجو کنید (فهرست کامل فعال‌ها؛ حداکثر {fa(REP_SUP_CAP)} انتخاب).</p>
              ) : repSupResults.length === 0 ? (
                <p className="mt-2 text-center text-[11px] text-stone-400">طرف حسابی با این عبارت یافت نشد.</p>
              ) : (
                <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pl-1">
                  {repSupResults.map((s) => (
                    <button key={s.id} type="button" onClick={() => toggleRepSup(s.id, true)}
                      className="flex w-full items-center gap-2 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-right text-xs text-stone-700 transition-colors hover:border-teal-300 hover:bg-teal-50/60">
                      <I.plus size={13} className="flex-none text-teal-700" />
                      <span className="min-w-0 flex-1 truncate font-bold">{s.name}</span>
                      {s.code ? <span dir="ltr" className="num flex-none text-[10px] text-stone-400">کد {toFaDigits(s.code)}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs text-stone-500">یادداشت</label>
              <Textarea rows={2} value={repForm.note} onChange={(e: any) => setRepForm((f: any) => ({ ...f, note: e.target.value }))} placeholder="…" />
            </div>
            <label className="col-span-2 flex cursor-pointer items-center gap-2 text-xs text-stone-600">
              <input type="checkbox" checked={repForm.active} onChange={(e: any) => setRepForm((f: any) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 accent-emerald-600" />
              فعال (در فهرست انتخاب سند دیده می‌شود)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepOpen(false)}>انصراف</Button>
            <Button disabled={savingRep} onClick={() => void submitRep()}>{savingRep ? 'در حال ذخیره…' : 'ذخیره'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ سوابق نماینده ═══════════ */}
      <Dialog open={!!repHist} onOpenChange={(o: boolean) => !o && setRepHist(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          {repHist && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><I.history size={16} className="text-emerald-700" /> سوابق «{repHist.name}»</DialogTitle>
                <DialogDescription>
                  {repHist.company ? `${repHist.company} · ` : ''}{repHist.title || 'نمایندهٔ فروش'} — {fa(repHistDocs.length)} سند
                </DialogDescription>
              </DialogHeader>
              {repHistLoading ? (
                <div className="space-y-1.5">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-stone-100" />)}
                </div>
              ) : repHistDocs.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">سندی برای این نماینده ثبت نشده است.</p>
              ) : (
                <div className="space-y-1.5">
                  {repHistDocs.map((d) => {
                    const k = kindMeta(d.kind)
                    return (
                      <div key={d.id} className="rounded-lg border border-stone-200 p-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn('flex-none text-[9px]', k.cls)}>{k.label}</Badge>
                          <span className="min-w-0 flex-1 truncate text-xs font-bold text-stone-700">{d.title}</span>
                          <span className="num flex-none text-[10px] text-stone-500">{faDate(d.dateJalali)}</span>
                          {d.amount > 0 ? <span className="num flex-none text-[10px] font-bold text-stone-600">{money(d.amount)}</span> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-stone-500">
                          {d.repRole ? <span>سمت: {d.repRole}</span> : null}
                          {d.location ? (
                            <span className="font-semibold text-emerald-700">
                              {d.location.cabinet?.name || ''} ‹ {d.location.shelf?.name || ''} ‹ {d.location.binder.name}
                              <span dir="ltr" className="num mr-1 text-stone-400">{d.location.binder.code}</span>
                              {d.folio ? <span className="num text-stone-400"> · برگهٔ {toFaDigits(d.folio)}</span> : null}
                            </span>
                          ) : <span className="text-amber-700">بدون جایگاه فیزیکی</span>}
                        </div>
                      </div>
                    )
                  })}
                  <p className="pt-1 text-center text-[10px] text-stone-400">جزئیات کامل و چاپ برگهٔ جایگاه هر سند: مالی ← آرشیو اسناد</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
