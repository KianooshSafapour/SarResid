import { useState, useEffect, useMemo, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Textarea, Tabs, TabsContent, TabsList, TabsTrigger, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, fa, todayJalali, toEnDigits, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   hr/performance — کارنامه عملکرد کارکنان (ترکیب وزن‌دار ۶ شاخص)
   وظایف ۳۵٪ · چیدمان ۲۵٪ · چک‌لیست ۱۵٪ · حضور ۱۰٪ · شمارش ۱۰٪ · تشویقی ۵٪
   + ارزیابی ماهانه مدیر شیفت عصر (۱۱ شاخص شرح وظایف)
   نمایش همهٔ شاخص‌ها «از ۱۰۰»؛ ورودی معیارهای انسانی ۱ تا ۵ (R1)
   ───────────────────────────────────────────────────────────── */

const COMPONENTS = [
  { key: 'taskScore', label: 'وظایف', weight: '۳۵٪' },
  { key: 'sectionScore', label: 'چیدمان', weight: '۲۵٪' },
  { key: 'checklistScore', label: 'چک‌لیست', weight: '۱۵٪' },
  { key: 'attendanceScore', label: 'حضور', weight: '۱۰٪' },
  { key: 'zoneCountScore', label: 'شمارش', weight: '۱۰٪' },
  { key: 'extraScore', label: 'تشویقی', weight: '۵٪' },
] as const

const GRADES: Record<string, { label: string; text: string; chip: string; bar: string }> = {
  A: { label: 'عالی', text: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  B: { label: 'خوب', text: 'text-teal-600', chip: 'bg-teal-50 text-teal-700', bar: 'bg-teal-500' },
  C: { label: 'قابل بهبود', text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  D: { label: 'نیازمند اقدام', text: 'text-rose-600', chip: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500' },
}

const INDICATORS_FALLBACK = [
  { key: 'staffMgmt', label: 'مدیریت پرسنل' },
  { key: 'hallControl', label: 'کنترل سالن' },
  { key: 'layoutQuality', label: 'کیفیت چیدمان' },
  { key: 'cleanliness', label: 'نظافت' },
  { key: 'labelsControl', label: 'کنترل برچسب' },
  { key: 'datesControl', label: 'کنترل تاریخ' },
  { key: 'customerService', label: 'پاسخگویی مشتری' },
  { key: 'problemSolving', label: 'حل مسئله' },
  { key: 'reporting', label: 'کیفیت گزارش' },
  { key: 'discipline', label: 'نظم و حضور' },
  { key: 'salesGrowth', label: 'نگاه فروش' },
]

const ROLE_FA: Record<string, string> = {
  OWNER: 'مالک', GM: 'مدیر کل', ADMIN: 'مدیر', EXEC: 'مدیر اجرایی', ACC: 'حسابدار', PM: 'مدیر محصولات',
  HC: 'صندوقدار ارشد', SK: 'انباردار', SALES: 'فروشنده', CASHIER: 'صندوقدار', MERCH: 'نیروی چیدمان',
}

const monthOf = (dash: string) => String(dash || '').slice(0, 7)

function barColor(v: number): string {
  if (v >= 80) return 'bg-emerald-500'
  if (v >= 60) return 'bg-teal-500'
  if (v >= 40) return 'bg-amber-500'
  return 'bg-rose-500'
}

/* حروف فارسی سطوح کارنامه (API هنوز A/B/C/D برمی‌گرداند) */
const GRADE_FA: Record<string, string> = { A: 'الف', B: 'ب', C: 'ج', D: 'د' }

/** نمایش امتیاز ۰-۱۰۰ فارسی — صحیح بدون اعشار، غیرصحیح با یک رقم اعشار (ممیز فارسی) */
function faScore(v: number): string {
  const n = Math.max(0, Math.min(100, Number(v) || 0))
  return Number.isInteger(n) ? fa(n) : fa(n.toFixed(1)).replace('.', '٫')
}
/** امتیاز ترکیبی — همیشه با یک رقم اعشار */
function faScore1(v: number): string {
  const n = Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 10) / 10))
  return fa(n.toFixed(1)).replace('.', '٫')
}

/* لنگرهای توصیفی مقیاس ۱-۵ ارزیابی مدیران (BARS کوچک) */
const M_ANCHORS = [
  { v: 1, label: 'بسیار ضعیف' },
  { v: 2, label: 'ضعیف' },
  { v: 3, label: 'قابل قبول' },
  { v: 4, label: 'خوب' },
  { v: 5, label: 'عالی' },
]

function parseScores(v: any): Record<string, number> {
  if (!v) return {}
  if (typeof v === 'string') { try { return JSON.parse(v) || {} } catch { return {} } }
  return v
}

export default function PerformanceView() {
  const { user } = useShell()
  const [tab, setTab] = useState('staff')
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(monthOf(todayJalali()) || '1405-07')
  const [periodType, setPeriodType] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY')
  const [scores, setScores] = useState<any[]>([])

  /* دیالوگ امتیاز تشویقی */
  const [extraOpen, setExtraOpen] = useState(false)
  const [extraTarget, setExtraTarget] = useState<any | null>(null)
  const [extraValue, setExtraValue] = useState('')
  const [extraNote, setExtraNote] = useState('')
  const [savingExtra, setSavingExtra] = useState(false)

  /* ارزیابی مدیران */
  const monthKey = /^\d{4}-\d{2}$/.test(period) ? period : monthOf(todayJalali())
  const [mLoading, setMLoading] = useState(false)
  const [indicators, setIndicators] = useState<any[]>(INDICATORS_FALLBACK)
  const [mScores, setMScores] = useState<Record<string, number>>({})
  const [mNote, setMNote] = useState('')
  const [mReviews, setMReviews] = useState<any[]>([])
  const [mManager, setMManager] = useState<{ id: string; name: string; title: string } | null>(null)
  const [mSaving, setMSaving] = useState(false)
  const [mLoaded, setMLoaded] = useState(false)

  useEffect(() => { void loadScores() }, [period, periodType])
  useEffect(() => { if (tab === 'managers') void loadManagers() }, [tab, monthKey])

  async function loadScores() {
    setLoading(true)
    const r = await api(`/api/performance${qs({ period, periodType })}`)
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت کارنامه‌ها'); setScores([]); return }
    setScores(r.data.scores || [])
  }

  async function loadManagers() {
    setMLoading(true)
    const [roster, mr] = await Promise.all([
      api('/api/auth/roster'),
      api(`/api/manager-reviews${qs({ periodKey: monthKey })}`),
    ])
    setMLoading(false)
    setMLoaded(true)
    if (roster.ok) {
      const u = (roster.data.users || []).find((x: any) => x.username === 'mollaie') ||
        (roster.data.users || []).find((x: any) => (x.fullName || '').indexOf('ملا') > -1)
      if (u) setMManager({ id: u.id, name: u.fullName, title: u.title || '' })
    }
    if (!mr.ok) { toast.error(mr.error || 'خطا در دریافت ارزیابی مدیران'); return }
    const revs = mr.data.reviews || []
    setMReviews(revs)
    const inds = mr.data.indicators
    if (Array.isArray(inds) && inds.length && inds.every((x: any) => x && x.key)) setIndicators(inds)
    const existing = revs.find((r: any) => r.periodKey === monthKey && (!mManager || r.managerId === mManager.id)) || null
    const sc = parseScores(existing?.scoresJson ?? existing?.scores ?? null)
    const next: Record<string, number> = {}
    for (const ind of (Array.isArray(inds) && inds.length ? inds : INDICATORS_FALLBACK)) next[ind.key] = Number(sc[ind.key] ?? 3)
    setMScores(next)
    setMNote(existing?.note || '')
  }

  function openExtra(s: any) {
    setExtraTarget(s)
    setExtraValue(String(s.extraScore ?? 0))
    setExtraNote(s.note || s.extraNote || '')
    setExtraOpen(true)
  }

  async function saveExtra() {
    if (!extraTarget) return
    const v = Number(toEnDigits(extraValue.trim()))
    if (!Number.isFinite(v)) return toast.error('مقدار امتیاز معتبر نیست')
    setSavingExtra(true)
    const r = await api('/api/performance', {
      method: 'POST',
      body: { userId: extraTarget.userId, periodType, periodKey: period, extraScore: v, note: extraNote.trim() || null },
    })
    setSavingExtra(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره امتیاز تشویقی ناموفق بود')
    toast.success(`امتیاز تشویقی «${extraTarget.userName}» ذخیره شد — کارنامه به‌روز می‌شود`)
    setExtraOpen(false)
    void loadScores()
  }

  const mTotal = useMemo(() => {
    const vals = indicators.map((i) => Number(mScores[i.key] ?? 3)).filter((v) => Number.isFinite(v))
    if (!vals.length) return 0
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 20)
  }, [mScores, indicators])

  async function saveManagerReview() {
    if (!mManager) return toast.error('اطلاعات مدیر شیفت عصر یافت نشد')
    const body: Record<string, number> = {}
    for (const i of indicators) {
      const v = Number(mScores[i.key] ?? 3)
      if (v < 1 || v > 5) return toast.error(`امتیاز «${i.label}» باید بین ۱ تا ۵ باشد`)
      body[i.key] = v
    }
    setMSaving(true)
    const r = await api('/api/manager-reviews', {
      method: 'POST',
      body: { periodKey: monthKey, managerId: mManager.id, managerName: mManager.name, scores: body, note: mNote.trim() || null },
    })
    setMSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت ارزیابی ناموفق بود')
    toast.success(`ارزیابی ${mManager.name} برای ${monthKey} ثبت شد — امتیاز ${fa(mTotal)}`)
    void loadManagers()
  }

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Icon name="barChart" size={18} /> کارنامه عملکرد کارکنان</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <TabsList>
                <TabsTrigger value="staff">کارکنان</TabsTrigger>
                <TabsTrigger value="managers">ارزیابی مدیران</TabsTrigger>
              </TabsList>
              {tab === 'staff' ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-stone-500">دوره ({periodType === 'MONTHLY' ? 'ماهانه — مثل ۱۴۰۵-۰۷' : 'هفتگی — مثل ۱۴۰۵-W30'})</label>
                    <Input
                      className="w-44"
                      value={period}
                      onChange={(e: any) => setPeriod(toEnDigits(e.target.value.trim()))}
                      placeholder={periodType === 'MONTHLY' ? '۱۴۰۵-۰۷' : '۱۴۰۵-W30'}
                    />
                  </div>
                  <div className="flex overflow-hidden rounded-lg border border-stone-200">
                    <button onClick={() => setPeriodType('MONTHLY')} className={cn('px-3 py-2 text-xs', periodType === 'MONTHLY' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600')}>ماهانه</button>
                    <button onClick={() => setPeriodType('WEEKLY')} className={cn('px-3 py-2 text-xs', periodType === 'WEEKLY' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600')}>هفتگی</button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void loadScores()} className="gap-1.5"><I.refresh size={14} /> به‌روزرسانی</Button>
                </>
              ) : (
                <div className="text-xs text-stone-500">دوره ارزیابی مدیر: <span className="font-bold">{monthKey}</span> (ماهانه)</div>
              )}
            </div>

            {/* ═══════════ کارکنان ═══════════ */}
            <TabsContent value="staff" className="space-y-4">
              {loading ? (
                <div className="py-10 text-center text-stone-500"><I.loader className="mx-auto mb-3 animate-spin" size={22} /> در حال محاسبه کارنامه‌ها…</div>
              ) : scores.length === 0 ? (
                <p className="py-10 text-center text-sm text-stone-400">برای این دوره کارنامه‌ای محاسبه نشد</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {scores.map((s) => {
                    const g = GRADES[s.grade] || GRADES.D
                    const total = Number(s.total || 0)
                    return (
                      <Card key={s.userId} className="border-stone-200">
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold">{s.userName}</div>
                              <div className="text-[11px] text-stone-400">{s.title || ROLE_FA[s.role] || s.role || ''}</div>
                              <div className={cn('mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-bold', g.chip)}>
                                کارنامه {GRADE_FA[s.grade] || s.grade || '—'} · {g.label}
                              </div>
                            </div>
                            <div className="shrink-0 text-center">
                              <div className={cn('text-4xl font-black leading-none', g.text)}>{faScore1(total)}</div>
                              <div className="mt-1 text-[10px] text-stone-400">از ۱۰۰</div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            {COMPONENTS.map((c) => {
                              const v = Math.max(0, Math.min(100, Number((s as any)[c.key] || 0)))
                              return (
                                <div key={c.key} className="flex items-center gap-2">
                                  <div className="w-24 shrink-0 text-[11px] text-stone-500">{c.label} <span className="text-stone-400">{c.weight}</span></div>
                                  <div className="h-1.5 grow overflow-hidden rounded-full bg-stone-100">
                                    <div className={cn('h-full rounded-full transition-all duration-300', c.key === 'extraScore' ? 'bg-amber-500' : barColor(v))} style={{ width: `${v}%` }} />
                                  </div>
                                  <div className="w-20 shrink-0 text-left text-[11px] font-bold text-stone-600">
                                    {faScore(v)} <span className="font-normal text-stone-400">از ۱۰۰</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div className="flex items-center justify-between gap-2 border-t border-stone-200 pt-2">
                            <span className="text-[11px] text-stone-400">امتیاز تشویقی: {fa(Number(s.extraScore || 0))}</span>
                            <Button variant="ghost" size="sm" className="gap-1" onClick={() => openExtra(s)}><I.pencil size={13} /> تشویقی / جریمه</Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* معیار حقوق و پاداش — فقط نمایشی */}
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-bold"><I.info size={15} /> معیار افزایش حقوق و پاداش</div>
                <p className="mb-3 text-xs leading-5 text-stone-600">
                  کارنامه الف → پیشنهاد پاداش؛ ب → در افزایش حقوق در نظر گرفته شود؛ ج → دوره آموزشی؛ د → هشدار و جلسه
                </p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {[
                    { g: 'A', t: 'پیشنهاد پاداش', cls: 'bg-emerald-100 text-emerald-700' },
                    { g: 'B', t: 'در افزایش حقوق در نظر گرفته شود', cls: 'bg-teal-50 text-teal-700' },
                    { g: 'C', t: 'دوره آموزشی', cls: 'bg-amber-100 text-amber-700' },
                    { g: 'D', t: 'هشدار و جلسه', cls: 'bg-rose-100 text-rose-700' },
                  ].map((r) => (
                    <div key={r.g} className={cn('rounded-lg p-2 text-center', r.cls)}>
                      <div className="text-lg font-black">{GRADE_FA[r.g] || r.g}</div>
                      <div className="text-[10px] leading-4">{r.t}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-4 text-stone-400">
                  کارنامه هر دوره به‌صورت خودکار از ۶ شاخص محاسبه می‌شود: وظایف ۳۵٪ · چیدمان ۲۵٪ · چک‌لیست ۱۵٪ · حضور ۱۰٪ · شمارش ۱۰٪ · تشویقی ۵٪. امتیاز تشویقی/جریمه تنها بخش قابل‌ویرایش مدیر است.
                </p>
              </div>

              {/* چرا این مقیاس؟ — یادداشت پژوهشی (R1) */}
              <Card className="border-stone-200 bg-stone-50">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-stone-700">
                    <I.bookOpen size={15} /> چرا این مقیاس؟
                  </div>
                  <ul className="space-y-1.5 text-xs leading-5 text-stone-600">
                    <li>• معیارهای سیستمی — وظایف، چک‌لیست، حضور و شمارش — به‌صورت خودکار و مستقیماً از ۱۰۰ محاسبه می‌شوند و دخالت ارزیاب ندارند.</li>
                    <li>• معیارهای انسانی (ارزیابی چیدمان و ارزیابی مدیران) با مقیاس ۱ تا ۵ ثبت می‌شوند تا دقت قضاوت ارزیاب حفظ شود (ورودی ۰ تا ۱۰۰ برای قضاوت انسانی، دقتِ کاذب می‌سازد)؛ در نمایش به معادل «از ۱۰۰» تبدیل می‌شوند تا مقایسه با شاخص‌های سیستمی ساده باشد.</li>
                    <li>• کارنامه نهایی به‌صورت وزن‌دار ترکیب می‌شود: وظایف ۳۵٪ · چیدمان ۲۵٪ · چک‌لیست ۱۵٪ · حضور ۱۰٪ · شمارش ۱۰٪ · امتیاز ویژه ۵٪.</li>
                    <li>• ارزیابی مطلق است؛ هر کارمند با استاندارد خودش سنجیده می‌شود، نه با توزیع اجباری بین همکاران.</li>
                  </ul>
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-200 pt-2.5 text-[11px]">
                    <span className="font-bold text-stone-600">سطوح کارنامه:</span>
                    {[
                      { l: 'الف (A) ≥ ۹۰', t: 'پاداش', cls: 'bg-emerald-100 text-emerald-700' },
                      { l: 'ب (B) ≥ ۸۰', t: 'در نظر گرفته شود', cls: 'bg-teal-50 text-teal-700' },
                      { l: 'ج (C) ≥ ۷۰', t: 'آموزش', cls: 'bg-amber-100 text-amber-700' },
                      { l: 'د (D) < ۷۰', t: 'هشدار', cls: 'bg-rose-100 text-rose-700' },
                    ].map((x) => (
                      <span key={x.l} className={cn('rounded-md px-2 py-0.5 font-bold', x.cls)}>
                        {x.l} <span className="font-normal">{x.t}</span>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══════════ ارزیابی مدیران ═══════════ */}
            <TabsContent value="managers" className="space-y-4">
              {mLoading && !mLoaded ? (
                <div className="py-10 text-center text-stone-500"><I.loader className="mx-auto mb-3 animate-spin" size={22} /> در حال دریافت ارزیابی مدیران…</div>
              ) : (
                <>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold">{mManager ? mManager.name : 'عبدالله ملايی'} <span className="text-[11px] font-normal text-stone-400">({mManager?.title || 'مدیر اجرایی و مدیر شیفت عصر'})</span></div>
                        <div className="mt-0.5 text-[11px] text-stone-400">ارزیاب: خانم لطفی (مدیر کل) · دوره {monthKey}</div>
                      </div>
                      <div className="text-center">
                        <div className={cn('text-3xl font-black leading-none', mTotal >= 90 ? 'text-emerald-600' : mTotal >= 80 ? 'text-teal-600' : mTotal >= 70 ? 'text-amber-600' : 'text-rose-600')}>{fa(mTotal)}</div>
                        <div className="text-[10px] text-stone-400">از ۱۰۰ (میانگین × ۲۰)</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {indicators.map((ind) => {
                      const v = Number(mScores[ind.key] ?? 3)
                      return (
                        <div key={ind.key} className="rounded-lg border border-stone-200 bg-white p-3">
                          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span className="text-xs font-medium text-stone-700">{ind.label}</span>
                            <span className="flex items-baseline gap-2">
                              <span className={cn('text-lg font-bold', v >= 4 ? 'text-emerald-600' : v === 3 ? 'text-teal-600' : 'text-rose-600')}>
                                {fa(v)} <span className="text-[10px] font-normal text-stone-400">از ۵</span>
                              </span>
                              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700" title="معادل از ۱۰۰">{fa(v * 20)} از ۱۰۰</span>
                            </span>
                          </div>
                          <input
                            type="range" min={1} max={5} step={1} value={v}
                            onChange={(e) => setMScores((p) => ({ ...p, [ind.key]: Number(e.target.value) }))}
                            className="w-full"
                            style={{ accentColor: '#0d9488' }}
                            aria-label={ind.label}
                          />
                          <div className="mt-1 flex justify-between gap-1 text-[9px] leading-4 text-stone-400">
                            {M_ANCHORS.map((a) => (
                              <span key={a.v} className={cn('whitespace-nowrap transition-colors', v === a.v ? 'font-bold text-teal-700' : 'text-stone-400')}>
                                {fa(a.v)} {a.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-64 grow">
                      <label className="mb-1 block text-xs text-stone-500">یادداشت ارزیاب (اختیاری)</label>
                      <Textarea rows={2} value={mNote} onChange={(e: any) => setMNote(e.target.value)} placeholder="نقاط قوت و موارد نیازمند بهبود مدیر شیفت عصر…" />
                    </div>
                    <Button disabled={mSaving} onClick={() => void saveManagerReview()} className="gap-1.5">
                      {mSaving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ثبت ارزیابی دوره {monthKey}
                    </Button>
                  </div>

                  {mReviews.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-sm font-bold"><I.history size={15} /> دوره‌های ثبت‌شده</div>
                      <div className="max-h-60 space-y-1.5 overflow-y-auto">
                        {mReviews.map((r) => (
                          <div key={r.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2', r.periodKey === monthKey ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-white')}>
                            <span className="text-xs">
                              <span className="font-bold">{r.managerName}</span>
                              <span className="text-stone-400"> · {r.periodKey}{r.reviewerName ? ` · ارزیاب: ${r.reviewerName}` : ''}</span>
                            </span>
                            <span className={cn('rounded px-2 py-0.5 text-[11px] font-bold', r.total >= 90 ? 'bg-emerald-100 text-emerald-700' : r.total >= 80 ? 'bg-teal-50 text-teal-700' : r.total >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')}>
                              {fa(Math.round(Number(r.total || 0)))} از ۱۰۰
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ═══ دیالوگ امتیاز تشویقی ═══ */}
      <Dialog open={extraOpen} onOpenChange={(o: boolean) => setExtraOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>امتیاز تشویقی / جریمه</DialogTitle>
            <DialogDescription>
              {extraTarget ? `${extraTarget.userName} — دوره ${period} (${periodType === 'MONTHLY' ? 'ماهانه' : 'هفتگی'})` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-stone-500">امتیاز (عدد — مثبت تشویقی، منفی جریمه)</label>
              <Input inputMode="numeric" value={extraValue} onChange={(e: any) => setExtraValue(e.target.value)} placeholder="مثلاً ۵ یا ‎−۳" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">علت / یادداشت</label>
              <Textarea rows={2} value={extraNote} onChange={(e: any) => setExtraNote(e.target.value)} placeholder="مثلاً: پاداش نظم مثال‌زدنی قفسه‌ها…" />
            </div>
            <p className="text-[10px] leading-4 text-stone-400">این امتیاز با وزن ۵٪ در کارنامه ترکیب می‌شود و بقیه شاخص‌ها به‌صورت زنده از داده‌های سیستم محاسبه می‌شوند.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraOpen(false)}>انصراف</Button>
            <Button disabled={savingExtra} onClick={() => void saveExtra()} className="gap-1.5">
              {savingExtra ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
