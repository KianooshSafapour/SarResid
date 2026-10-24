import {
  useState, useEffect, useMemo,
  api, useShell, toast, cn,
  Button, Input, Textarea, Card, CardContent,
  Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Progress, fa, toFaDigits, faSlash, jsDateToJalali, I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   tasks/sops — روال‌های استاندارد فروشگاه (SOP)
   ۱) فهرست کارتی راست‌به‌چپ: عنوان، توضیح، تعداد مرحله،
      نشان نسخه، شمارندهٔ بازدید (با چشم)، نقش‌های مرتبط،
      تاریخ ساخت/بازنگری جلالی (۱۴۰۵/۰۷/۲۸)
   ۲) دیالوگ جزئیات: مراحل شماره‌دار + حالت تعاملی «شروع روال»
      (مرحلهٔ جاری، قبلی/بعدی، نوار پیشرفت، «روال کامل شد»)
      — باز کردن جزئیات شمارندهٔ بازدید را واقعاً زیاد می‌کند
   ۳) حالت مدیر: ساخت/ویرایش (افزایش نسخه) / حذف روال +
      ویرایشگر مراحل با افزودن/حذف/جابه‌جایی
   ───────────────────────────────────────────────────────────── */

const MANAGERS = ['OWNER', 'GM', 'ADMIN', 'EXEC']

const ROLES: { key: string; label: string }[] = [
  { key: 'OWNER', label: 'مدیر عامل' },
  { key: 'GM', label: 'مدیر کل' },
  { key: 'ADMIN', label: 'مدیر عملیات و IT' },
  { key: 'EXEC', label: 'مدیر اجرایی' },
  { key: 'ACC', label: 'حسابدار' },
  { key: 'PM', label: 'مدیر محصولات' },
  { key: 'HC', label: 'صندوقدار ارشد' },
  { key: 'SK', label: 'انباردار' },
  { key: 'SALES', label: 'فروشنده' },
  { key: 'CASHIER', label: 'صندوقدار' },
  { key: 'MERCH', label: 'نیروی چیدمان' },
]
const roleLabel = (k: string) => ROLES.find((r) => r.key === k)?.label || k

interface SopStep { text: string; hint?: string }
interface SopItem {
  id: string; title: string; description: string
  stepsCount: number; views: number; completions: number; version: number
  roleKeys?: string[]; createdAt?: string; updatedAt?: string
}
interface SopDetail {
  id: string; title: string; description: string
  steps: SopStep[]; views: number; completions: number; version: number; roleKeys: string[]
  createdAt?: string; updatedAt?: string
}

/** ISO → «۱۴۰۵/۰۷/۲۸» */
function isoFa(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return faSlash(jsDateToJalali(d))
}

/** چیپ شمارندهٔ بازدید */
function ViewsChip({ views, big }: { views: number; big?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 font-medium text-stone-600',
      big ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]',
    )}>
      <I.eye size={big ? 13 : 11} className="text-stone-400" />
      <span className="num">{fa(views)}</span> بازدید
    </span>
  )
}

/** R5-P4: چیپ شمارندهٔ اجرای کامل — ماندگار در دیتابیس (Sop.completions) */
function CompletionsChip({ completions, big }: { completions: number; big?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 font-medium text-emerald-700',
      big ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]',
    )}>
      <I.check size={big ? 13 : 11} className="text-emerald-500" />
      <span className="num">{fa(completions)}</span> اجرای کامل
    </span>
  )
}

function VersionBadge({ version }: { version: number }) {
  return (
    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800">
      نسخهٔ {toFaDigits(String(version))}
    </Badge>
  )
}

/* ═══════════════ دیالوگ جزئیات + حالت تعاملی ═══════════════ */

