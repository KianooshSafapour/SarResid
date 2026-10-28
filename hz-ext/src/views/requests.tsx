/**
 * tasks/requests — درخواست‌ها (R16): کارکنان درخواست ثبت می‌کنند (کالای جدید، تأمین، تعمیر، نرم‌افزار، پیگیری مشتری)
 * و گردش‌کار شفافش را می‌بینند: ثبت ← بررسی ← تأیید/رد ← انجام — با زنجیرهٔ فرمان و ردپا.
 */
import { useState, useEffect, api, useShell, toast, cn, Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, fa, toFaDigits, formatJalali, I } from '../lib/hz'

/* R17: آیکون‌های لوسید به‌جای ایموجی — هم‌زبان با سایر بخش‌های پلتفرم */
const KIND_ICON: Record<string, any> = { NEW_PRODUCT: I.packagePlus, SUPPLY: I.carton, REPAIR: I.wrench, SOFTWARE: I.monitor, CUSTOMER: I.handshake, OTHER: I.penLine }
function KindIcon({ kind, size = 15, className = '' }: { kind: string; size?: number; className?: string }) {
  const C = KIND_ICON[kind] || I.penLine
  return <C size={size} className={className} />
}
const STATUS_CLS: Record<string, string> = {
  SUBMITTED: 'bg-stone-100 text-stone-700 border-stone-200',
  SEEN: 'bg-sky-100 text-sky-800 border-sky-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
  DONE: 'bg-teal-100 text-teal-800 border-teal-200',
}
const STEPS = ['SUBMITTED', 'SEEN', 'APPROVED', 'DONE']

