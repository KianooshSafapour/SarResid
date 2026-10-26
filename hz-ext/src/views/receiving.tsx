import {
  useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn,
  Button, Input, Card, CardContent, CardHeader, CardTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Checkbox,
  money, toman, fa, toEnDigits, toFaDigits, formatJalali, I,
  MoneyInput, NumInput,
} from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════════
   supply/receiving — «دریافت کالا» (میزکار دو‌مرحله‌ای دریافت — R9-V3)
   ───────────────────────────────────────────────────────────────────
   این صفحه فقط برای دریافت فیزیکی کالاست؛ ثبت سفارش در
   «سفارش‌گذاری هوشمند» انجام می‌شود. گردش‌کار ۵ مرحله‌ای:
     ۱) ثبت و تأیید سفارش (مدیر)  ← ۲) دریافت انبار (کارمند مجاز:
        OWNER/GM/ADMIN/EXEC/PM/SK — با مرجوعی جزئی: «کارتن ۱۲تایی
        می‌رسد، ۴ تا شکسته است → ۴ مرجوعی، ۸ وارد انبار»)
     ۳) راستی‌آزمایی ناظر (مدیران/انباردار) ← ۴) ثبت حسابداری
        (خانم درویشی — کنترل سود ۱۲٪/۲۱٪ + هلو) ← ۵) بستن سفارش.
   امکانات کلیدی:
     • میان‌برهای «کامل / نرسید» برای هر قلم + «همه تحویل کامل شد»
     • ذخیرهٔ پیشرفت برای تحویل‌های طولانی (بدون پایان دریافت)
     • چیپ «قیمت چاپی متفاوت» با شرط صحیح:
       productSellPrice != null ∧ printedPrice > 0 ∧ printedPrice ≠ productSellPrice
     • پنل ضایعات: اقلامی که باید به مامور پخش داده شود
     • «کالای اضافی» — قلمی که در درگاه کشف می‌شود (add-item)
   ═══════════════════════════════════════════════════════════════════ */

/* ── R9-V3: برچسب‌ها و رنگ‌های وضعیت (هماهنگ با orders.tsx) ── */
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
const ITEM_STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار', OK: 'کامل', PARTIAL: 'کسری', MISSING: 'نرسید',
  PARTIAL_RETURN: 'مرجوعی جزئی', RETURNED: 'کامل مرجوع', RECEIVED: 'دریافت‌شده', REJECTED: 'ردشده',
}
const ITEM_STATUS_CLS: Record<string, string> = {
  PENDING: 'bg-stone-100 text-stone-600 border-stone-200',
  OK: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-100 text-amber-700 border-amber-200',
  MISSING: 'bg-rose-100 text-rose-700 border-rose-200',
  PARTIAL_RETURN: 'bg-amber-100 text-amber-800 border-amber-300',
  RETURNED: 'bg-rose-100 text-rose-700 border-rose-300',
  RECEIVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
}

/* علت‌های مرجوعی هنگام دریافت (هماهنگ با orders.tsx) */
const RETURN_REASONS = ['شکسته/مخدوش', 'قیمت چاپی متفاوت', 'تاریخ انقضا گذشته', 'کالای اشتباه', 'دیگر']

/* ── R9-V3: مرحله‌های فهرست سفارش‌ها (چیپ‌های وضعیت) ── */
const STAGES: { key: string; label: string; empty: string }[] = [
  { key: 'APPROVED', label: 'آمادهٔ دریافت', empty: 'سفارش تأییدشده‌ای در نوبت دریافت نیست — سفارش‌ها پس از تأیید مدیر، خودکار به این صف می‌آیند (ثبت سفارش در «سفارش‌گذاری هوشمند»).' },
  { key: 'RECEIVING', label: 'در حال دریافت', empty: 'دریافت نیمه‌کاره‌ای نداریم — با «شروع دریافت» روی یک سفارش آماده، کار اینجا شروع می‌شود و با «ذخیرهٔ پیشرفت» می‌توانید وسط کار بیهوده نگران از دست رفتن داده نباشید.' },
  { key: 'RECEIVED', label: 'دریافت‌شده — در انتظار راستی‌آزمایی', empty: 'سفارشی در انتظار راستی‌آزمایی نیست — پس از «پایان دریافت» توسط کارمند، هر کارمندِ دیگری (غیر از دریافت‌کننده) می‌تواند آن را راستی‌آزمایی کند.' },
  { key: 'VERIFIED', label: 'راستی‌آزمایی‌شده — در انتظار حسابداری', empty: 'سفارشی در انتظار ثبت حسابداری نیست — پس از تأیید ناظر، نوبت خانم درویشی است (کنترل سود و ثبت).' },
  { key: 'ACCOUNTED', label: 'ثبت‌شده در حسابداری', empty: 'سفارشی در انتظار بستن نیست — پس از ثبت حسابداری، مدیر سفارش را می‌بندد و پرونده کامل می‌شود.' },
]

/* ── R9-V3: پنج‌گامِ میزکار (استپر) ── */
const STEPS: { title: string; actor: string }[] = [
  { title: 'ثبت و تأیید سفارش', actor: 'سفارش‌گذار + مدیر' },
  { title: 'دریافت انبار', actor: 'هر کارمند' },
  /* R11: راستی‌آزمایی هم برای همهٔ کارکنان باز است — فقط نه توسط خودِ دریافت‌کننده */
  { title: 'راستی‌آزمایی', actor: 'هر کارمندِ دیگر — غیر از دریافت‌کننده' },
  { title: 'ثبت حسابداری', actor: 'حسابداری' },
  { title: 'بستن', actor: 'مدیر' },
]

/* برچسب فارسی رویدادهای تاریخچه */
const HISTORY_FA: Record<string, string> = {
  create: 'ثبت سفارش', submit: 'ارسال برای تأیید', approve: 'تأیید سفارش',
  'start-receive': 'شروع دریافت', 'save-progress': 'ذخیرهٔ پیشرفت', 'add-item': 'افزودن قلم',
  receive: 'پایان دریافت', 'cheque-auto': 'ثبت خودکار چک', verify: 'راستی‌آزمایی',
  account: 'ثبت حسابداری', 'final-approve': 'بستن سفارش', cancel: 'لغو سفارش',
  'edit-submitted': 'ویرایش پیش از تأیید', update: 'ویرایش پیش‌نویس',
  'waste-select': 'انتخاب ضایعات', 'waste-returned': 'برگشت ضایعات', 'waste-revert': 'بازگشت ضایعات به انتظار',
}

/* ── helpers ─────────────────────────────────────────────── */
function numify(raw: string): number {
  return Number(toEnDigits(String(raw ?? '')).replace(/[^\d]/g, '')) || 0
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

/* وضعیت هر قلم پس از دریافت — همان فرمول سرور (computeReceiveStatus در /api/orders/[id]) */
function computeItemStatus(qty: number, receivedQty: number, returnedQty: number): string {
  if (receivedQty <= 0) return 'MISSING'
  if (qty > 0 && returnedQty >= qty) return 'RETURNED'
  if (returnedQty > 0) return 'PARTIAL_RETURN'
  if (receivedQty >= qty) return 'OK'
  return 'PARTIAL'
}

/* فرمول مغایرت سرور: پذیرفته‌شده ≠ سفارش یا وضعیت خارج از {PENDING, OK} */
function mismatchOfItems(items: any[]): number {
  return items.filter((it) => {
    const accepted = Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0))
    return accepted !== it.qty || (it.status !== 'PENDING' && it.status !== 'OK')
  }).length
}

/* ── atoms ───────────────────────────────────────────────── */
function PayBadge({ v }: { v?: string }) {
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', PAY_CLS[v ?? ''] || 'bg-stone-100 text-stone-600 border-stone-200')}>{PAY_LABEL[v ?? ''] || v}</span>
}

function OrderStatusBadge({ v }: { v?: string }) {
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', ORDER_STATUS_CLS[v ?? ''] || 'bg-stone-100 text-stone-600 border-stone-200')}>{ORDER_STATUS_FA[v ?? ''] || v}</span>
}

function ItemStatusChip({ st }: { st?: string }) {
  return <span className={cn('rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold', ITEM_STATUS_CLS[st ?? ''] ?? ITEM_STATUS_CLS.PENDING)}>{ITEM_STATUS_FA[st ?? ''] ?? st}</span>
}

/* ٪ سود — قرمز < ۱۲ · کهربایی < ۲۱ · سبز ≥ ۲۱ (هماهنگ با دیالوگ حسابداری orders.tsx) */
function MarginChip({ mg }: { mg: number | null }) {
  if (mg == null) return <span className="text-[10px] text-stone-400">بهای صفر</span>
  return (
    <span className={cn('inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-black',
      mg < 12 ? 'border-rose-200 bg-rose-100 text-rose-700' : mg < 21 ? 'border-amber-200 bg-amber-100 text-amber-800' : 'border-emerald-200 bg-emerald-100 text-emerald-700')}>
      {fa(Math.round(mg))}٪
    </span>
  )
}

