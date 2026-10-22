import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, Progress, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Tabs, TabsContent, TabsList, TabsTrigger, fa, money, toman, toEnDigits, toFaDigits, JalaliDate, DocPreview, printDoc, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   hr/hrdocs — پرونده پرسنل (مدارک قانونی + قرارداد + فیش حقوقی)
   کارت‌های پرسنل → دیالوگ پرونده با سه تب:
     ۱) مدارک: بارگذاری/حذف/مشاهده (تصویر یا PDF، سقف ۲٫۵MB)
     ۲) قرارداد: ویرایش فیلدها + چاپ «قرارداد کار» A4
     ۳) فیش حقوقی: انتخاب دوره + چاپ «رسید حقوق» A4
   فقط مدیران (OWNER/GM/ADMIN) — صفحهٔ hr/personnel دست‌نخورده می‌ماند
   ───────────────────────────────────────────────────────────── */

const ROLE_FA: Record<string, string> = {
  OWNER: 'مالک', GM: 'مدیر کل', ADMIN: 'مدیر', EXEC: 'مدیر اجرایی', ACC: 'حسابدار', PM: 'مدیر محصولات',
  HC: 'صندوقدار ارشد', SK: 'انباردار', SALES: 'فروشنده', CASHIER: 'صندوقدار', MERCH: 'نیروی چیدمان',
}

const DOC_KINDS: { key: string; label: string; cls: string }[] = [
  { key: 'NATIONAL_CARD', label: 'کارت ملی', cls: 'bg-emerald-100 text-emerald-700' },
  { key: 'ID_BOOK', label: 'شناسنامه', cls: 'bg-teal-50 text-teal-700' },
  { key: 'CONTRACT', label: 'قرارداد', cls: 'bg-sky-50 text-sky-700' },
  { key: 'PHOTO', label: 'عکس', cls: 'bg-violet-50 text-violet-700' },
  { key: 'CERT', label: 'مدرک', cls: 'bg-amber-100 text-amber-700' },
  { key: 'PAYSLIP', label: 'فیش حقوقی', cls: 'bg-rose-50 text-rose-700' },
  { key: 'OTHER', label: 'سایر', cls: 'bg-stone-100 text-stone-600' },
]
const kindMeta = (k: string) => DOC_KINDS.find((x) => x.key === k) || DOC_KINDS[DOC_KINDS.length - 1]

const CONTRACT_TYPES: { key: string; label: string }[] = [
  { key: 'FULL_TIME', label: 'تمام‌وقت' },
  { key: 'PART_TIME', label: 'پاره‌وقت' },
  { key: 'CONTRACT', label: 'قراردادی' },
]
const cTypeLabel = (k?: string | null) => (CONTRACT_TYPES.find((t) => t.key === k) || { label: k || '' }).label

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']

/** ۱۴۰۵-۰۷-۲۸ → ۱۴۰۵/۰۷/۲۸ (ارقام فارسی) */
function faDate(v?: string | null): string {
  if (!v) return '—'
  return toFaDigits(String(v).replace(/-/g, '/'))
}

function kb(size?: number): string {
  if (!size) return '۰'
  if (size < 1024) return fa(size) + ' بایت'
  if (size < 1024 * 1024) return fa((size / 1024).toFixed(0)) + ' کیلوبایت'
  return fa((size / (1024 * 1024)).toFixed(1).replace('.', '٫')) + ' مگابایت'
}

interface PersonItem {
  id: string
  userId: string | null
  fullName: string
  nationalId?: string | null
  phone?: string | null
  jobTitle?: string | null
  department?: string | null
  hireDate?: string | null
  bankCard?: string | null
  shaba?: string | null
  note?: string | null
  active?: boolean
  contractType?: string | null
  contractStart?: string | null
  contractEnd?: string | null
  contractSalary?: number | null
  contractNote?: string | null
  user?: { id: string; username: string; fullName: string; role: string } | null
}

interface DocItem {
  id: string
  userId: string
  kind: string
  title: string
  mimeType: string
  size: number
  note: string
  uploadedBy: string
  createdAt: string
}

