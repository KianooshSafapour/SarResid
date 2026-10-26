import { useState, useEffect, useMemo, api, useShell, toast, cn, Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Checkbox, jsx, fa, toFaDigits, todayJalali, parseJalali, formatJalaliLong, NumInput, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   store/lanecheck — «کنترل انقضای قفسه‌ها» (R8-EXPIRY + R10-LANE)
   گردش کار ۳ مرحله‌ای برای بازرسی تاریخ انقضا:
   ۱) انتخاب چیدمان‌گر ← ۲) انتخاب بخش و ردیف (طبقه/باتوم/سمت) ← ۳) ثبت بازرسی
   هر ردیف آخرین وضعیت خود را نشان می‌دهد («آخرین بار کِی و چطور دیده شد»).
   R10-LANE:
   • «برنامهٔ امروز» — هر روز ۲..۴ ردیفِ تصادفی از بخش‌های هر مسؤول (پایدار در طول
     روز، متفاوت هر روز) با وضعیت ثبت/در انتظار و پرش مستقیم به فرم بازرسی.
   • «کارنامهٔ بازرسی من» — غیرمدیرها فقط کارنامهٔ خودشان را می‌بینند (selfMode؛
     فقط-خواندنی، بدون امکان انتخاب دیگری یا ثبت برای دیگران).
   • اعلان بازرسی برای چیدمان‌گرِ بازرسی‌شده + خاموشی per-person (زنگ) و
     per-review («ثبت بی‌اعلان»).
   ───────────────────────────────────────────────────────────── */

type Person = { id: string; fullName: string; honorific: string; title: string; role: string }
type Section = { label: string; kind?: string; zone?: string | null; responsible?: { id: string | null; name: string } | null }
type Check = {
  id: string; dateJalali: string; merchandiserId: string | null; merchandiserName: string
  sectionLabel: string; lane: string; status: string
  expiredFound: number; nearExpiry: number; removedQty: number; note?: string | null
}
type LaneState = Check & { daysAgo: number | null }
type PlanLane = { section: string; lane: string; checked: boolean; status?: string | null; by?: string | null; dateJalali?: string | null }
type PlanPerson = {
  userId: string | null; name: string; role?: string | null; username?: string | null
  sections: string[]; lanes: PlanLane[]
}
type TodayPlan = { date: string; persons: PlanPerson[] }
type SelfStats = { total: number; ok: number; needsAttention: number; problem: number }
type Data = {
  today: string
  selfMode?: boolean
  self?: { id: string; name: string; role: string; title?: string | null; mySections?: string[] }
  stats?: SelfStats
  checks: Check[]
  laneStatus: Record<string, LaneState>
  sections: Section[]
  merchandisers: Person[]
  laneMap: { defaults: string[]; base?: string[]; special?: string[]; map: Record<string, string[]> }
  todayPlan?: TodayPlan
  mutedUsers?: string[]
}

const STATUS_META: Record<string, { label: string; short: string; solid: string; soft: string; text: string; dot: string; icon: 'check' | 'alertTriangle' | 'x' }> = {
  ok: {
    label: 'سالم / بدون مشکل', short: 'سالم',
    solid: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
    soft: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: 'check',
  },
  needs_attention: {
    label: 'نیازمند توجه', short: 'نیازمند توجه',
    solid: 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600',
    soft: 'border-amber-200 bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', icon: 'alertTriangle',
  },
  problem: {
    label: 'مشکل دارد', short: 'مشکل',
    solid: 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700',
    soft: 'border-rose-200 bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', icon: 'x',
  },
}

const ROLE_FA: Record<string, string> = {
  MERCH: 'نیروی چیدمان', PM: 'مدیر محصولات', EXEC: 'مدیر اجرایی', GM: 'مدیر کل',
  ADMIN: 'مدیر عملیات و IT', OWNER: 'مدیر عامل', SK: 'انباردار',
  SALES: 'فروشنده', CASHIER: 'صندوقدار', ACC: 'حسابدار', HC: 'صندوقدار ارشد',
}
const STEPS = [
  { n: 1, title: 'چیدمان‌گر' },
  { n: 2, title: 'بخش و ردیف' },
  { n: 3, title: 'ثبت بازرسی' },
]
const FALLBACK_SPECIAL = ['سمت چپ', 'سمت راست', 'باتوم (قفسهٔ پایانی)']

/* ───────── کمک‌های تاریخ/عدد ───────── */
function faDate(dash: string): string {
  return toFaDigits(String(dash || '').replace(/-/g, '/'))
}
function longFa(dash: string): string {
  const d = parseJalali(dash)
  return d ? toFaDigits(formatJalaliLong(d)) : faDate(dash)
}
/** چند روز گذشته (امروز = ۰) — محاسبهٔ دقیق با تبدیل جلالی→میلادی */
function daysAgoOf(dash: string): number | null {
  const d = parseJalali(dash)
  if (!d || isNaN(d.getTime())) return null
  const t = parseJalali(todayJalali())
  if (!t || isNaN(t.getTime())) return null
  return Math.max(0, Math.round((t.getTime() - d.getTime()) / 86400000))
}
function agoFa(n: number | null): string {
  if (n === null) return ''
  if (n <= 0) return 'امروز'
  if (n === 1) return 'دیروز'
  return `${fa(n)} روز پیش`
}
const laneKey = (s: string, l: string) => `${s}||${l}`
const who = (p: Person) => `${p.honorific || ''} ${p.fullName}`.trim()
const pctOf = (part: number, total: number) => (total > 0 ? Math.round((100 * part) / total) : null)

