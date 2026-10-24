import { useState, useEffect, useMemo, api, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, fa, toFaDigits, JalaliDate, TimeInput, Stepper, todayJalali, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   hr/leaves — مرخصی‌ها (نسخهٔ فشردهٔ همه‌کاره در یک صفحه)
   بالای صفحه: چیپ‌های خلاصه (کل/در انتظار/تأیید/رد/تفکیک نوع)
   میانه: نوار فیلتر + جدول یک‌نگاهی با اقدام خطی مدیر (تأیید/رد)
   درخواست جدید: دیالوگ — ساعتی: تاریخ + از ساعت + تا ساعت (یک ردیف هم‌تراز)
   ───────────────────────────────────────────────────────────── */

const TYPES: { key: string; label: string; cls: string }[] = [
  { key: 'HOURLY', label: 'ساعتی', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  { key: 'DAILY', label: 'روزانه', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'SICK', label: 'استعلاجی', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'UNPAID', label: 'بدون حقوق', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
]
const typeMeta = (t: string) => TYPES.find((x) => x.key === t) || { key: t, label: t, cls: 'bg-stone-100 text-stone-600 border-stone-200' }

const STATUSES: Record<string, { label: string; cls: string; dot: string }> = {
  PENDING: { label: 'در انتظار', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  APPROVED: { label: 'تأییدشده', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  REJECTED: { label: 'ردشده', cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
}
const statusMeta = (s: string) => STATUSES[s] || { label: s, cls: 'bg-stone-100 text-stone-600 border-stone-200', dot: 'bg-stone-400' }

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']

/** ۱۴۰۵-۰۷-۲۸ → ۱۴۰۵/۰۷/۲۸ (ارقام فارسی) */
function faDate(v?: string | null): string {
  if (!v) return '—'
  return toFaDigits(String(v).replace(/-/g, '/'))
}

/** '08:30' → دقیقه از نیمه‌شب */
function timeToMin(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '')
  if (!m) return NaN
  return Number(m[1]) * 60 + Number(m[2])
}

interface LeaveItem {
  id: string
  userId: string
  userName: string
  type: string
  fromDate: string
  toDate: string
  days: number
  hours: number | null
  reason: string | null
  status: string
  responseNote: string | null
  approverName: string | null
  createdAt: string
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-xl border px-3 py-2', tone || 'border-stone-200 bg-white')}>
      <span className="num text-lg font-black leading-none">{value}</span>
      <span className="text-[11px] leading-4 text-stone-500">{label}</span>
    </div>
  )
}

export default function LeavesView() {
  const { user } = useShell() as any
  const isMgr = !!user && MANAGER_ROLES.includes(user.role)

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<LeaveItem[]>([])
  const [manager, setManager] = useState(false)

  const [fStatus, setFStatus] = useState('ALL')
  const [fType, setFType] = useState('ALL')
  const [fq, setFq] = useState('')

  /* دیالوگ درخواست جدید */
  const [newOpen, setNewOpen] = useState(false)
  const [nType, setNType] = useState('DAILY')
  const [nFrom, setNFrom] = useState(todayJalali())
  const [nTo, setNTo] = useState(todayJalali())
  const [nDays, setNDays] = useState(1)
  const [nFromTime, setNFromTime] = useState('')
  const [nToTime, setNToTime] = useState('')
  const [nReason, setNReason] = useState('')
  const [nBusy, setNBusy] = useState(false)

  /* دیالوگ پاسخ مدیر (رد با دلیل) */
  const [rejTarget, setRejTarget] = useState<LeaveItem | null>(null)
  const [rejNote, setRejNote] = useState('')
  const [rejBusy, setRejBusy] = useState(false)
  const [actBusy, setActBusy] = useState<string | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await api('/api/hr/leaves')
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری مرخصی‌ها ناموفق بود'); return }
    setItems(r.data.items || [])
    setManager(!!r.data.manager)
  }

  /* مدت ساعتی محاسبه‌شده از «از ساعت / تا ساعت» */
  const hourlyMinutes = useMemo(() => {
    const a = timeToMin(nFromTime)
    const b = timeToMin(nToTime)
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
    return b - a
  }, [nFromTime, nToTime])

  async function submitNew() {
    if (!nFrom) return toast.error('تاریخ را انتخاب کنید')
    if (nType !== 'HOURLY' && !nTo) return toast.error('تاریخ پایان را انتخاب کنید')
    let hours: number | undefined
    if (nType === 'HOURLY') {
      if (hourlyMinutes <= 0) return toast.error('ساعت شروع و پایان را وارد کنید (پایان بعد از شروع)')
      if (hourlyMinutes > 8 * 60) return toast.error('مرخصی ساعتی حداکثر ۸ ساعت است')
      // رُند به چهارم ساعت — هماهنگ با اعتبارسنجی سرور
      hours = Math.max(0.25, Math.round((hourlyMinutes / 60) * 4) / 4)
    }
    setNBusy(true)
    const r = await api('/api/hr/leaves', {
      method: 'POST',
      body: {
        type: nType,
        fromDate: nFrom,
        toDate: nType === 'HOURLY' ? undefined : nTo,
        days: nType === 'HOURLY' ? undefined : nDays,
        hours,
        reason: nReason.trim() || undefined,
      },
    })
    setNBusy(false)
    if (!r.ok) return toast.error(r.error || 'ثبت درخواست ناموفق بود')
    toast.success('درخواست مرخصی ثبت شد و به اطلاع مدیران رسید ✓')
    setNewOpen(false)
    setNReason('')
    setNFromTime(''); setNToTime('')
    void load()
  }

  async function act(row: LeaveItem, action: 'approve' | 'reject', responseNote?: string) {
    setActBusy(row.id + ':' + action)
    const r = await api(`/api/hr/leaves/${row.id}`, { method: 'PATCH', body: { action, responseNote } })
    setActBusy(null)
    if (!r.ok) return toast.error(r.error || 'ثبت پاسخ ناموفق بود')
    toast.success(action === 'approve' ? `درخواست ${row.userName} تأیید شد ✓` : `درخواست ${row.userName} رد شد`)
    void load()
  }

  async function removeRow(row: LeaveItem) {
    if (!window.confirm('این درخواست حذف شود؟')) return
    const r = await api(`/api/hr/leaves/${row.id}`, { method: 'DELETE' })
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success('درخواست حذف شد')
    void load()
  }

  /* خلاصه‌ها */
  const stats = useMemo(() => {
    const s = { total: items.length, PENDING: 0, APPROVED: 0, REJECTED: 0, HOURLY: 0, DAILY: 0, SICK: 0, UNPAID: 0 } as Record<string, number>
    for (const it of items) {
      if (it.status in s) s[it.status]++
      if (it.type in s) s[it.type]++
    }
    return s
  }, [items])

  const filtered = useMemo(() => {
    const needle = fq.trim()
    return items.filter((it) => {
      if (fStatus !== 'ALL' && it.status !== fStatus) return false
      if (fType !== 'ALL' && it.type !== fType) return false
      if (needle && it.userName.indexOf(needle) === -1) return false
      return true
    })
  }, [items, fStatus, fType, fq])

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Icon name="calendarDays" size={18} /> مرخصی‌ها
            <span className="text-xs font-normal text-stone-400">درخواست، تأیید و پیگیری مرخصی پرسنل — همه در یک صفحه</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* ═══ چیپ‌های خلاصه ═══ */}
          <div className="flex flex-wrap gap-2">
            <Chip label="جمع کل" value={fa(stats.total)} tone="border-stone-300 bg-stone-50" />
            <Chip label="در انتظار تأیید" value={fa(stats.PENDING)} tone={cn(stats.PENDING > 0 && 'border-amber-300 bg-amber-50')} />
            <Chip label="تأییدشده" value={fa(stats.APPROVED)} tone="border-emerald-200 bg-emerald-50" />
            <Chip label="ردشده" value={fa(stats.REJECTED)} tone="border-rose-200 bg-rose-50" />
            <span className="mx-1 hidden w-px bg-stone-200 sm:block" />
            {TYPES.map((t) => (
              <Chip key={t.key} label={t.label} value={fa(stats[t.key] || 0)} />
            ))}
          </div>

          {/* ═══ نوار فیلتر ═══ */}
          <div className="flex flex-wrap items-center gap-2">
            <Select dir="rtl" value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همهٔ وضعیت‌ها</SelectItem>
                <SelectItem value="PENDING">در انتظار تأیید</SelectItem>
                <SelectItem value="APPROVED">تأییدشده</SelectItem>
                <SelectItem value="REJECTED">ردشده</SelectItem>
              </SelectContent>
            </Select>
            <Select dir="rtl" value={fType} onValueChange={setFType}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همهٔ انواع</SelectItem>
                {TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative min-w-44 grow sm:max-w-56">
              <I.search size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
              <Input className="h-9 pr-8" placeholder="جستجوی نام پرسنل…" value={fq} onChange={(e: any) => setFq(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}><I.refresh size={14} /> به‌روزرسانی</Button>
            <Button size="sm" className="mr-auto gap-1.5" onClick={() => setNewOpen(true)}><I.plus size={15} /> درخواست مرخصی جدید</Button>
          </div>

          {/* ═══ جدول ═══ */}
          {loading ? (
            <div className="py-10 text-center text-stone-500"><I.loader className="mx-auto mb-3 animate-spin" size={22} /> در حال بارگذاری…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100"><I.calendarDays size={22} className="text-stone-400" /></div>
              <p className="text-sm font-bold text-stone-600">مرخصی‌ای با این فیلترها یافت نشد</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-32">پرسنل</TableHead>
                    <TableHead className="text-center">نوع</TableHead>
                    <TableHead className="text-center">بازه</TableHead>
                    <TableHead className="text-center">مدت</TableHead>
                    <TableHead className="text-center">وضعیت</TableHead>
                    <TableHead className="min-w-40">دلیل / پاسخ</TableHead>
                    <TableHead className="text-center">اقدام</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((it) => {
                    const tm = typeMeta(it.type)
                    const sm = statusMeta(it.status)
                    const canAct = manager && it.status === 'PENDING'
                    const isOwn = user?.id === it.userId
                    const busy = actBusy === it.id + ':approve' || actBusy === it.id + ':reject'
                    return (
                      <TableRow key={it.id} className={cn(it.status === 'PENDING' && manager && 'bg-amber-50/40')}>
                        <TableCell className="text-xs font-bold text-stone-800">
                          {it.userName}
                          {isOwn && <Badge variant="secondary" className="mr-1 bg-emerald-50 text-emerald-700">خودم</Badge>}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold', tm.cls)}>{tm.label}</span>
                        </TableCell>
                        <TableCell className="num whitespace-nowrap text-center text-[11px] text-stone-600">
                          {faDate(it.fromDate)}{it.type !== 'HOURLY' && it.toDate !== it.fromDate ? ` تا ${faDate(it.toDate)}` : ''}
                        </TableCell>
                        <TableCell className="num text-center text-xs font-bold text-stone-700">
                          {it.type === 'HOURLY' ? `${fa(it.hours || 0)} ساعت` : `${fa(it.days)} روز`}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold', sm.cls)}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', sm.dot)} /> {sm.label}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-56 text-[11px] leading-5 text-stone-500">
                          {it.reason && <div className="truncate" title={it.reason}>💡 {it.reason}</div>}
                          {it.responseNote && <div className="truncate text-rose-500" title={it.responseNote}>✋ {it.responseNote}{it.approverName ? ` (${it.approverName})` : ''}</div>}
                          {!it.reason && !it.responseNote && <span className="text-stone-300">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {canAct ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" className="h-7 gap-1 bg-emerald-600 px-2.5 text-[11px] hover:bg-emerald-700" disabled={busy}
                                onClick={() => void act(it, 'approve')}>
                                {busy ? <I.loader size={12} className="animate-spin" /> : <I.check size={12} />} تأیید
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-rose-200 px-2.5 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={busy}
                                onClick={() => { setRejTarget(it); setRejNote('') }}>
                                <I.x size={12} /> رد
                              </Button>
                            </div>
                          ) : it.status === 'PENDING' && (isOwn || manager) ? (
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px] text-stone-400 hover:text-rose-600" onClick={() => void removeRow(it)}>
                              <I.trash size={12} /> حذف
                            </Button>
                          ) : (
                            <span className="text-[10px] text-stone-300">{it.approverName || '—'}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ دیالوگ درخواست جدید ═══ */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>درخواست مرخصی جدید</DialogTitle>
            <DialogDescription>درخواست شما ثبت و پس از بررسی مدیر، نتیجه در همین صفحه اعلام می‌شود</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-stone-500">نوع مرخصی</label>
              <Select dir="rtl" value={nType} onValueChange={setNType}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {nType === 'HOURLY' ? (
              <div>
                <label className="mb-1 block text-xs text-stone-500">تاریخ و بازهٔ ساعتی</label>
                {/* یک ردیف هم‌تراز — هر سه ورودی h-9 */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="mb-1 block text-[10px] text-stone-400">تاریخ</span>
                    <JalaliDate value={nFrom} onChange={setNFrom} />
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] text-stone-400">از ساعت</span>
                    <TimeInput value={nFromTime} onChange={setNFromTime} placeholder="۰۸:۳۰" />
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] text-stone-400">تا ساعت</span>
                    <TimeInput value={nToTime} onChange={setNToTime} placeholder="۱۲:۳۰" />
                  </div>
                </div>
                {nFromTime && nToTime && (
                  hourlyMinutes > 0 ? (
                    <p className="mt-1.5 text-[11px] font-bold text-teal-700">
                      مدت مرخصی: {hourlyMinutes >= 60 ? `${fa(Math.floor(hourlyMinutes / 60))} ساعت` : ''}{hourlyMinutes % 60 ? ` و ${fa(hourlyMinutes % 60)} دقیقه` : ''}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-rose-600">ساعت پایان باید بعد از ساعت شروع باشد</p>
                  )
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-stone-500">از تاریخ</label>
                  <JalaliDate value={nFrom} onChange={setNFrom} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-500">تا تاریخ</label>
                  <JalaliDate value={nTo} onChange={setNTo} />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-stone-500">تعداد روز</label>
                  <Stepper value={nDays} onChange={setNDays} min={1} max={90} hint="روز کاری" />
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-stone-500">دلیل (اختیاری)</label>
              <Textarea rows={2} value={nReason} onChange={(e: any) => setNReason(e.target.value)} placeholder="مثلاً: امور اداری / استراحت درمانی…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>انصراف</Button>
            <Button disabled={nBusy || (nType === 'HOURLY' && hourlyMinutes <= 0)} onClick={() => void submitNew()} className="gap-1.5">
              {nBusy ? <I.loader size={15} className="animate-spin" /> : <I.send size={15} />} ثبت درخواست
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ رد با دلیل ═══ */}
      <Dialog open={!!rejTarget} onOpenChange={(o: boolean) => { if (!o) setRejTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>رد درخواست مرخصی</DialogTitle>
            <DialogDescription>
              {rejTarget ? `${rejTarget.userName} — ${typeMeta(rejTarget.type).label} از ${faDate(rejTarget.fromDate)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block text-xs text-stone-500">دلیل رد (الزامی — به پرسنل نمایش داده می‌شود)</label>
            <Textarea rows={3} value={rejNote} onChange={(e: any) => setRejNote(e.target.value)} placeholder="مثلاً: هم‌زمانی با شیفت شلوغ پایان هفته…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejTarget(null)}>انصراف</Button>
            <Button variant="destructive" disabled={rejBusy || rejNote.trim().length < 3} onClick={() => { const t = rejTarget; setRejTarget(null); if (t) void act(t, 'reject', rejNote.trim()) }} className="gap-1.5">
              {rejBusy ? <I.loader size={15} className="animate-spin" /> : <I.x size={15} />} ثبت رد درخواست
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