function SopDetailDialog({
  sopId, canManage, onClose, onEdit, onDelete,
}: {
  sopId: string
  canManage: boolean
  onClose: () => void
  onEdit: (s: SopDetail) => void
  onDelete: (s: SopDetail) => void
}) {
  const [loading, setLoading] = useState(true)
  const [sop, setSop] = useState<SopDetail | null>(null)
  const [runIdx, setRunIdx] = useState<number | null>(null)
  const [runDone, setRunDone] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setSop(null); setRunIdx(null); setRunDone(false)
    ;(async () => {
      const r = await api(`/api/sops?id=${encodeURIComponent(sopId)}`)
      if (!alive) return
      setLoading(false)
      if (!r.ok) { toast.error(r.error || 'دریافت روال ناموفق بود'); onClose(); return }
      setSop(r.data?.sop || null)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sopId])

  const steps: SopStep[] = useMemo(() => (sop?.steps || []), [sop])

  function next() {
    if (runIdx === null) return
    if (runIdx < steps.length - 1) {
      setRunIdx(runIdx + 1)
    } else {
      setRunDone(true)
      toast.success(`روال «${sop?.title || ''}» کامل شد ✓`)
      /* R5-P4: شمارندهٔ اجرای کامل ماندگار — همان لحظه در دیتابیس زیاد می‌شود */
      if (sop) {
        void api('/api/sops/visit', { method: 'POST', body: { id: sop.id } }).then((r: any) => {
          if (r.ok) {
            setSop((s: SopDetail | null) => (s ? { ...s, views: r.data.views, completions: r.data.completions } : s))
          }
        })
      }
    }
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {loading ? (
          <div className="space-y-3">
            <div className="h-7 w-2/3 animate-pulse rounded-lg bg-stone-100" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" />
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-stone-100" />)}
          </div>
        ) : !sop ? (
          <p className="py-6 text-center text-sm text-stone-400">روال یافت نشد</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                <I.clipboard size={17} className="text-emerald-600" />
                <span className="min-w-0">{sop.title}</span>
                <VersionBadge version={sop.version} />
                <ViewsChip views={sop.views} big />
                <CompletionsChip completions={sop.completions} big />
              </DialogTitle>
              <DialogDescription className="sr-only">مراحل و توضیح روال استاندارد</DialogDescription>
            </DialogHeader>

            {sop.description ? (
              <p className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-6 text-stone-600">
                {sop.description}
              </p>
            ) : null}

            {/* نقش‌های مرتبط + تاریخ‌ها */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(sop.roleKeys || []).map((k) => (
                <Badge key={k} variant="secondary" className="text-[10px]">{roleLabel(k)}</Badge>
              ))}
              <span className="mr-auto flex flex-wrap items-center gap-2 text-[10px] text-stone-400">
                {sop.createdAt ? <span>ساخت {isoFa(sop.createdAt)}</span> : null}
                {sop.updatedAt && isoFa(sop.updatedAt) !== isoFa(sop.createdAt)
                  ? <span>· بازنگری {isoFa(sop.updatedAt)}</span>
                  : null}
              </span>
            </div>

            {/* ─── حالت فهرست مراحل ─── */}
            {runIdx === null && !runDone ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => { setRunIdx(0); setRunDone(false) }}>
                    <I.play size={14} className="ml-1" /> شروع روال
                  </Button>
                  <span className="text-[11px] text-stone-500">
                    {fa(steps.length)} مرحله — مرحله‌به‌مرحله با دکمهٔ «شروع روال» اجرا کنید
                  </span>
                </div>
                {steps.map((st, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-stone-200 bg-white p-2.5">
                    <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-black text-white">
                      {fa(i + 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-6 text-stone-700">{st.text}</p>
                      {st.hint ? (
                        <p className="mt-0.5 flex items-start gap-1 text-[10px] leading-5 text-stone-500">
                          <I.info size={11} className="mt-1 shrink-0 text-stone-400" />
                          <span>{st.hint}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* ─── حالت اجرای تعاملی ─── */}
            {runIdx !== null && !runDone && steps[runIdx] ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-stone-700">
                    مرحلهٔ {fa(runIdx + 1)} از {fa(steps.length)}
                  </span>
                  <span className="text-[10px] text-stone-400">پیشرفت: {fa(Math.round(((runIdx) / steps.length) * 100))}٪</span>
                  <Button variant="ghost" size="sm" className="mr-auto h-7 px-2 text-[11px] text-stone-500"
                    onClick={() => { setRunIdx(null); setRunDone(false) }}>
                    <I.x size={13} className="ml-1" /> پایان اجرا
                  </Button>
                </div>
                <Progress value={Math.round((runIdx / steps.length) * 100)} className="h-2" />

                {/* مراحل انجام‌شده (کم‌رنگ) */}
                {steps.slice(0, runIdx).map((st, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-400">
                    <I.check size={12} className="shrink-0 text-emerald-500" />
                    <span className="line-through decoration-stone-300">{st.text}</span>
                  </div>
                ))}

                {/* مرحلهٔ جاری */}
                <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">
                      {fa(runIdx + 1)}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700">اکنون این مرحله را انجام دهید</span>
                  </div>
                  <p className="mt-2.5 text-sm font-bold leading-7 text-stone-800">{steps[runIdx].text}</p>
                  {steps[runIdx].hint ? (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-white/70 p-2 text-[11px] leading-5 text-stone-600">
                      <I.info size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                      <span>{steps[runIdx].hint}</span>
                    </p>
                  ) : null}
                </div>

                {/* دکمه‌های ناوبری — قبلی راست، بعدی چپ (راست‌به‌چپ) */}
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" disabled={runIdx === 0} onClick={() => setRunIdx(Math.max(0, runIdx - 1))}>
                    <I.chevronRight size={15} /> قبلی
                  </Button>
                  <Button onClick={next}>
                    {runIdx === steps.length - 1 ? 'پایان روال' : 'بعدی'} <I.chevronLeft size={15} className="mr-1" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* ─── پایان موفق ─── */}
            {runDone ? (
              <div className="space-y-3">
                <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <I.check size={24} />
                  </span>
                  <p className="text-base font-extrabold text-emerald-800">روال کامل شد</p>
                  <p className="text-[11px] text-emerald-700">
                    همهٔ {fa(steps.length)} مرحلهٔ «{sop.title}» با موفقیت انجام شد.
                  </p>
                  {/* R5-P4: شمارندهٔ به‌روز پس از ثبت اجرا */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <CompletionsChip completions={sop.completions} big />
                    <ViewsChip views={sop.views} big />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" onClick={() => { setRunIdx(null); setRunDone(false) }}>
                    <I.layers size={14} className="ml-1" /> بازگشت به فهرست مراحل
                  </Button>
                  <Button onClick={() => { setRunIdx(0); setRunDone(false) }}>
                    <I.refresh size={14} className="ml-1" /> شروع دوباره
                  </Button>
                </div>
              </div>
            ) : null}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>بستن</Button>
              {canManage ? (
                <>
                  <Button variant="outline" className="gap-1.5 text-rose-600 hover:text-rose-700" onClick={() => onDelete(sop)}>
                    <I.trash size={14} /> حذف
                  </Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => onEdit(sop)}>
                    <I.pencil size={14} /> ویرایش
                  </Button>
                </>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════ دیالوگ ساخت/ویرایش (مدیر) ═══════════════ */

interface EditorState {
  title: string
  description: string
  steps: { text: string; hint: string }[]
  roleKeys: string[]
}

function SopEditorDialog({
  editing, initial, onClose, onSaved,
}: {
  editing: SopItem | SopDetail | null   // null = ساخت روال جدید
  initial: EditorState
  onClose: () => void
  onSaved: () => void
}) {
  const [st, setSt] = useState<EditorState>(initial)
  const [busy, setBusy] = useState(false)
  const isEdit = !!editing

  function setStep(i: number, patch: Partial<{ text: string; hint: string }>) {
    setSt((p) => ({ ...p, steps: p.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  }
  function move(i: number, dir: -1 | 1) {
    setSt((p) => {
      const steps = [...p.steps]
      const j = i + dir
      if (j < 0 || j >= steps.length) return p
      ;[steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...p, steps }
    })
  }

  async function save() {
    const title = st.title.trim()
    if (title.length < 2) return toast.error('عنوان روال الزامی است (حداقل ۲ نویسه)')
    const steps = st.steps
      .map((s) => ({ text: s.text.trim(), hint: s.hint.trim() || undefined }))
      .filter((s) => s.text.length > 0)
    if (steps.length === 0) return toast.error('حداقل یک مرحله با متن وارد کنید')

    setBusy(true)
    const r = isEdit
      ? await api('/api/sops', { method: 'PUT', body: { id: (editing as SopItem).id, title, description: st.description.trim(), steps, roleKeys: st.roleKeys } })
      : await api('/api/sops', { method: 'POST', body: { title, description: st.description.trim(), steps, roleKeys: st.roleKeys } })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'ذخیرهٔ روال ناموفق بود')
    toast.success(isEdit ? 'روال ویرایش شد و نسخهٔ آن یک واحد بالاتر رفت' : 'روال جدید ساخته شد')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <I.pencil size={16} className="text-emerald-600" />
            {isEdit ? `ویرایش «${(editing as SopItem).title}»` : 'روال استاندارد جدید'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'با هر ذخیره، شمارهٔ نسخهٔ روال یک واحد افزایش می‌یابد.'
              : 'عنوان، توضیح و مراحل را وارد کنید؛ مراحل قابل افزودن، حذف و جابه‌جایی هستند.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-600">عنوان روال</label>
            <Input value={st.title} onChange={(e: any) => setSt({ ...st, title: e.target.value })}
              placeholder="مثلاً: روال باز و بستن صندوق فروشگاه" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-600">توضیح (اختیاری)</label>
            <Textarea rows={2} value={st.description} onChange={(e: any) => setSt({ ...st, description: e.target.value })}
              placeholder="یک جمله دربارهٔ هدف این روال…" />
          </div>

          {/* مراحل */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-stone-700">مراحل روال</label>
              <span className="text-[10px] text-stone-400">{fa(st.steps.filter((s) => s.text.trim()).length)} مرحلهٔ واردشده</span>
            </div>
            {st.steps.map((s, i) => (
              <div key={i} className="rounded-xl border border-stone-200 bg-white p-2.5">
                <div className="flex items-start gap-2">
                  <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-bold text-stone-600">
                    {fa(i + 1)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input className="text-sm" placeholder="متن مرحله (مثلاً: صندوق را با کلید مسؤول شیفت باز کنید)"
                      value={s.text} onChange={(e: any) => setStep(i, { text: e.target.value })} />
                    <Input className="text-xs text-stone-600" placeholder="نکتهٔ راهنما (اختیاری)"
                      value={s.hint} onChange={(e: any) => setStep(i, { hint: e.target.value })} />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" title="انتقال به بالا"
                      disabled={i === 0} onClick={() => move(i, -1)}><I.chevronUp size={13} /></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" title="انتقال به پایین"
                      disabled={i === st.steps.length - 1} onClick={() => move(i, 1)}><I.chevronDown size={13} /></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7 text-rose-600" title="حذف مرحله"
                      onClick={() => setSt((p) => ({ ...p, steps: p.steps.filter((_, j) => j !== i) }))}>
                      <I.trash size={13} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm"
              onClick={() => setSt((p) => ({ ...p, steps: [...p.steps, { text: '', hint: '' }] }))}>
              <I.plus size={14} className="ml-1" /> افزودن مرحله
            </Button>
          </div>

          {/* نقش‌های مرتبط */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600">نقش‌های مرتبط (اختیاری — برای فیلتر نمایش)</label>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => {
                const on = st.roleKeys.includes(r.key)
                return (
                  <button key={r.key} type="button"
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                      on ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-700' : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50',
                    )}
                    onClick={() => setSt((p) => ({
                      ...p,
                      roleKeys: on ? p.roleKeys.filter((k) => k !== r.key) : [...p.roleKeys, r.key],
                    }))}>
                    {on ? '✓ ' : ''}{r.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <I.loader size={15} className="ml-1 animate-spin" /> : <I.save size={15} className="ml-1" />}
            {busy ? 'در حال ذخیره…' : isEdit ? 'ذخیرهٔ ویرایش' : 'ساخت روال'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════ نمای اصلی ═══════════════ */

export default function SopsView() {
  const { user } = useShell()
  const isManager = !!user && MANAGERS.includes(String(user.role))

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<SopItem[]>([])

  /* فیلترها */
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState('ALL')

  /* دیالوگ‌ها */
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ editing: SopItem | SopDetail | null; initial: EditorState } | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await api('/api/sops')
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری روال‌ها ناموفق بود'); return }
    setItems(r.data?.sops || [])
  }

  /* جست‌وجوی سمت کاربر + فیلتر نقش */
  const filtered = useMemo(() => {
    const needle = q.trim()
    return items.filter((s) => {
      if (roleF !== 'ALL' && !(s.roleKeys || []).includes(roleF)) return false
      if (!needle) return true
      return String(s.title).indexOf(needle) > -1 || String(s.description).indexOf(needle) > -1
    })
  }, [items, q, roleF])

  const totals = useMemo(() => ({
    count: items.length,
    steps: items.reduce((a, s) => a + (s.stepsCount || 0), 0),
    views: items.reduce((a, s) => a + (s.views || 0), 0),
    completions: items.reduce((a, s) => a + (s.completions || 0), 0), // R5-P4
  }), [items])

  function openDetail(id: string) { setDetailId(id) }
  function closeDetail() { setDetailId(null); void load() }

  function openCreate() {
    setEditor({ editing: null, initial: { title: '', description: '', steps: [{ text: '', hint: '' }], roleKeys: [] } })
  }
  function openEdit(s: SopItem | SopDetail) {
    const steps: SopStep[] = 'steps' in s && Array.isArray((s as SopDetail).steps)
      ? (s as SopDetail).steps
      : []
    const rows = steps.length ? steps.map((x) => ({ text: x.text || '', hint: x.hint || '' })) : [{ text: '', hint: '' }]
    setEditor({
      editing: s,
      initial: {
        title: s.title || '',
        description: s.description || '',
        steps: rows,
        roleKeys: [...(s.roleKeys || [])],
      },
    })
  }

  async function removeSop(s: SopItem | SopDetail) {
    if (!window.confirm(`روال «${s.title}» حذف شود؟ این عمل بازگشت‌پذیر نیست.`)) return
    const r = await api(`/api/sops?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' })
    if (!r.ok) return toast.error(r.error || 'حذف روال ناموفق بود')
    toast.success('روال حذف شد')
    setDetailId(null)
    void load()
  }

  return (
    <div className="space-y-4">

      {/* سربرگ: جست‌وجو + فیلتر نقش + دکمهٔ روال جدید */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs font-medium text-stone-600">جست‌وجوی روال</label>
            <div className="relative">
              <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="عنوان یا توضیح روال…" className="pr-9" />
              <I.search size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
            </div>
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-stone-600">فیلتر نقش</label>
            <Select value={roleF} onValueChange={setRoleF}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همهٔ نقش‌ها</SelectItem>
                {ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isManager ? (
            <Button onClick={openCreate}>
              <I.plus size={15} className="ml-1" /> روال جدید
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* چیپ‌های خلاصه */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2">
          <I.clipboard size={13} className="text-stone-400" />
          <span className="num text-base font-black">{fa(totals.count)}</span>
          <span className="text-[11px] text-stone-500">روال</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2">
          <I.layers size={13} className="text-stone-400" />
          <span className="num text-base font-black">{fa(totals.steps)}</span>
          <span className="text-[11px] text-stone-500">مرحلهٔ استاندارد</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2">
          <I.eye size={13} className="text-stone-400" />
          <span className="num text-base font-black">{fa(totals.views)}</span>
          <span className="text-[11px] text-stone-500">بازدید ثبت‌شده</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <I.check size={13} className="text-emerald-500" />
          <span className="num text-base font-black text-emerald-700">{fa(totals.completions)}</span>
          <span className="text-[11px] text-emerald-700">اجرای کامل</span>
        </span>
        <span className="mr-auto text-[11px] text-stone-400">
          {roleF === 'ALL'
            ? (q.trim() ? `${fa(filtered.length)} نتیجهٔ جست‌وجو` : '')
            : `${fa(filtered.length)} روال برای ${roleLabel(roleF)}`}
        </span>
      </div>

      {/* فهرست روال‌ها */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-stone-400">
            <I.bookOpen size={28} className="mx-auto mb-2 text-stone-400" />
            هنوز روال استانداردی ثبت نشده است
            {isManager ? ' — با دکمهٔ «روال جدید» اولین روال را بسازید' : ''}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-stone-400">
            <I.search size={28} className="mx-auto mb-2 text-stone-300" />
            روالی مطابق جست‌وجو یا فیلتر یافت نشد
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const created = isoFa(s.createdAt)
            const revised = isoFa(s.updatedAt)
            return (
              <Card key={s.id} className="cursor-pointer transition-colors hover:border-emerald-400" >
                <CardContent className="flex h-full flex-col gap-2.5 p-4" onClick={() => openDetail(s.id)}>
                  {/* عنوان + نسخه + بازدید */}
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-extrabold leading-6 text-stone-800">{s.title}</h3>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <VersionBadge version={s.version} />
                      <ViewsChip views={s.views} />
                      <CompletionsChip completions={s.completions} />
                    </div>
                  </div>

                  {s.description ? (
                    <p className="line-clamp-2 min-h-8 text-[11px] leading-5 text-stone-500">{s.description}</p>
                  ) : <span className="min-h-8" />}

                  {/* نقش‌های مرتبط */}
                  {(s.roleKeys || []).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <I.users size={11} className="text-stone-400" />
                      {(s.roleKeys || []).slice(0, 4).map((k) => (
                        <Badge key={k} variant="secondary" className="text-[10px]">{roleLabel(k)}</Badge>
                      ))}
                      {(s.roleKeys || []).length > 4 ? (
                        <span className="text-[10px] text-stone-400">+{fa((s.roleKeys || []).length - 4)}</span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* پایین کارت: تعداد مرحله + تاریخ‌ها */}
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed pt-2 text-[10px] text-stone-500">
                    <span className="flex items-center gap-1">
                      <I.layers size={11} className="text-stone-400" />
                      <span className="num font-bold text-stone-700">{fa(s.stepsCount)}</span> مرحله
                    </span>
                    {created ? <span className="flex items-center gap-1"><I.calendar size={11} className="text-stone-400" /> {created}</span> : null}
                    {revised && revised !== created
                      ? <span className="flex items-center gap-1 text-emerald-700"><I.refresh size={11} /> {revised}</span>
                      : null}
                    <span className="mr-auto flex items-center gap-0.5 text-emerald-700">
                      مشاهدهٔ روال <I.chevronLeft size={12} />
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* دیالوگ جزئیات */}
      {detailId ? (
        <SopDetailDialog
          sopId={detailId}
          canManage={isManager}
          onClose={closeDetail}
          onEdit={openEdit}
          onDelete={(s) => void removeSop(s)}
        />
      ) : null}

      {/* دیالوگ ساخت/ویرایش */}
      {editor ? (
        <SopEditorDialog
          editing={editor.editing}
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); setDetailId(null); void load() }}
        />
      ) : null}
    </div>
  )
}