interface PayrollRow {
  id: string
  year: number
  month: number
  monthLabel: string
  inputs: { overtimeMinutes: number; absenceDays: number; adjustment: number }
  profile: { baseSalary: number; housingAllowance: number; foodAllowance: number; childAllowance: number; children: number; seniorityDaily: number }
  computed: Record<string, number>
  saved: Record<string, number> | null
}

/** بارگذاری فایل با XHR برای نمایش درصد پیشرفت */
function uploadWithProgress(url: string, form: FormData, onProgress: (pct: number) => void): Promise<{ ok: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)) } catch { resolve({ ok: false, error: 'پاسخ نامعتبر از سرور' }) }
    }
    xhr.onerror = () => resolve({ ok: false, error: 'خطای شبکه در بارگذاری فایل' })
    xhr.send(form)
  })
}

export default function HrDocsView() {
  const { user } = useShell() as any
  const isMgr = !!user && MANAGER_ROLES.includes(user.role)

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<PersonItem[]>([])
  const [q, setQ] = useState('')

  /* دیالوگ پرونده */
  const [openId, setOpenId] = useState<string | null>(null)
  const sel = useMemo(() => items.find((p) => p.id === openId) || null, [items, openId])
  const [tab, setTab] = useState('docs')

  /* تب مدارک */
  const [docs, setDocs] = useState<DocItem[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<string | null>(null)
  const [delTarget, setDelTarget] = useState<DocItem | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [upKind, setUpKind] = useState('NATIONAL_CARD')
  const [upTitle, setUpTitle] = useState('')
  const [upFile, setUpFile] = useState<File | null>(null)
  const [upPct, setUpPct] = useState(0)
  const [upBusy, setUpBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  /* تب قرارداد */
  const [cType, setCType] = useState('')
  const [cStart, setCStart] = useState('')
  const [cEnd, setCEnd] = useState('')
  const [cSalary, setCSalary] = useState('')
  const [cNote, setCNote] = useState('')
  const [cSaving, setCSaving] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)

  /* تب فیش */
  const [slipRows, setSlipRows] = useState<PayrollRow[]>([])
  const [slipInfo, setSlipInfo] = useState<any>(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [slipSel, setSlipSel] = useState<string | null>(null)
  const [payslipOpen, setPayslipOpen] = useState(false)

  /* ───────── بارگذاری اولیه ───────── */
  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await api('/api/hr/personnel')
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت پرسنل'); return }
    setItems(r.data.items || [])
  }

  /* ───────── باز کردن پرونده ───────── */
  function openFile(p: PersonItem) {
    setOpenId(p.id)
    setTab('docs')
    setDocs([]); setThumbs({}); setUpFile(null); setUpPct(0); setUpKind('NATIONAL_CARD'); setUpTitle('')
    setCType(p.contractType || '')
    setCStart(p.contractStart || '')
    setCEnd(p.contractEnd || '')
    setCSalary(p.contractSalary != null ? String(p.contractSalary) : '')
    setCNote(p.contractNote || '')
    setSlipRows([]); setSlipInfo(null); setSlipSel(null)
    if (p.userId) { void loadDocs(p.userId); void loadSlips(p.userId) }
  }

  async function loadDocs(userId: string) {
    setDocsLoading(true)
    const r = await api(`/api/hr/documents${qs({ userId })}`)
    setDocsLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت مدارک'); return }
    const list: DocItem[] = r.data.items || []
    setDocs(list)
    /* پیش‌نمایش‌های کوچک — فقط تصاویر، به‌ترتیب */
    const imgDocs = list.filter((d) => d.mimeType && d.mimeType.startsWith('image/')).slice(0, 12)
    const next: Record<string, string> = {}
    for (const d of imgDocs) {
      const g = await api(`/api/hr/documents/${d.id}`)
      if (g.ok && g.data?.dataUrl) { next[d.id] = g.data.dataUrl; setThumbs({ ...next }) }
    }
  }

  async function loadSlips(userId: string) {
    setSlipLoading(true)
    const r = await api(`/api/hr/payroll${qs({ userId })}`)
    setSlipLoading(false)
    if (!r.ok) return /* پرسنل بدون سابقه — بی‌صدا */
    setSlipInfo(r.data)
    const rows: PayrollRow[] = r.data.items || []
    setSlipRows(rows)
    setSlipSel(rows[0]?.id ?? null)
  }

  /* ───────── مدارک: مشاهده / حذف / بارگذاری ───────── */
  async function viewDoc(d: DocItem) {
    setViewing(d.id)
    const r = await api(`/api/hr/documents/${d.id}`)
    setViewing(null)
    if (!r.ok) return toast.error(r.error || 'خطا در دریافت مدرک')
    const url: string = r.data?.dataUrl || ''
    if (!url) return toast.error('فایل موجود نیست')
    const w = window.open()
    if (!w) return toast.error('پنجرهٔ مرورگر مسدود شده است')
    const html = d.mimeType === 'application/pdf'
      ? `<html dir="rtl" style="height:100%"><body style="margin:0;height:100%"><iframe src="${url}" style="width:100%;height:100%;border:0"></iframe></body></html>`
      : `<html dir="rtl"><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f4"><img src="${url}" style="max-width:100%;max-height:100vh" alt="${d.title || d.kind}"></body></html>`
    w.document.write(html)
    w.document.close()
  }

  async function doDelete() {
    if (!delTarget) return
    setDelBusy(true)
    const r = await api(`/api/hr/documents/${delTarget.id}`, { method: 'DELETE' })
    setDelBusy(false)
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success('مدرک حذف شد')
    setDelTarget(null)
    if (sel?.userId) void loadDocs(sel.userId)
  }

  function pickFile(f: File | null) {
    if (!f) return
    if (!(/^image\//.test(f.type) || f.type === 'application/pdf')) return toast.error('فقط تصویر یا PDF مجاز است')
    if (f.size > 2.5 * 1024 * 1024) return toast.error('حجم فایل بیش از ۲٫۵ مگابایت است')
    setUpFile(f)
  }

  async function doUpload() {
    if (!sel?.userId) return
    if (!upFile) return toast.error('ابتدا فایل را انتخاب کنید')
    const form = new FormData()
    form.append('file', upFile)
    form.append('userId', sel.userId)
    form.append('kind', upKind)
    form.append('title', upTitle.trim())
    setUpBusy(true); setUpPct(0)
    const r = await uploadWithProgress('/api/hr/documents', form, setUpPct)
    setUpBusy(false)
    if (!r.ok) { setUpPct(0); return toast.error(r.error || 'بارگذاری ناموفق بود') }
    toast.success('مدرک بارگذاری شد ✓')
    setUpFile(null); setUpTitle(''); setUpPct(0)
    if (fileRef.current) fileRef.current.value = ''
    void loadDocs(sel.userId)
  }

  /* ───────── قرارداد ───────── */
  async function saveContract() {
    if (!sel) return
    setCSaving(true)
    const r = await api(`/api/hr/personnel/${sel.id}`, {
      method: 'PATCH',
      body: {
        contractType: cType || null,
        contractStart: cStart || null,
        contractEnd: cEnd || null,
        contractSalary: cSalary.trim() === '' ? null : Number(toEnDigits(cSalary.replace(/,/g, ''))),
        contractNote: cNote.trim() || null,
      },
    })
    setCSaving(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره قرارداد ناموفق بود')
    toast.success('اطلاعات قرارداد ذخیره شد ✓')
    setItems((prev) => prev.map((p) => p.id === sel.id ? {
      ...p, contractType: cType || null, contractStart: cStart || null, contractEnd: cEnd || null,
      contractSalary: cSalary.trim() === '' ? null : Number(toEnDigits(cSalary.replace(/,/g, ''))),
      contractNote: cNote.trim() || null,
    } : p))
  }

  const contractData = useMemo(() => {
    if (!sel) return {}
    const salaryNum = cSalary.trim() === '' ? null : Number(toEnDigits(cSalary.replace(/,/g, '')))
    return {
      employeeName: sel.fullName,
      employeeNationalId: sel.nationalId,
      employeeJobTitle: sel.jobTitle,
      employeePhone: sel.phone,
      hireDate: sel.hireDate,
      contractType: cType,
      contractStart: cStart,
      contractEnd: cEnd,
      contractSalary: Number.isFinite(salaryNum as number) ? salaryNum : 0,
      contractNote: cNote,
      employerSigner: user?.fullName,
    }
  }, [sel, cType, cStart, cEnd, cSalary, cNote, user])

  const slipSelRow = useMemo(() => slipRows.find((r) => r.id === slipSel) || null, [slipRows, slipSel])

  const payslipData = useMemo(() => {
    if (!slipSelRow || !slipInfo) return {}
    const c = slipSelRow.computed || {}
    return {
      staffName: slipInfo.fullName || sel?.fullName,
      jobTitle: slipInfo.jobTitle || sel?.jobTitle,
      nationalId: slipInfo.nationalId || sel?.nationalId,
      department: slipInfo.department || sel?.department,
      year: slipSelRow.year,
      month: slipSelRow.month,
      monthLabel: slipSelRow.monthLabel,
      base: c.base, housing: c.housing, food: c.food,
      childAllowance: slipSelRow.profile?.childAllowance,
      children: slipSelRow.profile?.children,
      childTotal: c.childTotal,
      seniorityDaily: slipSelRow.profile?.seniorityDaily,
      seniorityTotal: c.seniorityTotal,
      overtimeMinutes: slipSelRow.inputs?.overtimeMinutes,
      overtimePay: c.overtimePay,
      absenceDays: slipSelRow.inputs?.absenceDays,
      absenceDeduction: c.absenceDeduction,
      adjustment: slipSelRow.inputs?.adjustment,
      gross: c.gross, insurance: c.insurance, tax: c.tax, net: c.net,
      bankCard: sel?.bankCard,
      shaba: sel?.shaba,
      authorName: user?.fullName,
    }
  }, [slipSelRow, slipInfo, sel, user])

  /* ───────── فیلتر جستجو ───────── */
  const filtered = useMemo(() => {
    const needle = q.trim()
    if (!needle) return items
    return items.filter((p) => p.fullName.indexOf(needle) > -1 || (p.jobTitle || '').indexOf(needle) > -1)
  }, [items, q])

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Icon name="clipboard" size={18} /> پرونده پرسنل
            <span className="text-xs font-normal text-stone-400">مدارک قانونی · قرارداد کار · فیش حقوقی</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="relative min-w-56 grow sm:max-w-xs">
              <I.search size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
              <Input className="pr-8" placeholder="جستجوی نام یا سمت…" value={q} onChange={(e: any) => setQ(e.target.value)} />
            </div>
            <span className="text-xs text-stone-400">{fa(filtered.length)} نفر از {fa(items.length)}</span>
            <Button variant="outline" size="sm" className="mr-auto gap-1.5" onClick={() => void load()}><I.refresh size={14} /> به‌روزرسانی</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-stone-500"><I.loader className="mx-auto mb-3 animate-spin" size={22} /> در حال دریافت پرونده‌ها…</div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-stone-400">پرونده‌ای یافت نشد</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => {
                const role = p.user?.role || ''
                return (
                  <button key={p.id} type="button" onClick={() => openFile(p)}
                    className="group flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3.5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-50 text-lg font-black text-emerald-700">
                      {(p.fullName || '؟').trim().charAt(0)}
                    </span>
                    <span className="min-w-0 grow">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-stone-800 group-hover:text-emerald-700">{p.fullName}</span>
                        {!p.active && <Badge className="bg-stone-100 text-stone-500" variant="secondary">غیرفعال</Badge>}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-stone-400">{p.jobTitle || 'سمت ثبت نشده'}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        {role && <Badge className="bg-emerald-50 text-emerald-700" variant="secondary">{ROLE_FA[role] || role}</Badge>}
                        {p.contractType && <Badge className="bg-teal-50 text-teal-700" variant="secondary">قرارداد {cTypeLabel(p.contractType)}</Badge>}
                        {p.hireDate && <Badge className="bg-stone-100 text-stone-500" variant="secondary">از {faDate(p.hireDate)}</Badge>}
                        {!p.userId && <Badge className="bg-amber-50 text-amber-700" variant="secondary">بدون کاربر</Badge>}
                      </span>
                    </span>
                    <I.chevronLeft size={16} className="mt-2 shrink-0 text-stone-300 transition-colors group-hover:text-emerald-500" />
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════ دیالوگ پرونده پرسنل ═══════════ */}
      <Dialog open={!!sel} onOpenChange={(o: boolean) => { if (!o) setOpenId(null) }}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-700">
                {(sel?.fullName || '؟').charAt(0)}
              </span>
              پروندهٔ {sel?.fullName}
              {sel?.jobTitle && <span className="text-xs font-normal text-stone-400">{sel.jobTitle}</span>}
            </DialogTitle>
            <DialogDescription>مدارک قانونی، قرارداد کار و فیش‌های حقوقی این پرسنل</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="docs"><I.fileDown size={14} className="ml-1 inline" /> مدارک</TabsTrigger>
              <TabsTrigger value="contract"><I.penLine size={14} className="ml-1 inline" /> قرارداد</TabsTrigger>
              <TabsTrigger value="payslip"><I.banknote size={14} className="ml-1 inline" /> فیش حقوقی</TabsTrigger>
            </TabsList>

            {/* ═══ تب مدارک ═══ */}
            <TabsContent value="docs" className="space-y-3">
              {!sel?.userId ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
                  این پرونده به هیچ کاربری متصل نیست — برای بارگذاری مدرک، ابتدا از صفحهٔ «پرسنل» یک کاربر به آن متصل کنید.
                </div>
              ) : (
                <>
                  {isMgr && (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-stone-600"><I.plus size={14} /> بارگذاری مدرک جدید</div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-40">
                          <label className="mb-1 block text-[11px] text-stone-500">نوع مدرک</label>
                          <Select value={upKind} onValueChange={setUpKind}>
                            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DOC_KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="min-w-40 grow">
                          <label className="mb-1 block text-[11px] text-stone-500">عنوان (اختیاری)</label>
                          <Input className="h-9" value={upTitle} onChange={(e: any) => setUpTitle(e.target.value)} placeholder="مثلاً اسکن کارت ملی" />
                        </div>
                        <div className="min-w-52">
                          <label className="mb-1 block text-[11px] text-stone-500">فایل (تصویر یا PDF — حداکثر ۲٫۵MB)</label>
                          <div
                            className={cn('flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed px-3 text-xs transition-colors',
                              dragOver ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-stone-300 bg-white text-stone-500 hover:border-emerald-400')}
                            onClick={() => fileRef.current?.click()}
                            onDragOver={(e: any) => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e: any) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer?.files?.[0] || null) }}
                          >
                            {upFile ? <span className="truncate font-bold text-emerald-700">📎 {upFile.name} <span className="font-normal text-stone-400">({kb(upFile.size)})</span></span> : 'فایل را بکشید یا کلیک کنید'}
                          </div>
                          <input ref={fileRef as any} type="file" accept="image/*,application/pdf" className="hidden"
                            onChange={(e: any) => pickFile(e.target.files?.[0] || null)} />
                        </div>
                        <Button size="sm" disabled={!upFile || upBusy} onClick={() => void doUpload()} className="gap-1.5">
                          {upBusy ? <I.loader size={14} className="animate-spin" /> : <I.send size={14} />} بارگذاری
                        </Button>
                      </div>
                      {upBusy && <Progress value={upPct} className="mt-2 h-1.5" />}
                    </div>
                  )}

                  {docsLoading ? (
                    <div className="py-8 text-center text-sm text-stone-400"><I.loader className="mx-auto mb-2 animate-spin" size={18} /> در حال دریافت مدارک…</div>
                  ) : docs.length === 0 ? (
                    <p className="py-8 text-center text-sm text-stone-400">هنوز مدرکی برای این پرسنل بارگذاری نشده است</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {docs.map((d) => {
                        const km = kindMeta(d.kind)
                        const isImg = d.mimeType.startsWith('image/')
                        const isPdf = d.mimeType === 'application/pdf'
                        const thumb = thumbs[d.id]
                        return (
                          <div key={d.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                            <div className="flex h-28 items-center justify-center border-b border-stone-100 bg-stone-50">
                              {isImg && thumb ? (
                                <img src={thumb} alt={d.title || d.kind} className="h-full w-full object-contain p-1" />
                              ) : isPdf ? (
                                <div className="text-center text-rose-500"><div className="text-3xl">📄</div><div className="mt-1 text-[10px] text-stone-400">PDF</div></div>
                              ) : isImg ? (
                                <div className="text-center text-stone-300"><I.loader size={22} className="mx-auto animate-spin" /><div className="mt-1 text-[10px]">پیش‌نمایش…</div></div>
                              ) : (
                                <div className="text-3xl text-stone-300">🖼️</div>
                              )}
                            </div>
                            <div className="space-y-1.5 p-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', km.cls)}>{km.label}</span>
                                <span className="truncate text-[11px] font-bold text-stone-700" title={d.title || ''}>{d.title || 'بدون عنوان'}</span>
                              </div>
                              <div className="text-[10px] text-stone-400">{kb(d.size)} · {d.uploadedBy ? d.uploadedBy + ' · ' : ''}{faDate((d.createdAt || '').slice(0, 10))}</div>
                              <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="h-7 grow gap-1 text-[11px]" disabled={viewing === d.id} onClick={() => void viewDoc(d)}>
                                  {viewing === d.id ? <I.loader size={12} className="animate-spin" /> : <I.eye size={12} />} مشاهده
                                </Button>
                                {isMgr && (
                                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDelTarget(d)}>
                                    <I.trash size={12} />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* ═══ تب قرارداد ═══ */}
            <TabsContent value="contract" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-stone-500">
                  وضعیت: {cType ? <span className="font-bold text-teal-700">{cTypeLabel(cType)}</span> : <span className="text-stone-400">ثبت نشده</span>}
                  {cStart && <> · از <span className="num font-bold">{faDate(cStart)}</span></>}
                  {cEnd && <> تا <span className="num font-bold">{faDate(cEnd)}</span></>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setContractOpen(true)}><I.printer size={14} /> نمایش و چاپ قرارداد</Button>
                  {isMgr && (
                    <Button size="sm" disabled={cSaving} onClick={() => void saveContract()} className="gap-1.5">
                      {cSaving ? <I.loader size={14} className="animate-spin" /> : <I.save size={14} />} ذخیره
                    </Button>
                  )}
                </div>
              </div>

              {isMgr ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-stone-500">نوع قرارداد</label>
                    <Select value={cType || 'NONE'} onValueChange={(v: string) => setCType(v === 'NONE' ? '' : v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">— ثبت نشده —</SelectItem>
                        {CONTRACT_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-stone-500">حقوق قرارداد (ریال)</label>
                    <Input dir="ltr" inputMode="numeric" className="num text-right" value={cSalary}
                      onChange={(e: any) => setCSalary(toEnDigits(e.target.value).replace(/[^\d.]/g, ''))}
                      placeholder="مثلاً 200000000" />
                    {cSalary && Number(toEnDigits(cSalary)) > 0 && (
                      <p className="mt-1 text-[10px] text-stone-400">{money(Number(toEnDigits(cSalary)))} ریال ≈ {toman(Number(toEnDigits(cSalary)))} تومان</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-stone-500">تاریخ شروع قرارداد</label>
                    <JalaliDate value={cStart} onChange={setCStart} placeholder="— بدون تاریخ —" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-stone-500">تاریخ پایان قرارداد</label>
                    <JalaliDate value={cEnd} onChange={setCEnd} placeholder="— بدون تاریخ —" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-stone-500">ملاحظات قرارداد</label>
                    <Textarea rows={2} value={cNote} onChange={(e: any) => setCNote(e.target.value)} placeholder="یادداشت‌های قرارداد…" />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-7 text-stone-700">
                  <div>نوع قرارداد: <b>{cType ? cTypeLabel(cType) : '—'}</b></div>
                  <div>بازهٔ قرارداد: <b className="num">{cStart || cEnd ? `${faDate(cStart)} تا ${faDate(cEnd)}` : '—'}</b></div>
                  <div>حقوث قرارداد: <b>{cSalary ? money(Number(toEnDigits(cSalary))) + ' ریال' : '—'}</b></div>
                  {cNote && <div>ملاحظات: {cNote}</div>}
                </div>
              )}
            </TabsContent>

            {/* ═══ تب فیش حقوقی ═══ */}
            <TabsContent value="payslip" className="space-y-3">
              {slipLoading ? (
                <div className="py-8 text-center text-sm text-stone-400"><I.loader className="mx-auto mb-2 animate-spin" size={18} /> در حال دریافت فیش‌ها…</div>
              ) : slipRows.length === 0 ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
                  برای این پرسنل فیش حقوقی ثبت نشده است. فیش‌ها از صفحهٔ «حقوق و دستمزد» ذخیره می‌شوند.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-stone-600">دوره‌های ثبت‌شده:</span>
                    {slipRows.map((r) => (
                      <button key={r.id} type="button"
                        onClick={() => setSlipSel(r.id)}
                        className={cn('rounded-full border px-3 py-1 text-[11px] font-bold transition-colors',
                          r.id === slipSel ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm' : 'border-stone-200 bg-white text-stone-600 hover:border-emerald-300')}>
                        {r.monthLabel}
                      </button>
                    ))}
                    <Button size="sm" className="mr-auto gap-1.5" disabled={!slipSelRow} onClick={() => setPayslipOpen(true)}>
                      <I.printer size={14} /> نمایش و چاپ فیش
                    </Button>
                  </div>
                  {slipSelRow && (
                    <div className="overflow-hidden rounded-xl border border-stone-200">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-center">حقوق پایه</TableHead>
                            <TableHead className="text-center">اضافه‌کاری</TableHead>
                            <TableHead className="text-center">غیبت</TableHead>
                            <TableHead className="text-center">ناخالص</TableHead>
                            <TableHead className="text-center">بیمه + مالیات</TableHead>
                            <TableHead className="text-center">خالص پرداختی</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="num text-center text-xs">{money(slipSelRow.computed?.base)}</TableCell>
                            <TableCell className="num text-center text-xs">{fa(slipSelRow.inputs?.overtimeMinutes || 0)} دقیقه</TableCell>
                            <TableCell className="num text-center text-xs">{fa(slipSelRow.inputs?.absenceDays || 0)} روز</TableCell>
                            <TableCell className="num text-center text-xs">{money(slipSelRow.computed?.gross)}</TableCell>
                            <TableCell className="num text-center text-xs">{money((slipSelRow.computed?.insurance || 0) + (slipSelRow.computed?.tax || 0))}</TableCell>
                            <TableCell className="num text-center text-xs font-bold text-emerald-700">{money(slipSelRow.computed?.net)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ پیش‌نمایش قرارداد ═══ */}
      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>پیش‌نمایش قرارداد کار — {sel?.fullName}</DialogTitle>
            <DialogDescription>نسخهٔ A4 رسمی با سربرگ فروشگاه؛ با دکمهٔ چاپ، چاپ مستقیم یا ذخیرهٔ PDF</DialogDescription>
          </DialogHeader>
          <DocPreview kind="contract" data={contractData} scale={0.62} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractOpen(false)}>بستن</Button>
            <Button className="gap-1.5" onClick={() => printDoc('contract', contractData)}><I.printer size={15} /> چاپ / ذخیرهٔ PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ پیش‌نمایش فیش حقوقی ═══ */}
      <Dialog open={payslipOpen} onOpenChange={setPayslipOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>پیش‌نمایش رسید حقوق — {slipInfo?.fullName || sel?.fullName} ({slipSelRow?.monthLabel || ''})</DialogTitle>
            <DialogDescription>نسخهٔ A4 رسمی با ردیف مزایا، کسورات، خالص پرداختی و حروف‌خوانی مبلغ</DialogDescription>
          </DialogHeader>
          <DocPreview kind="payslip" data={payslipData} scale={0.62} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayslipOpen(false)}>بستن</Button>
            <Button className="gap-1.5" onClick={() => printDoc('payslip', payslipData)}><I.printer size={15} /> چاپ / ذخیرهٔ PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ تأیید حذف مدرک ═══ */}
      <Dialog open={!!delTarget} onOpenChange={(o: boolean) => { if (!o) setDelTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف مدرک</DialogTitle>
            <DialogDescription>
              {delTarget ? `${kindMeta(delTarget.kind).label}${delTarget.title ? ` «${delTarget.title}»` : ''} از پروندهٔ ${sel?.fullName} به‌طور کامل حذف می‌شود. این عمل بازگشت‌پذیر نیست.` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTarget(null)}>انصراف</Button>
            <Button variant="destructive" disabled={delBusy} onClick={() => void doDelete()} className="gap-1.5">
              {delBusy ? <I.loader size={15} className="animate-spin" /> : <I.trash size={15} />} حذف قطعی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
