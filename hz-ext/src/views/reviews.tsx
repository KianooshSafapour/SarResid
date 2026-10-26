import { useState, useEffect, useMemo, api, qs, useShell, toast, cn, Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, money, fa, todayJalali, formatJalaliLong, addJalaliDays, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   store/reviews — ارزیابی چیدمان و عملکرد (۴ شاخص علمی)
   ۱) تاریخ تولید/انقضا و FEFO   ۲) نظم چیدمان
   ۳) نظافت                       ۴) برچسب و قیمت
   ───────────────────────────────────────────────────────────── */

const PARAMS = [
  { key: 'dateScore', label: 'تاریخ تولید/انقضا — نزدیک‌انقضا در جلو (FEFO)', hint: 'کالاهای نزدیک‌تر به انقضا جلوی کالاهای جدیدتر قرار گیرند' },
  { key: 'layoutScore', label: 'نظم و ترتیب چیدمان', hint: 'ردیف‌ها مرتب، هم‌جهت و بدون جاافتادگی' },
  { key: 'cleanScore', label: 'نظافت', hint: 'بدون گرد روی کالا، خط و کف پاکیزه' },
  { key: 'labelScore', label: 'برچسب و قیمت', hint: 'جلوی هر ردیف محصول، برچسب قیمت موجود' },
] as const

const AVATARS: Record<string, string> = { dateScore: '📅', layoutScore: '🧱', cleanScore: '🧼', labelScore: '🏷' }

