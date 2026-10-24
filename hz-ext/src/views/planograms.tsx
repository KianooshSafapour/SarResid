import { useState, useEffect, useMemo, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Progress, fa, money, toFaDigits, toEnDigits, formatJalali, Icon, I } from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════
   store/planograms — «پلانوگرام قفسه‌ها» (R7)
   هر پلانوگرام به یک بخش فروشگاه (بلوک نقشه) متصل است:
   ۱) از نقشه فروشگاه: انتخاب بخش → دکمهٔ «پلانوگرام برای این بخش» → این صفحه با ?section=
   ۲) از خود این صفحه: دکمهٔ «پلانوگرام جدید» → انتخاب بخش در فرم
   ویرایشگر چیدمان: هر خانه = یک کالا (انتخاب با جستجو)، ذخیرهٔ زنده.
   ═══════════════════════════════════════════════════════════════ */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'پیش‌نویس', cls: 'border-stone-300 bg-stone-100 text-stone-600' },
  PUBLISHED: { label: 'منتشرشده', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  DONE: { label: 'اجرا شد', cls: 'border-teal-300 bg-teal-50 text-teal-700' },
  ARCHIVE: { label: 'بایگانی', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
}

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM']

export default function PlanogramsView() {
  const { user, go } = useShell()
  const canEdit = user ? MANAGER_ROLES.includes(user.role) : false

  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<any[]>([])
  const [sections, setSections] = useState<{ label: string; zone: string | null }[]>([])
  const [secFilter, setSecFilter] = useState('all')

  /* دیالوگ جدید */
  const [newOpen, setNewOpen] = useState(false)
  const [nf, setNf] = useState({ name: '', section: '', rows: '4', cols: '6' })
  const [creating, setCreating] = useState(false)

  /* ویرایشگر */
  const [ed, setEd] = useState<{ id: string; name: string; section: string | null; rows: number; cols: number; status: string } | null>(null)
  const [layout, setLayout] = useState<string[][]>([])
  const [prodMap, setProdMap] = useState<Record<string, any>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pick, setPick] = useState<{ r: number; c: number } | null>(null)
  const [pq, setPq] = useState('')
  const [pResults, setPResults] = useState<any[] | null>(null)
  const [pSearching, setPSearching] = useState(false)
  const [delConfirm, setDelConfirm] = useState<string | null>(null)
  const searchTimer = useMemo(() => ({ current: undefined as any }), [])

  /* ?section= از نقشه → باز شدن خودکار فرم جدید با همان بخش */
  useEffect(() => {
    const read = () => {
      const m = /[?&]section=([^&]+)/.exec(location.hash)
      if (m) {
        const sec = decodeURIComponent(m[1])
        setNf((f) => ({ ...f, section: sec }))
        setNewOpen(true)
        setSecFilter(sec)
      }
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  async function load() {
    setLoading(true)
    const [pg, fp] = await Promise.all([api('/api/store/planograms'), api('/api/store/floorplans')])
    if (pg.ok) setPlans(pg.data.planograms || [])
    else toast.error(pg.error || 'خطا در دریافت پلانوگرام‌ها')
    if (fp.ok) {
      const plan = (fp.data.plans || [])[0]
      const blocks = (plan?.blocks || []).filter((b: any) => b.label && !['ENTRANCE', 'EXIT', 'WALL'].includes(b.kind || ''))
      // فقط بخش‌های قفسه‌ای (گوندولا/يخچال/...) — هر برچسب یک‌بار
      const seen = new Set<string>()
      const secs: { label: string; zone: string | null }[] = []
      for (const b of blocks) {
        if (seen.has(b.label)) continue
        seen.add(b.label)
        secs.push({ label: b.label, zone: b.zoneName || null })
      }
      setSections(secs)
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const sectionName = (lbl: string | null | undefined) => lbl || 'بدون بخش'
  const zoneOf = (lbl: string | null | undefined) => sections.find((s) => s.label === lbl)?.zone || null

  const filtered = useMemo(
    () => secFilter === 'all' ? plans : plans.filter((p) => (p.blockLabel || '') === secFilter),
    [plans, secFilter],
  )

  /* ── ساخت پلانوگرام جدید ── */
  async function create() {
    if (nf.name.trim().length < 2) return toast.error('نام پلانوگرام را وارد کنید')
    if (!nf.section) return toast.error('بخش فروشگاه را انتخاب کنید — هر پلانوگرام باید به یک بخش متصل باشد')
    const rows = Math.max(1, Math.min(12, Math.round(Number(toEnDigits(nf.rows)) || 4)))
    const cols = Math.max(1, Math.min(24, Math.round(Number(toEnDigits(nf.cols)) || 6)))
    setCreating(true)
    const r = await api('/api/store/planograms', {
      method: 'POST',
      body: { name: nf.name.trim(), blockLabel: nf.section, rows, cols },
    })
    setCreating(false)
    if (!r.ok) return toast.error(r.error || 'ثبت ناموفق بود')
    toast.success(`پلانوگرام «${nf.name.trim()}» برای بخش ${nf.section} ساخته شد`)
    setNewOpen(false)
    setNf({ name: '', section: '', rows: '4', cols: '6' })
    await load()
    void openEditor(r.data.id)
  }

  /* ── ویرایشگر ── */
  async function openEditor(id: string) {
    const r = await api(`/api/store/planograms/${id}`)
    if (!r.ok) return toast.error(r.error || 'دریافت پلانوگرام ناموفق بود')
    const p = r.data.planogram
    const map: Record<string, any> = {}
    for (const pr of r.data.products || []) map[pr.id] = pr
    setEd({ id: p.id, name: p.name, section: p.blockLabel, rows: p.rows, cols: p.cols, status: p.status })
    setLayout(p.layout || [])
    setProdMap(map)
    setDirty(false)
    setPResults(null)
    setPq('')
  }

  async function saveLayout() {
    if (!ed) return
    setSaving(true)
    const r = await api(`/api/store/planograms/${ed.id}`, { method: 'PATCH', body: { layout } })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره ناموفق بود')
    toast.success('چیدمان ذخیره شد')
    setDirty(false)
    void load()
  }

  async function setStatus(id: string, action: 'publish' | 'unpublish' | 'archive' | 'restore' | 'done', msg: string) {
    const r = await api(`/api/store/planograms/${id}`, { method: 'PATCH', body: { status: action } })
    if (!r.ok) return toast.error(r.error || 'تغییر وضعیت ناموفق بود')
    toast.success(msg)
    void load()
    if (ed?.id === id) void openEditor(id)
  }

  async function duplicate(id: string) {
    const r = await api('/api/store/planograms', { method: 'POST', body: { duplicateOf: id } })
    if (!r.ok) return toast.error(r.error || 'کپی ناموفق بود')
    toast.success('کپی ساخته شد')
    void load()
  }

  async function remove(id: string) {
    const r = await api(`/api/store/planograms/${id}`, { method: 'DELETE' })
    setDelConfirm(null)
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success('پلانوگرام حذف شد')
    if (ed?.id === id) setEd(null)
    void load()
  }

  /* تغییر بخش متصل (بدون خروج از ویرایشگر) */
  async function changeSection(newSec: string) {
    if (!ed) return
    const r = await api(`/api/store/planograms/${ed.id}`, { method: 'PATCH', body: { blockLabel: newSec } })
    if (!r.ok) return toast.error(r.error || 'تغییر بخش ناموفق بود')
    setEd({ ...ed, section: newSec })
    toast.success(`بخش پلانوگرام به «${newSec}» تغییر کرد`)
    void load()
  }

  /* جستجوی کالا برای خانهٔ انتخابی */
  function onProductQuery(v: string) {
    setPq(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const t = toEnDigits(v).trim()
    if (t.length < 2) { setPResults(null); return }
    setPSearching(true)
    searchTimer.current = setTimeout(async () => {
      const r = await api('/api/products/search' + qs({ q: t, limit: 12 }))
      setPSearching(false)
      if (r.ok) setPResults(r.data?.products || [])
      else setPResults([])
    }, 300)
  }

  function setCell(r: number, c: number, productId: string | null, prod?: any) {
    if (prod) setProdMap((m) => ({ ...m, [prod.id]: prod }))
    setLayout((L) => L.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? (productId || '') : cell) : row))
    setDirty(true)
    setPick(null)
    setPq('')
    setPResults(null)
  }

  const filledCount = useMemo(() => layout.flat().filter(Boolean).length, [layout])
  const totalCells = ed ? ed.rows * ed.cols : 0

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Icon name="package" size={18} /> پلانوگرام قفسه‌ها
            <span className="text-xs font-normal text-stone-400">نقشهٔ چیدمان کالا روی هر بخش — هر پلانوگرام به یک بخش فروشگاه متصل است</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select dir="rtl" value={secFilter} onValueChange={setSecFilter}>
              <SelectTrigger className="w-56 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ بخش‌ها ({toFaDigits(plans.length)} پلانوگرام)</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.label} value={s.label}>
                    {s.label}{s.zone ? ` — زون ${s.zone}` : ''} ({toFaDigits(plans.filter((p) => (p.blockLabel || '') === s.label).length)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-stone-400">
              {toFaDigits(filtered.length)} پلانوگرام · {toFaDigits(sections.length)} بخش روی نقشه
            </span>
            {canEdit && (
              <Button className="mr-auto gap-1.5" onClick={() => setNewOpen(true)}>
                <I.plus size={15} /> پلانوگرام جدید
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-400"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال بارگذاری…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-stone-400">
              برای این بخش پلانوگرامی ثبت نشده است.
              {canEdit && secFilter !== 'all' && (
                <div className="mt-3">
                  <Button size="sm" className="gap-1.5" onClick={() => { setNf((f) => ({ ...f, section: secFilter })); setNewOpen(true) }}>
                    <I.plus size={14} /> پلانوگرام برای بخش {secFilter}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => {
                const st = STATUS_META[p.status] ?? STATUS_META.DRAFT
                const zone = zoneOf(p.blockLabel)
                return (
                  <Card key={p.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold">{p.name}</h3>
                        {/* بخش متصل — با پررنگی و زون */}
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-stone-500">
                          <span className="rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-bold text-teal-700">{sectionName(p.blockLabel)}</span>
                          {zone && <span className="text-[10px]">زون {zone}</span>}
                          <span className="num">· {toFaDigits(p.rows)}×{toFaDigits(p.cols)}</span>
                        </p>
                      </div>
                      <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-stone-500">سلامت پرشدن</span>
                        <span className="num font-bold">{toFaDigits(p.fillHealth)}٪</span>
                      </div>
                      <Progress value={p.fillHealth} />
                    </div>
                    <p className="mt-2 text-[11px] text-stone-400 num">آخرین تغییر: {toFaDigits(formatJalali(new Date(p.updatedAt)))}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => void openEditor(p.id)}>ویرایش چیدمان</Button>
                      {canEdit && (
                        <>
                          <Button size="sm" variant="outline" title="کپی" onClick={() => void duplicate(p.id)}><I.copy size={14} /></Button>
                          {p.status !== 'PUBLISHED' ? (
                            <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700" title="انتشار برای تیم چیدمان" onClick={() => void setStatus(p.id, 'publish', 'منتشر شد')}>انتشار</Button>
                          ) : (
                            <Button size="sm" variant="outline" className="gap-1" title="بازگشت به پیش‌نویس" onClick={() => void setStatus(p.id, 'unpublish', 'به پیش‌نویس برگشت')}>لغو انتشار</Button>
                          )}
                          <Button size="sm" variant="outline" className="text-rose-700 hover:bg-rose-50" title="حذف" onClick={() => setDelConfirm(p.id)}><I.trash size={14} /></Button>
                        </>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ دیالوگ پلانوگرام جدید — انتخاب بخش الزامی ═══ */}
      <Dialog open={newOpen} onOpenChange={(o: boolean) => { setNewOpen(o); if (!o) setNf({ name: '', section: '', rows: '4', cols: '6' }) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>پلانوگرام جدید</DialogTitle>
            <DialogDescription>هر پلانوگرام باید به یک بخش فروشگاه (روی نقشه) متصل باشد</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-500">نام پلانوگرام <span className="text-destructive">*</span></label>
              <Input value={nf.name} onChange={(e: any) => setNf({ ...nf, name: e.target.value })} placeholder="مثلاً: گوندولا ۵ — تنقلات" maxLength={80} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-500">بخش فروشگاه (روی نقشه) <span className="text-destructive">*</span></label>
              <Select dir="rtl" value={nf.section} onValueChange={(v: string) => setNf({ ...nf, section: v })}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="بخش را انتخاب کنید…" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.label} value={s.label}>
                      {s.label}{s.zone ? ` — زون ${s.zone}` : ''}
                      {plans.some((p) => (p.blockLabel || '') === s.label) ? ' ✓' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-stone-400">✓ = این بخش قبلاً پلانوگرام دارد</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-500">تعداد طبقه (ردیف)</label>
                <Input dir="ltr" inputMode="numeric" className="num text-center" value={nf.rows} onChange={(e: any) => setNf({ ...nf, rows: toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 2) })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-500">تعداد خانه در طبقه (ستون)</label>
                <Input dir="ltr" inputMode="numeric" className="num text-center" value={nf.cols} onChange={(e: any) => setNf({ ...nf, cols: toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 2) })} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewOpen(false)}>انصراف</Button>
            <Button disabled={creating} className="gap-1.5" onClick={() => void create()}>
              {creating ? <I.loader size={15} className="animate-spin" /> : <I.plus size={15} />} ساخت و شروع چیدمان
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ ویرایشگر چیدمان ═══ */}
      <Dialog open={!!ed} onOpenChange={(o: boolean) => { if (!o && dirty && !window.confirm('تغییرات ذخیره نشده — بستن؟')) return; if (!o) setEd(null) }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          {ed && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <I.layoutGrid size={18} /> {ed.name}
                  <Badge variant="outline" className={(STATUS_META[ed.status] ?? STATUS_META.DRAFT).cls}>{(STATUS_META[ed.status] ?? STATUS_META.DRAFT).label}</Badge>
                </DialogTitle>
                <DialogDescription>
                  {toFaDigits(ed.rows)} طبقه × {toFaDigits(ed.cols)} خانه · {toFaDigits(filledCount)} خانه پر ({totalCells ? toFaDigits(Math.round((filledCount / totalCells) * 100)) : '۰'}٪)
                </DialogDescription>
              </DialogHeader>

              {/* بخش متصل — قابل تغییر */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <span className="text-xs font-bold text-stone-500">بخش متصل:</span>
                <Select dir="rtl" value={ed.section || ''} onValueChange={(v: string) => void changeSection(v)}>
                  <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.label} value={s.label}>{s.label}{s.zone ? ` — زون ${s.zone}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dirty && <span className="mr-auto text-[11px] font-bold text-amber-600">● تغییرات ذخیره نشده</span>}
              </div>

              {/* شبکهٔ چیدمان — طبقهٔ ۱ از بالا */}
              <div className="space-y-1.5">
                {layout.map((row, ri) => (
                  <div key={ri} className="flex items-center gap-1.5">
                    <span className="w-10 shrink-0 text-center text-[10px] font-bold text-stone-400">طبقهٔ {toFaDigits(ed.rows - ri)}</span>
                    <div className="flex flex-1 gap-1.5">
                      {row.map((cell, ci) => {
                        const p = cell ? prodMap[cell] : null
                        return (
                          <button
                            key={ci} type="button"
                            onClick={() => { setPick({ r: ri, c: ci }); setPq(''); setPResults(null) }}
                            className={cn(
                              'group relative min-h-14 flex-1 rounded-lg border p-1.5 text-[10px] leading-4 transition-colors',
                              p ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-500' : 'border-dashed border-stone-300 bg-white text-stone-300 hover:border-stone-400',
                              pick?.r === ri && pick?.c === ci && 'ring-2 ring-emerald-500',
                            )}
                            title={p ? `${p.name} — کلیک برای تغییر` : 'کلیک برای انتخاب کالا'}
                          >
                            {p ? (
                              <>
                                <span className="line-clamp-3 font-bold">{p.name}</span>
                                {p.sellPrice ? <span className="num mt-0.5 block text-[9px] text-emerald-600">{money(p.sellPrice)} ریال</span> : null}
                                <span
                                  className="absolute -top-1.5 -left-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 group-hover:flex"
                                  role="button" aria-label={`خالی کردن ${p.name}`}
                                  onClick={(e) => { e.stopPropagation(); setCell(ri, ci, null) }}
                                >×</span>
                              </>
                            ) : <span className="text-stone-300">+</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* انتخاب کالا برای خانهٔ فعال */}
              {pick && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800">
                      انتخاب کالا برای طبقهٔ {toFaDigits(ed.rows - pick.r)} — خانهٔ {toFaDigits(pick.c + 1)}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setPick(null)}>بستن</Button>
                  </div>
                  <Input
                    autoFocus value={pq}
                    onChange={(e: any) => onProductQuery(e.target.value)}
                    placeholder="نام یا بارکد کالا… (حداقل ۲ نویسه)"
                    className="bg-white"
                  />
                  {pSearching && <p className="mt-2 text-xs text-stone-400"><I.loader size={13} className="ml-1 inline animate-spin" /> جستجو…</p>}
                  {pResults && pResults.length === 0 && !pSearching && <p className="mt-2 text-xs text-stone-400">کالایی یافت نشد</p>}
                  {pResults && pResults.length > 0 && (
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pl-1">
                      {pResults.map((p) => (
                        <button
                          key={p.id} type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-right text-xs hover:border-emerald-400 hover:bg-emerald-50"
                          onClick={() => setCell(pick.r, pick.c, p.id, p)}
                        >
                          <span className="font-bold">{p.name}</span>
                          <span className="num shrink-0 text-[10px] text-stone-400" dir="ltr">
                            {p.sellPrice ? money(p.sellPrice) : ''} {p.unit || ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2">
                <div className="mr-auto flex gap-1.5">
                  {ed.status !== 'PUBLISHED' && (
                    <Button variant="outline" size="sm" className="gap-1.5 border-emerald-300 text-emerald-700" onClick={() => void setStatus(ed.id, 'publish', 'برای تیم چیدمان منتشر شد')}><I.check size={14} /> انتشار</Button>
                  )}
                  {ed.status === 'PUBLISHED' && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void setStatus(ed.id, 'done', 'اجرای پلانوگرام تکمیل شد')}><I.checkCheck size={14} /> اجرا شد</Button>
                  )}
                </div>
                <Button variant="outline" onClick={() => setEd(null)}>بستن</Button>
                <Button disabled={saving || !dirty} className="gap-1.5" onClick={() => void saveLayout()}>
                  {saving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیرهٔ چیدمان
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* حذف */}
      <Dialog open={!!delConfirm} onOpenChange={(o: boolean) => !o && setDelConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف پلانوگرام</DialogTitle>
            <DialogDescription>این پلانوگرام برای همیشه حذف می‌شود — مطمئن هستید؟</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDelConfirm(null)}>انصراف</Button>
            <Button variant="destructive" className="gap-1.5" onClick={() => delConfirm && void remove(delConfirm)}><I.trash size={14} /> بله، حذف کن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
