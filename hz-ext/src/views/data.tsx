import {
  useState, useEffect,
  api, toast, cn,
  Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle,
  Badge, Checkbox,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  formatJalali, toFaDigits, fa,
  I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   system/data — پشتیبان و بازنشانی داده (R4-7)
   یک صفحه فشرده: بنر چرخه کار + خلاصه وضعیت فعلی + ساخت نسخه
   + فهرست نسخه‌ها با بازنشانی دومرحله‌ای و حذف
   ───────────────────────────────────────────────────────────── */

const KIND_META: Record<string, { label: string; cls: string }> = {
  MANUAL: { label: 'دستی', cls: 'border-teal-300 bg-teal-50 text-teal-800' },
  BASELINE: { label: 'پایه', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  PRE_IMPORT: { label: 'پیش از درون‌ریزی', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
}

const TABLE_LABELS: Record<string, string> = {
  product: 'کالا',
  supplier: 'تأمین‌کننده',
  order: 'سفارش',
  orderItem: 'قلم سفارش',
  cheque: 'چک',
  payment: 'پرداخت',
  paymentPlan: 'برنامه پرداخت',
  returnRequest: 'مرجوعی',
  customer: 'مشتری',
  personnel: 'پرسنل',
  task: 'وظیفه',
  holiday: 'تعطیلات',
  setting: 'تنظیمات',
}

function kindMeta(kind: string) {
  return KIND_META[kind] || { label: kind, cls: 'border-stone-300 bg-stone-100 text-stone-600' }
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** «۱۴۰۵/۰۷/۲۸ · ۱۴:۳۰» با ارقام فارسی و ممیز */
function whenFa(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${toFaDigits(formatJalali(d).replace(/-/g, '/'))} · ${toFaDigits(pad2(d.getHours()))}:${toFaDigits(pad2(d.getMinutes()))}`
}

function sizeFa(bytes: number): string {
  const kb = bytes / 1024
  if (kb >= 1024) return `${fa((kb / 1024).toFixed(1))} مگابایت`
  return `${fa(Math.max(1, Math.round(kb)))} کیلوبایت`
}

type Snapshot = {
  id: string
  name: string
  note: string
  kind: string
  tableCount: number
  rowCount: number
  sizeBytes: number
  createdBy: string
  createdAt: string
}

export default function DataSnapshotView() {
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [summary, setSummary] = useState<any>(null)

  /* فرم ساخت نسخه */
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState('MANUAL')
  const [creating, setCreating] = useState(false)

  /* دیالوگ بازنشانی دومرحله‌ای */
  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null)
  const [restoreAck, setRestoreAck] = useState(false)
  const [restoring, setRestoring] = useState(false)

  /* حذف */
  const [deletingId, setDeletingId] = useState('')

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await api('/api/admin/snapshot')
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری نسخه‌های پشتیبان ناموفق بود'); return }
    setSnapshots(r.data?.snapshots || [])
    setSummary(r.data?.summary || null)
  }

  async function submitCreate() {
    if (name.trim().length < 2) return toast.error('نام نسخه را وارد کنید (حداقل ۲ نویسه)')
    setCreating(true)
    const r = await api('/api/admin/snapshot', { method: 'POST', body: { name: name.trim(), note: note.trim(), kind } })
    setCreating(false)
    if (!r.ok) return toast.error(r.error || 'ساخت نسخه پشتیبان ناموفق بود')
    toast.success(`نسخه «${r.data?.name}» ساخته شد — ${fa(r.data?.rowCount ?? 0)} ردیف در ${fa(r.data?.tableCount ?? 0)} جدول`)
    setName(''); setNote(''); setKind('MANUAL')
    void load()
  }

  async function submitRestore() {
    if (!restoreTarget) return
    setRestoring(true)
    const r = await api(`/api/admin/snapshot/${restoreTarget.id}/restore`, { method: 'POST' })
    setRestoring(false)
    if (!r.ok) return toast.error(r.error || 'بازنشانی ناموفق بود')
    toast.success(`بازنشانی «${restoreTarget.name}» انجام شد — ${fa(r.data?.rowCount ?? 0)} ردیف در ${fa(r.data?.tables ?? 0)} جدول بازیابی شد`)
    setRestoreTarget(null); setRestoreAck(false)
    void load()
  }

  async function removeSnap(s: Snapshot) {
    if (!window.confirm(`حذف نسخه «${s.name}»؟ (فایل پشتیبان حذف می‌شود؛ داده‌های فعلی دست‌نخورده می‌مانند)`)) return
    setDeletingId(s.id)
    const r = await api(`/api/admin/snapshot/${s.id}`, { method: 'DELETE' })
    setDeletingId('')
    if (!r.ok) return toast.error(r.error || 'حذف نسخه ناموفق بود')
    toast.success('نسخه پشتیبان حذف شد')
    void load()
  }

  const latest = snapshots[0] || null
  const countEntries: Array<[string, number]> = summary?.counts
    ? Object.entries(summary.counts as Record<string, number>)
    : []

  return (
    <div className="space-y-4">
      {/* ─── بنر چرخه کار ─── */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <I.shield size={20} />
          </div>
          <div className="space-y-1 text-xs leading-6 text-amber-900">
            <p className="text-sm font-black">پشتیبان و بازنشانی داده</p>
            <p>
              <b>آزمایش کنید، خیالتان راحت باشد:</b> هر تغییری در سامانه (سفارش، کالا، چک، مرجوعی و …) موقتی است؛
              مدیر می‌تواند با یک کلیک، همه داده‌ها را به آخرین نسخه پشتیبان <b>بازنشانی</b> کند.
            </p>
            <p className="text-[11px] text-amber-800">
              پیش از تغییرهای بزرگ (مثل درون‌ریزی فایل کالا) یک نسخه بگیرید — بازنشانی همه رکوردهای ثبت‌شده پس از آن نسخه را حذف می‌کند.
              کاربران، دسترسی‌ها و گزارش فعالیت‌ها در نسخه‌ها ذخیره نمی‌شوند و دست‌نخورده می‌مانند.
            </p>
          </div>
        </div>
      </div>

      {/* ─── خلاصه وضعیت فعلی + فرم ساخت ─── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><I.layers size={17} /> وضعیت فعلی داده‌ها</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !summary ? (
              <div className="flex items-center justify-center py-8 text-sm text-stone-500">
                <I.loader size={18} className="ml-2 animate-spin" /> در حال شمارش…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {countEntries.map(([t, n]) => (
                    <div key={t} className="rounded-lg border border-stone-200 bg-stone-50/70 p-2 text-center">
                      <p className="text-sm font-black text-stone-800">{fa(n)}</p>
                      <p className="mt-0.5 text-[10px] leading-3 text-stone-500">{TABLE_LABELS[t] || t}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-stone-500">
                  {fa(summary?.userCount ?? 0)} کاربر (در نسخه‌ها ذخیره نمی‌شود)
                  {latest && (
                    <> · آخرین نسخه: <b>{latest.name}</b> ({whenFa(latest.createdAt)})</>
                  )}
                  {!latest && <> · هنوز نسخه‌ای ساخته نشده است</>}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><I.save size={17} /> ساخت نسخه پشتیبان جدید</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div>
              <label className="mb-1 block text-xs text-stone-500">نام نسخه *</label>
              <Input
                value={name}
                onChange={(e: any) => setName(e.target.value)}
                placeholder="مثلاً: قبل از درون‌ریزی دی‌ماه"
                maxLength={80}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">نوع نسخه</label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(KIND_META) as Array<keyof typeof KIND_META>).map((k) => (
                  <button
                    key={k} type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                      kind === k ? 'border-stone-800 bg-stone-800 text-white' : KIND_META[k].cls,
                    )}
                  >
                    {KIND_META[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">یادداشت (اختیاری)</label>
              <Textarea
                rows={2} value={note} maxLength={400}
                onChange={(e: any) => setNote(e.target.value)}
                placeholder="توضیح کوتاه درباره وضعیت داده‌ها در این لحظه…"
              />
            </div>
            <Button className="w-full gap-2" disabled={creating} onClick={() => void submitCreate()}>
              {creating ? <I.loader size={16} className="animate-spin" /> : <I.fileDown size={16} />}
              {creating ? 'در حال تهیه نسخه…' : 'تهیه نسخه از داده‌های فعلی'}
            </Button>
            <p className="text-center text-[10px] leading-4 text-stone-400">
              تمام رکوردهای کالا، تأمین‌کننده، سفارش، چک، مرجوعی، پرسنل و تنظیمات در نسخه ذخیره می‌شود.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── فهرست نسخه‌ها ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <I.history size={17} /> نسخه‌های پشتیبان
            <Badge variant="outline" className="border-stone-300 bg-stone-100 text-stone-600">{fa(snapshots.length)} نسخه</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-stone-500">
              <I.loader size={18} className="ml-2 animate-spin" /> در حال بارگذاری…
            </div>
          ) : snapshots.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
                <I.history size={26} className="text-stone-400" />
              </div>
              <p className="text-sm font-bold text-stone-700">هنوز نسخه‌ای ساخته نشده است</p>
              <p className="mt-1 text-xs text-stone-500">با فرم بالا اولین نسخه پشتیبان را بسازید تا نقطه بازگشت داشته باشید.</p>
            </div>
          ) : (
            <div className="max-h-[52vh] overflow-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">نام نسخه</TableHead>
                    <TableHead className="text-center">نوع</TableHead>
                    <TableHead className="text-center">جدول / ردیف</TableHead>
                    <TableHead className="text-center">حجم</TableHead>
                    <TableHead className="text-right">سازنده</TableHead>
                    <TableHead className="text-right">زمان</TableHead>
                    <TableHead className="text-center">اقدامات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="text-xs font-bold text-stone-800">{s.name}</p>
                        {s.note && <p className="mt-0.5 max-w-72 truncate text-[10px] text-stone-500" title={s.note}>{s.note}</p>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn('text-[10px]', kindMeta(s.kind).cls)}>{kindMeta(s.kind).label}</Badge>
                      </TableCell>
                      <TableCell className="num text-center text-[11px] text-stone-600">
                        {fa(s.tableCount)} / {fa(s.rowCount)}
                      </TableCell>
                      <TableCell className="num text-center text-[11px] text-stone-600">{sizeFa(s.sizeBytes)}</TableCell>
                      <TableCell className="text-[11px] text-stone-600">{s.createdBy || '—'}</TableCell>
                      <TableCell className="num text-[11px] text-stone-600">{whenFa(s.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm" className="h-8 gap-1.5 bg-emerald-700 px-2.5 text-[11px] hover:bg-emerald-800"
                            onClick={() => { setRestoreTarget(s); setRestoreAck(false) }}
                          >
                            <I.refresh size={13} /> بازنشانی
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-8 px-2 text-[11px] text-rose-600"
                            disabled={deletingId === s.id}
                            onClick={() => void removeSnap(s)}
                            aria-label={`حذف نسخه ${s.name}`}
                          >
                            {deletingId === s.id ? <I.loader size={13} className="animate-spin" /> : <I.trash size={13} />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── دیالوگ بازنشانی دومرحله‌ای ─── */}
      <Dialog open={!!restoreTarget} onOpenChange={(o: boolean) => { if (!o) { setRestoreTarget(null); setRestoreAck(false) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <I.alertTriangle size={18} /> بازنشانی به این نسخه؟
            </DialogTitle>
            <DialogDescription>
              «{restoreTarget?.name}» — {restoreTarget ? whenFa(restoreTarget.createdAt) : ''}
              {restoreTarget?.note ? ` · ${restoreTarget.note}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs leading-6 text-rose-800">
              <p><b>همه تغییرات بعد از این نسخه حذف می‌شود.</b></p>
              <p className="mt-1 text-[11px]">
                {restoreTarget ? `${fa(restoreTarget.rowCount)} ردیف در ${fa(restoreTarget.tableCount)} جدول جایگزین داده‌های فعلی می‌شود.
                رکوردهایی که پس از این نسخه ثبت شده‌اند (سفارش، کالا، چک و …) برای همیشه از بین می‌روند.` : ''}
              </p>
            </div>
            <label
              className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2.5"
              onClick={(e: any) => { if ((e.target as any)?.tagName !== 'BUTTON') setRestoreAck((v) => !v) }}
            >
              <span className="text-xs leading-5 text-stone-700">
                می‌دانم همه داده‌های ثبت‌شده پس از این نسخه حذف می‌شود و این کار بازگشت‌پذیر نیست.
              </span>
              <Checkbox checked={restoreAck} onCheckedChange={(v: any) => setRestoreAck(!!v)} className="mt-0.5" />
            </label>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setRestoreTarget(null); setRestoreAck(false) }}>انصراف</Button>
              <Button variant="destructive" disabled={!restoreAck || restoring} onClick={() => void submitRestore()} className="gap-2">
                {restoring && <I.loader size={15} className="animate-spin" />}
                {restoring ? 'در حال بازنشانی…' : 'بله، بازنشانی کن'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
