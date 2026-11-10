import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, Progress, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Tabs, TabsContent, TabsList, TabsTrigger, fa, money, toman, toEnDigits, toFaDigits, JalaliDate, minutesToHM, DocPreview, printDoc, MoneyInput, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   hr/hrdocs — پرونده پرسنل (اطلاعات فردی + مدارک + قرارداد + فیش + سوابق)
   نوار ابزار یک‌خطی: پرسنل جدید + جستجو + فیلتر فعال
   کارت‌های حرفه‌ای پرسنل → دیالوگ پرونده با پنج تب:
     ۱) اطلاعات فردی: ویرایش کامل + اتصال کاربر + فعال/غیرفعال
     ۲) قرارداد: ویرایش فیلدها + چاپ «قرارداد کار» A4
     ۳) مدارک: بارگذاری/حذف/مشاهده (تصویر یا PDF، سقف ۲٫۵MB)
     ۴) فیش حقوقی: انتخاب دوره + چاپ «رسید حقوق» A4
     ۵) سوابق: آخرین وضعیت‌های حضور و مرخصی‌ها
   فقط مدیران (OWNER/GM/ADMIN)
   ───────────────────────────────────────────────────────────── */

const ROLE_FA: Record<string, string> = {
  OWNER: 'مالک', GM: 'مدیر کل', ADMIN: 'مدیر', EXEC: 'مدیر اجرایی', ACC: 'حسابدار', PM: 'مدیر محصولات',
  HC: 'صندوقدار ارشد', SK: 'انباردار', SALES: 'فروشنده', CASHIER: 'صندوقدار', MERCH: 'نیروی چیدمان',
}
/** رنگ آواتار بر اساس نقش */
const ROLE_AVATAR: Record<string, string> = {
  OWNER: 'from-amber-200 to-amber-50 text-amber-800',
  GM: 'from-emerald-200 to-teal-50 text-emerald-800',
  ADMIN: 'from-violet-200 to-violet-50 text-violet-800',
  EXEC: 'from-orange-200 to-amber-50 text-amber-800',
  ACC: 'from-teal-200 to-teal-50 text-teal-800',
  PM: 'from-rose-200 to-rose-50 text-rose-800',
}
const avatarCls = (role?: string | null) => ROLE_AVATAR[role || ''] || 'from-emerald-100 to-teal-50 text-emerald-700'

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