/* ═════════ نمای اصلی — میزکار دریافت کالا ═════════ */
export default function ReceivingView() {
  const { user: shellUser, refreshBadges, go } = useShell()
  /* R9-V3: نقش کاربر — از پوستهٔ زنده؛ در نبودش از /api/auth/me */
  const [meUser, setMeUser] = useState<any>(null)
  const user = shellUser || meUser

  /* فهرست سفارش‌ها بر پایهٔ مرحله */
  const [stage, setStage] = useState('APPROVED')
  const [list, setList] = useState<any[] | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [listQ, setListQ] = useState('')
  const [listLoading, setListLoading] = useState(true)

  /* سفارش انتخاب‌شده + جزئیات */
  const [selId, setSelId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  /* فرم دریافت (مرحلهٔ ۲) */
  const [rows, setRows] = useState<any[] | null>(null)
  const [actBusy, setActBusy] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  /* کالای اضافی (add-item) */
  const [addDlg, setAddDlg] = useState<any>(null)
  const addTimer = useRef<any>(null)

  /* ثبت حسابداری (مرحلهٔ ۴) */
  const [accRows, setAccRows] = useState<any[] | null>(null)
  const [accFor, setAccFor] = useState<string | null>(null)
  const [providerDoc, setProviderDoc] = useState('')
  const [pushToHoloo, setPushToHoloo] = useState(false)
  const [accResult, setAccResult] = useState<any>(null)

  /* R11: مامور پخش (نمایندهٔ تأمین‌کننده) — برای سپردن اقلام ضایعاتِ برگشتی؛
     نام کامل + موبایل، الزامی پیش از «پایان دریافت» سفارشِ دارای ضایعاتِ برگشتی */
  const [wasteRep, setWasteRep] = useState<{ name: string; phone: string }>({ name: '', phone: '' })
  const repNameOk = wasteRep.name.trim().length >= 3
  const repPhoneOk = wasteRep.phone.replace(/[^0-9]/g, '').length >= 10 && wasteRep.phone.replace(/[^0-9]/g, '').length <= 14
  const repValid = repNameOk && repPhoneOk

  /* R11: تنظیم نمایش «آخرین رویدادها» و «یادداشت سفارش» — فقط مدیر سیستم؛ پیش‌فرض: پنهان */
  const [visFlags, setVisFlags] = useState<{ showHistory: boolean; showNote: boolean; loaded: boolean }>({ showHistory: false, showNote: false, loaded: false })
  const [visBusy, setVisBusy] = useState(false)

  /* نقش‌ها — تأیید نهایی دسترسی روی سرور بررسی می‌شود */
  const role = String(user?.role ?? '')
  /* R10: دریافت کالا برای همهٔ کارکنان باز است (مالک: «همه باید بتوانند دریافت کنند») */
  const canReceive = !!user
  /* R11: راستی‌آزمایی (تأیید دریافت) هم برای همهٔ کارکنان باز است —
     هر کسی می‌تواند یا دریافت کند یا راستی‌آزمایی؛ نه هر دو برای یک سفارش (اصل دو‌نفره، سمت سرور هم اجباری است) */
  const canVerify = !!user
  const canAccount = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC'].includes(role)
  const isManager = ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(role)
  /* R10: اصل دو‌نفره — اگر کاربر جاری همان دریافت‌کننده باشد، راستی‌آزمایی خودش ممنوع است */
  const isReceiver = !!(detail?.receivedBy?.id && user?.id && detail.receivedBy.id === user.id)

  useEffect(() => {
    void loadList()
    /* R9-V3: در نبود کاربرِ پوسته، نقش از /api/auth/me خوانده می‌شود */
    if (!shellUser) {
      void api('/api/auth/me').then((r: any) => { if (r.ok) setMeUser(r.data?.user ?? null) })
    }
    /* R11: تنظیم نمایش مدیر (پیش‌فرض پنهان) */
    void api('/api/settings/receiving').then((r: any) => {
      if (r.ok) setVisFlags({ showHistory: !!r.data?.showHistory, showNote: !!r.data?.showNote, loaded: true })
    })
  }, [])

  /* ── R9-V3: فهرست سفارش‌های مرحلهٔ جاری ── */
  async function loadList(st?: string) {
    const target = st ?? stage
    setListLoading(true)
    const r = await api('/api/orders' + qs({ status: target, q: listQ.trim() || undefined, pageSize: 50, queue: 1 }))
    setListLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت سفارش‌ها'); setList([]); return }
    setList(r.data?.items ?? [])
    setStatusCounts(r.data?.statusCounts ?? {})
  }

  /* ── انتخاب سفارش و بارگذاری پروندهٔ کامل ── */
  async function selectOrder(o: any) {
    setSelId(o.id)
    setDetail(null)
    setRows(null)
    setConfirmOpen(false)
    setAccRows(null)
    setAccFor(null)
    setAccResult(null)
    setProviderDoc('')
    setPushToHoloo(false)
    setWasteRep({ name: '', phone: '' })
    await loadDetail(o.id)
  }

  /* R11: تغییر تنظیم نمایش توسط مدیر — PUT و به‌روزرسانی وضعیت */
  async function toggleVis(key: 'showHistory' | 'showNote') {
    if (visBusy) return
    setVisBusy(true)
    const r = await api('/api/settings/receiving', { method: 'PUT', body: { [key]: !visFlags[key] } })
    setVisBusy(false)
    if (!r.ok) { toast.error(r.error || 'ذخیرهٔ تنظیم ناموفق بود'); return }
    setVisFlags((f) => ({ ...f, [key]: !f[key], loaded: true }))
    toast.success(key === 'showHistory'
      ? (!visFlags[key] ? 'نمایش «آخرین رویدادها» روشن شد' : '«آخرین رویدادها» پنهان شد')
      : (!visFlags[key] ? 'نمایش «یادداشت سفارش» روشن شد' : '«یادداشت سفارش» پنهان شد'))
  }

  async function loadDetail(id: string) {
    setDetailLoading(true)
    const r = await api(`/api/orders/${id}`)
    setDetailLoading(false)
    if (!r.ok) { toast.error(r.error || 'جزئیات سفارش دریافت نشد'); setSelId(null); return }
    setDetail(r.data)
    /* اگر سفارش در حال دریافت است، فرم از مقادیر ذخیره‌شده پر می‌شود */
    if (r.data?.status === 'RECEIVING') initRows(r.data?.items ?? [])
  }

  /* ── R9-V3: ساخت سطرهای فرم دریافت — پیش‌پرشدگی از مقادیر ذخیره‌شده ── */
  function initRows(items: any[]) {
    setRows(items.map((it: any) => ({
      id: it.id,
      name: it.name,
      barcode: it.barcode,
      qty: it.qty,
      unitBuyPrice: it.unitBuyPrice,
      printedPrice: it.printedPrice,
      productSellPrice: it.productSellPrice,
      /* تحویل نیمه‌کاره؟ مقدار ذخیره‌شده، وگرنه «کامل» (پیش‌فرض عملی انباردار) */
      receivedQty: it.receivedQty != null ? it.receivedQty : it.qty,
      returnedQty: it.returnedQty ?? 0,
      returnReason: it.returnReason ?? '',
    })))
  }

  /* ── اکشن‌های گردش‌کار ── */
  async function patchAction(id: string, action: string, extra?: Record<string, any>, busyKey?: string) {
    setActBusy(busyKey ?? action)
    const r = await api(`/api/orders/${id}`, { method: 'PATCH', body: { action, ...extra } })
    setActBusy(null)
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return null }
    setDetail(r.data)
    setRows(null)
    refreshBadges?.()
    void loadList()
    return r.data
  }

  /* شروع دریافت — درِ انبار باز می‌شود */
  async function startReceive() {
    if (!detail) return
    const d = await patchAction(detail.id, 'start-receive', undefined, 'start')
    if (!d) return
    toast.success(`دریافت ${d.code} شروع شد — اقلام را همان‌طور که رسیدند ثبت کنید`)
    initRows(d.items ?? [])
  }

  /* ── ویرایش سطر فرم (clamp مرجوعی ≤ دریافت؛ پاک‌کردن علت در صفر) ── */
  function patchRow(i: number, patch: Record<string, any>) {
    setRows((rs) => {
      if (!rs) return rs
      return rs.map((x, j) => {
        if (j !== i) return x
        const nx = { ...x, ...patch }
        nx.receivedQty = Math.max(0, Math.round(Number(nx.receivedQty ?? 0) || 0))
        nx.returnedQty = Math.min(nx.receivedQty, Math.max(0, Math.round(Number(nx.returnedQty ?? 0) || 0)))
        if (nx.returnedQty <= 0) nx.returnReason = ''
        return nx
      })
    })
  }

  /* میان‌بر سراسری مالک: «همه تحویل کامل شد» — کل سفارش بدون ایراد */
  function allFull() {
    setRows((rs) => (rs ?? []).map((x) => ({ ...x, receivedQty: x.qty, returnedQty: 0, returnReason: '' })))
    toast.info('همهٔ اقلام «تحویل کامل» علامت خورد — در صورت نیاز اصلاح کنید و ثبت کنید')
  }

  /* ذخیرهٔ پیشرفت — برای تحویل‌های طولانی، بدون پایان دریافت */
  async function saveProgress() {
    if (!detail || !rows) return
    const d = await patchAction(detail.id, 'save-progress', {
      items: rows.map((r: any) => ({
        id: r.id,
        receivedQty: r.receivedQty,
        returnedQty: r.returnedQty,
        ...(r.returnedQty > 0 && r.returnReason ? { returnReason: r.returnReason } : {}),
      })),
    }, 'save')
    if (!d) return
    toast.success(`پیشرفت دریافت ${d.code} ذخیره شد — سفارش در حال دریافت باقی می‌ماند`)
    initRows(d.items ?? [])
  }

  /* ── R9-V3: خلاصهٔ زندهٔ فرم ── */
  const sum = useMemo(() => {
    const rs = rows ?? []
    const stOf = (x: any) => computeItemStatus(Number(x.qty) || 0, Number(x.receivedQty ?? 0), Number(x.returnedQty ?? 0))
    return {
      ok: rs.filter((x) => stOf(x) === 'OK').length,
      ret: rs.filter((x) => ['PARTIAL_RETURN', 'RETURNED'].includes(stOf(x))).length,
      miss: rs.filter((x) => stOf(x) === 'MISSING').length,
      accepted: rs.reduce((s: number, x: any) => s + Math.max(0, Number(x.receivedQty ?? 0) - Number(x.returnedQty ?? 0)), 0),
      acceptedValue: rs.reduce((s: number, x: any) => s + Math.max(0, Number(x.receivedQty ?? 0) - Number(x.returnedQty ?? 0)) * (Number(x.unitBuyPrice) || 0), 0),
      mism: rs.filter((x) => stOf(x) !== 'OK').length,
    }
  }, [rows])

  /* پایان دریافت — با دیالوگ تأیید مغایرت‌ها (R11: + مامور پخشِ ضایعاتِ برگشتی) */
  async function confirmReceive() {
    if (!detail || !rows) return
    /* اگر سفارش ضایعاتِ برگشتی دارد و فرم مامور پخش ناقص است، دکمه از قبل غیرفعال است؛
       اینجا هم دوباره چک می‌کنیم (fail-safe) */
    const selWaste = (detail.wasteReturns ?? []).filter((w: any) => w.status === 'SELECTED').length
    if (selWaste > 0 && !repValid) return toast.error('نام کامل و شمارهٔ موبایل مامور پخش را وارد کنید — اقلام ضایعات به او سپرده می‌شود')
    const d = await patchAction(detail.id, 'receive', {
      items: rows.map((r: any) => ({
        id: r.id,
        receivedQty: r.receivedQty,
        returnedQty: r.returnedQty || 0,
        ...(r.returnedQty > 0 && r.returnReason ? { returnReason: r.returnReason } : {}),
      })),
      ...(selWaste > 0 ? { wasteRepName: wasteRep.name.trim(), wasteRepPhone: wasteRep.phone.trim() } : {}),
    }, 'receive')
    setConfirmOpen(false)
    if (!d) return
    const mm = d.mismatch ?? 0
    const rItems: any[] = d.items ?? []
    const okN = rItems.filter((x) => x.status === 'OK').length
    const retN = rItems.filter((x) => x.status === 'PARTIAL_RETURN' || x.status === 'RETURNED').length
    const missN = rItems.filter((x) => x.status === 'MISSING').length
    toast.success(
      `دریافت ثبت شد — ${fa(okN)} قلم کامل${retN ? `، ${fa(retN)} مرجوعی` : ''}${missN ? `، ${fa(missN)} نرسید` : ''}` +
      (mm ? ` (${fa(mm)} مغایرت)` : '') +
      (d.payMethod === 'CHEQUE' && d.chequeDays > 0 ? ' — چک خودکار ثبت شد' : ''),
    )
    /* نتیجهٔ مرحلهٔ بعد را همان‌جا نشان بده (کارت راستی‌آزمایی) */
  }

  /* ── R9-V3: کالای اضافی — قلمی که در درگاه کشف شد ── */
  function openAddDlg() {
    setAddDlg({ q: '', rs: null, productId: '', name: '', barcode: '', qty: '1', unitBuyPrice: '0', printedPrice: '0' })
  }

  function addSearch(t: string) {
    setAddDlg((d: any) => ({ ...(d ?? {}), q: t, rs: null }))
    if (addTimer.current) clearTimeout(addTimer.current)
    const tt = toEnDigits(t).trim()
    if (tt.length < 2) return
    addTimer.current = setTimeout(async () => {
      const r = await api('/api/products/search' + qs({ q: tt, limit: 6 }))
      if (!r.ok) return
      setAddDlg((d: any) => (d ? { ...d, rs: r.data?.products ?? [] } : d))
    }, 300)
  }

  function addPickProduct(p: any) {
    setAddDlg((d: any) => ({
      ...(d ?? {}),
      productId: p.id,
      name: p.name,
      barcode: p.barcode ?? '',
      unitBuyPrice: String(Math.round(Number(p.lastBuyPrice ?? 0)) || 0),
      printedPrice: String(Math.round(Number(p.sellPrice ?? 0)) || 0),
      q: p.name,
      rs: null,
    }))
  }

  async function submitAdd() {
    if (!detail || !addDlg) return
    const name = String(addDlg.name || addDlg.q || '').trim()
    if (!name) return toast.error('نام کالا را وارد کنید یا از جست‌وجو انتخاب کنید')
    const qty = numify(addDlg.qty)
    if (qty < 1) return toast.error('تعداد را وارد کنید')
    const d = await patchAction(detail.id, 'add-item', {
      ...(addDlg.productId ? { productId: addDlg.productId } : {}),
      name,
      barcode: addDlg.barcode || undefined,
      qty,
      unitBuyPrice: numify(addDlg.unitBuyPrice),
      printedPrice: numify(addDlg.printedPrice) || undefined,
    }, 'add')
    if (!d) return
    toast.success(`«${name}» به سفارش اضافه شد و تحویل‌شده ثبت شد (${fa(qty)} عدد)`)
    setAddDlg(null)
    initRows(d.items ?? [])
  }

  /* ── R9-V3: راستی‌آزمایی ناظر (مرحلهٔ ۳) ── */
  async function verifyOrder() {
    if (!detail) return
    const d = await patchAction(detail.id, 'verify', undefined, 'verify')
    if (!d) return
    toast.success(`راستی‌آزمایی ${d.code} تأیید شد — سفارش به حسابداری ارجاع شد`)
  }

  /* ── R9-V3: ثبت حسابداری (مرحلهٔ ۴) — ساخت سطرها هنگام ورود به کارت ── */
  useEffect(() => {
    if (detail?.status === 'VERIFIED' && accFor !== detail.id) {
      setAccFor(detail.id)
      setAccRows((detail.items ?? []).map((it: any) => ({
        id: it.id,
        name: it.name,
        qty: it.qty,
        accepted: Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0)),
        returnedQty: it.returnedQty ?? 0,
        unitBuyPrice: it.unitBuyPrice,
        printedPrice: it.printedPrice,
        markedReturned: false,
      })))
    }
  }, [detail, accFor])

  function patchAccRow(i: number, patch: Record<string, any>) {
    setAccRows((rs) => (rs ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  const accTotal = useMemo(() => (accRows ?? []).reduce((s: number, x: any) => s + (Number(x.unitBuyPrice) || 0) * (Number(x.qty) || 0), 0), [accRows])

  async function submitAccount() {
    if (!detail || !accRows) return
    const d = await patchAction(detail.id, 'account', {
      items: accRows.map((x: any) => ({
        id: x.id,
        unitBuyPrice: Number(x.unitBuyPrice) || 0,
        printedPrice: Number(x.printedPrice) || 0,
        ...(x.markedReturned ? { markedReturned: true } : {}),
      })),
      providerDocNumber: providerDoc.trim() || undefined,
      ...(pushToHoloo ? { pushToHoloo: true } : {}),
    }, 'account')
    if (!d) return
    const parts: string[] = [`ثبت حسابداری ${d.code} انجام شد`]
    if (d.marginInvoiceNumber) parts.push(`فاکتور سودسنج شمارهٔ ${fa(d.marginInvoiceNumber)}`)
    if (d.archiveDocId) parts.push('سند آرشیو فاکتور ساخته شد')
    toast.success(parts.join(' — '))
    if (d.holoo?.pending) toast.warning(`هلو: در انتظار ارسال — ${d.holoo?.reason ?? ''}`)
    setAccResult(d)
  }

  /* ── R10: پیش‌فاکتور سودسنج — فاکتور پیش‌نویس از اقلام همین سفارش + پرش به سودسنج ── */
  const [proformaBusy, setProformaBusy] = useState(false)
  async function makeProforma() {
    if (!detail || proformaBusy) return
    const items = (detail.items ?? []).map((it: any) => ({
      productId: it.productId ?? null,
      barcode: it.barcode ?? null,
      productName: it.name,
      unit: 'عدد',
      quantity: Math.max(1, Math.round(Number(it.qty) || 0)),
      totalCost: Math.round((Number(it.unitBuyPrice) || 0) * (Number(it.qty) || 0)),
      printedPrice: Number(it.printedPrice) || 0,
      salePrice: Number(it.printedPrice) || 0,
      note: (it.returnedQty ?? 0) > 0 ? `مرجوعی: ${it.returnedQty}` : null,
    }))
    if (!items.length) return toast.error('قلمی برای پیش‌فاکتور نیست')
    setProformaBusy(true)
    const r = await api('/api/margin', {
      method: 'POST',
      body: {
        supplierId: detail.supplierId ?? undefined,
        supplierName: detail.supplierName || 'بدون تأمین‌کننده',
        note: `پیش‌فاکتور سفارش ${detail.code} — کنترل سود پیش از ثبت حسابداری`,
        items,
      },
    })
    setProformaBusy(false)
    if (!r.ok) return toast.error(r.error || 'ساخت پیش‌فاکتور ناموفق بود')
    const inv = r.data?.invoice ?? r.data
    toast.success(`پیش‌فاکتور سودسنج شمارهٔ ${fa(inv?.number ?? '')} ساخته شد — برای بازبینی به سودسنج می‌روید`)
    if (inv?.id) go(`profit/builder?id=${inv.id}`)
  }

  /* ── بستن سفارش (مرحلهٔ ۵) ── */
  async function finalApprove() {
    if (!detail) return
    const d = await patchAction(detail.id, 'final-approve', undefined, 'final')
    if (!d) return
    toast.success(`سفارش ${d.code} بسته شد — پروندهٔ تحویل کامل است`)
  }

  /* ── مشتق‌ها ── */
  const d = detail
  const stepIdx = useMemo(() => {
    const st = String(d?.status ?? '')
    if (st === 'DRAFT' || st === 'SUBMITTED') return 1
    if (st === 'APPROVED' || st === 'RECEIVING') return 2
    if (st === 'RECEIVED') return 3
    if (st === 'VERIFIED') return 4
    if (st === 'ACCOUNTED') return 5
    if (st === 'DONE') return 6
    return 0
  }, [d?.status])

  const detailMismatch = useMemo(() => (d?.items ? mismatchOfItems(d.items) : 0), [d])
  const wasteSelected = (d?.wasteReturns ?? []).filter((w: any) => w.status === 'SELECTED').length
  const stageMeta = STAGES.find((s) => s.key === stage) ?? STAGES[0]
  const selListOrder = (list ?? []).find((o) => o.id === selId) ?? null
  const lastHistory = (d?.history ?? []).slice(-3).reverse()

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      {/* ── R9-V3: فهرست سفارش‌ها بر پایهٔ مرحله ── */}
      <Card data-tour="page">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><I.package size={18} /> دریافت کالا — میزکار تحویل فیزیکی</CardTitle>
            <div className="flex gap-2">
              <Input className="w-52" value={listQ} onChange={(e: any) => setListQ(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === 'Enter') void loadList() }}
                placeholder="جست‌وجو کد / تأمین‌کننده…" />
              <Button variant="outline" size="sm" onClick={() => void loadList()} className="gap-1"><I.refresh size={14} /> به‌روزرسانی</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <button key={s.key} type="button"
                onClick={() => { setStage(s.key); void loadList(s.key) }}
                className={cn('rounded-lg border px-3 py-1 text-xs transition-colors',
                  stage === s.key ? 'border-teal-600 bg-teal-600 text-white' : 'border-stone-200 text-stone-600 hover:border-emerald-400')}>
                {s.label} {statusCounts[s.key] ? fa(statusCounts[s.key]) : ''}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <p className="py-8 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت فهرست…</p>
          ) : (list ?? []).length === 0 ? (
            /* ── حالت خالیِ مرحله ── */
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
              <I.package size={26} className="mx-auto mb-2 text-stone-400" />
              <p className="text-sm font-bold text-stone-600">سفارشی در مرحلهٔ «{stageMeta.label}» نیست</p>
              <p className="mx-auto mt-1.5 max-w-lg text-xs leading-5 text-stone-500">{stageMeta.empty}</p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
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
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(list ?? []).map((o) => (
                    <TableRow key={o.id} className={cn('cursor-pointer', selId === o.id && 'bg-teal-50', o.status === 'RECEIVING' && 'bg-amber-50/50')}
                      onClick={() => { if (selId !== o.id) void selectOrder(o) }}>
                      <TableCell className="text-xs">
                        <span dir="ltr" className="font-mono font-bold">{o.code}</span>
                        {o.payMethod === 'CHEQUE' && (o.chequeDays ?? 0) > 0 && (
                          <div className="mt-1 whitespace-nowrap text-[9.5px] text-amber-700" title="مهلت چک این سفارش">چک {fa(o.chequeDays)} روزه</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{o.supplierName || 'بدون تأمین‌کننده'}</TableCell>
                      <TableCell className="text-xs text-stone-500"><span dir="ltr">{o.deliveryDate ? faDate(o.deliveryDate) : '—'}</span></TableCell>
                      <TableCell className="text-center"><PayBadge v={o.payMethod} /></TableCell>
                      <TableCell className="text-center text-xs">{fa(o.itemsCount ?? 0)}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-bold text-stone-700">{money(o.totalAmount)}</span>
                        <span className="text-[10px] text-stone-400"> ریال</span>
                      </TableCell>
                      <TableCell className="text-center"><OrderStatusBadge v={o.status} /></TableCell>
                      <TableCell className="text-stone-400"><I.chevronLeft size={15} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ میزکار سفارش انتخاب‌شده ═══ */}
      {!selId ? (
        /* ── R9-V3: توضیح کل فرایند — وقتی چیزی انتخاب نشده ── */
        <Card>
          <CardContent className="p-6">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <p className="flex items-center gap-2 text-sm font-black text-teal-800"><I.info size={16} /> دریافت کالا یک فرایند ۵ مرحله‌ای است</p>
              <p className="mt-2 text-xs leading-6 text-stone-600">
                ۱) سفارش در «سفارش‌گذاری هوشمند» ثبت و توسط مدیر تأیید می‌شود ·
                ۲) هر کارمندِ لاگین‌شده مرسوله را در انبار می‌گیرد — با ثبت مرجوعی جزئی و اقلام نرسیده ·
                ۳) هر کارمندِ دیگری (غیر از دریافت‌کننده — اصل دو‌نفره) دریافت را راستی‌آزمایی می‌کند ·
                ۴) حسابداری (خانم درویشی) قیمت‌ها را کنترل سود کرده و در حسابداری ثبت می‌کند (و در هلو) ·
                ۵) مدیر سفارش را می‌بندد.
              </p>
              <p className="mt-2 text-xs leading-6 text-stone-500">
                این صفحه فقط برای دریافت فیزیکی کالاست؛ ثبت سفارش در «سفارش‌گذاری هوشمند» انجام می‌شود.
                برای شروع، یک سفارش را از فهرست بالا انتخاب کنید.
              </p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {STEPS.map((s, i) => (
                <div key={s.title} className="rounded-xl border border-stone-200 bg-white p-3 text-center">
                  <span className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-sm font-black text-teal-700">{toFaDigits(i + 1)}</span>
                  <p className="text-xs font-bold text-stone-700">{s.title}</p>
                  <p className="mt-0.5 text-[10px] text-stone-400">{s.actor}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── R9-V3: سربرگ سفارش + استپر پنج‌مرحله‌ای ── */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <I.receipt size={18} />
                  <span dir="ltr" className="font-mono">{d ? toFaDigits(d.code) : (selListOrder ? toFaDigits(selListOrder.code) : '…')}</span>
                  {d && <OrderStatusBadge v={d.status} />}
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void loadDetail(selId)} className="gap-1" disabled={detailLoading}>
                    {detailLoading ? <I.loader size={14} className="animate-spin" /> : <I.refresh size={14} />} تازه‌سازی
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setSelId(null); setDetail(null); setRows(null) }} className="gap-1">
                    بازگشت به فهرست <I.chevronLeft size={14} />
                  </Button>
                </div>
              </div>

              {/* استپر — جایگاه زندهٔ سفارش در فرایند */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-2.5" dir="rtl">
                {STEPS.map((s, i) => {
                  const n = i + 1
                  const done = stepIdx > n
                  const active = stepIdx === n
                  return (
                    <span key={s.title} className="flex items-center gap-1">
                      {i > 0 && <I.chevronLeft size={14} className="text-stone-400" />}
                      <span className={cn('flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]',
                        done ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : active ? 'border-teal-600 bg-teal-50 font-bold text-teal-800'
                            : 'border-stone-200 bg-white text-stone-500')}
                        title={`${s.title} — ${s.actor}`}>
                      <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black',
                        done ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-500')}>
                        {done ? <I.check size={11} /> : toFaDigits(n)}
                      </span>
                      {s.title}
                    </span>
                    </span>
                  )
                })}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!d ? (
                <p className="py-8 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت پروندهٔ سفارش…</p>
              ) : (
                <>
                  {/* شناسنامهٔ سفارش */}
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] sm:grid-cols-4">
                    <div>
                      <div className="text-stone-400">تأمین‌کننده</div>
                      <div className="font-bold text-stone-700">{d.supplierName || 'بدون تأمین‌کننده'}</div>
                      {d.supplier?.phone && <div dir="ltr" className="text-[10px] text-stone-400">{toFaDigits(d.supplier.phone)}</div>}
                    </div>
                    <div>
                      <div className="text-stone-400">تاریخ تحویل</div>
                      <div className="font-bold text-stone-700"><span dir="ltr">{d.deliveryDate ? faDate(d.deliveryDate) : '—'}</span></div>
                    </div>
                    <div>
                      <div className="text-stone-400">روش پرداخت</div>
                      <div className="font-bold text-stone-700"><PayBadge v={d.payMethod} /></div>
                    </div>
                    <div>
                      <div className="text-stone-400">مبلغ سفارش</div>
                      <div className="font-bold text-stone-700"><span dir="ltr">{money(d.totalAmount)}</span> ریال</div>
                      <div className="text-[10px] text-stone-400">≈ {toman(d.totalAmount)} تومان</div>
                    </div>
                  </div>

                  {/* چک خودکار — یادآوری برای کارمند دریافت */}
                  {d.payMethod === 'CHEQUE' && (d.chequeDays ?? 0) > 0 && ['APPROVED', 'RECEIVING'].includes(d.status) && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-800">
                      <I.banknote size={14} />
                      <b>چک {fa(d.chequeDays)} روزه</b>
                      <span className="text-amber-700">— با پایان دریافت، چک این سفارش خودکار ثبت می‌شود (در انتظار امضای مالک)</span>
                    </div>
                  )}

                  {/* مسئولان */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-stone-400">مسئولان:</span>
                    {[
                      { k: 'ثبت‌کننده', v: d.createdBy?.fullName },
                      { k: 'تأیید‌کننده', v: d.approvedBy?.fullName },
                      { k: 'گیرنده', v: d.receivedBy?.fullName },
                      { k: 'راستی‌آزمایی‌کننده', v: d.verifiedBy?.fullName },
                    ].map((c) => (
                      <span key={c.k} className={cn('rounded-md border px-2 py-0.5',
                        c.v ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-white text-stone-400')}>
                        {c.k}: <b>{c.v || '—'}</b>
                      </span>
                    ))}
                  </div>

                  {/* R11: تنظیم نمایش (فقط مدیر) — «آخرین رویدادها» و «یادداشت سفارش» پیش‌فرض پنهان‌اند */}
                  {isManager && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 p-2 text-[11px] text-stone-500">
                      <I.settings size={13} className="text-stone-400" />
                      <span className="font-bold text-stone-600">نمایش در پروندهٔ دریافت:</span>
                      <button type="button" disabled={visBusy}
                        onClick={() => void toggleVis('showHistory')}
                        className={cn('rounded-md border px-2 py-0.5 font-bold transition-colors',
                          visFlags.showHistory ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-white text-stone-400')}>
                        آخرین رویدادها {visFlags.showHistory ? 'روشن' : 'خاموش'}
                      </button>
                      <button type="button" disabled={visBusy}
                        onClick={() => void toggleVis('showNote')}
                        className={cn('rounded-md border px-2 py-0.5 font-bold transition-colors',
                          visFlags.showNote ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-white text-stone-400')}>
                        یادداشت سفارش {visFlags.showNote ? 'روشن' : 'خاموش'}
                      </button>
                      <span className="text-[10px] text-stone-400">— برای همهٔ کاربران اعمال می‌شود</span>
                    </div>
                  )}

                  {/* تاریخچه — ۳ رویداد آخر (R11: فقط با اجازهٔ مدیر سیستم) */}
                  {visFlags.showHistory && lastHistory.length > 0 && (
                    <div className="rounded-xl border border-stone-200 bg-white p-2.5">
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-stone-600"><I.history size={13} /> آخرین رویدادها</p>
                      <div className="space-y-1">
                        {lastHistory.map((h: any, i: number) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-stone-500">
                            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-bold text-stone-600">{HISTORY_FA[h.action] ?? h.action}</span>
                            <span>{h.detail}</span>
                            <span className="text-stone-400">— {h.by} · <span dir="ltr">{jShort(h.at)}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* R11: یادداشت سفارش — فقط با اجازهٔ مدیر سیستم (پیش‌فرض پنهان) */}
                  {visFlags.showNote && d.note && (
                    <div className="rounded-xl border border-stone-200 bg-white p-2.5 text-[11px] leading-5 text-stone-600">
                      <span className="font-bold text-stone-500">یادداشت سفارش: </span>{d.note}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ══ مرحلهٔ ۲: شروع/فرم دریافت ══ */}
          {d?.status === 'APPROVED' && (
            <Card>
              <CardHeader className="space-y-2 pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><I.package size={18} /> گام ۲ — دریافت انبار</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs leading-5 text-stone-500">
                  این سفارش تأیید شده و در نوبت دریافت است. با «شروع دریافت» درِ انبار باز می‌شود و می‌توانید اقلام را همان‌طور که رسیدند ثبت کنید.
                  {user ? '' : ' (در حال تشخیص دسترسی شما…)'}
                </p>
                {canReceive ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void startReceive()} disabled={actBusy === 'start'} className="gap-2">
                      {actBusy === 'start' ? <I.loader size={16} className="animate-spin" /> : <I.play size={16} />} شروع دریافت کالا
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-800">
                    <I.info size={13} className="inline align-middle" /> برای شروع دریافت ابتدا وارد حساب کاربری خود شوید.
                  </div>
                )}
                {/* پیش‌نمایش اقلام سفارش — چه چیزی باید برسد */}
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table dir="rtl" className="w-full min-w-[560px] text-xs">
                    <thead>
                      <tr className="border-b bg-stone-50 text-[11px] font-bold text-stone-500">
                        <th className="p-2 text-right">کالا</th>
                        <th className="p-2 text-center">سفارش</th>
                        <th className="p-2 text-center">کارتن</th>
                        <th className="p-2 text-center">بهای واحد (ریال)</th>
                        <th className="p-2 text-center">قیمت چاپی (ریال)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(d.items ?? []).map((it: any) => {
                        const printedDiffers = it.productSellPrice != null && Number(it.printedPrice) > 0 && Number(it.printedPrice) !== Number(it.productSellPrice)
                        return (
                          <tr key={it.id} className="border-b border-stone-200 last:border-b-0">
                            <td className="p-2 font-medium text-stone-700">
                              {it.name}
                              {printedDiffers && (
                                <span className="mr-1.5 rounded border border-amber-300 bg-amber-100 px-1 py-px text-[9.5px] font-bold text-amber-800"
                                  title={`قیمت چاپی فاکتور (${money(it.printedPrice)} ریال) با قیمت فروش فعلی این کالا (${money(it.productSellPrice)} ریال) فرق دارد`}>
                                  قیمت چاپی متفاوت
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center">{fa(it.qty)}</td>
                            <td className="p-2 text-center text-stone-500">{it.cartonQty ? `${fa(it.cartonQty)} × ${fa(it.unitsPerCarton || 0)}` : '—'}</td>
                            <td className="p-2 text-center"><span dir="ltr">{money(it.unitBuyPrice)}</span></td>
                            <td className="p-2 text-center"><span dir="ltr">{money(it.printedPrice)}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══ R9-V3: فرم دریافت — هستهٔ میزکار ══ */}
          {d?.status === 'RECEIVING' && rows && (
            <Card>
              <CardHeader className="space-y-2 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <I.package size={18} /> فرم دریافت — اقلام را همان‌طور که رسیدند ثبت کنید
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => allFull()}>
                      <I.checkCheck size={14} /> همه تحویل کامل شد
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 border-teal-200 text-teal-700" onClick={() => openAddDlg()}>
                      <I.packagePlus size={14} /> کالای اضافی
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] leading-5 text-stone-500">
                  فقط واحدهای سالم (دریافت − مرجوعی) وارد انبار می‌شود. مرسولهٔ کامل؟ دکمهٔ «همه تحویل کامل شد» همین حالا همه را کامل می‌زند —
                  کارتن ۱۲تایی رسید و ۴ تا شکسته بود؟ دریافت ۱۲ · مرجوعی ۴ + علت — باقی وارد انبار می‌شود.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-h-[62vh] space-y-2 overflow-y-auto pl-0.5">
                  {rows.map((it: any, i: number) => {
                    const st = computeItemStatus(Number(it.qty) || 0, Number(it.receivedQty ?? 0), Number(it.returnedQty ?? 0))
                    /* R9-V3: شرط صحیح چیپ «قیمت چاپی متفاوت» — فیلد سرور productSellPrice است */
                    const printedDiffers = it.productSellPrice != null && Number(it.printedPrice) > 0 && Number(it.printedPrice) !== Number(it.productSellPrice)
                    return (
                      <div key={it.id} className={cn('rounded-xl border p-2.5 transition-colors',
                        st === 'MISSING' ? 'border-rose-200 bg-rose-50/40'
                          : st === 'PARTIAL_RETURN' || st === 'RETURNED' ? 'border-amber-300 bg-amber-50/50'
                            : st === 'PARTIAL' ? 'border-amber-200 bg-amber-50/40' : 'border-stone-200')}>
                        {/* ردیف اصلی: نام | دریافت | مرجوعی | میان‌برها */}
                        <div className="grid grid-cols-[minmax(0,1fr)_120px_120px_auto] items-center gap-x-2 gap-y-1.5">
                          <div className="flex min-w-0 flex-col items-start gap-1">
                            <span className="truncate text-xs font-bold text-stone-700" title={it.name}>{it.name}</span>
                            <span className="flex flex-wrap items-center gap-1 text-[10px] text-stone-400">
                              <span>سفارش: {fa(it.qty)}</span>
                              {printedDiffers && (
                                <span className="rounded border border-amber-300 bg-amber-100 px-1 py-px font-bold text-amber-800"
                                  title={`قیمت چاپی فاکتور (${money(it.printedPrice)} ریال) با قیمت فروش فعلی این کالا (${money(it.productSellPrice)} ریال) فرق دارد`}>
                                  قیمت چاپی متفاوت
                                </span>
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="mb-0.5 block text-center text-[9.5px] text-stone-400">دریافت‌شده</span>
                            <NumInput value={String(it.receivedQty ?? 0)} onChange={(v: string) => patchRow(i, { receivedQty: Number(v) || 0 })} />
                          </div>
                          <div>
                            <span className="mb-0.5 block text-center text-[9.5px] text-stone-400">مرجوعی</span>
                            <NumInput value={String(it.returnedQty ?? 0)} disabled={Number(it.receivedQty ?? 0) <= 0}
                              onChange={(v: string) => patchRow(i, { returnedQty: Number(v) || 0 })} />
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" title="تحویل کامل — همین قلم"
                              onClick={() => patchRow(i, { receivedQty: it.qty, returnedQty: 0 })}
                              className="flex h-9 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100">
                              <I.check size={13} /> کامل
                            </button>
                            <button type="button" title="نرسید — همین قلم"
                              onClick={() => patchRow(i, { receivedQty: 0, returnedQty: 0 })}
                              className="flex h-9 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 text-[10px] font-bold text-rose-700 transition-colors hover:bg-rose-100">
                              <I.x size={13} /> نرسید
                            </button>
                          </div>
                        </div>
                        {/* علت مرجوعی — فقط وقتی مرجوعی > 0 */}
                        {Number(it.returnedQty ?? 0) > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-amber-200 pt-2">
                            <span className="text-[10px] font-bold text-amber-800">علت مرجوعی ({fa(it.returnedQty)} عدد):</span>
                            <div className="w-52">
                              <Select dir="rtl" value={it.returnReason || ''} onValueChange={(v: string) => patchRow(i, { returnReason: v })}>
                                <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="انتخاب علت…" /></SelectTrigger>
                                <SelectContent>
                                  {RETURN_REASONS.map((rr) => (
                                    <SelectItem key={rr} value={rr} className="text-xs">{rr}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                        {/* وضعیت محاسبه‌شدهٔ همین قلم */}
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <ItemStatusChip st={st} />
                          <span className="text-[10px] text-stone-400">
                            وارد انبار: <b className="text-stone-600">{fa(Math.max(0, Number(it.receivedQty ?? 0) - Number(it.returnedQty ?? 0)))}</b> از {fa(it.qty)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* نوار خلاصهٔ زنده */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-600">
                  <span>
                    {fa(sum.ok)} قلم کامل ·{' '}
                    <span className={cn(sum.ret > 0 && 'font-bold text-amber-700')}>{fa(sum.ret)} مرجوعی</span> ·{' '}
                    <span className={cn(sum.miss > 0 && 'font-bold text-rose-700')}>{fa(sum.miss)} نرسید</span>
                  </span>
                  <span>جمع پذیرفته‌شده: <b className="text-stone-700">{fa(sum.accepted)}</b> واحد · <b className="text-emerald-700"><span dir="ltr">{money(sum.acceptedValue)}</span> ریال</b></span>
                </div>

                {/* R11: مامور پخش — الزامی برای سفارشِ دارای اقلام ضایعاتِ برگشتی */}
                {wasteSelected > 0 && (
                  <div className={cn('rounded-xl border p-2.5', repValid ? 'border-amber-200 bg-amber-50/40' : 'border-amber-300 bg-amber-50/70')}>
                    <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-amber-800">
                      <I.user size={14} /> مامور پخش (نمایندهٔ تأمین‌کننده) — تحویل {fa(wasteSelected)} قلم ضایعاتِ برگشتی
                      <span className="font-normal text-amber-700">— نام کامل و موبایل او را همین‌جا ثبت کنید؛ بدون آن، پایان دریافت ممکن نیست.</span>
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10.5px] font-bold text-stone-500">نام کامل مامور پخش <span className="text-rose-500">*</span></label>
                        <Input value={wasteRep.name} onChange={(e: any) => setWasteRep((w) => ({ ...w, name: e.target.value }))}
                          placeholder="مثلاً رضا محمدی" className="h-9" dir="rtl" />
                        {!repNameOk && wasteRep.name !== '' && (
                          <p className="mt-1 text-[10px] font-bold text-rose-600">نام کامل (حداقل ۳ حرف) لازم است</p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] font-bold text-stone-500">شمارهٔ موبایل مامور پخش <span className="text-rose-500">*</span></label>
                        <Input value={wasteRep.phone} onChange={(e: any) => setWasteRep((w) => ({ ...w, phone: e.target.value }))}
                          placeholder="۰۹۱۲۳۴۵۶۷۸۹" className="h-9" dir="ltr" inputMode="numeric" />
                        {!repPhoneOk && wasteRep.phone !== '' && (
                          <p className="mt-1 text-[10px] font-bold text-rose-600">شمارهٔ موبایل معتبر (۱۰ تا ۱۴ رقم) لازم است</p>
                        )}
                      </div>
                    </div>
                    {repValid && (
                      <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                        <I.checkCheck size={12} /> ثبت شد: {wasteRep.name.trim()} · <span dir="ltr">{toFaDigits(wasteRep.phone.trim())}</span> — با «پایان دریافت» همراه پرونده ضبط می‌شود
                      </p>
                    )}
                  </div>
                )}

                {/* دکمه‌های فرم */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="outline" onClick={() => void saveProgress()} disabled={actBusy === 'save'} className="gap-1">
                    {actBusy === 'save' ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیرهٔ پیشرفت
                  </Button>
                  <Button onClick={() => setConfirmOpen(true)} disabled={wasteSelected > 0 && !repValid}
                    title={wasteSelected > 0 && !repValid ? 'نام و موبایل مامور پخش را کامل کنید' : undefined} className="gap-1">
                    <I.check size={15} /> پایان دریافت و ثبت
                  </Button>
                </div>
                <p className="text-[10px] leading-4 text-stone-400">
                  «ذخیرهٔ پیشرفت» برای تحویل‌های طولانی است (سفارش در حال دریافت می‌ماند)؛ «پایان دریافت» مرحلهٔ کارمند را می‌بندد و سفارش به راستی‌آزمایی ناظر می‌رود.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ══ R9-V3: پنل ضایعات — اقلامی که باید به مامور پخش داده شود ══ */}
          {d && (d.wasteReturns ?? []).length > 0 && (
            <Card>
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <I.trash size={18} /> اقلام ضایعات — این‌ها را به مامور پخش بدهید
                </CardTitle>
                <p className="text-[11px] text-stone-500">
                  اقلام ضایعاتِ علامت‌شده روی این سفارش، همراه مرسوعهٔ برگشتی به تأمین‌کننده برمی‌گردند — هنگام تحویل درگاه، این‌ها را جدا کنید و به مامور پخش بسپارید.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(d.wasteReturns ?? []).map((w: any) => (
                    <div key={w.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5',
                      w.status === 'SELECTED' ? 'border-amber-300 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/50')}>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-stone-700">{w.name}</span>
                        <span className="rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600">
                          {fa(w.qty)} {w.unit}
                        </span>
                        <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{w.reasonLabel}</span>
                        <span className="text-[10px] text-stone-500">ارزش تقریبی: <span dir="ltr">{money(w.estValue)}</span> ریال</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {w.selectedByName && <span className="text-[10px] text-stone-400">علامت‌زننده: {w.selectedByName}{w.selectedAtJalali ? ` · ${faDate(w.selectedAtJalali)}` : ''}</span>}
                        {w.status === 'SELECTED' ? (
                          <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800" title="با پایان دریافت، برگشت به تأمین‌کننده ثبت می‌شود">
                            برگشت با همین سفارش
                          </span>
                        ) : (
                          <span className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <I.check size={11} className="inline align-middle" /> برگشت به تأمین‌کننده{w.returnedAtJalali ? ` · ${faDate(w.returnedAtJalali)}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {wasteSelected > 0 && d.status === 'RECEIVING' && (
                    <p className="text-[10px] leading-4 text-amber-700">
                      <I.info size={12} className="inline align-middle" /> با «پایان دریافت»، وضعیت این {fa(wasteSelected)} قلم خودکار به «برگشت به تأمین‌کننده» تغییر می‌کند — نام و موبایل مامور پخش را در فرم دریافت ثبت کنید.
                    </p>
                  )}
                  {/* R11: مامور پخشی که اقلام به او سپرده شد */}
                  {(d.wasteRep || (d.wasteReturns ?? []).some((w: any) => w.repName)) && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/60 p-2.5 text-[11px] text-teal-800">
                      <I.user size={14} />
                      <b>مامور پخشِ تحویل‌گیرندهٔ ضایعات:</b>
                      <span className="font-bold">{d.wasteRep?.name || (d.wasteReturns ?? []).find((w: any) => w.repName)?.repName}</span>
                      {(d.wasteRep?.phone || (d.wasteReturns ?? []).find((w: any) => w.repPhone)?.repPhone) && (
                        <span dir="ltr" className="num">{toFaDigits(d.wasteRep?.phone || (d.wasteReturns ?? []).find((w: any) => w.repPhone)?.repPhone)}</span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══ مرحلهٔ ۳: راستی‌آزمایی ناظر ══ */}
          {d?.status === 'RECEIVED' && (
            <Card>
              <CardHeader className="space-y-2 pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><I.shieldCheck size={18} /> گام ۳ — راستی‌آزمایی دریافت</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] sm:grid-cols-4">
                  {[
                    { k: 'دریافت‌کننده', v: d.receivedBy?.fullName ?? '—' },
                    { k: 'مغایرت', v: detailMismatch ? `${fa(detailMismatch)} قلم` : 'بدون مغایرت' },
                    { k: 'قلم', v: `${fa((d.items ?? []).length)} قلم` },
                    {
                      k: 'ارزش کالای واردشده',
                      v: `${money((d.items ?? []).reduce((s: number, x: any) => s + Math.max(0, (x.receivedQty ?? 0) - (x.returnedQty ?? 0)) * x.unitBuyPrice, 0))} ریال`,
                    },
                  ].map((c) => (
                    <div key={c.k}>
                      <div className="text-stone-400">{c.k}</div>
                      <div className="font-bold text-stone-700" dir="auto">{c.v}</div>
                    </div>
                  ))}
                </div>

                {/* R11: مامور پخشِ ضایعاتِ برگشتی — در راستی‌آزمایی هم دیده شود */}
                {d.wasteRep && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/60 p-2.5 text-[11px] text-teal-800">
                    <I.user size={14} /> <b>مامور پخشِ ضایعاتِ برگشتی:</b> {d.wasteRep.name}
                    {d.wasteRep.phone && <span dir="ltr" className="num">{toFaDigits(d.wasteRep.phone)}</span>}
                    <span className="text-teal-700">— اقلام ضایعات همراه همین مرسوله به او برگشت داده شد.</span>
                  </div>
                )}

                {/* جدول اقلام دریافت‌شده */}
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table dir="rtl" className="w-full min-w-[600px] text-xs">
                    <thead>
                      <tr className="border-b bg-stone-50 text-[11px] font-bold text-stone-500">
                        <th className="p-2 text-right">کالا</th>
                        <th className="p-2 text-center">سفارش</th>
                        <th className="p-2 text-center">دریافت</th>
                        <th className="p-2 text-center">مرجوعی</th>
                        <th className="p-2 text-center">وارد انبار</th>
                        <th className="p-2 text-center">وضعیت</th>
                        <th className="p-2 text-center">علت مرجوعی</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(d.items ?? []).map((it: any) => (
                        <tr key={it.id} className="border-b border-stone-200 last:border-b-0">
                          <td className="p-2 font-medium text-stone-700">{it.name}</td>
                          <td className="p-2 text-center">{fa(it.qty)}</td>
                          <td className="p-2 text-center">{fa(it.receivedQty ?? 0)}</td>
                          <td className="p-2 text-center">{(it.returnedQty ?? 0) > 0 ? <span className="font-bold text-amber-700">{fa(it.returnedQty)}</span> : '—'}</td>
                          <td className="p-2 text-center font-bold">{fa(Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0)))}</td>
                          <td className="p-2 text-center"><ItemStatusChip st={it.status} /></td>
                          <td className="p-2 text-center text-[10px] text-stone-500">{it.returnReason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {detailMismatch > 0 && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-800">
                    <I.alertTriangle size={14} /> <b>{fa(detailMismatch)} قلم مغایرت دارد</b> — مرجوعی، کسری یا قلم نرسیده؛ پیش از تأیید، با بارنامه/فاکتور تطبیق دهید.
                  </div>
                )}

                {canVerify && !isReceiver ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-stone-500">با تأیید شما، دریافت این سفارش نهایی می‌شود و به مرحلهٔ حسابداری (خانم درویشی) می‌رود.</p>
                    <Button onClick={() => void verifyOrder()} disabled={actBusy === 'verify'} className="gap-1">
                      {actBusy === 'verify' ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} تأیید راستی‌آزمایی
                    </Button>
                  </div>
                ) : canVerify && isReceiver ? (
                  <div className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 text-[11px] text-rose-800">
                    <I.shieldOff size={14} /> <b>اصل دو‌نفره:</b> دریافتِ این سفارش را شما ثبت کرده‌اید — راستی‌آزمایی باید توسط کارمندِ دیگری انجام شود.
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white p-2.5 text-[11px] text-stone-500">
                    <I.clock size={14} className="text-stone-400" /> در انتظار راستی‌آزمایی — هر کارمندِ لاگین‌شده‌ای غیر از دریافت‌کننده می‌تواند تأیید کند.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ══ مرحلهٔ ۴: کنترل سود و ثبت حسابداری (خانم درویشی) ══ */}
          {d?.status === 'VERIFIED' && (
            <Card>
              <CardHeader className="space-y-2 pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><I.banknote size={18} /> گام ۴ — کنترل سود و ثبت حسابداری</CardTitle>
                <p className="text-[11px] leading-5 text-stone-500">
                  بهای خرید و قیمت چاپی را از روی فاکتور اصلاح کنید — درصد سود رنگ می‌گیرد (قرمز &lt; ۱۲٪ · کهربایی &lt; ۲۱٪ · سبز ≥ ۲۱٪)؛ ثبت، سند آرشیو فاکتور و فاکتور سودسنج هم می‌سازد.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!canAccount ? (
                  <div className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white p-2.5 text-[11px] text-stone-500">
                    <I.clock size={14} className="text-stone-400" /> در انتظار حسابداری — ثبت فقط با دسترسی حسابداری یا مدیران ممکن است.
                  </div>
                ) : !accRows ? (
                  <p className="py-6 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال آماده‌سازی اقلام…</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                      <div className="min-w-[760px]">
                        <div dir="rtl" className="grid grid-cols-[minmax(0,1fr)_92px_92px_150px_150px_104px_96px] items-center gap-x-2 border-b border-stone-200 bg-stone-50 px-2.5 py-2 text-[11px] font-bold text-stone-500">
                          <span>کالا</span>
                          <span className="text-center">سفارش</span>
                          <span className="text-center">وارد انبار</span>
                          <span className="text-center">بهای واحد (ریال)</span>
                          <span className="text-center">قیمت چاپی (ریال)</span>
                          <span className="text-center">سود</span>
                          <span className="text-center">مرجوعی؟</span>
                        </div>
                        {accRows.map((x: any, i: number) => {
                          const buy = Number(x.unitBuyPrice) || 0
                          const sell = Number(x.printedPrice) || 0
                          const mg = buy > 0 ? ((sell - buy) / buy) * 100 : null
                          return (
                            <div key={x.id} dir="rtl" className={cn('grid grid-cols-[minmax(0,1fr)_92px_92px_150px_150px_104px_96px] items-center gap-x-2 border-b border-stone-200 px-2.5 py-2 last:border-b-0 hover:bg-stone-100/60',
                              x.markedReturned && 'bg-rose-50/60')}>
                              <span className="truncate text-xs font-bold text-stone-700" title={x.name}>{x.name}</span>
                              <span className="text-center text-xs text-stone-500">{fa(x.qty)}</span>
                              <span className="text-center text-xs font-bold text-stone-700">{fa(x.accepted)}</span>
                              <MoneyInput value={String(x.unitBuyPrice ?? 0)} onChange={(raw: string) => patchAccRow(i, { unitBuyPrice: numify(raw) })} />
                              <MoneyInput value={String(x.printedPrice ?? 0)} onChange={(raw: string) => patchAccRow(i, { printedPrice: numify(raw) })} />
                              <div className="text-center"><MarginChip mg={mg} /></div>
                              <div className="flex items-center justify-center gap-1">
                                {(x.returnedQty ?? 0) > 0 && (
                                  <span className="rounded border border-amber-300 bg-amber-100 px-1 py-px text-[9px] font-bold text-amber-800" title="مرجوعی ثبت‌شده هنگام دریافت">{fa(x.returnedQty)} مرجوع</span>
                                )}
                                <label className="flex cursor-pointer items-center gap-1 text-[10px] text-stone-500" title="این ردیف کامل مرجوع شد و در سند آرشیو «اقلام مرجوعی» ثبت می‌شود">
                                  <Checkbox checked={!!x.markedReturned} onCheckedChange={(v: boolean) => patchAccRow(i, { markedReturned: v === true })} />
                                  علامت
                                </label>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs">
                      <span className="text-stone-500">جمع نهایی (بهای خرید × تعداد سفارش):</span>
                      <span className="font-black text-emerald-700"><span dir="ltr">{money(accTotal)}</span> ریال ≈ {toman(accTotal)} تومان</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-stone-500">شماره سند تأمین‌کننده (اختیاری)</label>
                        <Input value={providerDoc} onChange={(e: any) => setProviderDoc(e.target.value)} placeholder="مثلاً شماره فاکتور…" className="h-9" />
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-white p-2.5 text-xs text-stone-600" title="سفارش خرید در حسابداری هلو (Apex) هم ثبت می‌شود">
                        <Checkbox checked={pushToHoloo} onCheckedChange={(v: boolean) => setPushToHoloo(v === true)} />
                        <span className="flex items-center gap-1"><I.zap size={14} className="text-amber-600" /> ثبت سفارش خرید در هلو</span>
                      </label>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      {/* R10: پیش‌فاکتور در سودسنج — فاکتور پیش‌نویس می‌سازد و برای بازبینی سود به سودسنج می‌برد */}
                      <Button variant="outline" onClick={() => void makeProforma()} disabled={actBusy === 'account' || proformaBusy} className="gap-1 border-teal-300 text-teal-700 hover:bg-teal-50">
                        {proformaBusy ? <I.loader size={15} className="animate-spin" /> : <I.trendingUp size={15} />} پیش‌فاکتور در سودسنج
                      </Button>
                      <Button onClick={() => void submitAccount()} disabled={actBusy === 'account' || proformaBusy} className="gap-1">
                        {actBusy === 'account' ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} ثبت در حسابداری + ساخت اسناد
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ══ مرحلهٔ ۵: بستن سفارش ══ */}
          {d?.status === 'ACCOUNTED' && (
            <Card>
              <CardHeader className="space-y-2 pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><I.checkCheck size={18} /> گام ۵ — بستن سفارش</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(accResult ?? d)?.marginInvoiceNumber ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800">
                      فاکتور سودسنج شمارهٔ {fa((accResult ?? d).marginInvoiceNumber)} ساخته شد
                    </span>
                    {(accResult ?? d).archiveDocId && (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800">سند آرشیو فاکتور ثبت شد</span>
                    )}
                    {(accResult ?? d).holoo && ((accResult ?? d).holoo.pushed ? (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800">در هلو ثبت شد</span>
                    ) : (
                      <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                        هلو: در انتظار ارسال — {(accResult ?? d).holoo?.reason ?? ''}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs leading-5 text-stone-500">
                  ثبت حسابداری انجام شده است — حساب‌ها، سند آرشیو و فاکتور سودسنج همین سفارش آماده‌اند؛ با بستن، پروندهٔ تحویل کامل می‌شود.
                </p>
                {isManager ? (
                  <div className="flex justify-end">
                    <Button onClick={() => void finalApprove()} disabled={actBusy === 'final'} className="gap-1">
                      {actBusy === 'final' ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} بستن سفارش
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white p-2.5 text-[11px] text-stone-500">
                    <I.clock size={14} className="text-stone-400" /> در انتظار بستن توسط مدیر.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ══ پروندهٔ بسته ══ */}
          {d?.status === 'DONE' && (
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                    <I.checkCheck size={17} /> سفارش {toFaDigits(d.code)} تکمیل شد — از ثبت تا بستن، همهٔ مراحل انجام است.
                  </p>
                  <span className="text-[11px] text-stone-500">راستی‌آزمایی: {d.verifiedBy?.fullName ?? '—'} · ثبت حسابداری: {(d.history ?? []).find((h: any) => h.action === 'account')?.by ?? '—'}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══ سفارش لغوشده ══ */}
          {d?.status === 'CANCELLED' && (
            <Card>
              <CardContent className="p-5">
                <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm font-bold text-rose-700">
                  <I.x size={16} /> این سفارش لغو شده است.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ══ R9-V3: دیالوگ تأیید پایان دریافت — فهرست مغایرت‌ها ══ */}
      <Dialog open={confirmOpen} onOpenChange={(v: boolean) => setConfirmOpen(v)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <I.alertTriangle size={18} /> پایان دریافت {d ? toFaDigits(d.code) : ''} — بررسی نهایی
            </DialogTitle>
            <DialogDescription>
              {sum.mism > 0
                ? `${fa(sum.mism)} قلم مغایرت دارد — پیش از ثبت نهایی، تطبیق را با بارنامه/فاکتور چک کنید.`
                : 'همهٔ اقلام کامل ثبت شده‌اند — ثبت نهایی دریافت را تأیید کنید.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px]">
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800">{fa(sum.ok)} قلم کامل</span>
              {sum.ret > 0 && <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-bold text-amber-800">{fa(sum.ret)} قلم مرجوعی</span>}
              {sum.miss > 0 && <span className="rounded-md border border-rose-200 bg-rose-100 px-2 py-0.5 font-bold text-rose-700">{fa(sum.miss)} قلم نرسید</span>}
              <span className="text-stone-500">جمع پذیرفته‌شده: <b>{fa(sum.accepted)}</b> واحد · <b className="text-emerald-700"><span dir="ltr">{money(sum.acceptedValue)}</span> ریال</b></span>
            </div>

            {/* اقلام مغایر — فهرست کامل برای تصمیم ناظرپسند */}
            {sum.mism > 0 && rows && (
              <div className="overflow-x-auto rounded-xl border border-stone-200">
                <table dir="rtl" className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="border-b bg-stone-50 text-[11px] font-bold text-stone-500">
                      <th className="p-2 text-right">کالا</th>
                      <th className="p-2 text-center">سفارش</th>
                      <th className="p-2 text-center">دریافت</th>
                      <th className="p-2 text-center">مرجوعی</th>
                      <th className="p-2 text-center">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter((x: any) => computeItemStatus(x.qty, x.receivedQty ?? 0, x.returnedQty ?? 0) !== 'OK').map((x: any) => (
                      <tr key={x.id} className="border-b border-stone-200 last:border-b-0">
                        <td className="p-2 font-medium text-stone-700">{x.name}</td>
                        <td className="p-2 text-center">{fa(x.qty)}</td>
                        <td className="p-2 text-center">{fa(x.receivedQty ?? 0)}</td>
                        <td className="p-2 text-center">{(x.returnedQty ?? 0) > 0 ? `${fa(x.returnedQty)}${x.returnReason ? ` (${x.returnReason})` : ''}` : '—'}</td>
                        <td className="p-2 text-center"><ItemStatusChip st={computeItemStatus(x.qty, x.receivedQty ?? 0, x.returnedQty ?? 0)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* یادآوری ضایعات برگشتی */}
            {wasteSelected > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-800">
                  <I.trash size={13} /> {fa(wasteSelected)} قلم ضایعات همراه همین دریافت به تأمین‌کننده برمی‌گردد — آن‌ها را به مامور پخش بدهید و رسید بگیرید.
                </p>
                <div className={cn('flex flex-wrap items-center gap-1.5 rounded-xl border p-2.5 text-[11px]', repValid ? 'border-teal-200 bg-teal-50/60 text-teal-800' : 'border-rose-200 bg-rose-50/70 text-rose-800')}>
                  <I.user size={13} />
                  {repValid ? (
                    <span>تحویل به مامور پخش: <b>{wasteRep.name.trim()}</b> · <span dir="ltr" className="num">{toFaDigits(wasteRep.phone.trim())}</span> — همراه ثبت نهایی ضبط می‌شود</span>
                  ) : (
                    <span>نام کامل و شمارهٔ موبایل مامور پخش هنوز ناقص است — فرم دریافت را تکمیل کنید.</span>
                  )}
                </div>
              </div>
            )}
            {d?.payMethod === 'CHEQUE' && (d.chequeDays ?? 0) > 0 && (
              <p className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-800">
                <I.banknote size={13} /> با پایان دریافت، چک {fa(d.chequeDays)} روزهٔ این سفارش به مبلغ کالای پذیرفته‌شده خودکار ثبت می‌شود.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>انصراف</Button>
            <Button onClick={() => void confirmReceive()} disabled={actBusy === 'receive' || (wasteSelected > 0 && !repValid)} className="gap-1">
              {actBusy === 'receive' ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} ثبت نهایی و پایان دریافت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ R9-V3: دیالوگ کالای اضافی — قلمی که در درگاه کشف شد ══ */}
      <Dialog open={!!addDlg} onOpenChange={(v: boolean) => { if (!v) setAddDlg(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.packagePlus size={18} /> کالای اضافی — افزوندن به همین سفارش</DialogTitle>
            <DialogDescription>
              کالایی که در سفارش نبود ولی همراه مرسوله آمد؟ اینجا اضافه کنید — بلافاصله «تحویل‌شده» ثبت می‌شود و در فاکتور حسابداری می‌آید.
            </DialogDescription>
          </DialogHeader>
          {addDlg && (
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-stone-500">جست‌وجوی کالا (یا نام دستی)</label>
                <Input autoFocus value={addDlg.q} onChange={(e: any) => addSearch(e.target.value)} placeholder="نام کالا را بنویسید…" className="h-9" />
                {addDlg.rs && addDlg.rs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {addDlg.rs.map((p: any) => (
                      <button key={p.id} type="button" onClick={() => addPickProduct(p)}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100">
                        + {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-stone-500">نام کالا</label>
                <Input value={addDlg.name} onChange={(e: any) => setAddDlg((x: any) => ({ ...(x ?? {}), name: e.target.value, productId: '' }))} className="h-9" />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-stone-500">تعداد</label>
                  <NumInput value={String(addDlg.qty ?? '1')} onChange={(v: string) => setAddDlg((x: any) => ({ ...(x ?? {}), qty: v }))} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-stone-500">بهای واحد (ریال)</label>
                  <MoneyInput value={String(addDlg.unitBuyPrice ?? '0')} onChange={(v: string) => setAddDlg((x: any) => ({ ...(x ?? {}), unitBuyPrice: v }))} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-stone-500">قیمت چاپی (ریال)</label>
                  <MoneyInput value={String(addDlg.printedPrice ?? '0')} onChange={(v: string) => setAddDlg((x: any) => ({ ...(x ?? {}), printedPrice: v }))} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDlg(null)}>انصراف</Button>
            <Button onClick={() => void submitAdd()} disabled={actBusy === 'add'} className="gap-1">
              {actBusy === 'add' ? <I.loader size={15} className="animate-spin" /> : <I.plus size={15} />} افزودن قلم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