export default function ReviewsView() {
  const { user, go } = useShell()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [meta, setMeta] = useState<{ blocks: any[]; staff: any[]; reviews: any[] }>({ blocks: [], staff: [], reviews: [] })
  const [blockLabel, setBlockLabel] = useState('')
  const [reviews, setReviews] = useState<any[]>([])
  const [form, setForm] = useState({ staffId: '', staffName: '', dateScore: 3, layoutScore: 3, cleanScore: 3, labelScore: 3, note: '', points: '' })
  const [filterStaff, setFilterStaff] = useState('all')

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await api('/api/section-reviews')
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت داده‌ها'); return }
    setMeta(r.data)
    if (r.data.blocks?.length) setBlockLabel(r.data.blocks[0].label)
  }

  const selectedBlock = useMemo(() => meta.blocks.find((b) => b.label === blockLabel), [meta.blocks, blockLabel])
  const total = form.dateScore + form.layoutScore + form.cleanScore + form.labelScore
  const history = useMemo(
    () => (reviews || meta.reviews || []).filter((rv) => filterStaff === 'all' || rv.staffName === filterStaff).slice(0, 60),
    [reviews, meta.reviews, filterStaff],
  )
  const avgByParam = useMemo(() => {
    if (!history.length) return null
    const n = history.length
    return {
      dateScore: history.reduce((s: number, r: any) => s + (r.dateScore || 0), 0) / n,
      layoutScore: history.reduce((s: number, r: any) => s + (r.layoutScore || 0), 0) / n,
      cleanScore: history.reduce((s: number, r: any) => s + (r.cleanScore || 0), 0) / n,
      labelScore: history.reduce((s: number, r: any) => s + (r.labelScore || 0), 0) / n,
    }
  }, [history])

  async function saveResponsible(name: string, id: string) {
    if (!selectedBlock) return
    const plans = await api('/api/store/floorplans')
    if (!plans.ok) { toast.error(plans.error || 'نقشه یافت نشد'); return }
    const plan = plans.data.plans?.[0]
    if (!plan) { toast.error('نقشه‌ای ثبت نشده است'); return }
    const blocks = plan.blocks.map((b: any) =>
      b.label === selectedBlock.label ? { ...b, meta: { ...(b.meta || {}), responsible: { id, name } } } : b,
    )
    const upd = await api(`/api/store/floorplans/${plan.id}`, { method: 'PATCH', body: { blocks } })
    if (!upd.ok) { toast.error(upd.error || 'ذخیره مسؤول خط خوش نشد'); return }
    setForm((f) => ({ ...f, staffId: id, staffName: name }))
    toast.success(`مسؤول «${selectedBlock.label}»: ${name}`)
  }

  async function submit() {
    if (!blockLabel) return toast.error('خط را انتخاب کنید')
    if (!form.staffId && !form.staffName) return toast.error('مسؤول خط را انتخاب کنید')
    setSaving(true)
    const r = await api('/api/section-reviews', {
      method: 'POST',
      body: {
        date: todayJalali(),
        blockLabel,
        staffId: form.staffId || null,
        staffName: form.staffName || null,
        dateScore: form.dateScore,
        layoutScore: form.layoutScore,
        cleanScore: form.cleanScore,
        labelScore: form.labelScore,
        note: form.note || null,
        points: form.points === '' ? null : Number(form.points),
      },
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت نشد')
    toast.success(`ارزیابی «${blockLabel}» ثبت شد — امتیاز ${fa(total * 5)}`)
    setReviews([r.data.review, ...reviews])
    setForm((f) => ({ ...f, note: '', points: '' }))
  }

  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت نقشه و ارزیابی‌ها…
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* خط‌های فروشگاه — چیپ‌ها */}
      <Card data-tour="page">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Icon name="store" size={18} /> ارزیابی چیدمان خط‌ها</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {meta.blocks.length === 0 && <span className="text-sm text-stone-500">خطی برای ارزیابی تعریف نشده — ابتدا نقشه فروشگاه را کامل کنید</span>}
            {meta.blocks.map((b) => (
              <button
                key={b.label}
                onClick={() => { setBlockLabel(b.label); setForm((f) => ({ ...f, staffId: '', staffName: '' })) }}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                  blockLabel === b.label ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-emerald-400',
                )}
              >
                {b.label}
                {b.zone ? <span className={cn('mr-1', blockLabel === b.label ? 'text-emerald-100' : 'text-stone-400')}> · {b.zone}</span> : null}
              </button>
            ))}
          </div>

          {selectedBlock && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{selectedBlock.kind}</Badge>
                <span className="text-sm text-stone-500">مسؤول خط:</span>
                <Select value={form.staffName || undefined} onValueChange={(v: string) => {
                  const st = meta.staff.find((s) => s.fullName === v)
                  if (st) void saveResponsible(st.fullName, st.id)
                }}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="انتخاب مسؤول خط…" /></SelectTrigger>
                  <SelectContent>
                    {meta.staff.map((s) => (
                      <SelectItem key={s.id} value={s.fullName}>{s.honorific} {s.fullName} — {s.title || ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {PARAMS.map((p) => (
                  <div key={p.key} className="rounded-lg border border-stone-200 bg-white p-3">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-stone-700">{AVATARS[p.key]} {p.label}</span>
                      <span className={cn('text-lg font-bold', (form as any)[p.key] >= 4 ? 'text-emerald-600' : (form as any)[p.key] >= 3 ? 'text-teal-600' : (form as any)[p.key] >= 2 ? 'text-amber-600' : 'text-rose-600')}>
                        {fa((form as any)[p.key])} <span className="text-xs font-normal text-stone-400">/ ۵</span>
                      </span>
                    </div>
                    <p className="mb-2 text-[11px] leading-4 text-stone-400">{p.hint}</p>
                    <input
                      type="range" min={0} max={5} step={1} value={(form as any)[p.key]}
                      onChange={(e) => setForm((f) => ({ ...f, [p.key]: Number(e.target.value) } as any))}
                      className="w-full accent-[#0e7a4a]"
                      aria-label={p.label}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                  <label className="mb-1 block text-xs text-stone-500">یادداشت ارزیاب</label>
                  <Textarea rows={2} value={form.note} onChange={(e: any) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="نکته‌ای درباره چیدمان این خط…" />
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-xs text-stone-500">امتیاز تشویقی (اختیاری)</label>
                  <Input inputMode="numeric" value={form.points} onChange={(e: any) => setForm((f) => ({ ...f, points: e.target.value }))} placeholder="خودکار" />
                </div>
                <div className="text-center">
                  <div className="text-xs text-stone-500">امتیاز کل</div>
                  <div className="text-2xl font-black text-emerald-700">{fa(total * 5)}</div>
                  <div className="text-[10px] text-stone-400">از ۱۰۰</div>
                </div>
                <Button disabled={saving} onClick={() => void submit()} className="gap-2">
                  {saving ? <I.loader size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
                  ثبت ارزیابی
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* تاریخچه */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><Icon name="history" size={18} /> تاریخچه ارزیابی‌ها</CardTitle>
            <Select value={filterStaff} onValueChange={setFilterStaff}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه مسؤولان</SelectItem>
                {meta.staff.map((s) => <SelectItem key={s.id} value={s.fullName}>{s.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {avgByParam && (
            <div className="mt-2 flex flex-wrap gap-2">
              {PARAMS.map((p) => (
                <span key={p.key} className="rounded-md bg-stone-100 px-2 py-1 text-[11px] text-stone-600">
                  {AVATARS[p.key]} میانگین {fa(Math.round((avgByParam as any)[p.key] * 10) / 10)}
                </span>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">هنوز ارزیابی‌ای ثبت نشده است</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">خط</TableHead>
                    <TableHead className="text-right">مسؤول</TableHead>
                    <TableHead className="text-center">تاریخ</TableHead>
                    <TableHead className="text-center">چیدمان</TableHead>
                    <TableHead className="text-center">نظافت</TableHead>
                    <TableHead className="text-center">برچسب</TableHead>
                    <TableHead className="text-center">امتیاز</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((rv) => (
                    <TableRow key={rv.id}>
                      <TableCell className="text-xs text-stone-500">{rv.date}</TableCell>
                      <TableCell className="text-xs font-medium">{rv.blockLabel}</TableCell>
                      <TableCell className="text-xs">{rv.staffName || '—'}</TableCell>
                      {[rv.dateScore, rv.layoutScore, rv.cleanScore, rv.labelScore].map((s: number, i: number) => (
                        <TableCell key={i} className="text-center">
                          <span className={cn('inline-block rounded px-1.5 py-0.5 text-xs font-bold', s >= 4 ? 'bg-emerald-100 text-emerald-700' : s >= 3 ? 'bg-teal-100 text-teal-700' : s >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')}>{fa(s)}</span>
                        </TableCell>
                      ))}
                      <TableCell className="text-center text-sm font-bold text-emerald-700">{fa(rv.points ?? (rv.dateScore + rv.layoutScore + rv.cleanScore + rv.labelScore) * 5)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
