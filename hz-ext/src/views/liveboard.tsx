import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Card, CardContent, CardHeader, CardTitle, Badge, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Stepper, money, fa, todayJalali, toFaDigits, JALALI_MONTHS, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   store/liveboard — نقشه زنده فروشگاه (بلوپرینت تعاملی)
   بلوک‌های نقشه با آمار زنده پلانوگرام + کم‌موجودی + کنترل تاریخ
   + کانتور واقعی فروشگاه (ذوزنقهٔ هایپر زیتون) زیر بلوک‌ها
   + ستون‌های چیدمان و نوبت‌گردانی کنترل تاریخ (F7)
   ───────────────────────────────────────────────────────────── */

const KIND_META: Record<string, { color: string; label: string }> = {
  GONDOLA: { color: '#be185d', label: 'گوندولا' },
  SHELF: { color: '#a16207', label: 'قفسه' },
  FREEZER_ICECREAM: { color: '#0891b2', label: 'فریزر بستنی' },
  FRIDGE_CLOSED: { color: '#0f766e', label: 'یخچال بسته' },
  FRIDGE_OPEN: { color: '#14b8a6', label: 'یخچال باز' },
  FRIDGE_SHOWCASE: { color: '#2dd4bf', label: 'ویترین سرد' },
  CASHIER_U: { color: '#e11d48', label: 'صندوق' },
  CHECKOUT: { color: '#fb7185', label: 'مسیر پرداخت' },
  ENTRANCE: { color: '#16a34a', label: 'ورودی / خروجی' },
  BAKERY: { color: '#ea580c', label: 'نان و شیرینی' },
  CUSTOM: { color: '#57534e', label: 'سایر' },
  AISLE: { color: '#b45309', label: 'ردیف قفسه' },
  STORAGE: { color: '#78716c', label: 'انبار' },
  PRODUCE: { color: '#65a30d', label: 'میوه و تره‌بار' },
  DELI: { color: '#b91c1c', label: 'پروتئین' },
  EXIT: { color: '#78716c', label: 'خروجی' },
}

const PRODUCT_KINDS = ['GONDOLA', 'SHELF', 'FREEZER_ICECREAM', 'FRIDGE_CLOSED', 'FRIDGE_OPEN', 'FRIDGE_SHOWCASE', 'BAKERY', 'CUSTOM', 'AISLE', 'STORAGE', 'PRODUCE', 'DELI']

/** دسترسی ستون‌ها/کنترل تاریخ: مدیران + PM (قرارداد B3) */
const COL_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM']

type Pt = [number, number]

