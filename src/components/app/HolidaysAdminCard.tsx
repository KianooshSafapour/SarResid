'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, formatJalaliLong, J_MONTHS, toJalaliParts } from '@/lib/jalali'
import { formatHijri } from '@/lib/hijri'
import { SectionCard, Pill, EmptyState, Labeled } from '@/components/app/ui-bits'
import { JalaliDatePicker, useHolidays } from '@/components/app/jalali-widgets'
import { Modal } from '@/components/views/Orders'
import { RefreshCw, Plus, Pencil, Trash2, CalendarDays, Check, X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/** کارت مدیریت کامل تعطیلات رسمی — ویرایش عنوان/تاریخ/نوع + افزودن/حذف/همگام‌سازی.
 *  در تب «تعطیلات رسمی» بخش مدیریت سوار می‌شود؛ جای دیگری هم قابل استفاده است. */

type Row = {
  id: string
  date: string
  title: string
  kind: string // HOLIDAY | OCCASION
  hijriLabel: string
  solar: boolean
  source: string
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: 'دستی', color: '#6d7a6e' },
  builtin: { label: 'موتور داخلی', color: '#0e7a4a' },
  seed: { label: 'پایگاه اولیه', color: '#8a6d10' },
  keybit: { label: 'اینترنت', color: '#207a63' },
  official: { label: 'رسمی time.ir', color: '#c96f4a' },
}

const KIND_META = {
  HOLIDAY: { label: 'تعطیل رسمی', color: '#b3372f' },
  OCCASION: { label: 'مناسبت — تعطیل نیست', color: '#c9a227' },
} as const

type Kind = keyof typeof KIND_META