const ARRIVAL_FA: Record<string, { label: string; cls: string }> = {
  on_time: { label: 'به‌وقت', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  late: { label: 'تأخیر', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  absent: { label: 'غیبت', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  permitted_leave: { label: 'مرخصی', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
}
const LEAVE_TYPES: { key: string; label: string; cls: string }[] = [
  { key: 'HOURLY', label: 'ساعتی', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  { key: 'DAILY', label: 'روزانه', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'SICK', label: 'استعلاجی', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'UNPAID', label: 'بدون حقوق', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
]
const leaveTypeMeta = (t: string) => LEAVE_TYPES.find((x) => x.key === t) || { key: t, label: t, cls: 'bg-stone-100 text-stone-600 border-stone-200' }
const LEAVE_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'در انتظار', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  APPROVED: { label: 'تأییدشده', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'ردشده', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
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
  birthday?: string | null
  bankCard?: string | null
  shaba?: string | null
  emergencyName?: string | null
  emergencyPhone?: string | null
  note?: string | null
  active?: boolean
  contractType?: string | null
  contractStart?: string | null
  contractEnd?: string | null
  contractSalary?: number | null
  contractNote?: string | null
  user?: { id: string; username: string; fullName: string; role: string } | null
}

interface LinkableUser { id: string; username: string; fullName: string; role: string }

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
  const [linkable, setLinkable] = useState<LinkableUser[]>([])
  const [q, setQ] = useState('')
  const [actFilter, setActFilter] = useState<'all' | 'active' | 'inactive'>('all')

  /* دیالوگ پرونده */
  const [openId, setOpenId] = useState<string | null>(null)
  const sel = useMemo(() => items.find((p) => p.id === openId) || null, [items, openId])
  const [tab, setTab] = useState('info')

  /* تب اطلاعات فردی */
  const [pInfo, setPInfo] = useState({
    fullName: '', nationalId: '', phone: '', jobTitle: '', department: '', hireDate: '', birthday: '',
    bankCard: '', shaba: '', emergencyName: '', emergencyPhone: '', note: '', userId: '',
  })
  const [pSaving, setPSaving] = useState(false)
  const [activeBusy, setActiveBusy] = useState(false)

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

  /* تب سوابق */
  const [histLoading, setHistLoading] = useState(false)
  const [histChecks, setHistChecks] = useState<any[]>([])
  const [histLeaves, setHistLeaves] = useState<any[]>([])

  /* دیالوگ پرسنل جدید */
  const [npOpen, setNpOpen] = useState(false)
  const [np, setNp] = useState({ fullName: '', jobTitle: '', department: '', phone: '', nationalId: '', hireDate: '', userId: '', note: '' })
  const [npBusy, setNpBusy] = useState(false)

  /* ───────── بارگذاری اولیه ───────── */
  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await api('/api/hr/personnel')
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت پرسنل'); return }
    setItems(r.data.items || [])
    setLinkable(r.data.linkableUsers || [])
  }

  /* ───────── باز کردن پرونده ───────── */
  function openFile(p: PersonItem) {
    setOpenId(p.id)
    setTab('info')
    setPInfo({
      fullName: p.fullName || '',
      nationalId: p.nationalId || '',
      phone: p.phone || '',
      jobTitle: p.jobTitle || '',
      department: p.department || '',
      hireDate: p.hireDate || '',
      birthday: p.birthday || '',
      bankCard: p.bankCard || '',
      shaba: p.shaba || '',
      emergencyName: p.emergencyName || '',
      emergencyPhone: p.emergencyPhone || '',
      note: p.note || '',
      userId: p.user?.id || '',
    })
    setDocs([]); setThumbs({}); setUpFile(null); setUpPct(0); setUpKind('NATIONAL_CARD'); setUpTitle('')
    setCType(p.contractType || '')
    setCStart(p.contractStart || '')
    setCEnd(p.contractEnd || '')
    setCSalary(p.contractSalary != null ? String(p.contractSalary) : '')
    setCNote(p.contractNote || '')
    setSlipRows([]); setSlipInfo(null); setSlipSel(null)
    setHistChecks([]); setHistLeaves([])
    if (p.user?.id) { void loadDocs(p.user.id); void loadSlips(p.user.id) }
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

  async function loadHistory(userId: string) {
    setHistLoading(true)
    const [ch, lv] = await Promise.all([
      api(`/api/staff-checks${qs({ staff: userId })}`),
      api(`/api/hr/leaves${qs({ userId })}`),
    ])
    setHistLoading(false)
    setHistChecks(ch.ok ? (ch.data.items || []) : [])
    setHistLeaves(lv.ok ? (lv.data.items || []) : [])
  }

  /* ───────── اطلاعات فردی: ذخیره + فعال/غیرفعال ───────── */
  async function saveInfo() {
    if (!sel) return
    if (pInfo.fullName.trim().length < 3) return toast.error('نام و نام خانوادگی را کامل وارد کنید')
    setPSaving(true)
    const r = await api(`/api/hr/personnel/${sel.id}`, {
      method: 'PATCH',
      body: {
        fullName: pInfo.fullName.trim() || null,
        nationalId: pInfo.nationalId.trim() || null,
        phone: pInfo.phone.trim() || null,
        jobTitle: pInfo.jobTitle.trim() || null,
        department: pInfo.department.trim() || null,
        hireDate: pInfo.hireDate || null,
        birthday: pInfo.birthday || null,
        bankCard: pInfo.bankCard.trim() || null,
        shaba: pInfo.shaba.trim() || null,
        emergencyName: pInfo.emergencyName.trim() || null,
        emergencyPhone: pInfo.emergencyPhone.trim() || null,
        note: pInfo.note.trim() || null,
        userId: pInfo.userId || undefined,
      },
    })
    setPSaving(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره اطلاعات ناموفق بود')
    toast.success('اطلاعات فردی ذخیره شد ✓')
    const linkedId = pInfo.userId || null
    setItems((prev) => prev.map((p) => p.id === sel.id ? {
      ...p,
      fullName: pInfo.fullName.trim(),
      nationalId: pInfo.nationalId.trim() || null,
      phone: pInfo.phone.trim() || null,
      jobTitle: pInfo.jobTitle.trim() || null,
      department: pInfo.department.trim() || null,
      hireDate: pInfo.hireDate || null,
      birthday: pInfo.birthday || null,
      bankCard: pInfo.bankCard.trim() || null,
      shaba: pInfo.shaba.trim() || null,
      emergencyName: pInfo.emergencyName.trim() || null,
      emergencyPhone: pInfo.emergencyPhone.trim() || null,
      note: pInfo.note.trim() || null,
      userId: linkedId,
      user: linkedId ? (p.user?.id === linkedId ? p.user : (linkable.find((u) => u.id === linkedId)
        ? { ...(linkable.find((u) => u.id === linkedId) as any) } : p.user)) : null,
    } : p))
    void load()
  }

  async function toggleActive() {
    if (!sel) return
    setActiveBusy(true)
    const next = !sel.active
    const r = await api(`/api/hr/personnel/${sel.id}`, { method: 'PATCH', body: { active: next } })
    setActiveBusy(false)
    if (!r.ok) return toast.error(r.error || 'تغییر وضعیت ناموفق بود')
    setItems((prev) => prev.map((p) => p.id === sel.id ? { ...p, active: next } : p))
    toast.success(next ? 'پرونده فعال شد' : 'پرونده غیرفعال شد (حذف نرم)')
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
    if (sel?.user?.id) void loadDocs(sel.user.id)
  }

  function pickFile(f: File | null) {
    if (!f) return
    if (!(/^image\//.test(f.type) || f.type === 'application/pdf')) return toast.error('فقط تصویر یا PDF مجاز است')
    if (f.size > 2.5 * 1024 * 1024) return toast.error('حجم فایل بیش از ۲٫۵ مگابایت است')
    setUpFile(f)
  }

  async function doUpload() {
    if (!sel?.user?.id) return
    if (!upFile) return toast.error('ابتدا فایل را انتخاب کنید')
    const form = new FormData()
    form.append('file', upFile)
    form.append('userId', sel.user.id)
    form.append('kind', upKind)
    form.append('title', upTitle.trim())
    setUpBusy(true); setUpPct(0)
    const r = await uploadWithProgress('/api/hr/documents', form, setUpPct)
    setUpBusy(false)
    if (!r.ok) { setUpPct(0); return toast.error(r.error || 'بارگذاری ناموفق بود') }
    toast.success('مدرک بارگذاری شد ✓')
    setUpFile(null); setUpTitle(''); setUpPct(0)
    if (fileRef.current) fileRef.current.value = ''
    void loadDocs(sel.user.id)
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

  /* ───────── پرسنل جدید ───────── */
  async function createPerson() {
    if (np.fullName.trim().length < 3) return toast.error('نام و نام خانوادگی را کامل وارد کنید')
    setNpBusy(true)
    const r = await api('/api/hr/personnel', {
      method: 'POST',
      body: {
        fullName: np.fullName.trim(),
        jobTitle: np.jobTitle.trim() || undefined,
        department: np.department.trim() || undefined,
        phone: np.phone.trim() || undefined,
        nationalId: np.nationalId.trim() || undefined,
        hireDate: np.hireDate || undefined,
        userId: np.userId || undefined,
        note: np.note.trim() || undefined,
      },
    })
    setNpBusy(false)
    if (!r.ok) return toast.error(r.error || 'ایجاد پرونده ناموفق بود')
    toast.success('پروندهٔ پرسنل جدید ایجاد شد ✓')
    setNpOpen(false)
    setNp({ fullName: '', jobTitle: '', department: '', phone: '', nationalId: '', hireDate: '', userId: '', note: '' })
    void load()
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

  /* ───────── فیلتر جستجو + وضعیت ───────── */
  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((p) => p.active !== false).length,
    inactive: items.filter((p) => p.active === false).length,
    unlinked: items.filter((p) => !p.user).length,
    contract: items.filter((p) => p.contractType).length,
  }), [items])

  const filtered = useMemo(() => {
    const needle = q.trim()
    return items.filter((p) => {
      if (actFilter === 'active' && p.active === false) return false
      if (actFilter === 'inactive' && p.active !== false) return false
      if (!needle) return true
      return p.fullName.indexOf(needle) > -1 || (p.jobTitle || '').indexOf(needle) > -1 || (p.department || '').indexOf(needle) > -1
    })
  }, [items, q, actFilter])

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      <Card data-tour="page">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Icon name="clipboard" size={18} /> پرونده پرسنل
            <span className="text-xs font-normal text-stone-400">اطلاعات فردی · مدارک قانونی · قرارداد کار · فیش حقوقی · سوابق</span>
          </CardTitle>

          {/* ═══ نوار ابزار — یک ردیف افقی ═══ */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button size="sm" className="gap-1.5" onClick={() => setNpOpen(true)}>
              <I.plus size={15} /> پرسنل جدید
            </Button>
            <div className="relative min-w-44 grow sm:max-w-xs">
              <I.search size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
              <Input className="h-9 pr-8" placeholder="جستجوی نام، سمت یا دپارتمان…" value={q} onChange={(e: any) => setQ(e.target.value)} />
            </div>
            <div className="flex overflow-hidden rounded-lg border border-stone-300">
              {([['all', 'همه'], ['active', 'فعال'], ['inactive', 'غیرفعال']] as const).map(([key, label], idx) => (
                <button
                  key={key} type="button"
                  onClick={() => setActFilter(key)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    idx > 0 && 'border-r border-stone-300',
                    actFilter === key ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="whitespace-nowrap text-xs text-stone-400">
              {fa(filtered.length)} نفر از {fa(stats.total)}
              {stats.inactive > 0 && <> · {fa(stats.inactive)} غیرفعال</>}
            </span>
            <Button variant="outline" size="sm" className="mr-auto gap-1.5" onClick={() => void load()}><I.refresh size={14} /> به‌روزرسانی</Button>
          </div>

          {/* ═══ چیپ‌های خلاصه ═══ */}
          <div className="flex flex-wrap gap-2 pt-2.5">
            {[
              { label: 'کل پرسنل', value: stats.total, tone: 'border-stone-300 bg-stone-50' },
              { label: 'فعال', value: stats.active, tone: 'border-emerald-200 bg-emerald-50' },
              { label: 'بدون کاربر', value: stats.unlinked, tone: stats.unlinked > 0 ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white' },
              { label: 'دارای قرارداد', value: stats.contract, tone: 'border-teal-200 bg-teal-50' },
            ].map((c) => (
              <div key={c.label} className={cn('flex items-center gap-2 rounded-xl border px-3 py-1.5', c.tone)}>
                <span className="num text-base font-black leading-none">{fa(c.value)}</span>
                <span className="text-[11px] leading-4 text-stone-500">{c.label}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-stone-500"><I.loader className="mx-auto mb-3 animate-spin" size={22} /> در حال دریافت پرونده‌ها…</div>
          ) : items.length === 0 ? (
            <div className="py-14 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
                <I.users size={26} className="text-stone-400" />
              </div>
              <p className="text-sm font-bold text-stone-700">هنوز پرونده‌ای ثبت نشده است</p>
              <p className="mt-1 text-xs text-stone-500">با دکمهٔ «پرسنل جدید» اولین پرونده را بسازید.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
                <I.search size={24} className="text-stone-400" />
              </div>
              <p className="text-sm font-bold text-stone-700">پرونده‌ای با این جستجو یافت نشد</p>
              <p className="mt-1 text-xs text-stone-500">عبارت جستجو یا فیلتر وضعیت را تغییر دهید.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => {
                const role = p.user?.role || ''
                const inactive = p.active === false
                return (
                  <button key={p.id} type="button" onClick={() => openFile(p)}
                    className={cn(
                      'group flex flex-col gap-2.5 rounded-xl border p-4 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                      inactive
                        ? 'border-stone-200 bg-stone-50/70 hover:border-stone-300'
                        : 'border-stone-200 bg-white hover:border-emerald-300',
                    )}>
                    <div className="flex items-start gap-3">
                      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xl font-black', inactive ? 'from-stone-200 to-stone-100 text-stone-400' : avatarCls(role))}>
                        {(p.fullName || '؟').trim().charAt(0)}
                      </span>
                      <span className="min-w-0 grow">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('truncate text-sm font-bold', inactive ? 'text-stone-400' : 'text-stone-800 group-hover:text-emerald-700')}>{p.fullName}</span>
                        </span>
                        <span className={cn('mt-0.5 block truncate text-[11px]', inactive ? 'text-stone-400' : 'text-stone-500')}>{p.jobTitle || 'سمت ثبت نشده'}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {inactive
                            ? <Badge className="bg-stone-200 text-stone-500" variant="secondary">غیرفعال</Badge>
                            : <Badge className="bg-emerald-50 text-emerald-700" variant="secondary">فعال</Badge>}
                          {role && <Badge className="bg-amber-50 text-amber-700" variant="secondary">{ROLE_FA[role] || role}</Badge>}
                          {!p.user && <Badge className="bg-amber-50 text-amber-700" variant="secondary">بدون کاربر</Badge>}
                        </span>
                      </span>
                      <I.chevronLeft size={16} className="mt-1 shrink-0 text-stone-300 transition-colors group-hover:text-emerald-500" />
                    </div>
                    <div className="space-y-1 border-t border-stone-100 pt-2 text-[11px] text-stone-500">
                      {p.department && (
                        <div className="flex items-center gap-1.5"><I.store size={12} className="shrink-0 text-stone-400" /><span className="truncate">{p.department}</span></div>
                      )}
                      {p.phone && (
                        <div className="flex items-center gap-1.5"><I.keyboard size={12} className="shrink-0 text-stone-400" /><span dir="ltr" className="num">{toFaDigits(p.phone)}</span></div>
                      )}
                      {p.hireDate && (
                        <div className="flex items-center gap-1.5"><I.calendarDays size={12} className="shrink-0 text-stone-400" />استخدام {faDate(p.hireDate)}</div>
                      )}
                      {!p.hireDate && !p.phone && !p.department && (
                        <div className="text-stone-300">اطلاعات تکمیلی ثبت نشده — برای تکمیل کلیک کنید</div>
                      )}
                      {p.contractType && (
                        <div className="pt-0.5"><Badge className="bg-teal-50 text-teal-700" variant="secondary">قرارداد {cTypeLabel(p.contractType)}</Badge></div>
                      )}
                    </div>
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
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-base font-black', avatarCls(sel?.user?.role))}>
                {(sel?.fullName || '؟').charAt(0)}
              </span>
              پروندهٔ {sel?.fullName}
              {sel?.active === false
                ? <Badge className="bg-stone-200 text-stone-500" variant="secondary">غیرفعال</Badge>
                : <Badge className="bg-emerald-50 text-emerald-700" variant="secondary">فعال</Badge>}
              {sel?.user && <Badge className="bg-amber-50 text-amber-700" variant="secondary">{ROLE_FA[sel.user.role] || sel.user.role}</Badge>}
            </DialogTitle>
            <DialogDescription>
              {sel?.jobTitle || 'بدون سمت'}{sel?.department ? ` · ${sel.department}` : ''} — اطلاعات فردی، قرارداد، مدارک، فیش‌های حقوقی و سوابق
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v: string) => { setTab(v); if (v === 'history' && sel?.user?.id && histChecks.length === 0 && histLeaves.length === 0 && !histLoading) void loadHistory(sel.user.id) }}>
            <TabsList>
              <TabsTrigger value="info"><I.user size={14} className="ml-1 inline" /> اطلاعات فردی</TabsTrigger>
              <TabsTrigger value="contract"><I.penLine size={14} className="ml-1 inline" /> قرارداد</TabsTrigger>
              <TabsTrigger value="docs"><I.fileDown size={14} className="ml-1 inline" /> مدارک</TabsTrigger>
              <TabsTrigger value="payslip"><I.banknote size={14} className="ml-1 inline" /> فیش حقوقی</TabsTrigger>
              <TabsTrigger value="history"><I.history size={14} className="ml-1 inline" /> سوابق</TabsTrigger>
            </TabsList>

            {/* ═══ تب اطلاعات فردی ═══ */}
            <TabsContent value="info" className="space-y-3">
              {isMgr ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">نام و نام خانوادگی *</label>
                      <Input className="h-9" value={pInfo.fullName} onChange={(e: any) => setPInfo((f) => ({ ...f, fullName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">سمت</label>
                      <Input className="h-9" value={pInfo.jobTitle} onChange={(e: any) => setPInfo((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="مثلاً صندوقدار" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">دپارتمان</label>
                      <Input className="h-9" value={pInfo.department} onChange={(e: any) => setPInfo((f) => ({ ...f, department: e.target.value }))} placeholder="مثلاً صندوق" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">کد ملی</label>
                      <Input className="h-9 num" dir="ltr" value={pInfo.nationalId} onChange={(e: any) => setPInfo((f) => ({ ...f, nationalId: toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 10) }))} placeholder="۱۰ رقم" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">تلفن همراه</label>
                      <Input className="h-9 num" dir="ltr" value={pInfo.phone} onChange={(e: any) => setPInfo((f) => ({ ...f, phone: toEnDigits(e.target.value).replace(/[^\d+]/g, '').slice(0, 13) }))} placeholder="09…" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">تاریخ استخدام</label>
                      <JalaliDate value={pInfo.hireDate} onChange={(v: string) => setPInfo((f) => ({ ...f, hireDate: v }))} placeholder="— بدون تاریخ —" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">تاریخ تولد</label>
                      <JalaliDate value={pInfo.birthday} onChange={(v: string) => setPInfo((f) => ({ ...f, birthday: v }))} placeholder="— بدون تاریخ —" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">شماره کارت بانکی</label>
                      <Input className="h-9 num" dir="ltr" value={pInfo.bankCard} onChange={(e: any) => setPInfo((f) => ({ ...f, bankCard: toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 19) }))} placeholder="۱۶ رقم" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">شماره شبا</label>
                      <Input className="h-9 num" dir="ltr" value={pInfo.shaba} onChange={(e: any) => setPInfo((f) => ({ ...f, shaba: e.target.value.slice(0, 26) }))} placeholder="IR…" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">تماس اضطراری (نام)</label>
                      <Input className="h-9" value={pInfo.emergencyName} onChange={(e: any) => setPInfo((f) => ({ ...f, emergencyName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">تماس اضطراری (شماره)</label>
                      <Input className="h-9 num" dir="ltr" value={pInfo.emergencyPhone} onChange={(e: any) => setPInfo((f) => ({ ...f, emergencyPhone: toEnDigits(e.target.value).replace(/[^\d+]/g, '').slice(0, 13) }))} placeholder="09…" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">اتصال به کاربر سیستم</label>
                      <Select dir="rtl" value={pInfo.userId || 'NONE'} onValueChange={(v: string) => setPInfo((f) => ({ ...f, userId: v === 'NONE' ? '' : v }))}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">— بدون کاربر —</SelectItem>
                          {(pInfo.userId && sel?.user && !linkable.some((u) => u.id === pInfo.userId)
                            ? [{ id: sel.user.id, username: sel.user.username, fullName: sel.user.fullName, role: sel.user.role }]
                            : []).map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName} ({ROLE_FA[u.role] || u.role})</SelectItem>)}
                          {linkable.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName} ({ROLE_FA[u.role] || u.role})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="mb-1 block text-xs text-stone-500">یادداشت</label>
                      <Textarea rows={2} value={pInfo.note} onChange={(e: any) => setPInfo((f) => ({ ...f, note: e.target.value }))} placeholder="یادداشت دربارهٔ این پرسنل…" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
                    <Button
                      variant="outline" size="sm" disabled={activeBusy}
                      className={cn('gap-1.5', sel?.active !== false ? 'border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50')}
                      onClick={() => void toggleActive()}
                    >
                      {activeBusy ? <I.loader size={14} className="animate-spin" /> : sel?.active !== false ? <I.trash size={14} /> : <I.check size={14} />}
                      {sel?.active !== false ? 'غیرفعال‌سازی پرونده' : 'فعال‌سازی پرونده'}
                    </Button>
                    <Button size="sm" disabled={pSaving} onClick={() => void saveInfo()} className="gap-1.5">
                      {pSaving ? <I.loader size={14} className="animate-spin" /> : <I.save size={14} />} ذخیرهٔ اطلاعات فردی
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-7 text-stone-700 sm:grid-cols-2">
                  <div>نام: <b>{sel?.fullName}</b></div>
                  <div>سمت: <b>{sel?.jobTitle || '—'}</b></div>
                  <div>دپارتمان: <b>{sel?.department || '—'}</b></div>
                  <div>کد ملی: <b className="num">{toFaDigits(sel?.nationalId || '—')}</b></div>
                  <div>تلفن: <b className="num">{toFaDigits(sel?.phone || '—')}</b></div>
                  <div>استخدام: <b className="num">{faDate(sel?.hireDate)}</b></div>
                </div>
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
                    <Select dir="rtl" value={cType || 'NONE'} onValueChange={(v: string) => setCType(v === 'NONE' ? '' : v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">— ثبت نشده —</SelectItem>
                        {CONTRACT_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-stone-500">حقوق قرارداد (ریال)</label>
                    {/* R7: جداکنندهٔ هزارگان خودکار */}
                    <MoneyInput className="text-right" value={cSalary} onChange={(v: string) => setCSalary(v)} placeholder="۲۰۰٬۰۰۰٬۰۰۰" suffix="ریال" />
                    {cSalary && Number(toEnDigits(cSalary)) > 0 && (
                      <p className="mt-1 text-[10px] text-stone-400">≈ {toman(Number(toEnDigits(cSalary)))} تومان</p>
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
                  <div>حقوق قرارداد: <b>{cSalary ? money(Number(toEnDigits(cSalary))) + ' ریال' : '—'}</b></div>
                  {cNote && <div>ملاحظات: {cNote}</div>}
                </div>
              )}
            </TabsContent>

            {/* ═══ تب مدارک ═══ */}
            <TabsContent value="docs" className="space-y-3">
              {!sel?.user?.id ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
                  این پرونده به هیچ کاربری متصل نیست — برای بارگذاری مدرک، از تب «اطلاعات فردی» یک کاربر به آن متصل کنید.
                </div>
              ) : (
                <>
                  {isMgr && (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-stone-600"><I.plus size={14} /> بارگذاری مدرک جدید</div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-40">
                          <label className="mb-1 block text-[11px] text-stone-500">نوع مدرک</label>
                          <Select dir="rtl" value={upKind} onValueChange={setUpKind}>
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
                    <div className="py-8 text-center">
                      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100"><I.fileDown size={22} className="text-stone-400" /></div>
                      <p className="text-sm font-bold text-stone-600">هنوز مدرکی بارگذاری نشده است</p>
                      <p className="mt-1 text-xs text-stone-400">کارت ملی، شناسنامه، قرارداد، عکس، مدرک و فیش حقوقی قابل بارگذاری است.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {docs.map((d) => {
                        const km = kindMeta(d.kind)
                        const isImg = d.mimeType.startsWith('image/')
                        const isPdf = d.mimeType === 'application/pdf'
                        const thumb = thumbs[d.id]
                        return (
                          <div key={d.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md">
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

            {/* ═══ تب سوابق ═══ */}
            <TabsContent value="history" className="space-y-3">
              {!sel?.user?.id ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
                  این پرونده به کاربری متصل نیست — سوابق حضور و مرخصی برای کاربران متصل ثبت می‌شود.
                </div>
              ) : histLoading ? (
                <div className="py-8 text-center text-sm text-stone-400"><I.loader className="mx-auto mb-2 animate-spin" size={18} /> در حال دریافت سوابق…</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* آخرین وضعیت‌های حضور */}
                  <div className="rounded-xl border border-stone-200">
                    <div className="border-b border-stone-100 px-3 py-2 text-xs font-bold text-stone-700">آخرین وضعیت‌های حضور (بررسی تیم)</div>
                    {histChecks.length === 0 ? (
                      <p className="py-6 text-center text-xs text-stone-400">هنوز کنترل شیفتی برای این پرسنل ثبت نشده است</p>
                    ) : (
                      <div className="max-h-72 space-y-1.5 overflow-y-auto p-2.5">
                        {histChecks.map((c: any) => {
                          const am = ARRIVAL_FA[c.arrival] || ARRIVAL_FA.on_time
                          const bits = [
                            c.lateMinutes > 0 ? `تأخیر ${minutesToHM(c.lateMinutes)}${c.hadPermission ? ' (با اجازه)' : ''}` : '',
                            c.hourlyLeaveMinutes > 0 ? `مرخصی ${minutesToHM(c.hourlyLeaveMinutes)}` : '',
                            c.overtimeMinutes > 0 ? `اضافه‌کاری ${minutesToHM(c.overtimeMinutes)}` : '',
                          ].filter(Boolean)
                          return (
                            <div key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-100 bg-white px-2.5 py-1.5">
                              <span className="num text-[11px] font-bold text-stone-700">{faDate(c.date)}</span>
                              <Badge variant="secondary" className="bg-stone-100 text-stone-600">{c.shift === 'MORNING' ? 'صبح' : 'عصر'}</Badge>
                              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', am.cls)}>{am.label}</span>
                              {bits.length > 0 && <span className="text-[10px] text-stone-500">{bits.join(' · ')}</span>}
                              <span className="mr-auto text-[9.5px] text-stone-300">{c.checkerName || ''}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {/* مرخصی‌ها */}
                  <div className="rounded-xl border border-stone-200">
                    <div className="border-b border-stone-100 px-3 py-2 text-xs font-bold text-stone-700">مرخصی‌ها</div>
                    {histLeaves.length === 0 ? (
                      <p className="py-6 text-center text-xs text-stone-400">مرخصی‌ای برای این پرسنل ثبت نشده است</p>
                    ) : (
                      <div className="max-h-72 space-y-1.5 overflow-y-auto p-2.5">
                        {histLeaves.map((l: any) => {
                          const tm = leaveTypeMeta(l.type)
                          const st = LEAVE_STATUS[l.status] || LEAVE_STATUS.PENDING
                          return (
                            <div key={l.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-100 bg-white px-2.5 py-1.5">
                              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', tm.cls)}>{tm.label}</span>
                              <span className="num text-[11px] text-stone-600">{faDate(l.fromDate)}{l.type !== 'HOURLY' && l.toDate !== l.fromDate ? ` تا ${faDate(l.toDate)}` : ''}</span>
                              <span className="num text-[10px] font-bold text-stone-700">{l.type === 'HOURLY' ? `${fa(l.hours || 0)} ساعت` : `${fa(l.days)} روز`}</span>
                              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', st.cls)}>{st.label}</span>
                              {l.reason && <span className="truncate text-[10px] text-stone-400" title={l.reason}>{l.reason}</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ پرسنل جدید ═══ */}
      <Dialog open={npOpen} onOpenChange={setNpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>پروندهٔ پرسنل جدید</DialogTitle>
            <DialogDescription>حداقل نام و نام خانوادگی لازم است؛ بقیهٔ اطلاعات بعداً از تب «اطلاعات فردی» قابل تکمیل است.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-stone-500">نام و نام خانوادگی *</label>
              <Input className="h-9" value={np.fullName} onChange={(e: any) => setNp((f) => ({ ...f, fullName: e.target.value }))} placeholder="مثلاً فاطمه احمدی" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">سمت</label>
              <Input className="h-9" value={np.jobTitle} onChange={(e: any) => setNp((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="مثلاً صندوقدار" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">دپارتمان</label>
              <Input className="h-9" value={np.department} onChange={(e: any) => setNp((f) => ({ ...f, department: e.target.value }))} placeholder="مثلاً صندوق" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">تلفن همراه</label>
              <Input className="h-9 num" dir="ltr" value={np.phone} onChange={(e: any) => setNp((f) => ({ ...f, phone: toEnDigits(e.target.value).replace(/[^\d+]/g, '').slice(0, 13) }))} placeholder="09…" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">کد ملی</label>
              <Input className="h-9 num" dir="ltr" value={np.nationalId} onChange={(e: any) => setNp((f) => ({ ...f, nationalId: toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 10) }))} placeholder="۱۰ رقم" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">تاریخ استخدام</label>
              <JalaliDate value={np.hireDate} onChange={(v: string) => setNp((f) => ({ ...f, hireDate: v }))} placeholder="— بدون تاریخ —" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">اتصال به کاربر سیستم</label>
              <Select dir="rtl" value={np.userId || 'NONE'} onValueChange={(v: string) => setNp((f) => ({ ...f, userId: v === 'NONE' ? '' : v }))}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون کاربر —</SelectItem>
                  {linkable.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName} ({ROLE_FA[u.role] || u.role})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-stone-500">یادداشت</label>
              <Textarea rows={2} value={np.note} onChange={(e: any) => setNp((f) => ({ ...f, note: e.target.value }))} placeholder="یادداشت اولیه…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNpOpen(false)}>انصراف</Button>
            <Button disabled={npBusy} onClick={() => void createPerson()} className="gap-1.5">
              {npBusy ? <I.loader size={15} className="animate-spin" /> : <I.plus size={15} />} ایجاد پرونده
            </Button>
          </DialogFooter>
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