function kindOf(k: string) { return KIND_META[k] || KIND_META.CUSTOM }
function respName(r: any): string {
  if (!r) return ''
  if (typeof r === 'string') return r
  return r.name || r.fullName || ''
}
/** تاریخ میل جلالی → متن بلند فارسی: «۲۷ مهر ۱۴۰۵» */
function longFa(dash: string): string {
  const m = String(dash || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return String(dash || '—')
  return `${toFaDigits(Number(m[3]))} ${JALALI_MONTHS[Number(m[2]) - 1] || ''} ${toFaDigits(Number(m[1]))}`
}

/** دهانهٔ درها = یال‌های افقیِ «داخل» کانتور (لبهٔ داخلی چفدورها) با طول واقعی ۱٫۲ تا ۶ متر */
function findDoors(pts: Pt[] | null, W: number, H: number): { x1: number; y: number; x2: number; cx: number; lenP: number; label: string; color: string; hingeW: boolean }[] {
  if (!pts || pts.length < 4) return []
  const epsH = 0.15 * (H / 20.1)
  const epsIn = 0.55 * (H / 20.1)
  const ys = pts.map((p) => p[1])
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const raw: { x1: number; y: number; x2: number; cx: number; lenP: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    if (Math.abs(p[1] - q[1]) > epsH) continue
    const y = (p[1] + q[1]) / 2
    if (y < minY + epsIn || y > maxY - epsIn) continue
    const x1 = Math.min(p[0], q[0])
    const x2 = Math.max(p[0], q[0])
    const lenM = (x2 - x1) * (15.32 / W)
    if (lenM < 1.2 || lenM > 6) continue
    raw.push({ x1, y, x2, cx: (x1 + x2) / 2, lenP: x2 - x1 })
  }
  raw.sort((a, b) => b.cx - a.cx) // شرقی اول (ورودی)
  return raw.map((d, i) => {
    const isEntr = raw.length === 1 ? d.cx > W / 2 : i === 0
    const label = raw.length <= 2 ? (isEntr ? 'ورودی' : 'خروجی') : i === 0 ? 'ورودی' : i === raw.length - 1 ? 'خروجی' : 'در'
    const color = isEntr ? '#059669' : i === raw.length - 1 && raw.length > 2 ? '#b45309' : '#be123c'
    return { ...d, label, color, hingeW: isEntr }
  })
}

export default function LiveboardView() {
  const { user, go } = useShell()
  const CAN_COLS = COL_ROLES.includes(String(user?.role || ''))

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ plan: any; blocks: any[]; zones: any[] } | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [dc, setDc] = useState<{ state: 'idle' | 'loading' | 'open'; todaySlot: number; lines: any[]; all: any[]; todayPlan: any[]; results: any[] }>({ state: 'idle', todaySlot: 0, lines: [], all: [], todayPlan: [], results: [] })
  const selLabelRef = useRef<string>('')

  // کانتور + ستون‌ها (F7)
  const [outline, setOutline] = useState<Pt[] | null>(null)
  const [colBoard, setColBoard] = useState<{ state: 'loading' | 'ready' | 'denied'; sections: any[] }>({ state: 'loading', sections: [] })
  const [cform, setCform] = useState<{ lineId: string; chk: Record<string, 'ok' | 'issues'>; expired: number; nearExpiry: number; fefoOk: boolean; note: string; saving: boolean } | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await api('/api/floorplan-stats')
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت نقشه زنده'); return }
    setData({ plan: r.data.plan || null, blocks: r.data.blocks || [], zones: r.data.zones || [] })
    setSelId(null)
    selLabelRef.current = ''
    setDc({ state: 'idle', todaySlot: 0, lines: [], all: [], todayPlan: [], results: [] })
    void loadOutline()
    void loadColumns()
  }

  /** کانتور واقعی — از نقشه‌ها (همهٔ نقش‌های نقشهٔ زنده مجازند؛ خطا = بی‌کانتور، بی‌سروصدا) */
  async function loadOutline() {
    const r = await api('/api/store/floorplans')
    if (!r.ok) { setOutline(null); return }
    const o = r.data.plans?.[0]?.outlineJson
    setOutline(Array.isArray(o) && o.length >= 4 ? o.map((p: any) => [Number(p[0]), Number(p[1])] as Pt) : null)
  }

  /** ستون‌های چیدمان (B3) — مدیران + PM؛ سایر نقش‌ها: بی‌سروصدا خاموش */
  async function loadColumns() {
    if (!CAN_COLS) { setColBoard({ state: 'denied', sections: [] }); return }
    const r = await api('/api/store/section-columns')
    if (!r.ok) { setColBoard({ state: 'denied', sections: [] }); return }
    setColBoard({ state: 'ready', sections: r.data.sections || [] })
  }

  const plan = data?.plan || { name: '', width: 2840, height: 1540 }
  const blocks = data?.blocks || []
  const zones = data?.zones || []
  const sel = useMemo(() => blocks.find((b) => b.id === selId) || null, [blocks, selId])

  const colMap = useMemo(() => {
    const m = new Map<string, any>()
    if (colBoard.state === 'ready') for (const s of colBoard.sections) m.set(s.blockLabel, s)
    return m
  }, [colBoard])
  const selSection = sel?.label ? colMap.get(sel.label) || null : null

  /* ═══ برنامهٔ کنترل امروز — به تفکیک مسؤول هر بخش (R4-1+9) ═══ */
  const [todayBoard, setTodayBoard] = useState<{ state: 'idle' | 'loading' | 'ready' | 'denied'; plan: any[]; results: any[]; lines: any[] }>({ state: 'idle', plan: [], results: [], lines: [] })
  const [planBump, setPlanBump] = useState(0)
  useEffect(() => {
    if (!CAN_COLS) { setTodayBoard({ state: 'denied', plan: [], results: [], lines: [] }); return }
    let dead = false
    setTodayBoard((t) => (t.state === 'ready' ? t : { ...t, state: 'loading' }))
    void api(`/api/date-checks${qs({ date: todayJalali() })}`).then((r: any) => {
      if (dead) return
      if (!r.ok) { setTodayBoard({ state: 'ready', plan: [], results: [], lines: [] }); return }
      setTodayBoard({ state: 'ready', plan: r.data.todayPlan || [], results: r.data.results || [], lines: r.data.lines || [] })
    })
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [CAN_COLS, planBump])

  /** «هر روز یک ستون از بخشِ هر شخص» — گروه‌بندی بلوک‌های ستون‌دار بر اساس مسؤول */
  const personPlan = useMemo(() => {
    if (todayBoard.state !== 'ready' || colBoard.state !== 'ready') return [] as { person: string; rows: any[] }[]
    const planBy = new Map<string, any>((todayBoard.plan || []).map((p: any) => [p.blockLabel, p]))
    const doneBy = new Map<string, string>()
    for (const rc of todayBoard.results || []) {
      const bl = String(rc.blockLabel || '')
      if (bl && !doneBy.has(bl)) doneBy.set(bl, String(rc.checkerName || ''))
    }
    const groups = new Map<string, { person: string; rows: any[] }>()
    for (const b of blocks) {
      const sec = b.label ? colMap.get(b.label) : null
      if (!sec) continue
      const active = (sec.columns || []).filter((c: any) => c.active)
      if (!active.length) continue
      const person = respName(b.responsible) || 'بدون مسؤول'
      const p = planBy.get(b.label)
      const g = groups.get(person) || { person, rows: [] }
      g.rows.push({
        label: b.label,
        startFrom: p?.startFrom || active[0]?.name || '—',
        suggested: Number(p?.suggested || 0),
        done: doneBy.has(b.label),
        doneBy: doneBy.get(b.label) || '',
      })
      groups.set(person, g)
    }
    return [...groups.values()].sort((a, b) => a.person.localeCompare(b.person, 'fa'))
  }, [todayBoard, colBoard, blocks, colMap])
  const doors = useMemo(() => findDoors(outline, plan.width, plan.height), [outline, plan.width, plan.height])

  const legendKinds = useMemo(() => {
    const seen: string[] = []
    for (const b of blocks) if (!seen.includes(b.kind)) seen.push(b.kind)
    return seen
  }, [blocks])

  const stats = useMemo(() => {
    let products = 0, stock = 0, lowBlocks = 0, productBlocks = 0
    for (const b of blocks) {
      if (PRODUCT_KINDS.includes(b.kind)) productBlocks++
      products += Number(b.productCount || 0)
      stock += Number(b.stockTotal || 0)
      if (Number(b.lowStock || 0) > 0) lowBlocks++
    }
    return { blocks: blocks.length, productBlocks, products, stock, lowBlocks }
  }, [blocks])

  /** فرم کنترل ستون‌ها — با پیش‌انتخابِ پیشنهادِ چرخش (startFrom + suggested) */
  useEffect(() => {
    if (!sel || !selSection || !CAN_COLS) { setCform(null); return }
    const active = (selSection.columns || []).filter((c: any) => c.active)
    const start = selSection.nextStart || active[0]?.name || null
    const tp = (dc.todayPlan || []).find((p: any) => p.blockLabel === sel.label)
    const sug = Math.max(1, Math.min(Number(tp?.suggested ?? 2), active.length))
    const chk: Record<string, 'ok' | 'issues'> = {}
    if (start && active.length) {
      const idx = Math.max(0, active.findIndex((c: any) => c.name === start))
      for (let k = 0; k < sug; k++) chk[active[(idx + k) % active.length].name] = 'ok'
    }
    setCform({ lineId: '', chk, expired: 0, nearExpiry: 0, fefoOk: true, note: '', saving: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.label, selSection, dc.state, CAN_COLS])

  function select(b: any) {
    setSelId((prev) => (prev === b.id ? null : b.id))
    selLabelRef.current = b.label || ''
    setDc((d) => ({ ...d, state: 'idle', lines: [], todayPlan: [], results: [] }))
    if (CAN_COLS && b.label && colMap.get(b.label)) void loadDateChecks(b.label)
  }

  async function loadDateChecks(blockLabel: string) {
    setDc((d) => ({ ...d, state: 'loading' }))
    const r = await api(`/api/date-checks${qs({ date: todayJalali() })}`)
    if (!r.ok) { setDc({ state: 'open', todaySlot: 0, lines: [], all: [], todayPlan: [], results: [] }); return toast.error(r.error || 'خطا در دریافت برنامه کنترل تاریخ') }
    const all = (r.data.lines || []) as any[]
    const label = selLabelRef.current || blockLabel // محافظت از تغییر انتخاب حین دریافت
    const todaySlot = Number(r.data.todaySlot || 0)
    setDc({
      state: 'open',
      todaySlot,
      lines: all.filter((l) => l.blockLabel === label && l.daySlot === todaySlot),
      all: all.filter((l) => l.blockLabel === label),
      todayPlan: r.data.todayPlan || [],
      results: r.data.results || [],
    })
  }

  /** ثبت کنترل ستون‌ها → POST /api/date-checks (ستون‌ها + مکان‌نما در columnsJson) */
  async function submitColumnCheck() {
    if (!sel || !cform) return
    const names = Object.keys(cform.chk)
    if (!names.length) return toast.error('حداقل یک ستون را برای ثبت علامت بزنید')
    const lineOpts = dc.state === 'open' ? dc.all : []
    const effLineId = cform.lineId || lineOpts.find((l) => l.daySlot === dc.todaySlot)?.id || lineOpts[0]?.id || ''
    if (!effLineId) return toast.error('خط کنترل تاریخ این بخش هنوز بارگذاری نشده است — دوباره تلاش کنید')
    const status = Object.values(cform.chk).includes('issues') ? 'issues' : 'ok'
    setCform((f) => (f ? { ...f, saving: true } : f))
    const r = await api('/api/date-checks', {
      method: 'POST',
      body: {
        date: todayJalali(),
        lineId: effLineId,
        status,
        expiredCount: cform.expired,
        nearExpiryCount: cform.nearExpiry,
        fefoOk: cform.fefoOk,
        note: cform.note.trim() || undefined,
        columns: names.map((n) => ({ name: n, status: cform.chk[n] })),
      },
    })
    if (!r.ok) { setCform((f) => (f ? { ...f, saving: false } : f)); return toast.error(r.error || 'ثبت کنترل ستون‌ها ممکن نشد') }
    toast.success(`کنترل ${fa(names.length)} ستون از «${sel.label}» ثبت شد${status === 'issues' ? ' — دارای مشکل' : ''}`)
    if (sel.label) void loadDateChecks(sel.label)
    void loadColumns()
    setPlanBump((x) => x + 1)
  }

  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت نقشه زنده فروشگاه…
      </CardContent></Card>
    )
  }

  if (!blocks.length) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Icon name="store" size={18} /> نقشه زنده فروشگاه</CardTitle></CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-stone-400">نقشه یا بلوکی ثبت نشده است — ابتدا در «نقشه فروشگاه» بلوک‌ها را تعریف کنید</p>
          <div className="text-center"><Button variant="outline" onClick={() => go('store/floorplan')} className="gap-1.5"><I.settings size={15} /> رفتن به نقشه فروشگاه</Button></div>
        </CardContent>
      </Card>
    )
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`
  const polyPts = outline ? outline.map((p) => p.join(',')).join(' ') : ''
  const lineOpts = dc.state === 'open' ? dc.all : []
  const effLineId = (cform?.lineId || lineOpts.find((l) => l.daySlot === dc.todaySlot)?.id || lineOpts[0]?.id || '')
  const todaysChecks = dc.state === 'open' ? dc.results.filter((r: any) => r.blockLabel === sel?.label) : []
  const lastCheck = todaysChecks[0] || null
  const lastCheckCols: string[] = []
  for (const rc of todaysChecks) {
    try {
      for (const c of JSON.parse(rc.columnsJson || '[]') || []) {
        const n = String(c?.name || '')
        if (n && !lastCheckCols.includes(n)) lastCheckCols.push(n)
      }
    } catch { /* columnsJson نامعتبر */ }
  }
  const todayHasIssues = todaysChecks.some((rc: any) => rc.status === 'issues')

  return (
    <div className="space-y-4">
      {/* ═══ سرآیند + آمار ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="store" size={18} /> نقشه زنده فروشگاه
              {plan?.name ? <span className="text-xs font-normal text-stone-400">({plan.name})</span> : null}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5"><I.refresh size={14} /> به‌روزرسانی</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">{fa(stats.blocks)} بلوک</span>
            <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">{fa(stats.productBlocks)} خط کالادار</span>
            <span className="rounded-md bg-teal-50 px-2 py-1 text-teal-700">{fa(stats.products)} کالای پلانوگرام‌شده</span>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">{fa(stats.stock)} موجودی نقشه</span>
            {stats.lowBlocks > 0 && (
              <span className="rounded-md bg-rose-50 px-2 py-1 font-bold text-rose-700">
                <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" /> {fa(stats.lowBlocks)} خط کم‌موجودی
              </span>
            )}
            {outline && <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">کانتور واقعی ثبت‌شده {doors.length ? `· ${fa(doors.length)} در` : ''}</span>}
          </div>

          {/* راهنما + ناحیه‌ها */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {legendKinds.map((k) => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-stone-500">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: kindOf(k).color }} />
                {kindOf(k).label}
              </span>
            ))}
          </div>
          {zones.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {zones.map((z, i) => (
                <span key={`${z.name}-${i}`} className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] text-stone-600">
                  {z.name}
                  {Number(z.pending) > 0 ? ` · در انتظار: ${fa(Number(z.pending))}` : ''}
                  {Number(z.confirmed) > 0 ? ` · تأییدشده: ${fa(Number(z.confirmed))}` : ''}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ برنامهٔ کنترل امروز — به تفکیک مسؤول هر بخش (R4-1+9) ═══ */}
      {CAN_COLS && todayBoard.state !== 'denied' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <I.userCheck size={17} /> برنامهٔ کنترل ستون‌های امروز
              <span className="text-[11px] font-normal text-stone-500">— هر روز یک ستون از بخشِ هر مسؤول نوبتِ چک تاریخ است</span>
              {todayBoard.state === 'loading' && <span className="text-[11px] text-stone-400">در حال دریافت…</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {personPlan.length === 0 ? (
              <p className="text-xs text-stone-500">ستونی برای بخش‌ها ثبت نشده — از «نقشهٔ فروشگاه» ستون‌های چیدمان را تعریف کنید.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {personPlan.map((g) => (
                  <div key={g.person} className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-stone-800">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-[11px] font-black text-white">{fa(g.rows.length)}</span>
                      <span className="truncate">{g.person}</span>
                      <span className="text-[10px] font-normal text-stone-400">بخش‌ها</span>
                    </div>
                    <div className="space-y-1">
                      {g.rows.map((r) => (
                        <div key={r.label} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-stone-800">{r.label}</div>
                            <div className="text-[10px] text-stone-500">شروع از «{r.startFrom}»{r.suggested ? ` · ${fa(r.suggested)} ستون` : ''}</div>
                          </div>
                          {r.done ? (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700" title={r.doneBy}>ثبت شد{r.doneBy ? ` · ${r.doneBy}` : ''}</span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">در انتظار</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="p-3">
            <div className="overflow-x-auto">
              <div
                className="relative min-w-[640px] rounded-xl border border-stone-300 bg-stone-50"
                style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
              >
                {/* کانتور واقعی + درها — زیر بلوک‌ها */}
                {outline && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${plan.width} ${plan.height}`}
                    preserveAspectRatio="none"
                    style={{ fontFamily: 'Vazirmatn, system-ui, sans-serif' }}
                  >
                    <polygon points={polyPts} fill="#ffffff" stroke="#a8a29e" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    {doors.map((d, di) => {
                      const L = d.lenP
                      const hx = d.hingeW ? d.x1 : d.x2
                      const ox = d.hingeW ? d.x2 : d.x1
                      const sweep = d.hingeW ? 1 : 0
                      const fs = Math.min(L * 0.16, plan.width / 38, plan.height / 22)
                      return (
                        <g key={`door-${di}`}>
                          <line x1={d.x1} y1={d.y} x2={d.x2} y2={d.y} stroke={d.color} strokeWidth={2} strokeDasharray="7 6" vectorEffect="non-scaling-stroke" opacity={0.9} />
                          <path d={`M ${hx} ${d.y} L ${hx} ${d.y - L}`} stroke={d.color} strokeWidth={1.6} fill="none" vectorEffect="non-scaling-stroke" />
                          <path d={`M ${hx} ${d.y - L} A ${L} ${L} 0 0 ${sweep} ${ox} ${d.y}`} stroke={d.color} strokeWidth={1} strokeDasharray="5 5" fill="none" opacity={0.7} vectorEffect="non-scaling-stroke" />
                          <text x={d.cx} y={d.y - L * 0.35} textAnchor="middle" fontSize={fs} fontWeight={800} fill={d.color}
                            stroke="#ffffff" strokeWidth={fs / 7} paintOrder="stroke">{d.label}</text>
                        </g>
                      )
                    })}
                  </svg>
                )}

                {blocks.map((b) => {
                  const meta = kindOf(b.kind)
                  const resp = respName(b.responsible)
                  const low = Number(b.lowStock || 0) > 0
                  const isSel = selId === b.id
                  const colN = b.label && colBoard.state === 'ready' ? (colMap.get(b.label)?.columns || []).filter((c: any) => c.active).length : 0
                  return (
                    <button
                      key={b.id}
                      onClick={() => select(b)}
                      className={cn('absolute overflow-hidden rounded-md p-1 text-right text-white transition-shadow hover:shadow-lg', isSel ? 'z-10' : '')}
                      style={{
                        left: pct(b.x, plan.width),
                        top: pct(b.y, plan.height),
                        width: pct(b.w, plan.width),
                        height: pct(b.h, plan.height),
                        background: meta.color,
                        boxShadow: isSel
                          ? '0 0 0 3px #ffffff, 0 0 0 6px #0d9488'
                          : 'inset 0 0 0 1px rgba(255,255,255,.25)',
                        textShadow: '0 1px 2px rgba(0,0,0,.4)',
                      }}
                      title={`${b.label || meta.label}${b.zoneName ? ` — ${b.zoneName}` : ''}${resp ? ` — ${resp}` : ''}${Number(b.productCount || 0) ? ` — ${fa(b.productCount)} کالا / ${fa(b.stockTotal || 0)} موجودی` : ''}${colN ? ` — ${fa(colN)} ستون چیدمان` : ''}`}
                    >
                      {low && <span className="absolute right-1 top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" style={{ boxShadow: '0 0 0 1.5px #fff' }} />}
                      {colN > 0 && (
                        <span className="absolute bottom-0.5 left-1 flex items-center gap-0.5 rounded bg-black/30 px-1 py-[1px] text-[8px] font-bold leading-3 text-white">
                          <I.columns size={9} /> {fa(colN)}
                        </span>
                      )}
                      <div className="truncate text-[10px] font-medium leading-4">{b.label || meta.label}</div>
                      {b.zoneName ? <div className="truncate text-[9px] leading-3 opacity-90">{b.zoneName}</div> : null}
                      {resp ? <div className="truncate text-[9px] leading-3 opacity-80">{resp}</div> : null}
                      {Number(b.productCount || 0) > 0 ? (
                        <div className="truncate text-[9px] leading-3 opacity-75">{fa(b.productCount)} کالا · {fa(b.stockTotal || 0)} عدد</div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-stone-400">روی هر بلوک بزنید تا آمار زنده، پرفروش‌ها و کنترل تاریخ آن خط را ببینید · نقطه سرخ چشمک‌زن = کم‌موجودی · علامت ستون = ستون‌های چیدمان</p>
          </CardContent>
        </Card>

        {/* پنل جزئیات بلوک */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {sel ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: kindOf(sel.kind).color }} />
                  <span className="truncate">{sel.label || kindOf(sel.kind).label}</span>
                </>
              ) : (
                'جزئیات خط'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!sel ? (
              <p className="py-10 text-center text-sm text-stone-400">یک بخش از نقشه را انتخاب کنید</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{kindOf(sel.kind).label}</Badge>
                  {sel.zoneName ? <Badge variant="outline">{sel.zoneName}</Badge> : null}
                  {Number(sel.lowStock || 0) > 0 && <Badge variant="destructive">{fa(sel.lowStock)} کالای کم‌موجودی</Badge>}
                </div>

                {respName(sel.responsible) ? (
                  <div className="text-xs text-stone-500">مسؤول خط: <span className="font-bold text-stone-700">{respName(sel.responsible)}</span></div>
                ) : (
                  <div className="text-xs text-stone-400">مسؤول خط تعیین نشده — از «ارزیابی چیدمان» قابل ثبت است</div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { l: 'کالای پلانوگرام', v: fa(sel.productCount ?? 0) },
                    { l: 'تنوع کالا', v: fa(sel.distinctProducts ?? sel.productCount ?? 0) },
                    { l: 'موجودی کل', v: fa(sel.stockTotal ?? 0) },
                    { l: 'کم‌موجودی', v: fa(sel.lowStock ?? 0), warn: Number(sel.lowStock || 0) > 0 },
                  ].map((s) => (
                    <div key={s.l} className={cn('rounded-lg border p-2 text-center', s.warn ? 'border-rose-300 bg-rose-50' : 'border-stone-200 bg-white')}>
                      <div className={cn('text-lg font-black', s.warn ? 'text-rose-700' : 'text-stone-700')}>{s.v}</div>
                      <div className="text-[10px] text-stone-400">{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* پرفروش‌های خط */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold"><I.trendingUp size={14} /> کالاهای پلانوگرام این خط</div>
                  {(sel.topProducts || []).length === 0 ? (
                    <p className="rounded-lg bg-stone-50 p-2 text-center text-[11px] text-stone-400">پلانوگرامی برای این خط ثبت نشده است</p>
                  ) : (
                    <div className="max-h-52 space-y-1 overflow-y-auto">
                      {(sel.topProducts || []).map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-2 py-1.5">
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{p.name}</span>
                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold', Number(p.stock || 0) <= 5 ? 'bg-rose-50 text-rose-700' : 'bg-stone-100 text-stone-600')}>
                            {fa(p.stock || 0)} عدد
                          </span>
                          <span className="shrink-0 text-[10px] text-stone-400">{money(p.sellPrice)} ریال</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ═══ ستون‌ها و نوبت کنترل تاریخ (F7) ═══ */}
                {selSection && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1 text-xs font-bold text-teal-800"><I.columns size={14} /> ستون‌ها و نوبت کنترل تاریخ</span>
                      <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-teal-700">{fa(selSection.columns.filter((c: any) => c.active).length)} فعال</span>
                      <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-stone-500">پوشش {fa(selSection.coverage ?? 0)}٪</span>
                      <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-stone-500">آخرین کنترل: {selSection.lastCheckedAt ? longFa(selSection.lastCheckedAt) : '—'}</span>
                    </div>

                    {selSection.nextStart && (
                      <div className="mb-1.5 rounded-md border border-teal-300 bg-white px-2 py-1 text-[11px] text-teal-700">
                        شروع چرخش بعدی: <span className="font-bold">«{selSection.nextStart}»</span>
                      </div>
                    )}

                    {dc.state === 'open' && (() => {
                      const tp = (dc.todayPlan || []).find((p: any) => p.blockLabel === sel.label)
                      return tp ? (
                        <div className="mb-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                          برنامه امروز ({longFa(todayJalali())}): شروع از «{tp.startFrom || '—'}» · پیشنهاد: {fa(tp.suggested)} ستون
                        </div>
                      ) : null
                    })()}

                    {lastCheck && (
                      <div className={cn('mb-1.5 rounded-md px-2 py-1 text-[11px]', todayHasIssues ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>
                        امروز ثبت شد: {fa(lastCheckCols.length)} ستون {todayHasIssues ? '· دارای مشکل' : '· سالم'}
                        {lastCheckCols.length ? ` (${lastCheckCols.join('، ')})` : ''}
                      </div>
                    )}

                    {/* فهرست ستون‌ها */}
                    <div className="space-y-1">
                      {(selSection.columns || []).map((c: any) => {
                        const isNext = selSection.nextStart === c.name
                        const checkedToday = lastCheckCols.includes(c.name)
                        return (
                          <div key={c.id} className={cn(
                            'flex items-center justify-between gap-1 rounded-md border px-2 py-1 text-[11px]',
                            isNext ? 'border-teal-300 bg-teal-50' : c.active ? 'border-stone-200 bg-white' : 'border-stone-200 bg-stone-50 opacity-55',
                          )}>
                            <span className={cn('truncate font-bold', isNext ? 'text-teal-700' : 'text-stone-700')}>
                              {c.name}
                              {isNext && <Badge className="mr-1.5 bg-teal-600 text-[9px] text-white hover:bg-teal-600">شروع بعدی</Badge>}
                              {!c.active && <Badge variant="outline" className="mr-1.5 text-[9px]">غیرفعال</Badge>}
                            </span>
                            {checkedToday && <span className="shrink-0 text-[10px] font-bold text-emerald-600">✓ امروز</span>}
                          </div>
                        )
                      })}
                      {(selSection.columns || []).length === 0 && (
                        <p className="rounded-md bg-white p-2 text-center text-[11px] text-stone-400">برای این بخش ستونی تعریف نشده — از «نقشه فروشگاه» قابل تعریف است</p>
                      )}
                    </div>

                    {/* فرم سریع ثبت کنترل ستون‌ها */}
                    {CAN_COLS && cform && (selSection.columns || []).some((c: any) => c.active) && (
                      <div className="mt-2 space-y-2 border-t border-teal-200 pt-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-800"><I.timer size={13} /> ثبت کنترل ستون‌ها</div>

                        {lineOpts.length > 1 && (
                          <Select value={effLineId || undefined} onValueChange={(v: string) => setCform((f) => (f ? { ...f, lineId: v } : f))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="خط ثبت…" /></SelectTrigger>
                            <SelectContent>
                              {lineOpts.map((l) => <SelectItem key={l.id} value={l.id}>{l.label || l.id}{l.daySlot === undefined ? '' : ` (نوبت چرخه: ${fa(l.daySlot)})`}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}

                        <div className="space-y-1">
                          {(selSection.columns || []).filter((c: any) => c.active).map((c: any) => {
                            const st = cform.chk[c.name]
                            return (
                              <div key={c.id} className={cn('flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1', st ? 'border-teal-300 bg-white' : 'border-stone-200 bg-white/70')}>
                                <Checkbox
                                  checked={!!st}
                                  onCheckedChange={(v: boolean) => setCform((f) => {
                                    if (!f) return f
                                    const chk = { ...f.chk }
                                    if (v) chk[c.name] = 'ok'; else delete chk[c.name]
                                    return { ...f, chk }
                                  })}
                                />
                                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-stone-700">{c.name}</span>
                                {st && (
                                  <span className="flex shrink-0 items-center gap-0.5" dir="ltr">
                                    <button
                                      onClick={() => setCform((f) => (f ? { ...f, chk: { ...f.chk, [c.name]: 'ok' } } : f))}
                                      className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold transition', st === 'ok' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500 hover:bg-emerald-50')}
                                    >سالم</button>
                                    <button
                                      onClick={() => setCform((f) => (f ? { ...f, chk: { ...f.chk, [c.name]: 'issues' } } : f))}
                                      className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold transition', st === 'issues' ? 'bg-rose-600 text-white' : 'bg-stone-100 text-stone-500 hover:bg-rose-50')}
                                    >مشکل</button>
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-600">
                          <span className="flex items-center gap-1">منقضی: <Stepper size="sm" value={cform.expired} onChange={(v: number) => setCform((f) => (f ? { ...f, expired: v } : f))} min={0} max={9999} /></span>
                          <span className="flex items-center gap-1">نزدیک انقضا: <Stepper size="sm" value={cform.nearExpiry} onChange={(v: number) => setCform((f) => (f ? { ...f, nearExpiry: v } : f))} min={0} max={9999} /></span>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
                          <Checkbox checked={cform.fefoOk} onCheckedChange={(v: boolean) => setCform((f) => (f ? { ...f, fefoOk: !!v } : f))} />
                          قانون FEFO رعایت شد (نزدیک‌ترین انقضا در جلو)
                        </label>
                        <Input
                          value={cform.note}
                          onChange={(e: any) => setCform((f) => (f ? { ...f, note: e.target.value } : f))}
                          placeholder="یادداشت (اختیاری)" className="h-8 text-xs"
                        />
                        <Button size="sm" className="w-full gap-1.5" disabled={cform.saving || !Object.keys(cform.chk).length || !effLineId} onClick={() => void submitColumnCheck()}>
                          {cform.saving ? <I.loader size={14} className="animate-spin" /> : <I.check size={14} />}
                          ثبت کنترل {fa(Object.keys(cform.chk).length)} ستون
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* اقدام‌ها */}
                <div className="flex flex-wrap gap-1.5 border-t border-stone-200 pt-3">
                  <Button variant="outline" size="sm" onClick={() => go('store/planograms')} className="gap-1.5"><I.package size={14} /> پلانوگرام</Button>
                  <Button variant="outline" size="sm" onClick={() => go('store/reviews')} className="gap-1.5"><I.clipboard size={14} /> ارزیابی چیدمان</Button>
                  <Button variant="secondary" size="sm" disabled={dc.state === 'loading'} onClick={() => sel.label && void loadDateChecks(sel.label)} className="gap-1.5">
                    {dc.state === 'loading' ? <I.loader size={14} className="animate-spin" /> : <I.timer size={14} />} کنترل تاریخ این خط
                  </Button>
                </div>

                {dc.state === 'open' && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50 p-2">
                    <div className="mb-1 text-[11px] font-bold text-teal-700">خطوط کنترل تاریخ امروز ({longFa(todayJalali())})</div>
                    {dc.lines.length === 0 ? (
                      <p className="text-[11px] leading-5 text-stone-500">امروز در چرخه ۲۸روزه، خطی از این بلوک نوبت کنترل تاریخ نیست.</p>
                    ) : (
                      <div className="space-y-1">
                        {dc.lines.map((l) => (
                          <div key={l.id} className="rounded-md bg-white px-2 py-1 text-[11px]">
                            <span className="font-bold">{l.label || l.id}</span>
                            <span className="text-stone-400"> · نوبت چرخه: روز {fa(l.daySlot || 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