export function HolidaysAdminCard({ canManage = true }: { canManage?: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncInfo, setSyncInfo] = useState<{ lastSync: { at?: string; mode?: string; officialUsed?: number; by?: string } | null; calibration: Record<string, number>; sourceReachable: boolean | null } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editKind, setEditKind] = useState<Kind>('HOLIDAY')
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [delTarget, setDelTarget] = useState<Row | null>(null)
  const holMap = useHolidays()

  const load = async () => {
    try {
      const d = await api<{ holidays: Row[] }>('/api/holidays')
      setRows(d.holidays || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const loadSyncInfo = async () => {
    try {
      const d = await api<{ lastSync: any; calibration: Record<string, number>; sourceReachable: boolean | null }>('/api/holidays/sync')
      setSyncInfo(d)
    } catch { /* فقط نمایانگر وضعیت است */ }
  }
  useEffect(() => {
    if (canManage) loadSyncInfo()
  }, [canManage])

  const groups = useMemo(() => {
    const m = new Map<string, { jy: number; jm: number; items: Row[] }>()
    for (const h of rows) {
      const { jy, jm } = toJalaliParts(h.date)
      const key = `${jy}-${String(jm).padStart(2, '0')}`
      if (!m.has(key)) m.set(key, { jy, jm, items: [] })
      m.get(key)!.items.push(h)
    }
    return [...m.values()].sort((a, b) => a.jy - b.jy || a.jm - b.jm)
  }, [rows])

  const startEdit = (h: Row) => {
    setEditingId(h.id)
    setEditTitle(h.title)
    setEditDate(h.date)
    setEditKind(h.kind === 'OCCASION' ? 'OCCASION' : 'HOLIDAY')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
    setEditDate('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!editTitle.trim()) return toast.error('عنوان نمی‌تواند خالی باشد')
    if (!editDate) return toast.error('تاریخ الزامی است')
    setSaving(true)
    try {
      await api('/api/holidays', {
        method: 'PATCH',
        body: { id: editingId, title: editTitle.trim(), date: editDate, kind: editKind },
      })
      toast.success('تعطیلی به‌روزرسانی شد ✅')
      cancelEdit()
      await load()
    } catch (e: any) {
      toast.error(e.message) // شامل خطای ۴۰۹ تداخل تاریخ با پیام فارسی
    } finally {
      setSaving(false)
    }
  }

  const sync = async (mode: 'official' | 'rebuild' = 'official') => {
    setSyncing(true)
    try {
      const res = await api<{ ok: boolean; added: number; updated: number; removed: number; errors: string[]; calibration: Record<string, number>; perYear: { year: number; official: boolean }[] }>('/api/holidays/sync', {
        method: 'POST',
        body: { mode },
      })
      const officialYears = (res.perYear || []).filter((p) => p.official).length
      if (res.ok && officialYears > 0)
        toast.success(`تقویم از منبع رسمی (time.ir) همگام شد ✅ — ${faNum(res.added)} مورد در ${faNum(officialYears)} سال؛ کالیبراسیون قمری: ${faNum(Object.keys(res.calibration || {}).length)} ماه`)
      else if (res.ok && (res.added > 0 || res.updated > 0))
        toast.info(`بازسازی آفلاین انجام شد — منبع اینترنتی در دسترس نبود (${res.errors?.[0] || ''})`)
      else if (res.ok) toast.info('تعطیلات به‌روز است — مورد جدیدی پیدا نشد')
      else toast.error(res.errors?.[0] || 'همگام‌سازی ناموفق بود')
      await load()
      await loadSyncInfo()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <SectionCard
        title="تعطیلات رسمی — مدیریت کامل 🗓️"
        subtitle="منبع رسمی: time.ir — ویرایش هر تعطیلی (عنوان، تاریخ، نوع)؛ ردیف‌های دستی با همگام‌سازی بازنویسی نمی‌شوند"
        icon={<CalendarDays size={18} />}
        actions={
          canManage && (
            <>
              <button
                onClick={() => sync('official')}
                disabled={syncing}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#207a63]/40 bg-[#207a63]/10 px-4 py-2.5 text-xs font-extrabold text-[#207a63] disabled:opacity-50"
                title="دریافت سال کامل از منبع رسمی (یک درخواست به‌ازای هر سال) + کالیبراسیون هجری"
              >
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'در حال همگام‌سازی…' : 'همگام‌سازی از منبع رسمی'}
              </button>
              <button
                onClick={() => sync('rebuild')}
                disabled={syncing}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold text-muted-foreground disabled:opacity-50"
                title="بازسازی آفلاین از موتور داخلی — وقتی اینترنت در دسترس نیست"
              >
                بازسازی آفلاین
              </button>
              <button
                onClick={() => setAddOpen(true)}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white"
              >
                <Plus size={14} /> افزودن تعطیلی
              </button>
            </>
          )
        }
      >
        {syncInfo && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-muted/40 px-3 py-2 text-[10px] font-bold text-muted-foreground">
            <span>
              آخرین همگام‌سازی: {syncInfo.lastSync?.at ? formatJalaliLong(syncInfo.lastSync.at.slice(0, 10)) : '—'}
              {syncInfo.lastSync?.by ? ` (${syncInfo.lastSync.by})` : ''}
            </span>
            <span>منبع اینترنتی: {syncInfo.sourceReachable === true ? '✅ در دسترس' : syncInfo.sourceReachable === false ? '❌ قطع — بازسازی آفلاین فعال است' : '…'}</span>
            {Object.keys(syncInfo.calibration || {}).length > 0 && (
              <span className="text-[#8a6d10]">🌙 کالیبراسیون قمری فعال: {faNum(Object.keys(syncInfo.calibration).length)} ماه هجری</span>
            )}
          </div>
        )}
        {!canManage && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 px-3 py-2 text-[11px] font-bold text-[#8a6d10]">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>فقط مدیران مجاز (دارای مجوز «مدیریت تعطیلات رسمی» یا حسابدار ارشد) می‌توانند ویرایش کنند — نمای فعلی فقط‌خواندنی است.</span>
          </div>
        )}
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">در حال بارگذاری تعطیلات…</p>
        ) : groups.length === 0 ? (
          <EmptyState emoji="📅" title="تعطیلی ثبت نشده" hint="با دکمهٔ همگام‌سازی یا افزودن دستی شروع کنید" />
        ) : (
          <div className="scroll-gold max-h-[62vh] space-y-4 overflow-y-auto pl-1">
            {groups.map((g) => (
              <div key={`${g.jy}-${g.jm}`}>
                <div className="mb-1.5 flex items-center gap-2">
                  <h3 className="text-sm font-black text-foreground">
                    {J_MONTHS[g.jm - 1]} {faNum(g.jy)}
                  </h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {faNum(g.items.length)} مورد
                  </span>
                </div>
                <div className="space-y-1.5">
                  {g.items.map((h) => {
                    const src = SOURCE_LABELS[h.source] || SOURCE_LABELS.manual
                    const kin = KIND_META[h.kind === 'OCCASION' ? 'OCCASION' : 'HOLIDAY']
                    const editing = editingId === h.id
                    if (editing) {
                      return (
                        <div key={h.id} className="rounded-xl border-2 border-[#c9a227]/60 bg-[#fdf6dd]/40 p-3">
                          <p className="mb-2 text-[11px] font-black text-[#8a6d10]">ویرایش تعطیلی — تاریخ قبلی: {formatJalaliLong(h.date)}</p>
                          <div className="grid gap-2.5 sm:grid-cols-2">
                            <Labeled label="عنوان *">
                              <input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm"
                                placeholder="عنوان تعطیلی"
                              />
                            </Labeled>
                            <Labeled label="تاریخ (شمسی) *">
                              <JalaliDatePicker value={editDate} onChange={setEditDate} holidays={holMap} quickChips={false} />
                            </Labeled>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-muted-foreground">نوع:</span>
                            {(Object.keys(KIND_META) as Kind[]).map((k) => (
                              <button
                                key={k}
                                type="button"
                                onClick={() => setEditKind(k)}
                                className={cn(
                                  'rounded-full px-3 py-2 text-[11px] font-bold transition',
                                  editKind === k ? 'text-white' : 'border border-border bg-card text-foreground/70'
                                )}
                                style={editKind === k ? { background: KIND_META[k].color } : undefined}
                              >
                                {KIND_META[k].label}
                              </button>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
                            >
                              <Check size={14} /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-xs font-bold"
                            >
                              <X size={14} /> انصراف
                            </button>
                          </div>
                          <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
                            تغییر تاریخ = جابه‌جایی ردیف در تقویم (اگر تاریخ مقصد قبلاً پر باشد، خطای تداخل می‌گیرید). تعطیلی‌های «موتور داخلی» با همگام‌سازی ممکن است بازسازی شوند؛ برای تغییر پایدار، نوع و عنوان را همین‌جا اصلاح کنید.
                          </p>
                        </div>
                      )
                    }
                    return (
                      <div
                        key={h.id}
                        className={cn(
                          'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white/80 px-3 py-2.5',
                          h.kind === 'OCCASION' && 'bg-[#c9a227]/5'
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="shrink-0 rounded-lg bg-[#b3372f]/10 px-2.5 py-1 text-[11px] font-black text-[#b3372f]">
                            {formatJalaliLong(h.date)}
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-bold">{h.title}</span>
                            {(h.hijriLabel || h.kind === 'OCCASION') && (
                              <span className="block truncate text-[9px] font-bold text-[#8a6d10]">
                                {h.hijriLabel ? `🌙 ${h.hijriLabel}` : `🌙 ${formatHijri(h.date)}`}
                                {h.kind === 'OCCASION' ? ' • تعطیل نیست' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Pill label={kin.label} color={kin.color} />
                          <Pill label={src.label} color={src.color} />
                          {canManage && (
                            <>
                              <button
                                onClick={() => startEdit(h)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0e7a4a]/10 text-[#0e7a4a] transition hover:bg-[#0e7a4a]/20"
                                title="ویرایش عنوان/تاریخ/نوع"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setDelTarget(h)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#b3372f]/10 text-[#b3372f] transition hover:bg-[#b3372f]/20"
                                title="حذف تعطیلی"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {addOpen && (
        <AddHolidayModal
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            load()
          }}
        />
      )}

      {delTarget && (
        <Modal title="حذف تعطیلی" onClose={() => setDelTarget(null)}>
          <p className="text-sm text-foreground/80">
            «{delTarget.title}» ({formatJalaliLong(delTarget.date)}) از تقویم حذف می‌شود. این عمل بازگشت‌پذیر نیست؛ برای بازسازی از «همگام‌سازی با موتور رسمی» استفاده کنید.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await api(`/api/holidays?id=${delTarget.id}`, { method: 'DELETE' })
                  toast.success('تعطیلی حذف شد')
                  setDelTarget(null)
                  await load()
                } catch (e: any) {
                  toast.error(e.message)
                }
              }}
              className="min-h-[44px] flex-1 rounded-xl bg-[#b3372f] py-2.5 text-xs font-extrabold text-white"
            >
              حذف
            </button>
            <button onClick={() => setDelTarget(null)} className="min-h-[44px] flex-1 rounded-xl border py-2.5 text-xs font-bold">
              انصراف
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

function AddHolidayModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const holMap = useHolidays()
  const [date, setDate] = useState('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<Kind>('HOLIDAY')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!date || !title.trim()) return toast.error('تاریخ و عنوان الزامی است')
    setBusy(true)
    try {
      await api('/api/holidays', { method: 'POST', body: { date, title: title.trim(), kind } })
      toast.success('تعطیلی به تقویم اضافه شد 📅')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="افزودن تعطیلی رسمی" onClose={onClose}>
      <Labeled label="تاریخ *">
        <JalaliDatePicker value={date} onChange={setDate} holidays={holMap} />
      </Labeled>
      <Labeled label="عنوان تعطیلی *">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm"
          placeholder="مثلاً: عید نوروز"
        />
      </Labeled>
      <Labeled label="نوع">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_META) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'rounded-full px-3 py-2 text-[11px] font-bold transition',
                kind === k ? 'text-white' : 'border border-border bg-card text-foreground/70'
              )}
              style={kind === k ? { background: KIND_META[k].color } : undefined}
            >
              {KIND_META[k].label}
            </button>
          ))}
        </div>
      </Labeled>
      <button
        onClick={save}
        disabled={busy}
        className="min-h-[44px] w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50"
      >
        {busy ? '…' : 'ثبت تعطیلی 📅'}
      </button>
    </Modal>
  )
}
