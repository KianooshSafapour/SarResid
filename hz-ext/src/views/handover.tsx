import {
  useState, useEffect, useMemo,
  api, qs, useShell, toast, cn,
  Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle,
  Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Tabs, TabsContent, TabsList, TabsTrigger, Checkbox,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  JalaliDate, jsDateToJalali, TimeInput, faSlash,
  money, toman, fa,
  parseJalali, toEnDigits, toFaDigits, todayJalali,
  Icon, I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   tasks/reports — گزارش تحویل شیفت (بازطراحی ساختاریافته R1)
   ۱) فرم ۶ بخشی SBAR/I-PASS بومی: صندوق → دریافت‌ها → پرسنل →
      مشکلات واگذار‌شده (با اقدام شرطی اگر/آنگاه) → کارهای شیفت بعد
      (مسئول + ساعت هدف صریح — بدون کار یتیم) → یادداشت آزاد
   ۲) اختلاف صندوق زنده: تطابق / کهربایی ≤۵۰٬۰۰۰ / سرخ >۵۰٬۰۰۰
      + توضیح الزامی برای اختلاف بزرگ
   ۳) شاخص‌های زندهٔ فروشگاه — خودکار از سامانه، بدون ثبت دستی
   ۴) تأیید دریافت = read-back الکترونیکی شیفت بعد
   ───────────────────────────────────────────────────────────── */

const SHIFTS = [
  { key: 'MORNING', label: 'شیفت صبح' },
  { key: 'EVENING', label: 'شیفت عصر' },
]
const MANAGERS = ['OWNER', 'GM', 'ADMIN', 'EXEC']
const SUPERS = ['OWNER', 'GM', 'ADMIN']
const DIFF_LIMIT = 50000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** شاخص‌های زنده — دادهٔ خودکار سامانه؛ هر ردیف به صفحهٔ خودش می‌رود */
const METRICS: {
  key: string; label: string; icon: string; go: string; roles: string[];
  tone?: (n: number) => string
}[] = [
  { key: 'returnsToday', label: 'مرجوعی‌های امروز', icon: 'receipt', go: 'crm/history', roles: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'CASHIER'] },
  { key: 'returnsPending', label: 'مرجوعی در انتظار تأیید', icon: 'timer', go: 'crm/approvals', roles: ['OWNER', 'GM', 'ADMIN', 'EXEC'], tone: (n) => (n > 0 ? 'text-rose-600' : '') },
  { key: 'lowStockCount', label: 'کالای کم‌موجود', icon: 'trendingDown', go: 'supply/products', roles: ['*'], tone: (n) => (n > 0 ? 'text-amber-600' : '') },
  { key: 'ordersWaiting', label: 'سفارش در انتظار دریافت', icon: 'carton', go: 'supply/orders', roles: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'ACC'] },
  { key: 'chequesThisWeek', label: 'چک‌های ۷ روز آینده', icon: 'banknote', go: 'finance/cheques', roles: ['OWNER', 'GM', 'ADMIN', 'ACC'], tone: (n) => (n > 0 ? 'text-amber-600' : '') },
  { key: 'tasksOpen', label: 'وظایف باز', icon: 'clipboard', go: 'tasks/tasks', roles: ['*'] },
  { key: 'tasksOverdue', label: 'وظایف عقب‌افتاده', icon: 'alertTriangle', go: 'tasks/tasks', roles: ['*'], tone: (n) => (n > 0 ? 'text-rose-600' : '') },
  { key: 'problemsOpen', label: 'مشکلات باز', icon: 'zap', go: 'tasks/problems', roles: ['*'], tone: (n) => (n > 0 ? 'text-amber-600' : '') },
  { key: 'morningChecksFlagged', label: 'پرچم کنترل صبح', icon: 'userCheck', go: 'tasks/attendance', roles: MANAGERS, tone: (n) => (n > 0 ? 'text-amber-600' : '') },
]

/** برچسب‌های گزارش‌های قدیمی (قالب دفترچه‌ای پیش از بازطراحی) */
const LEGACY_KEYS: { key: string; label: string }[] = [
  { key: 'absent', label: 'غایبان' },
  { key: 'shortage', label: 'کمبودها' },
  { key: 'done', label: 'اقدامات انجام‌شده' },
  { key: 'remaining', label: 'باقی‌مانده برای شیفت بعد' },
]

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** تاریخ جلالی → «۱۴۰۵/۰۷/۲۸» (ارقام فارسی + ممیز — هرگز خط تیره) */
function dateFa(dash: string): string {
  const v = String(dash || '')
  if (!v) return '—'
  return parseJalali(v) ? faSlash(v) : toFaDigits(v)
}

/** ISO → «۰۵:۴۱» فارسی */
function clockFa(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return toFaDigits(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)
}