export default function RequestsView() {
  const { user } = useShell()
  const [rows, setRows] = useState<any[]>([])
  const [byStatus, setByStatus] = useState<Record<string, number>>({})
  const [kinds, setKinds] = useState<any[]>([])
  const [canHandle, setCanHandle] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('OPEN')
  const [dlg, setDlg] = useState(false)
  const [form, setForm] = useState({ kind: 'NEW_PRODUCT', title: '', body: '', priority: 'NORMAL' })
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [handleNote, setHandleNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    api('/api/requests' + (tab === 'MINE' ? '?mine=1' : tab !== 'OPEN' ? `?status=${tab}` : ''))
      .then((r: any) => {
        if (r.ok) { setRows(r.data.requests); setByStatus(r.data.byStatus); setKinds(r.data.kinds); setCanHandle(r.data.canHandle) }
        else toast.error(r.error || 'دریافت نشد')
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [tab])

  async function submit() {
    if (form.title.trim().length < 3) return toast.error('عنوان حداقل ۳ حرف')
    setSaving(true)
    const r = await api('/api/requests', { method: 'POST', body: form })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت نشد')
    toast.success(`درخواست ${r.data.code} ثبت شد — مدیران خبردار شدند؛ فرایندش را همین‌جا دنبال کنید`)
    setDlg(false); setForm({ kind: 'NEW_PRODUCT', title: '', body: '', priority: 'NORMAL' })
    load()
  }

  async function act(id: string, action: string) {
    setBusy(true)
    const r = await api('/api/requests', { method: 'PATCH', body: { id, action, note: handleNote } })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'انجام نشد')
    toast.success('ثبت شد — به ثبت‌کننده اطلاع داده شد')
    setHandleNote('')
    setDetail((d: any) => d && d.id === id ? null : d)
    load()
  }

  const openCount = (byStatus.SUBMITTED ?? 0) + (byStatus.SEEN ?? 0) + (byStatus.APPROVED ?? 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <I.clipboard size={18} className="text-teal-700" /> درخواست‌ها — از ایده تا انجام، با گردش‌کار شفاف
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] font-bold text-stone-600">{fa(openCount)} باز · {fa(byStatus.DONE ?? 0)} انجام‌شده</span>
            <span className="flex-1" />
            <Button onClick={() => setDlg(true)} className="gap-1"><I.plus size={15} /> درخواست جدید</Button>
          </CardTitle>
          <p className="text-xs leading-5 text-stone-500">
            هر چیزی لازم دارید درخواست کنید: کالای جدید برای قفسه، خرید/تأمین، تعمیر تجهیز، تغییر در پلتفرم، یا پیگیری خواستهٔ مشتری.
            مسیر هر درخواست شفاف است: ثبت ← بررسی مدیر ← تأیید/رد ← انجام؛ هر مرحله به شما اطلاع داده می‌شود.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'OPEN', label: `باز (${fa(openCount)})` },
              { key: 'MINE', label: 'درخواست‌های من' },
              { key: 'SUBMITTED', label: `ثبت‌شده (${fa(byStatus.SUBMITTED ?? 0)})` },
              { key: 'SEEN', label: `در بررسی (${fa(byStatus.SEEN ?? 0)})` },
              { key: 'APPROVED', label: `در انجام (${fa(byStatus.APPROVED ?? 0)})` },
              { key: 'DONE', label: `انجام‌شده (${fa(byStatus.DONE ?? 0)})` },
              { key: 'REJECTED', label: `ردشده (${fa(byStatus.REJECTED ?? 0)})` },
            ].map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={cn('rounded-full border px-3 py-1.5 text-[12px] font-medium', tab === t.key ? 'border-teal-600 bg-teal-600 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-teal-300')}>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-stone-400">در حال دریافت…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center">
              <p className="text-sm font-bold text-stone-600">درخواستی در این وضعیت نیست</p>
              <p className="mt-1 text-[11px] text-stone-400">چیزی لازم دارید؟ «درخواست جدید» را بزنید — مدیران همان لحظه خبردار می‌شوند</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const stepIdx = STEPS.indexOf(r.status)
                return (
                  <button key={r.id} type="button" onClick={() => setDetail(r)}
                    className={cn('w-full rounded-xl border p-3 text-right transition-colors hover:border-teal-400',
                      r.priority === 'HIGH' ? 'border-amber-300 bg-amber-50/40' : 'border-stone-200 bg-white')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500"><KindIcon kind={r.kind} size={15} /></span>
                      <span className="font-mono text-[11px] font-bold text-stone-400" dir="ltr">{r.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-stone-800">{r.title}</span>
                      {r.priority === 'HIGH' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">فوری</span> : null}
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', STATUS_CLS[r.status])}>{r.statusLabel}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      {STEPS.map((st, i) => (
                        <span key={st} className={cn('h-1.5 flex-1 rounded-full', r.status === 'REJECTED' ? 'bg-rose-200' : i <= stepIdx ? 'bg-emerald-500' : 'bg-stone-200')} />
                      ))}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-400">
                      <span>{r.kindLabel} · از {r.requestedByName}{r.handledByName ? ` · دست‌اندرکار: ${r.handledByName}` : ''}</span>
                      <span dir="ltr">{fa(formatJalali(new Date(r.createdAt)).replace(/-/g, '/'))}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ثبت درخواست جدید */}
      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>درخواست جدید</DialogTitle>
            <DialogDescription className="text-[12px] leading-6">ثبت‌شده برای شما ردپا می‌سازد و مدیران زنجیرهٔ فرمان خبردار می‌شوند.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-stone-600">نوع درخواست</label>
              <Select value={form.kind} onValueChange={(v: string) => setForm((c) => ({ ...c, kind: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => <SelectItem key={k.key} value={k.key}><span className="flex items-center gap-1.5"><KindIcon kind={k.key} size={13} /> {k.label}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-stone-600">عنوان (کوتاه و روشن)</label>
              <Input value={form.title} onChange={(e: any) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="مثلاً: اسنپ پکرینگ لیمو در دسترس مشتری نیست" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-stone-600">توضیح</label>
              <Textarea value={form.body} onChange={(e: any) => setForm((c) => ({ ...c, body: e.target.value }))} placeholder="چه چیزی، کجا، چرا لازم است…" className="min-h-20" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-stone-600">اولویت</label>
              <Select value={form.priority} onValueChange={(v: string) => setForm((c) => ({ ...c, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">عادی — وقتی شد</SelectItem>
                  <SelectItem value="NORMAL">معمولی</SelectItem>
                  <SelectItem value="HIGH">فوری</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>انصراف</Button>
            <Button disabled={saving} onClick={() => void submit()} className="gap-1">{saving ? <I.loader size={14} className="animate-spin" /> : <I.check size={14} />} ثبت درخواست</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* جزئیات + گردش‌کار */}
      <Dialog open={!!detail} onOpenChange={(o: boolean) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500"><KindIcon kind={detail.kind} size={16} /></span>
                  <span className="font-mono text-[12px] font-bold text-stone-400" dir="ltr">{detail.code}</span>
                  <span className="min-w-0 flex-1 truncate">{detail.title}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', STATUS_CLS[detail.status])}>{detail.statusLabel}</span>
                </DialogTitle>
                <DialogDescription>{detail.kindLabel} · از {detail.requestedByName}{detail.handledByName ? ` · دست‌اندرکار: ${detail.handledByName}` : ''}</DialogDescription>
              </DialogHeader>
              {detail.body ? <p className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-[12px] leading-6 text-stone-700">{detail.body}</p> : null}
              {detail.resultNote ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[12px] text-emerald-800">نتیجه: {detail.resultNote}</p> : null}
              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                <p className="mb-2 text-[11px] font-bold text-stone-600">گردش‌کار — چه مرحله‌ای، توسط که</p>
                <div className="space-y-1.5">
                  {[...(detail.history ?? [])].reverse().map((h: any, i: number) => {
                    const dt = h.at ? new Date(h.at) : null
                    return (
                      <div key={i} className="flex gap-2 text-[11px] leading-5">
                        <span className="whitespace-nowrap text-stone-400" dir="ltr">{dt && !isNaN(dt.getTime()) ? `${fa(formatJalali(dt).replace(/-/g, '/'))} · ${fa(String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0'))}` : ''}</span>
                        <span className="whitespace-nowrap font-medium text-stone-700">{h.label || h.action}:</span>
                        <span className="text-stone-600">{h.by}{h.detail ? ` — ${h.detail}` : ''}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              {canHandle && !['DONE', 'REJECTED'].includes(detail.status) ? (
                <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/50 p-2.5">
                  <Textarea value={handleNote} onChange={(e: any) => setHandleNote(e.target.value)} placeholder="یادداشت اقدام (برای رد/انجام الزامی)" className="min-h-16 text-xs" />
                  <div className="flex flex-wrap gap-2">
                    {detail.status === 'SUBMITTED' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(detail.id, 'seen')}>دیده شد — شروع بررسی</Button> : null}
                    <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700" disabled={busy} onClick={() => void act(detail.id, 'approve')}>تأیید</Button>
                    <Button size="sm" variant="outline" className="border-teal-300 text-teal-700" disabled={busy || handleNote.trim().length < 3} onClick={() => void act(detail.id, 'done')}>انجام شد</Button>
                    <Button size="sm" variant="outline" className="border-rose-300 text-rose-700" disabled={busy || handleNote.trim().length < 3} onClick={() => void act(detail.id, 'reject')}>رد</Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