/* ───────── زنگ خاموش/روشن — آیکون محلی (lucide-style، مثل icons.tsx) ───────── */
function BellIcon({ off = false, size = 15, className = '' }: { off?: boolean; size?: number; className?: string }) {
  const kids = [
    jsx('path', { key: 1, d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }),
    jsx('path', { key: 2, d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }),
  ]
  if (off) kids.push(jsx('line', { key: 3, x1: 2, y1: 2, x2: 22, y2: 22 }))
  return jsx(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: className,
      'aria-hidden': true,
      children: kids,
    },
  ) as any
}

export default function LaneCheckView() {
  const { user } = useShell()
  const isMgr = !!user && ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(user.role)

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Data | null>(null)
  const [step, setStep] = useState(1)
  const [merch, setMerch] = useState<Person | null>(null)
  const [section, setSection] = useState('')
  const [lane, setLane] = useState('')
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ status: 'ok', expiredFound: '', nearExpiry: '', removedQty: '', note: '', silent: false })
  const [dlg, setDlg] = useState<{ open: boolean; section: string; rows: { id: number; name: string }[] }>({ open: false, section: '', rows: [] })
  const [busyDlg, setBusyDlg] = useState(false)
  const [mutingId, setMutingId] = useState<string | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await api('/api/lane-checks')
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت داده‌ها'); return }
    setData(r.data as Data)
  }
  async function refresh() {
    const r = await api('/api/lane-checks')
    if (r.ok) setData(r.data as Data)
  }

  /* ───────── مشتقات ───────── */
  const sections = data?.sections || []
  const people = useMemo(() => {
    const all = data?.merchandisers || []
    const needle = q.trim()
    if (!needle) return all
    return all.filter((p) => (who(p) + ' ' + (p.title || '') + ' ' + (ROLE_FA[p.role] || '')).includes(needle))
  }, [data, q])
  const lanesOf = (s: string): string[] => {
    const custom = data?.laneMap.map?.[s]
    return Array.isArray(custom) && custom.length ? custom : data?.laneMap.defaults || []
  }
  const stateOf = (s: string, l: string): LaneState | null => (data?.laneStatus[laneKey(s, l)] as LaneState) || null
  const lastState = section && lane ? stateOf(section, lane) : null
  const isMuted = (id: string) => !!(data?.mutedUsers || []).includes(id)

  const sectionStats = useMemo(() => {
    const out: Record<string, { total: number; checked: number; problems: number }> = {}
    for (const s of sections) {
      const lanes = lanesOf(s.label)
      let checked = 0, problems = 0
      for (const l of lanes) {
        const st = stateOf(s.label, l)
        if (st) { checked++; if (st.status === 'problem') problems++ }
      }
      out[s.label] = { total: lanes.length, checked, problems }
    }
    return out
  }, [data, sections])

  const summary = useMemo(() => {
    let total = 0, week = 0, never = 0, problems = 0, attention = 0
    for (const s of sections) {
      for (const l of lanesOf(s.label)) {
        total++
        const st = stateOf(s.label, l)
        if (!st) { never++; continue }
        if ((st.daysAgo ?? daysAgoOf(st.dateJalali) ?? 999) <= 6) week++
        if (st.status === 'problem') problems++
        else if (st.status === 'needs_attention') attention++
      }
    }
    return { total, week, never, problems, attention }
  }, [data, sections])

  const sectionChecks = useMemo(
    () => (data?.checks || []).filter((c) => c.sectionLabel === section).slice(0, 12),
    [data, section],
  )
  const specialSuggest = data?.laneMap.special?.length ? data.laneMap.special : FALLBACK_SPECIAL
  const plan = data?.todayPlan || null

  /* ── مشتقاتِ حالت «کارنامهٔ من» (selfMode) ── */
  const selfPlan = data?.selfMode ? (data.todayPlan?.persons?.[0] || null) : null
  const selfStats = data?.stats || null
  const myAttention = useMemo(
    () => (data?.selfMode ? (data.checks || []).filter((c) => c.status !== 'ok' && (c.note || '').trim()).slice(0, 8) : []),
    [data],
  )
  const myHistory = useMemo(
    () => (data?.selfMode ? (data.checks || []).slice(0, 30) : []),
    [data],
  )

  /* ───────── کنش‌ها ───────── */
  function resetForm() { setForm({ status: 'ok', expiredFound: '', nearExpiry: '', removedQty: '', note: '', silent: false }) }

  async function submit() {
    if (!merch) return toast.error('چیدمان‌گر (بازرس) را انتخاب کنید')
    if (!section || !lane) return toast.error('بخش و ردیف را انتخاب کنید')
    if (!STATUS_META[form.status]) return toast.error('وضعیت بازرسی را انتخاب کنید')
    setSaving(true)
    const r = await api('/api/lane-checks', {
      method: 'POST',
      body: {
        merchandiserId: merch.id,
        merchandiserName: who(merch),
        sectionLabel: section,
        lane,
        status: form.status,
        expiredFound: Number(form.expiredFound) || 0,
        nearExpiry: Number(form.nearExpiry) || 0,
        removedQty: Number(form.removedQty) || 0,
        note: form.note.trim() || null,
        silent: form.silent === true,
      },
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت بازرسی انجام نشد')
    const quiet = r.data && r.data.notified === false
    toast.success(`بازرسی «${section} — ${lane}» ثبت شد${quiet ? ' — بدون اعلان' : ''}`)
    resetForm()
    await refresh()
    setStep(2) // بازگشت به ردیف‌ها؛ دکمهٔ همین ردیف وضعیت تازه را نشان می‌دهد
  }

  /** پرش مستقیم از «برنامهٔ امروز» به فرم ثبتِ همان ردیف، با همان شخص/بخش/ردیف */
  function jumpToCheck(person: PlanPerson, l: PlanLane) {
    resetForm()
    setMerch({ id: person.userId || '', fullName: person.name, honorific: '', title: person.username ? `@${person.username}` : '', role: person.role || '' })
    setSection(l.section)
    setLane(l.lane)
    setStep(3)
  }

  /** خاموش/روشن‌کردن اعلان‌های بازرسی یک نفر (مدیران) */
  async function toggleMute(p: Person) {
    if (mutingId) return
    const muted = isMuted(p.id)
    setMutingId(p.id)
    const r = await api(`/api/lane-checks?muteUser=${encodeURIComponent(p.id)}`, { method: 'PUT', body: { muted: !muted } })
    setMutingId(null)
    if (!r.ok) return toast.error(r.error || 'تغییر وضعیت اعلان انجام نشد')
    toast.success(`اعلان‌های بازرسی برای ${who(p)} ${muted ? 'روشن' : 'خاموش'} شد`)
    await refresh()
  }

  /* ───────── ویرایشگر ردیف‌های بخش (مدیران) ───────── */
  function openLaneDlg(s: string) {
    setDlg({ open: true, section: s, rows: lanesOf(s).map((name, i) => ({ id: i + 1, name })) })
  }
  function addRow(name = '') { setDlg((d) => ({ ...d, rows: [...d.rows, { id: Date.now(), name }] })) }
  function removeRow(id: number) { setDlg((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) })) }
  function renameRow(id: number, name: string) { setDlg((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, name } : r)) })) }
  function fillDefaults() { setDlg((d) => ({ ...d, rows: (data?.laneMap.defaults || []).map((name, i) => ({ id: i + 1, name })) })) }
  async function saveLaneMap() {
    const lanes = [...new Set(dlg.rows.map((r) => r.name.trim()).filter(Boolean))]
    setBusyDlg(true)
    const r = await api('/api/lane-checks?laneMap=1', { method: 'PUT', body: { sectionLabel: dlg.section, lanes } })
    setBusyDlg(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره نشد')
    toast.success(lanes.length ? `ردیف‌های «${dlg.section}» ذخیره شد — ${fa(lanes.length)} ردیف` : `تنظیم اختصاصی «${dlg.section}» حذف شد (پیش‌فرض)`)
    setDlg((d) => ({ ...d, open: false }))
    await refresh()
  }

  /* ───────── مسیر ۳ مرحله‌ای ───────── */
  const reachable = merch ? (section ? 3 : 2) : 1
  function goto(n: number) {
    if (n > reachable) return
    if (n <= 2) setLane('')
    setStep(n)
  }

  if (loading || !data) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت بخش‌ها و وضعیت ردیف‌ها…
      </CardContent></Card>
    )
  }

  /* ═══════════════ حالت «کارنامهٔ من» — فقط-خواندنی برای غیرمدیرها ═══════════════ */
  if (data.selfMode) {
    const self = data.self!
    const st = selfStats
    const pOk = st ? pctOf(st.ok, st.total) : null
    const pAtt = st ? pctOf(st.needsAttention, st.total) : null
    const pPrb = st ? pctOf(st.problem, st.total) : null
    const roleFa = ROLE_FA[self.role] || self.role
    return (
      <div className="space-y-4">
        {/* سربرگ + چگونگی عملکرد */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Icon name="userCheck" size={18} /> کارنامهٔ بازرسی من
              <span className="text-xs font-normal text-stone-400">بازرسی‌هایی که مدیران از ردیف‌های بخش‌های شما ثبت کرده‌اند</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-base font-black text-white">{self.name.trim().charAt(0) || '؟'}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-stone-800">{self.name}</span>
                <span className="block text-xs text-stone-500">{roleFa}{self.title ? ` · ${self.title}` : ''}</span>
              </span>
              <span className="ms-auto rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] text-stone-500">{faDate(data.today)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="text-2xl font-black text-stone-700">{fa(st?.total ?? 0)}</div>
                <div className="text-[11px] text-stone-500">مجموع بازرسی‌های من</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-2xl font-black text-emerald-700">{pOk === null ? '—' : `${fa(pOk)}٪`}</div>
                <div className="text-[11px] text-emerald-600">سالم{st ? ` (${fa(st.ok)})` : ''}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-2xl font-black text-amber-700">{pAtt === null ? '—' : `${fa(pAtt)}٪`}</div>
                <div className="text-[11px] text-amber-600">نیازمند توجه{st ? ` (${fa(st.needsAttention)})` : ''}</div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <div className="text-2xl font-black text-rose-700">{pPrb === null ? '—' : `${fa(pPrb)}٪`}</div>
                <div className="text-[11px] text-rose-600">مشکل{st ? ` (${fa(st.problem)})` : ''}</div>
              </div>
            </div>
            {st && st.total > 0 && (
              <p className="text-[11px] leading-5 text-stone-400">
                درصدها روی همهٔ بازرسی‌های ثبت‌شده به نام شما (به‌عنوان چیدمان‌گر یا مسؤول بخش) محاسبه می‌شود. ثبت بازرسی فقط توسط مدیران انجام می‌شود؛
                برای پیگیری، یادداشت بازرس را در «موارد نیازمند توجه» بخوانید.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ردیف‌های امروزِ من */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Icon name="calendarDays" size={18} /> ردیف‌های امروز من
              <span className="text-xs font-normal text-stone-400">هر روز چند ردیف از بخش‌های شما به‌صورت تصادفی انتخاب می‌شود تا بازرسی انقضا در طول ماه پخش شود</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selfPlan && selfPlan.lanes.length > 0 ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-teal-50 px-3 py-1 font-bold text-teal-800">
                    {fa(selfPlan.lanes.filter((l) => l.checked).length)} از {fa(selfPlan.lanes.length)} ثبت شد
                  </span>
                  <span className="text-stone-400">انتخاب تصادفیِ امروز از {fa(selfPlan.sections.length)} بخشِ شما</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {selfPlan.lanes.map((l) => {
                    const meta = l.checked && l.status ? STATUS_META[l.status] || null : null
                    return (
                      <div key={`${l.section}||${l.lane}`} className={cn('rounded-xl border p-3', l.checked ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50/60')}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-stone-800">{l.section} — {l.lane}</span>
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', l.checked ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-800')}>
                            {l.checked ? 'ثبت شد ✓' : 'در انتظار'}
                          </span>
                        </div>
                        {l.checked ? (
                          <div className="mt-1 text-[11px] text-stone-500">
                            {meta ? <b className={meta.text}>{meta.short}</b> : null}{l.by ? ` · بازرس: ${l.by}` : ''}
                          </div>
                        ) : (
                          <div className="mt-1 text-[11px] text-stone-400">هنوز توسط مدیر بازرسی نشده است</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-stone-50 p-4 text-center text-xs leading-6 text-stone-500">
                برای امروز ردیفی به نام شما انتخاب نشده است.{self.mySections && self.mySections.length ? '' : ' بخشی از نقشهٔ فروشگاه به نام شما به‌عنوان مسؤول ثبت نشده — از مدیر بخواهید در نقشهٔ فروشگاه، «مسؤول بخش» را برای بخش‌های شما تعیین کند.'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* موارد نیازمند توجه */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Icon name="alertTriangle" size={18} /> موارد نیازمند توجه
              <span className="text-xs font-normal text-stone-400">بازرسی‌های «مشکل» یا «نیازمند توجه» که یادداشت بازرس دارند</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myAttention.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-xs text-emerald-700">
                <I.check size={14} className="-mt-0.5 inline align-middle" /> مورد نیازمند توجهی برای شما ثبت نشده است
              </p>
            ) : (
              <div className="space-y-2">
                {myAttention.map((c) => {
                  const meta = STATUS_META[c.status] || STATUS_META.needs_attention
                  return (
                    <div key={c.id} className={cn('rounded-xl border p-3', meta.soft)}>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={cn('rounded-full px-2 py-0.5 font-bold', cn(meta.soft, meta.text))}>{meta.short}</span>
                        <b className="text-stone-800">{c.sectionLabel} — {c.lane}</b>
                        <span className="text-stone-400">{faDate(c.dateJalali)}</span>
                        <span className="ms-auto text-stone-400">
                          تاریخ‌گذشته {c.expiredFound ? fa(c.expiredFound) : '—'} · نزدیک انقضا {c.nearExpiry ? fa(c.nearExpiry) : '—'}
                        </span>
                      </div>
                      {c.note && (
                        <div className="mt-2 border-s-2 border-amber-300 bg-white/60 ps-2 text-xs leading-5 text-stone-600">
                          «{c.note}»
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* سابقهٔ بازرسی‌های من */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Icon name="history" size={18} /> سابقهٔ بازرسی‌های من
              <span className="text-xs font-normal text-stone-400">{fa(myHistory.length)} بازرسیٔ اخیر — فقط-خواندنی</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myHistory.length === 0 ? (
              <p className="rounded-lg bg-stone-50 p-4 text-center text-xs text-stone-500">هنوز بازرسی‌ای به نام شما ثبت نشده است</p>
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-xl border border-stone-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">تاریخ</TableHead>
                      <TableHead className="text-right">بخش</TableHead>
                      <TableHead className="text-right">ردیف</TableHead>
                      <TableHead className="text-center">وضعیت</TableHead>
                      <TableHead className="text-center">تاریخ‌گذشته</TableHead>
                      <TableHead className="text-center">نزدیک انقضا</TableHead>
                      <TableHead className="text-center">جمع‌آوری</TableHead>
                      <TableHead className="text-right">یادداشت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myHistory.map((c) => {
                      const meta = STATUS_META[c.status] || STATUS_META.ok
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs text-stone-500">{faDate(c.dateJalali)}</TableCell>
                          <TableCell className="text-xs font-medium text-stone-700">{c.sectionLabel}</TableCell>
                          <TableCell className="text-xs font-medium text-stone-700">{c.lane}</TableCell>
                          <TableCell className="text-center">
                            <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-bold', cn(meta.soft, meta.text))}>{meta.short}</span>
                          </TableCell>
                          <TableCell className="text-center text-xs">{c.expiredFound ? fa(c.expiredFound) : '—'}</TableCell>
                          <TableCell className="text-center text-xs">{c.nearExpiry ? fa(c.nearExpiry) : '—'}</TableCell>
                          <TableCell className="text-center text-xs">{c.removedQty ? fa(c.removedQty) : '—'}</TableCell>
                          <TableCell className="max-w-56 truncate text-xs text-stone-500" title={c.note || ''}>{c.note || '—'}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ═══════════════ حالت مدیران: برنامهٔ امروز + گردش ۳ مرحله‌ای ═══════════════ */
  return (
    <div className="space-y-4">
      {/* ═══ برنامهٔ امروز — تخصیص تصادفی روزانهٔ ردیف‌ها ═══ */}
      {plan && plan.persons.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Icon name="calendarDays" size={18} /> برنامهٔ امروز
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">{faDate(plan.date)}</span>
              <span className="text-xs font-normal text-stone-400">هر روز ۲ تا ۴ ردیف از بخش‌های هر مسؤول به‌صورت تصادفی — پایدار در طول امروز، متفاوت برای فردا؛ بازرسی انقضا روی کل ماه پخش می‌شود</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {plan.persons.map((p) => {
                const done = p.lanes.filter((l) => l.checked).length
                const total = p.lanes.length
                const unmapped = !p.userId
                return (
                  <div key={p.userId || p.name} className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
                    <div className="flex items-center gap-2.5">
                      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-black', done === total ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500')}>
                        {done === total ? <I.check size={16} /> : (p.name.trim().charAt(0) || '؟')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-stone-800">{p.name}</span>
                        <span className="block truncate text-[11px] text-stone-400">
                          {unmapped ? 'بدون کاربرِ سامانه' : ROLE_FA[p.role || ''] || p.role || ''} · {fa(p.sections.length)} بخش: {p.sections.join('، ')}
                        </span>
                      </span>
                      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', done === total ? 'bg-emerald-600 text-white' : done > 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500')}>
                        {fa(done)}/{fa(total)} ثبت شد
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.lanes.map((l) => {
                        const meta = l.checked && l.status ? STATUS_META[l.status] || null : null
                        return (
                          <button
                            key={`${l.section}||${l.lane}`}
                            type="button"
                            title={`ثبت بازرسیِ «${l.section} — ${l.lane}» برای ${p.name}`}
                            onClick={() => jumpToCheck(p, l)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all',
                              l.checked
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                : 'border-dashed border-amber-300 bg-amber-50/60 text-amber-800 hover:bg-amber-100',
                            )}
                          >
                            <span className="font-bold">{l.section} — {l.lane}</span>
                            {l.checked ? (
                              <span className="flex items-center gap-1">
                                <I.check size={11} /> ثبت شد{meta ? <b className={meta.text}> · {meta.short}</b> : null}
                              </span>
                            ) : (
                              <span>در انتظار</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-stone-400">
              <I.info size={12} className="-mt-0.5 inline align-middle" />{' '}
              با کلیک روی هر ردیف، فرم ثبت بازرسی با همان شخص، بخش و ردیف پیش‌انتخاب می‌شود. «بدون کاربرِ سامانه» یعنی نام مسؤول در نقشه با هیچ کاربری تطبیق نشده — بازرسی با همان نام آزاد ثبت می‌شود و اعلانی ارسال نمی‌شود.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ═══ نوار خلاصه + مسیر ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Icon name="timer" size={18} /> کنترل انقضای قفسه‌ها
            <span className="text-xs font-normal text-stone-400">بازرسی ردیف/طبقهٔ هر بخش توسط چیدمان‌گر — «هر ردیف آخرین بار کِی و چطور دیده شد»</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="text-2xl font-black text-stone-700">{fa(summary.total)}</div>
              <div className="text-[11px] text-stone-500">مجموع ردیف‌های تعریف‌شده</div>
            </div>
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
              <div className="text-2xl font-black text-teal-700">{fa(summary.week)}</div>
              <div className="text-[11px] text-teal-600">بازرسی‌شده در ۷ روز اخیر</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-2xl font-black text-amber-700">{fa(summary.never)}</div>
              <div className="text-[11px] text-amber-600">هرگز بررسی نشده</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-2xl font-black text-rose-700">{fa(summary.problems)}</div>
              <div className="text-[11px] text-rose-600">
                ردیف مشکل‌دار{summary.attention > 0 ? ` + ${fa(summary.attention)} نیازمند توجه` : ''}
              </div>
            </div>
          </div>

          {/* مسیر: ۱ چیدمان‌گر ← ۲ بخش و ردیف ← ۳ ثبت بازرسی */}
          <div className="flex flex-wrap items-center gap-1.5">
            {STEPS.map((s, i) => {
              const done = s.n < step
              const active = s.n === step
              const clickable = s.n <= reachable
              return (
                <span key={s.n} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => goto(s.n)}
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition-all',
                      active && 'border-teal-600 bg-white font-bold text-teal-800 ring-2 ring-teal-600/20',
                      done && 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
                      !active && !done && (clickable ? 'border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-400' : 'border-stone-100 bg-stone-50 text-stone-300'),
                    )}
                  >
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black', done ? 'bg-white/25' : active ? 'bg-teal-600 text-white' : 'bg-stone-200 text-stone-600')}>
                      {done ? <I.check size={12} /> : toFaDigits(s.n)}
                    </span>
                    {s.title}
                  </button>
                  {i < STEPS.length - 1 && <I.chevronLeft size={14} className="text-stone-300" />}
                </span>
              )
            })}
            {merch && (
              <span className="ms-2 text-[11px] text-stone-400">
                بازرس: <b className="text-stone-600">{who(merch)}</b>{section ? <> · بخش: <b className="text-stone-600">{section}</b></> : null}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ مرحلهٔ ۱ — انتخاب چیدمان‌گر ═══ */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">۱ · انتخاب چیدمان‌گر</CardTitle>
            <div className="relative mt-2 max-w-sm">
              <I.search size={15} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="جستجوی نام یا سمت…" className="pe-8" />
            </div>
          </CardHeader>
          <CardContent>
            {people.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400">چیدمان‌گری یافت نشد</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {people.map((p) => {
                  const selected = merch?.id === p.id
                  const muted = isMuted(p.id)
                  const busy = mutingId === p.id
                  return (
                    <div key={p.id} className="relative">
                      <button
                        type="button"
                        onClick={() => { setMerch(p); setSection(''); setLane(''); setStep(2) }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border p-3 pe-12 text-right transition-all',
                          selected ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-600/25' : 'border-stone-200 bg-white hover:border-teal-400 hover:bg-teal-50/40',
                        )}
                      >
                        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black', selected ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-500')}>
                          {p.fullName.trim().charAt(0) || '؟'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-stone-800">{who(p)}</span>
                          <span className="block truncate text-xs text-stone-500">{p.title || '—'}</span>
                          <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold', p.role === 'MERCH' ? 'bg-teal-100 text-teal-700' : 'bg-stone-100 text-stone-500')}>
                            {ROLE_FA[p.role] || p.role}
                          </span>
                        </span>
                        {selected && <I.check size={18} className="shrink-0 text-teal-600" />}
                      </button>
                      {/* خاموش/روشن‌کردن اعلان‌های بازرسی این نفر */}
                      <button
                        type="button"
                        disabled={busy}
                        title={muted
                          ? 'اعلان‌های بازرسی برای این نفر خاموش است — کلیک: روشن‌شدن'
                          : 'اعلان‌های بازرسی برای این نفر روشن است — کلیک: خاموش‌شدن'}
                        onClick={() => void toggleMute(p)}
                        className={cn(
                          'absolute bottom-2.5 end-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border transition-colors',
                          muted
                            ? 'border-stone-200 bg-stone-100 text-stone-400 hover:border-rose-300 hover:text-rose-600'
                            : 'border-teal-200 bg-teal-50 text-teal-600 hover:bg-teal-100',
                          busy && 'opacity-60',
                        )}
                      >
                        {busy ? <I.loader size={13} className="animate-spin" /> : <BellIcon off={muted} size={14} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="mt-3 text-[11px] leading-5 text-stone-400">
              <BellIcon off size={12} className="-mt-0.5 inline align-middle" />{' '}
              با زنگِ هر نفر، اعلان «بازرسی جدید ثبت شد» برایش خاموش/روشن می‌شود — چیدمان‌گرِ خاموش، اعلان نمی‌گیرد اما بازرسی‌ها در کارنامهٔ او ثبت می‌ماند.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ═══ مرحلهٔ ۲ — بخش‌ها و ردیف‌ها ═══ */}
      {step === 2 && merch && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">۲ · بخش و ردیف</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-stone-400">بازرس: <b className="text-stone-600">{who(merch)}</b></span>
                <Button variant="outline" size="sm" onClick={() => setStep(1)}>تغییر چیدمان‌گر</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {sections.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400">بخشی یافت نشد — ابتدا نقشهٔ فروشگاه را کامل کنید</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {sections.map((s) => {
                    const st = sectionStats[s.label] || { total: 0, checked: 0, problems: 0 }
                    const active = section === s.label
                    return (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => { setSection(s.label); setLane('') }}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-xs transition-colors',
                          active ? 'border-teal-600 bg-teal-600 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-teal-400',
                        )}
                      >
                        {s.label}
                        <span className={cn('ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold', active ? 'bg-white/20 text-white' : st.total && st.checked === st.total ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500')}>
                          {st.checked}/{fa(st.total)}
                        </span>
                        {st.problems > 0 && <span className={cn('ms-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold', active ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-700')}>{fa(st.problems)} مشکل</span>}
                      </button>
                    )
                  })}
                </div>

                {section && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                      <div className="text-sm font-bold text-stone-700">
                        ردیف‌های «{section}»
                        <span className="ms-2 text-[11px] font-normal text-stone-400">{sectionStats[section]?.checked ?? 0} از {fa(sectionStats[section]?.total ?? 0)} ردیف بازرسی شده</span>
                        {(() => {
                          const r = sections.find((s) => s.label === section)?.responsible
                          return r ? <span className="ms-2 text-[11px] font-normal text-stone-400">مسؤول: <b className="text-stone-600">{r.name}</b>{r.id ? '' : ' (بدون کاربر)'}</span> : null
                        })()}
                      </div>
                      {isMgr && (
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openLaneDlg(section)}>
                          <I.settings size={14} /> مدیریت ردیف‌های بخش
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {lanesOf(section).map((l) => {
                        const s = stateOf(section, l)
                        const ago = s ? (s.daysAgo ?? daysAgoOf(s.dateJalali) ?? 0) : null
                        const meta = s ? STATUS_META[s.status] || STATUS_META.ok : null
                        const active = lane === l
                        return (
                          <button
                            key={l}
                            type="button"
                            onClick={() => { setLane(l); resetForm(); setStep(3) }}
                            className={cn(
                              'min-h-24 rounded-xl border p-3 text-right transition-all',
                              active ? 'border-teal-600 bg-white ring-2 ring-teal-600/25' : s && meta ? cn(meta.soft, 'hover:shadow-sm') : 'border-stone-200 bg-stone-50 hover:border-stone-400',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-stone-800">{l}</span>
                              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', s && meta ? meta.dot : 'bg-stone-300')} />
                            </div>
                            {s && meta ? (
                              <div className="mt-1.5 space-y-0.5">
                                <div className="text-xs">
                                  <span className={cn('font-bold', meta.text)}>{meta.short}</span>
                                  {ago !== null && <span className="text-stone-400"> · {agoFa(ago)}</span>}
                                </div>
                                <div className="truncate text-[11px] text-stone-500" title={`${faDate(s.dateJalali)} — ${s.merchandiserName}`}>
                                  {faDate(s.dateJalali)} · {s.merchandiserName}
                                </div>
                                {(s.expiredFound > 0 || s.nearExpiry > 0) && (
                                  <div className="text-[11px] text-rose-600">تاریخ‌گذشته {fa(s.expiredFound)} · نزدیک انقضا {fa(s.nearExpiry)}</div>
                                )}
                              </div>
                            ) : (
                              <div className="mt-1.5 text-xs text-stone-400">هرگز بررسی نشده</div>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {sectionChecks.length > 0 && (
                      <div className="rounded-xl border border-stone-200">
                        <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-600">
                          <I.history size={14} /> آخرین بازرسی‌های «{section}»
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-right">تاریخ</TableHead>
                                <TableHead className="text-right">ردیف</TableHead>
                                <TableHead className="text-right">بازرس</TableHead>
                                <TableHead className="text-center">وضعیت</TableHead>
                                <TableHead className="text-center">تاریخ‌گذشته</TableHead>
                                <TableHead className="text-center">نزدیک انقضا</TableHead>
                                <TableHead className="text-center">جمع‌آوری</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sectionChecks.map((c) => {
                                const meta = STATUS_META[c.status] || STATUS_META.ok
                                return (
                                  <TableRow key={c.id}>
                                    <TableCell className="text-xs text-stone-500">{faDate(c.dateJalali)}</TableCell>
                                    <TableCell className="text-xs font-medium text-stone-700">{c.lane}</TableCell>
                                    <TableCell className="text-xs text-stone-600">{c.merchandiserName || '—'}</TableCell>
                                    <TableCell className="text-center">
                                      <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-bold', cn(meta.soft, meta.text))}>{meta.short}</span>
                                    </TableCell>
                                    <TableCell className="text-center text-xs">{c.expiredFound ? fa(c.expiredFound) : '—'}</TableCell>
                                    <TableCell className="text-center text-xs">{c.nearExpiry ? fa(c.nearExpiry) : '—'}</TableCell>
                                    <TableCell className="text-center text-xs">{c.removedQty ? fa(c.removedQty) : '—'}</TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ مرحلهٔ ۳ — ثبت بازرسی ═══ */}
      {step === 3 && merch && section && lane && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">۳ · ثبت بازرسی</CardTitle>
              <Button variant="outline" size="sm" onClick={() => { setLane(''); setStep(2) }}>
                <I.chevronLeft size={14} className="rotate-180" /> بازگشت به ردیف‌ها
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* بافت بازرسی */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
              <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{section}</span>
              <I.chevronLeft size={14} className="text-stone-300" />
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-700">{lane}</span>
              <I.chevronLeft size={14} className="text-stone-300" />
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-700">بازرس: {who(merch)}</span>
              {isMuted(merch.id) && (
                <span className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-500" title="اعلان‌های بازرسی برای این نفر خاموش است">
                  <BellIcon off size={12} /> اعلان خاموش
                </span>
              )}
              {lastState && (
                <span className="ms-auto text-[11px] text-stone-500">
                  آخرین وضعیت:{' '}
                  <b className={(STATUS_META[lastState.status] || STATUS_META.ok).text}>
                    {(STATUS_META[lastState.status] || STATUS_META.ok).short}
                  </b>{' '}
                  · {agoFa(lastState.daysAgo ?? daysAgoOf(lastState.dateJalali) ?? 0)} · {longFa(lastState.dateJalali)}
                </span>
              )}
            </div>

            {/* وضعیت ردیف */}
            <div>
              <div className="mb-2 text-xs font-bold text-stone-600">وضعیت ردیف</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(STATUS_META) as ('ok' | 'needs_attention' | 'problem')[]).map((k) => {
                  const meta = STATUS_META[k]
                  const active = form.status === k
                  const Ico = meta.icon === 'check' ? I.check : meta.icon === 'alertTriangle' ? I.alertTriangle : I.x
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, status: k }))}
                      className={cn(
                        'flex h-14 flex-col items-center justify-center gap-1 rounded-xl border text-[13px] font-bold transition-all',
                        active ? meta.solid : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400',
                      )}
                    >
                      <Ico size={18} />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* شمارش‌ها */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-stone-500">تعداد اقلام تاریخ‌گذشته</label>
                <NumInput value={form.expiredFound} onChange={(v: string) => setForm((f) => ({ ...f, expiredFound: v }))} placeholder="۰" className="h-11 text-base" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500">نزدیک انقضا (۳۰ روز آینده)</label>
                <NumInput value={form.nearExpiry} onChange={(v: string) => setForm((f) => ({ ...f, nearExpiry: v }))} placeholder="۰" className="h-11 text-base" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500">جمع‌آوری‌شده از قفسه</label>
                <NumInput value={form.removedQty} onChange={(v: string) => setForm((f) => ({ ...f, removedQty: v }))} placeholder="۰" className="h-11 text-base" />
              </div>
            </div>

            {/* یادداشت */}
            <div>
              <label className="mb-1 block text-xs text-stone-500">یادداشت بازرس</label>
              <Textarea rows={3} value={form.note} onChange={(e: any) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="مثلاً محل اقلام نزدیک انقضا، اقدام انجام‌شده، هماهنگی با انبار…" />
            </div>

            {/* ثبت بی‌اعلان (R10) */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
              <Checkbox checked={form.silent} onCheckedChange={(v: any) => setForm((f) => ({ ...f, silent: v === true }))} className="mt-0.5" />
              <span className="text-xs leading-5">
                <span className="font-bold text-stone-700">ثبت بی‌اعلان (فقط مدیران می‌بینند)</span>
                <span className="text-stone-400"> — برای این بازرسی، اعلان «بازرسی جدید ثبت شد» به {who(merch)} نمی‌رسد؛ بازرسی فقط در گزارش‌های مدیریت دیده می‌شود.</span>
              </span>
            </label>

            {/* راهنمای سریع */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
              <I.alertTriangle size={14} className="-mt-0.5 inline align-middle" />{' '}
              راهنما: اقلام تاریخ‌گذشته را از قفسه خارج کنید و تعدادشان را در «جمع‌آوری‌شده» ثبت کنید؛ اقلام نزدیک انقضا (زیر ۳۰ روز) طبق اصل FEFO به جلوی ردیف بیایند و در «نزدیک انقضا» شمرده شوند.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => void submit()} className="h-12 gap-2 bg-emerald-600 px-6 text-base hover:bg-emerald-700">
                {saving ? <I.loader size={18} className="animate-spin" /> : <I.check size={18} />}
                ثبت بازرسی
              </Button>
              <Button variant="outline" className="h-12" onClick={() => { setLane(''); setStep(2) }}>انصراف و بازگشت</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ دیالوگ مدیریت ردیف‌های بخش (مدیران) ═══ */}
      <Dialog open={dlg.open} onOpenChange={(o: boolean) => setDlg((d) => ({ ...d, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.settings size={16} /> مدیریت ردیف‌های «{dlg.section}»</DialogTitle>
            <DialogDescription>
              ردیف/طبقه‌های این بخش را تعریف کنید (گوندولاها معمولاً ۷ طبقه + باتوم دارند). ذخیرهٔ فهرست خالی = حذف تنظیم اختصاصی و بازگشت به پیش‌فرض.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {dlg.rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs text-stone-400">{toFaDigits(i + 1)}</span>
                <Input value={r.name} onChange={(e: any) => renameRow(r.id, e.target.value)} placeholder="نام ردیف — مثلاً طبقهٔ ۳ یا باتوم راست" className="h-10" />
                <Button type="button" variant="ghost" size="sm" className="h-10 w-10 shrink-0 p-0 text-rose-600 hover:bg-rose-50" onClick={() => removeRow(r.id)} aria-label="حذف ردیف">
                  <I.trash size={16} />
                </Button>
              </div>
            ))}
            {dlg.rows.length === 0 && (
              <p className="rounded-lg bg-stone-50 p-3 text-center text-xs text-stone-500">ردیفی تعریف نشده — ذخیره = بازگشت به پیش‌فرض (۷ طبقه + باتوم)</p>
            )}
            <button
              type="button"
              onClick={() => addRow()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 py-2.5 text-xs font-bold text-stone-500 transition-colors hover:border-teal-500 hover:text-teal-700"
            >
              <I.plus size={14} /> افزودن ردیف
            </button>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-stone-400">افزودن سریع:</span>
              {specialSuggest.filter((nm) => !dlg.rows.some((r) => r.name === nm)).map((nm) => (
                <button
                  key={nm}
                  type="button"
                  onClick={() => addRow(nm)}
                  className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-600 transition-colors hover:border-teal-400 hover:text-teal-700"
                >
                  + {nm}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" variant="outline" className="gap-1.5" onClick={fillDefaults}>
              <I.refresh size={14} /> پیش‌فرض (۷ طبقه + باتوم)
            </Button>
            <Button type="button" disabled={busyDlg} onClick={() => void saveLaneMap()} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              {busyDlg ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