function dateTimeFa(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${faSlash(jsDateToJalali(d))} · ساعت ${clockFa(iso)}`
}

function shiftFa(s: string): string {
  return s === 'EVENING' ? 'عصر' : 'صبح'
}

/** آیا صفحه برای این کاربر باز است؟ (override کاربر > نقش) */
function canSee(user: any, route: string, roles: string[]): boolean {
  if (!user) return false
  const r = String(user.role || '')
  if (SUPERS.includes(r)) return true
  const allow: string[] = Array.isArray(user.pageAllow) ? user.pageAllow : []
  const deny: string[] = Array.isArray(user.pageDeny) ? user.pageDeny : []
  if (allow.includes(route)) return true
  if (deny.includes(route)) return false
  return roles.includes('*') || roles.includes(r)
}

/* ═══════════════ قطعات کوچک فرم ═══════════════ */

function Field({ label, children, hint }: { label: string; children: any; hint?: any }) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-xs font-medium text-stone-600">{label}</label>
      {children}
      {hint}
    </div>
  )
}

/** ورودی مبلغ ریالی — نمایش فارسی، ورودی لاتین/فارسی */
function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const n = Number(value)
  return (
    <div>
      <Input
        dir="ltr" inputMode="numeric" placeholder={placeholder || '۰'} className="num text-end"
        value={value ? toFaDigits(value) : ''}
        onChange={(e: any) => onChange(toEnDigits(String(e.target.value)).replace(/[^\d]/g, ''))}
      />
      {value !== '' && Number.isFinite(n) && n > 0 && (
        <p className="mt-1 text-[11px] text-stone-500">{money(n)} ریال ≈ {toman(n)} تومان</p>
      )}
    </div>
  )
}

/** بخش شماره‌دار فرم */
function SectionCard({ n, title, icon, children, note }: { n: number; title: string; icon: string; children: any; note?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white">{fa(n)}</span>
          <h3 className="text-sm font-bold text-stone-700">{title}</h3>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-500"><Icon name={icon as any} size={14} /></span>
          {note && <span className="text-[10px] text-stone-400">{note}</span>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

/** اختلاف صندوق — سه وضعیت */
function DiffBadge({ diff }: { diff: number }) {
  const abs = Math.abs(diff)
  const cls = diff === 0
    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
    : abs <= DIFF_LIMIT
      ? 'border-amber-400 bg-amber-50 text-amber-800'
      : 'border-rose-400 bg-rose-50 text-rose-800'
  const label = diff === 0 ? 'مطابقت کامل' : diff > 0 ? `مازاد ${money(abs)} ریال` : `کسری ${money(abs)} ریال`
  return <Badge variant="outline" className={cn('text-[11px]', cls)}>{label}</Badge>
}

/** ردیف «برچسب: مقدار» در نمایش فقط‌خواندنی — مقدار از راست (جهت طبیعی متن فارسی) */
function KV({ label, children }: { label: string; children: any }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed py-1.5">
      <span className="shrink-0 text-xs text-stone-500">{label}</span>
      <span className="min-w-0 break-words text-xs font-bold text-stone-700">{children}</span>
    </div>
  )
}

function SevMini({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    urgent: 'border-rose-400 bg-rose-50 text-rose-800',
    high: 'border-amber-400 bg-amber-50 text-amber-800',
    normal: 'border-stone-300 bg-stone-100 text-stone-600',
    low: 'border-stone-300 bg-stone-50 text-stone-500',
  }
  const label: Record<string, string> = { urgent: 'فوری', high: 'زیاد', normal: 'معمولی', low: 'کم' }
  return <Badge variant="outline" className={cn('text-[10px]', map[severity] || map.normal)}>{label[severity] || severity}</Badge>
}

/* ═══════════════ نمایش فقط‌خواندنی گزارش (شیفت قبل / تاریخچه) ═══════════════ */

function ReportView({ report, roster }: { report: any; roster: any[] }) {
  const d: any = report?.data || {}
  const nameOf = (id: any) => {
    const u = roster.find((x: any) => x.id === id)
    return u ? `${u.honorific ? `${u.honorific} ` : ''}${u.fullName}` : ''
  }
  const cheques: any = d.chequesCollected
  const carried: any[] = Array.isArray(d.carriedProblems) ? d.carriedProblems : []
  const carriedIds: any[] = Array.isArray(d.problemsCarried) ? d.problemsCarried : []
  const tasksNext: any[] = Array.isArray(d.tasksForNext) ? d.tasksForNext : []
  const staffNotes: any[] = Array.isArray(d.staffNotes) ? d.staffNotes : []
  const metrics: any = d.metrics && typeof d.metrics === 'object' ? d.metrics : null

  const hasNew =
    d.cashCounted != null || d.cashExpected != null || d.posTotal != null || d.cardTotal != null ||
    d.chequesCollected != null || !!d.pendingDeliveries || !!d.priceChangeNotes || !!d.notes ||
    staffNotes.length > 0 || tasksNext.length > 0 || carriedIds.length > 0

  return (
    <div className="space-y-3">
      {/* شناسنامهٔ گزارش */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
        <I.handshake size={16} className="text-emerald-600" />
        <span className="text-xs font-bold text-stone-700">
          {report?.user?.honorific ? `${report.user.honorific} ` : ''}{report?.user?.fullName || '—'}
        </span>
        <span className="text-[11px] text-stone-500">
          {dateFa(report?.date || '')} · شیفت {shiftFa(report?.shift || '')} · ثبت: {dateTimeFa(report?.createdAt)}
        </span>
        {report?.acknowledged ? (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700">
            <I.check size={11} className="ml-1" /> دریافت شد توسط {report.acknowledgedBy || '—'}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-[10px] text-amber-800">دریافت تأیید نشده</Badge>
        )}
      </div>

      {hasNew ? (
        <>
          {/* ۱. صندوق */}
          {(d.cashCounted !== undefined || d.cashExpected !== undefined || d.posTotal !== undefined || d.cardTotal !== undefined || d.chequesCollected !== undefined) && (
            <Card>
              <CardContent className="p-3">
                <h4 className="mb-1 text-xs font-bold text-stone-700">۱. صندوق و پرداخت</h4>
                <KV label="نقدی شمرده‌شده">{d.cashCounted !== undefined && d.cashCounted !== null ? `${money(Number(d.cashCounted))} ریال` : '—'}</KV>
                <KV label="نقدی مورد انتظار">{d.cashExpected !== undefined && d.cashExpected !== null ? `${money(Number(d.cashExpected))} ریال` : '—'}</KV>
                {typeof d.cashDiff === 'number' && <KV label="اختلاف صندوق"><DiffBadge diff={d.cashDiff} /></KV>}
                {d.cashDiffNote ? <KV label="توضیح اختلاف">{d.cashDiffNote}</KV> : null}
                <KV label="کارتخوان (POS)">{d.posTotal ? `${money(Number(d.posTotal))} ریال` : '—'}</KV>
                <KV label="کارت به کارت / بانکی">{d.cardTotal ? `${money(Number(d.cardTotal))} ریال` : '—'}</KV>
                <KV label="چک دریافتی">
                  {cheques && typeof cheques === 'object'
                    ? `${fa(cheques.count || 0)} فقره${cheques.total ? ` · جمع ${money(Number(cheques.total))} ریال` : ''}`
                    : (cheques ? String(cheques) : '—')}
                </KV>
              </CardContent>
            </Card>
          )}

          {/* ۲. دریافت‌ها و سفارش‌ها */}
          {(d.pendingDeliveries || d.priceChangeNotes) && (
            <Card>
              <CardContent className="p-3">
                <h4 className="mb-1 text-xs font-bold text-stone-700">۲. دریافت‌ها و سفارش‌ها</h4>
                {d.pendingDeliveries ? <KV label="سفارش‌های در راه"><span className="whitespace-pre-line">{d.pendingDeliveries}</span></KV> : null}
                {d.priceChangeNotes ? <KV label="تغییرات قیمت"><span className="whitespace-pre-line">{d.priceChangeNotes}</span></KV> : null}
              </CardContent>
            </Card>
          )}

          {/* ۳. پرسنل */}
          {staffNotes.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <h4 className="mb-1 text-xs font-bold text-stone-700">۳. یادداشت پرسنل</h4>
                {staffNotes.map((s: any, i: number) => (
                  <KV key={i} label={s.staffName || '—'}>{s.note || '—'}</KV>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ۴. مشکلات واگذار‌شده */}
          {(carried.length > 0 || carriedIds.length > 0) && (
            <Card>
              <CardContent className="p-3">
                <h4 className="mb-1 text-xs font-bold text-stone-700">۴. مشکلات واگذار‌شده به شیفت بعد</h4>
                {carried.length > 0 ? carried.map((p: any, i: number) => (
                  <div key={i} className="border-b border-dashed py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SevMini severity={p.severity || 'normal'} />
                      <span className="text-xs font-bold text-stone-700">{p.title || p.id}</span>
                    </div>
                    {p.action ? <p className="mt-1 text-[11px] text-stone-600">اقدام لازم: <span className="font-medium">{p.action}</span></p> : null}
                  </div>
                )) : <KV label="تعداد مشکلات واگذار‌شده">{fa(carriedIds.length)}</KV>}
              </CardContent>
            </Card>
          )}

          {/* ۵. کارهای شیفت بعد */}
          {tasksNext.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <h4 className="mb-1 text-xs font-bold text-stone-700">۵. کارهای شیفت بعد</h4>
                {tasksNext.map((t: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 border-b border-dashed py-1.5">
                    <span className="num flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-600">{fa(i + 1)}</span>
                    <span className="text-xs font-bold text-stone-700">{t.text}</span>
                    <span className="flex items-center gap-1 text-[10px] text-teal-700"><I.userCheck size={11} />{t.assigneeName || nameOf(t.assigneeId) || 'بدون مسئول'}</span>
                    {t.targetTime ? <span className="num flex items-center gap-1 text-[10px] text-stone-500"><I.clock size={11} />{toFaDigits(t.targetTime)}</span> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ۶. یادداشت آزاد */}
          {d.notes ? (
            <Card>
              <CardContent className="p-3">
                <h4 className="mb-1 text-xs font-bold text-stone-700">۶. یادداشت آزاد</h4>
                <p className="whitespace-pre-line text-xs text-stone-600">{d.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        /* گزارش قدیمی (قالب دفترچه‌ای) */
        <Card>
          <CardContent className="p-3">
            <h4 className="mb-1 text-xs font-bold text-stone-700">گزارش ثبت‌شده (قالب قدیمی)</h4>
            {LEGACY_KEYS.filter((k) => d[k.key]).map((k) => (
              <KV key={k.key} label={k.label}><span className="whitespace-pre-line">{String(d[k.key])}</span></KV>
            ))}
            {report?.note ? <KV label="یادداشت">{report.note}</KV> : null}
            {!LEGACY_KEYS.some((k) => d[k.key]) && !report?.note ? (
              <p className="py-2 text-center text-xs text-stone-400">این گزارش محتوای ساختاریافته ندارد</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* تصویر لحظه‌ای شاخص‌ها هنگام ثبت */}
      {metrics ? (
        <Card>
          <CardContent className="p-3">
            <h4 className="mb-2 text-xs font-bold text-stone-700">شاخص‌های فروشگاه در لحظهٔ ثبت</h4>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {METRICS.map((m) => (
                <div key={m.key} className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5">
                  <p className="truncate text-[10px] text-stone-500">{m.label}</p>
                  <p className="num text-sm font-black text-stone-700">{fa(Number(metrics[m.key]) || 0)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

/* ═══════════════ نمای اصلی ═══════════════ */

export default function HandoverView() {
  const { user, go, refreshBadges } = useShell()

  const isEveningSide = user?.role === 'EXEC' || user?.username === 'mollaie'
  const [tab, setTab] = useState('today')
  const [date, setDate] = useState(todayJalali())
  const [shift, setShift] = useState<'MORNING' | 'EVENING'>(isEveningSide ? 'EVENING' : 'MORNING')

  const [loading, setLoading] = useState(true)
  const [board, setBoard] = useState<any>(null)
  const [roster, setRoster] = useState<any[]>([])
  const [openProblems, setOpenProblems] = useState<any[]>([])

  /* فرم امروز */
  const [cashCounted, setCashCounted] = useState('')
  const [cashExpected, setCashExpected] = useState('')
  const [posTotal, setPosTotal] = useState('')
  const [cardTotal, setCardTotal] = useState('')
  const [chqCount, setChqCount] = useState('')
  const [chqTotal, setChqTotal] = useState('')
  const [diffNote, setDiffNote] = useState('')
  const [pendingDeliveries, setPendingDeliveries] = useState('')
  const [priceChangeNotes, setPriceChangeNotes] = useState('')
  const [staffNotes, setStaffNotes] = useState<{ staffId: string; note: string }[]>([])
  const [carried, setCarried] = useState<Record<string, string>>({})
  const [tasks, setTasks] = useState<{ text: string; assigneeId: string; targetTime: string }[]>([])
  const [freeNote, setFreeNote] = useState('')
  const [handoverTo, setHandoverTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [acking, setAcking] = useState(false)

  /* دیالوگ مشاهدهٔ گزارش تاریخچه */
  const [viewing, setViewing] = useState<any>(null)

  useEffect(() => {
    void loadBoard(date, shift)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadBoard(d: string, s: string) {
    if (!DATE_RE.test(d)) return
    setLoading(true)
    const [br, rosterR, probsR] = await Promise.all([
      api(`/api/shift-reports${qs({ date: d, shift: s })}`),
      api('/api/auth/roster'),
      api('/api/problems?status=OPEN'),
    ])
    setLoading(false)
    if (!br.ok) { toast.error(br.error || 'خطا در دریافت گزارش شیفت'); return }
    setBoard(br.data || null)
    if (rosterR.ok) setRoster((rosterR.data?.users || []).filter((u: any) => u.active !== false))
    if (probsR.ok) setOpenProblems(probsR.data?.items || [])
  }

  function changeDate(v: string) {
    if (!v || !DATE_RE.test(v) || v === date) return
    setDate(v)
    void loadBoard(v, shift)
  }

  function changeShift(v: string) {
    const s = v === 'EVENING' ? 'EVENING' : 'MORNING'
    if (s === shift) return
    setShift(s)
    void loadBoard(date, s)
  }

  const nameOf = (id: string) => {
    const u = roster.find((x: any) => x.id === id)
    return u ? `${u.honorific ? `${u.honorific} ` : ''}${u.fullName}` : ''
  }

  /* اختلاف زندهٔ صندوق */
  const diff = useMemo(() => {
    if (cashCounted === '' || cashExpected === '') return null
    return Number(cashCounted) - Number(cashExpected)
  }, [cashCounted, cashExpected])
  const diffBig = diff !== null && Math.abs(diff) > DIFF_LIMIT

  /* ───────── ثبت گزارش تحویل ───────── */

  async function submit() {
    if (!DATE_RE.test(date)) return toast.error('تاریخ گزارش نامعتبر است')

    /* اعتبارسنجی‌های پژوهش‌محور */
    if (diffBig && !diffNote.trim()) {
      return toast.error('اختلاف صندوق بیش از ۵۰٬۰۰۰ ریال است — توضیح اختلاف الزامی است')
    }
    const staffRows = staffNotes.filter((r) => r.staffId || r.note.trim())
    for (const r of staffRows) {
      if (!r.staffId) return toast.error('برای هر یادداشت پرسنل، کارمند را انتخاب کنید')
      if (!r.note.trim()) return toast.error('یادداشت انتخاب‌شده برای پرسنل را بنویسید یا ردیف را حذف کنید')
    }
    const carriedIds = Object.keys(carried)
    for (const id of carriedIds) {
      if (!carried[id].trim()) return toast.error('برای هر مشکل واگذار‌شده، «اقدام لازم» (اگر/آنگاه) را بنویسید')
    }
    const taskRows = tasks.filter((r) => r.text.trim() || r.assigneeId || r.targetTime)
    for (const r of taskRows) {
      if (!r.text.trim()) return toast.error('متن کار شیفت بعد را بنویسید یا ردیف را حذف کنید')
      if (!r.assigneeId) return toast.error(`کار «${r.text.trim()}» باید مسئول مشخص داشته باشد (کار یتیم ممنوع)`)
      if (!TIME_RE.test(r.targetTime)) return toast.error(`ساعت هدف کار «${r.text.trim()}» را به شکل ۱۸:۳۰ وارد کنید`)
    }

    const data: any = {}
    if (cashCounted !== '') data.cashCounted = Number(cashCounted)
    if (cashExpected !== '') data.cashExpected = Number(cashExpected)
    if (posTotal !== '') data.posTotal = Number(posTotal)
    if (cardTotal !== '') data.cardTotal = Number(cardTotal)
    if (chqCount !== '' || chqTotal !== '') {
      data.chequesCollected = { count: chqCount === '' ? 0 : Number(chqCount), total: chqTotal === '' ? 0 : Number(chqTotal) }
    }
    if (pendingDeliveries.trim()) data.pendingDeliveries = pendingDeliveries.trim()
    if (priceChangeNotes.trim()) data.priceChangeNotes = priceChangeNotes.trim()
    if (staffRows.length) data.staffNotes = staffRows.map((r) => ({ staffName: nameOf(r.staffId), note: r.note.trim() }))
    if (handoverTo) data.handoverTo = handoverTo
    if (carriedIds.length) {
      data.problemsCarried = carriedIds
      data.carriedProblems = carriedIds.map((id) => {
        const p: any = openProblems.find((x: any) => x.id === id) || {}
        return { id, title: p.problem || '', severity: p.severity || 'normal', action: carried[id].trim() }
      })
    }
    if (taskRows.length) {
      data.tasksForNext = taskRows.map((r) => ({ text: r.text.trim(), assigneeId: r.assigneeId, assigneeName: nameOf(r.assigneeId), targetTime: r.targetTime }))
    }
    if (freeNote.trim()) data.notes = freeNote.trim()
    if (diffNote.trim()) data.cashDiffNote = diffNote.trim()

    setSaving(true)
    const r = await api('/api/shift-reports', {
      method: 'POST',
      body: { date, shift, data, note: freeNote.trim() || null },
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت گزارش انجام نشد')
    toast.success(
      handoverTo
        ? 'گزارش تحویل ثبت شد و به گیرنده اطلاع‌رسانی شد'
        : 'گزارش تحویل شیفت ثبت شد',
    )
    /* پاک‌سازی فرم */
    setCashCounted(''); setCashExpected(''); setPosTotal(''); setCardTotal('')
    setChqCount(''); setChqTotal(''); setDiffNote('')
    setPendingDeliveries(''); setPriceChangeNotes('')
    setStaffNotes([]); setCarried({}); setTasks([])
    setFreeNote(''); setHandoverTo('')
    refreshBadges?.()
    void loadBoard(date, shift)
  }

  /* ───────── تأیید دریافت شیفت قبل (read-back) ───────── */

  async function ack(id: string) {
    setAcking(true)
    const r = await api(`/api/shift-reports/${id}`, { method: 'PATCH', body: { action: 'ack' } })
    setAcking(false)
    if (!r.ok) return toast.error(r.error || 'تأیید دریافت انجام نشد')
    toast.success('دریافت شیفت تأیید شد')
    refreshBadges?.()
    void loadBoard(date, shift)
  }

  /* ───────── رندر ───────── */

  const metrics = board?.metrics
  const previous = board?.previous
  const history: any[] = board?.history || []
  const todayReport = board?.report

  return (
    <div className="space-y-4">
      {/* سربرگ: تاریخ + شیفت */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-stone-600">تاریخ گزارش</label>
            <JalaliDate value={date} onChange={changeDate} quickChips={[{ label: 'امروز', deltaDays: 0 }, { label: 'دیروز', deltaDays: -1 }]} />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs font-medium text-stone-600">شیفت</label>
            <Select value={shift} onValueChange={changeShift}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFTS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-stone-500">
            <I.handshake size={15} className="text-emerald-600" />
            تحویل ساختاریافتهٔ شیفت — داده‌های فروشگاه خودکار خوانده می‌شوند
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v: string) => setTab(v)} dir="rtl">
        <TabsList>
          <TabsTrigger value="today">گزارش امروز</TabsTrigger>
          <TabsTrigger value="prev">شیفت قبل</TabsTrigger>
          <TabsTrigger value="history">تاریخچه</TabsTrigger>
        </TabsList>

        {/* ═══════ تب گزارش امروز ═══════ */}
        <TabsContent value="today" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
              <div className="h-52 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
              {/* ستون فرم */}
              <div className="space-y-4">
                {todayReport ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    <I.info size={15} />
                    <span>
                      برای این تاریخ و شیفت گزارشی ثبت شده است ({todayReport.user?.fullName || '—'} · ساعت {clockFa(todayReport.createdAt)})
                      — ثبت دوباره نسخهٔ جدیدی از گزارش می‌سازد.
                    </span>
                    <Button variant="outline" size="sm" className="mr-auto h-7" onClick={() => setViewing(todayReport)}>مشاهدهٔ گزارش ثبت‌شده</Button>
                  </div>
                ) : null}

                {/* ۱. صندوق و پرداخت */}
                <SectionCard n={1} title="صندوق و پرداخت" icon="banknote">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="نقدی شمرده‌شده (ریال)"><MoneyInput value={cashCounted} onChange={setCashCounted} /></Field>
                    <Field label="نقدی مورد انتظار (ریال)"><MoneyInput value={cashExpected} onChange={setCashExpected} /></Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-stone-500">اختلاف صندوق:</span>
                    {diff === null ? (
                      <span className="text-[11px] text-stone-400">پس از وارد کردن هر دو مبلغ محاسبه می‌شود</span>
                    ) : (
                      <>
                        <DiffBadge diff={diff} />
                        {diffBig && <span className="text-[11px] font-bold text-rose-600">بیش از ۵۰٬۰۰۰ ریال — باید توضیح داده شود</span>}
                      </>
                    )}
                  </div>
                  {diffBig ? (
                    <div className="mt-2">
                      <Field label="توضیح اختلاف صندوق (الزامی)">
                        <Textarea
                          rows={2} className="text-sm" placeholder="مثلاً: دو قبض نقدی ثبت نشده بود؛ رسیدش پیوست شد"
                          value={diffNote} onChange={(e: any) => setDiffNote(e.target.value)}
                        />
                      </Field>
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="جمع کارتخوان (POS) — ریال"><MoneyInput value={posTotal} onChange={setPosTotal} /></Field>
                    <Field label="کارت به کارت / بانکی — ریال"><MoneyInput value={cardTotal} onChange={setCardTotal} /></Field>
                    <Field label="تعداد چک دریافتی">
                      <Input
                        dir="ltr" inputMode="numeric" placeholder="۰" className="num text-center"
                        value={chqCount ? toFaDigits(chqCount) : ''}
                        onChange={(e: any) => setChqCount(toEnDigits(String(e.target.value)).replace(/[^\d]/g, '').slice(0, 3))}
                      />
                    </Field>
                    <Field label="جمع چک‌های دریافتی — ریال"><MoneyInput value={chqTotal} onChange={setChqTotal} /></Field>
                  </div>
                </SectionCard>

                {/* ۲. دریافت‌ها و سفارش‌ها */}
                <SectionCard n={2} title="دریافت‌ها و سفارش‌ها" icon="carton">
                  <div className="space-y-3">
                    <Field label="سفارش‌های در راه (هر خط یک سفارش)">
                      <Textarea
                        rows={3} className="text-sm" placeholder={'مثلاً:\nسفارش بیژن — فردا صبح\nسفارش لبنیات پگاه — امروز عصر'}
                        value={pendingDeliveries} onChange={(e: any) => setPendingDeliveries(e.target.value)}
                      />
                    </Field>
                    <Field label="تغییرات قیمت امروز">
                      <Textarea
                        rows={2} className="text-sm" placeholder="مثلاً: پرتقال تخفیف هفتگی مهر شد — قفسه ۴"
                        value={priceChangeNotes} onChange={(e: any) => setPriceChangeNotes(e.target.value)}
                      />
                    </Field>
                  </div>
                </SectionCard>

                {/* ۳. یادداشت پرسنل */}
                <SectionCard n={3} title="یادداشت پرسنل" icon="users">
                  {staffNotes.length === 0 ? (
                    <p className="rounded-lg bg-stone-50 p-2 text-center text-xs text-stone-400">یادداشتی برای پرسنل ثبت نشده — در صورت نیاز اضافه کنید</p>
                  ) : (
                    <div className="space-y-2">
                      {staffNotes.map((r, i) => (
                        <div key={i} className="flex flex-wrap items-end gap-2">
                          <div className="w-full sm:w-52">
                            <Select value={r.staffId} onValueChange={(v: string) => setStaffNotes((prev) => prev.map((x, j) => (j === i ? { ...x, staffId: v } : x)))}>
                              <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب کارمند" /></SelectTrigger>
                              <SelectContent>
                                {roster.map((u: any) => (
                                  <SelectItem key={u.id} value={u.id}>{u.honorific ? `${u.honorific} ` : ''}{u.fullName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="min-w-0 flex-1">
                            <Input
                              className="text-sm" placeholder="یادداشت (مثلاً: صندوق ۲ نیم‌ساعت تأخیر داشت)"
                              value={r.note}
                              onChange={(e: any) => setStaffNotes((prev) => prev.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                            />
                          </div>
                          <Button
                            variant="outline" size="icon" className="h-9 w-9 shrink-0 text-rose-600" title="حذف ردیف"
                            onClick={() => setStaffNotes((prev) => prev.filter((_, j) => j !== i))}
                          ><I.trash size={14} /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setStaffNotes((prev) => [...prev, { staffId: '', note: '' }])}>
                    <I.plus size={14} className="ml-1" /> افزودن یادداشت پرسنل
                  </Button>
                </SectionCard>

                {/* ۴. مشکلات واگذار‌شده */}
                <SectionCard n={4} title="مشکلات واگذار‌شده به شیفت بعد" icon="alertTriangle" note="با علامت‌زدن، مشکل به تحویل شیفت بعد پیوست می‌شود">
                  {openProblems.length === 0 ? (
                    <p className="rounded-lg bg-emerald-50 p-2 text-center text-xs text-emerald-700">مشکلی برای واگذاری به شیفت بعد وجود ندارد ✓</p>
                  ) : (
                    <div className="space-y-2">
                      {openProblems.map((p: any) => {
                        const checked = p.id in carried
                        return (
                          <div key={p.id} className={cn('rounded-xl border p-2.5 transition-colors', checked ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-white')}>
                            <label className="flex cursor-pointer items-start gap-2">
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                onCheckedChange={(v: any) => setCarried((prev) => {
                                  const next = { ...prev }
                                  if (v === true) next[p.id] = ''
                                  else delete next[p.id]
                                  return next
                                })}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <SevMini severity={p.severity} />
                                  <span className="text-xs font-bold text-stone-700">{p.problem}</span>
                                </span>
                                {p.location ? <span className="mt-0.5 block text-[10px] text-stone-500">محل: {p.location}</span> : null}
                              </span>
                            </label>
                            {checked ? (
                              <div className="mt-2">
                                <Input
                                  className="text-sm" placeholder="اقدام لازم — اگر … شد، آنگاه …"
                                  value={carried[p.id] || ''}
                                  onChange={(e: any) => setCarried((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                />
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </SectionCard>

                {/* ۵. کارهای شیفت بعد */}
                <SectionCard n={5} title="کارهای شیفت بعد" icon="clipboard" note="هر کار باید مسئول و ساعت هدف مشخص داشته باشد">
                  {tasks.length === 0 ? (
                    <p className="rounded-lg bg-stone-50 p-2 text-center text-xs text-stone-400">کاری برای شیفت بعد ثبت نشده — در صورت نیاز اضافه کنید</p>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((r, i) => (
                        <div key={i} className="flex flex-wrap items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <Input
                              className="text-sm" placeholder="متن کار (مثلاً: پیگیری چک‌های سررسید نزدیک)"
                              value={r.text}
                              onChange={(e: any) => setTasks((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                            />
                          </div>
                          <div className="w-full sm:w-48">
                            <Select value={r.assigneeId} onValueChange={(v: string) => setTasks((prev) => prev.map((x, j) => (j === i ? { ...x, assigneeId: v } : x)))}>
                              <SelectTrigger className="w-full"><SelectValue placeholder="مسئول انجام" /></SelectTrigger>
                              <SelectContent>
                                {roster.map((u: any) => (
                                  <SelectItem key={u.id} value={u.id}>{u.honorific ? `${u.honorific} ` : ''}{u.fullName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-24">
                            <TimeInput
                              value={r.targetTime}
                              onChange={(v: string) => setTasks((prev) => prev.map((x, j) => (j === i ? { ...x, targetTime: v } : x)))}
                            />
                          </div>
                          <Button
                            variant="outline" size="icon" className="h-9 w-9 shrink-0 text-rose-600" title="حذف ردیف"
                            onClick={() => setTasks((prev) => prev.filter((_, j) => j !== i))}
                          ><I.trash size={14} /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setTasks((prev) => [...prev, { text: '', assigneeId: '', targetTime: '' }])}>
                    <I.plus size={14} className="ml-1" /> افزودن کار
                  </Button>
                </SectionCard>

                {/* ۶. یادداشت آزاد */}
                <SectionCard n={6} title="یادداشت آزاد" icon="penLine">
                  <Textarea
                    rows={3} className="text-sm" placeholder="هر نکتهٔ دیگری که شیفت بعد باید بداند…"
                    value={freeNote} onChange={(e: any) => setFreeNote(e.target.value)}
                  />
                </SectionCard>

                {/* نوار ثبت */}
                <Card>
                  <CardContent className="flex flex-wrap items-end gap-3 p-4">
                    <div className="w-full sm:w-56">
                      <label className="mb-1 block text-xs font-medium text-stone-600">تحویل به (اطلاع‌رسانی)</label>
                      <Select value={handoverTo} onValueChange={setHandoverTo}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="بدون اطلاع‌رسانی" /></SelectTrigger>
                        <SelectContent>
                          {roster.filter((u: any) => u.id !== user?.id).map((u: any) => (
                            <SelectItem key={u.id} value={u.id}>{u.honorific ? `${u.honorific} ` : ''}{u.fullName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1" />
                    <Button onClick={submit} disabled={saving} className="min-w-40">
                      {saving ? <I.loader size={15} className="ml-1 animate-spin" /> : <I.send size={15} className="ml-1" />}
                      {saving ? 'در حال ثبت…' : 'ثبت گزارش تحویل شیفت'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* ستون شاخص‌های زنده */}
              <div className="space-y-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <I.barChart size={15} className="text-emerald-600" />
                      شاخص‌های زندهٔ فروشگاه
                    </CardTitle>
                    <p className="text-[10px] text-stone-400">خودکار از سامانه — بدون ثبت دستی · تاریخ {dateFa(date)}</p>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {METRICS.map((m) => {
                      const n = Number(metrics?.[m.key]) || 0
                      const enabled = canSee(user, m.go, m.roles)
                      const inner = (
                        <>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
                            <Icon name={m.icon as any} size={14} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-600">{m.label}</span>
                          <span className={cn('num text-lg font-black', m.tone ? m.tone(n) : 'text-stone-700')}>{fa(n)}</span>
                          {enabled ? <I.chevronLeft size={13} className="shrink-0 text-stone-400" /> : null}
                        </>
                      )
                      return enabled ? (
                        <button
                          key={m.key} type="button"
                          className="flex w-full items-center gap-2 rounded-lg border border-stone-200 bg-white p-2 text-right transition-colors hover:border-emerald-400"
                          onClick={() => go(m.go)} title={`رفتن به ${m.label}`}
                        >{inner}</button>
                      ) : (
                        <div key={m.key} className="flex w-full items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2 opacity-70">{inner}</div>
                      )
                    })}
                  </CardContent>
                </Card>

                {/* راهنمای چک‌لیست تحویل */}
                <Card>
                  <CardContent className="p-3 text-[11px] leading-6 text-stone-500">
                    <p className="mb-1 flex items-center gap-1 font-bold text-stone-600"><I.info size={13} /> تحویل خوب چه هست؟</p>
                    صندوق شمرده و اختلافش توضیح داده شود · مشکلات باز با «اگر/آنگاه» واگذار شوند · هر کار شیفت بعد مسئول و ساعت هدف داشته باشد · شیفت بعد دریافت را تأیید کند.
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════ تب شیفت قبل ═══════ */}
        <TabsContent value="prev" className="mt-4">
          {loading ? (
            <div className="h-64 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
          ) : !previous ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-stone-400">
                <I.history size={28} className="mx-auto mb-2 text-stone-400" />
                هنوز گزارشی از شیفت‌های قبل ثبت نشده است
              </CardContent>
            </Card>
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              {/* بنر تأیید دریافت */}
              {previous.acknowledged ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-700">
                  <I.check size={16} />
                  <span className="font-bold">دریافت این گزارش تأیید شد</span>
                  <span>توسط {previous.acknowledgedBy || '—'} · {dateTimeFa(previous.acknowledgedAt)}</span>
                </div>
              ) : previous.userId === user?.id ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-300 bg-stone-50 p-3 text-xs text-stone-600">
                  <I.clock size={16} />
                  <span>این گزارش را شما ثبت کرده‌اید — منتظر تأیید دریافت شیفت بعد است (read-back الکترونیکی)</span>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <I.alertTriangle size={22} className="text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-amber-800">دریافت این گزارش تأیید نشده است</p>
                      <p className="text-xs text-amber-700">
                        گزارش {dateFa(previous.date)} (شیفت {shiftFa(previous.shift)}) را مطالعه کنید و دریافت آن را تأیید کنید — تأیید دریافت یعنی read-back الکترونیکی محتوای تحویل.
                      </p>
                    </div>
                    <Button onClick={() => ack(previous.id)} disabled={acking}>
                      {acking ? <I.loader size={15} className="ml-1 animate-spin" /> : <I.userCheck size={15} className="ml-1" />}
                      {acking ? 'در حال ثبت…' : 'تأیید دریافت شیفت'}
                    </Button>
                  </div>
                </div>
              )}

              <ReportView report={previous} roster={roster} />
            </div>
          )}
        </TabsContent>

        {/* ═══════ تب تاریخچه ═══════ */}
        <TabsContent value="history" className="mt-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />)}
            </div>
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-stone-400">
                <I.history size={28} className="mx-auto mb-2 text-stone-400" />
                هنوز گزارش تحویل شیفتی ثبت نشده است
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-2 sm:p-4">
                <p className="mb-2 text-[11px] text-stone-400">۲۰ گزارش آخر</p>
                <div className="space-y-1.5">
                  {history.map((h: any) => {
                    const d: any = h.data || {}
                    const cashDiff = typeof d.cashDiff === 'number' ? d.cashDiff : null
                    return (
                      <button
                        key={h.id} type="button"
                        className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-2.5 text-right transition-colors hover:border-emerald-400"
                        onClick={() => setViewing(h)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500"><I.handshake size={14} /></span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-stone-700">{dateFa(h.date)} · شیفت {shiftFa(h.shift)}</span>
                          <span className="block text-[10px] text-stone-500">{h.user?.fullName || '—'} · ثبت {clockFa(h.createdAt)}</span>
                        </span>
                        <span className="mr-auto flex flex-wrap items-center gap-1.5">
                          {cashDiff !== null ? <DiffBadge diff={cashDiff} /> : null}
                          {h.acknowledged ? (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700">تأیید شد</Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-[10px] text-amber-800">در انتظار تأیید</Badge>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* دیالوگ مشاهدهٔ گزارش */}
      <Dialog open={!!viewing} onOpenChange={(o: boolean) => { if (!o) setViewing(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <I.handshake size={16} className="text-emerald-600" />
              گزارش تحویل شیفت — {viewing ? `${dateFa(viewing.date)} · شیفت ${shiftFa(viewing.shift)}` : ''}
            </DialogTitle>
          </DialogHeader>
          {viewing ? <ReportView report={viewing} roster={roster} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
