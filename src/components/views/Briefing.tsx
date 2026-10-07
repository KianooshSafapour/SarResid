'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliDateTime } from '@/lib/jalali'
import { Pill, EmptyState } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Sunrise, Printer, ArrowRight, Archive, Save, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

type Briefing = {
  generatedAt: string
  todayLabel: string
  holiday: { title: string } | null
  teamSize: number
  priceCheck?: { total: number; checkedToday: number; remaining: number; red: number; yellow: number; green: number }
  autoArchived?: boolean
  stats: {
    overdueOrders: number
    todayDeliveries: number
    dueCheques: number
    dueChequesAmount: number
    outOfStock: number
    lowStock: number
    expiring: number
    tasksToday: number
    newIdeas: number
    createdYesterday: number
    createdYesterdayAmount: number
    accountedYesterday: number
  }
  overdueList: { code: string; providerName: string; deliveryDate: string; totalAmount: number }[]
  deliveriesList: { code: string; providerName: string; payMethod: string; itemsCount: number }[]
  chequesList: { number: string; amount: number; recipientName: string; dueDate: string; status: string }[]
  stockList: { name: string; stock: number; reorderLevel: number; category: string; providerName: string }[]
  expiringList: { productName: string; qty: number; expiryDate: string; daysLeft: number }[]
  tasksList: { title: string; assignedToName: string; priority: string }[]
  ideasList: { content: string; authorName: string }[]
  requestsList: { productName: string; count: number }[]
  providersToday: string[]
}

const PRIORITY_LABEL: Record<string, { label: string; color: string }> = {
  URGENT: { label: 'فوری', color: '#b3372f' },
  HIGH: { label: 'مهم', color: '#a16207' },
  NORMAL: { label: 'معمولی', color: '#166534' },
  LOW: { label: 'کم', color: '#6b7280' },
}

type ArchiveMeta = {
  id: string
  forDate: string
  jalaliLabel: string
  createdByName: string
  createdAt: string
  digest: { createdYesterday: number; overdueOrders: number; todayDeliveries: number; dueCheques: number; priceCheckRemaining?: number; priceCheckRed?: number }
}

export default function BriefingView({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<Briefing | null>(null)
  const [err, setErr] = useState('')
  const [archive, setArchive] = useState<ArchiveMeta[]>([])
  const [showArchive, setShowArchive] = useState(false)
  const [snap, setSnap] = useState<Briefing | null>(null)
  const [snapMeta, setSnapMeta] = useState<ArchiveMeta | null>(null)
  const [saving, setSaving] = useState(false)

  const loadArchive = useCallback(() => {
    api<{ archive: ArchiveMeta[] }>('/api/briefing?archive=1')
      .then((d) => setArchive(d.archive))
      .catch(() => setArchive([]))
  }, [])

  useEffect(() => {
    api<Briefing>('/api/briefing')
      .then((d) => {
        setData(d)
        if (d.autoArchived) toast('🗂️ نسخه امروز صبح‌نامه خودکار در آرشیو ثبت شد')
      })
      .catch((e) => setErr(e.message))
    loadArchive()
  }, [loadArchive])

  const saveToArchive = async () => {
    setSaving(true)
    try {
      const r = await api<{ snapshot: { jalaliLabel: string }; overwritten: boolean }>('/api/briefing', { method: 'POST' })
      toast.success(r.overwritten ? 'نسخه امروز در آرشیو به‌روزرسانی شد 🗂️' : 'صبح‌نامه امروز در آرشیو ذخیره شد 🗂️')
      loadArchive()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const openSnap = async (id: string) => {
    try {
      const r = await api<{ snapshot: { data: Briefing } & ArchiveMeta }>(`/api/briefing?id=${id}`)
      setSnap(r.snapshot.data)
      setSnapMeta(r.snapshot)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (err)
    return (
      <EmptyState
        emoji="🌅"
        title="صبح‌نامه در دسترس نیست"
        hint={err}
      />
    )
  if (!data && !snap)
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glow-card h-28 animate-pulse rounded-2xl bg-card/60" />
        ))}
      </div>
    )

  const s = snap ? snap.stats : data!.stats
  const d = snap || data!
  const isArchived = !!snap

  const headStats = [
    { label: 'سفارش دیروز', value: faNum(s.createdYesterday), sub: `${faMoney(s.createdYesterdayAmount)} تومان`, tone: 'text-[#0e7a4a]' },
    { label: 'ثبت در هلو دیروز', value: faNum(s.accountedYesterday), sub: 'سفارش تکمیل‌شده', tone: 'text-[#8a6d10]' },
    { label: 'مرسوله امروز', value: faNum(s.todayDeliveries), sub: d.providersToday.length ? d.providersToday.slice(0, 2).join(' • ') : 'بدون مرسوله', tone: 'text-[#77934a]' },
    { label: 'سرآمده ⚠️', value: faNum(s.overdueOrders), sub: 'نیاز به فالوآپ', tone: s.overdueOrders ? 'text-[#b3372f]' : 'text-foreground' },
    { label: 'چک ۷ روز آینده', value: faNum(s.dueCheques), sub: `${faMoney(s.dueChequesAmount)} تومان`, tone: 'text-[#8a6d10]' },
    { label: 'ناموجود / کم‌موجود', value: `${faNum(s.outOfStock)} / ${faNum(s.lowStock)}`, sub: 'اقدام خرید لازم است', tone: s.outOfStock ? 'text-[#b3372f]' : 'text-foreground' },
  ]

  return (
    <div className="space-y-4">
      {/* toolbar (no-print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { if (snap) { setSnap(null); setSnapMeta(null) } else ctx.navigate('dashboard') }}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-extrabold transition hover:border-[#c9a227]/60"
          >
            <ArrowRight size={14} /> {isArchived ? 'بازگشت به صبح‌نامه امروز' : 'بازگشت به داشبورد'}
          </button>
          <button
            onClick={() => { setShowArchive((v) => !v); if (!showArchive) loadArchive() }}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-extrabold transition',
              showArchive ? 'border-[#c9a227] bg-[#fdf6dd] text-[#8a6d10]' : 'border-border bg-card hover:border-[#c9a227]/60'
            )}
          >
            <FolderOpen size={14} /> آرشیو صبح‌نامه‌ها {archive.length > 0 && `(${faNum(archive.length)})`}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isArchived && (
            <button
              onClick={saveToArchive}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#8a6d10] to-[#c9a227] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'در حال ذخیره…' : 'ذخیره نسخه امروز در آرشیو'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-5 py-2.5 text-xs font-extrabold text-white shadow-lg transition hover:shadow-xl"
          >
            <Printer size={15} /> چاپ / ذخیره PDF
          </button>
        </div>
      </div>

      {/* archive panel (no-print) */}
      {showArchive && (
        <section className="no-print glow-card gold-glow-border fade-in-up rounded-2xl bg-card p-4 sm:p-5">
          <header className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fdf6dd] text-[#8a6d10]"><Archive size={17} /></span>
            <div>
              <h2 className="text-sm font-black">آرشیو صبح‌نامه‌ها</h2>
              <p className="text-[10px] text-muted-foreground">نسخه ثبت‌شده هر روز برای مرور جلسات قبل — روی هر کارت بزنید تا باز و چاپ شود</p>
            </div>
          </header>
          {archive.length === 0 ? (
            <p className="rounded-xl bg-muted/50 p-4 text-center text-[11px] text-muted-foreground">
              هنوز نسخه‌ای آرشیو نشده — با دکمه «ذخیره نسخه امروز در آرشیو» اولین نسخه را ثبت کنید
            </p>
          ) : (
            <div className="scroll-gold relative max-h-72 space-y-2.5 overflow-y-auto pl-1">
              <span className="absolute bottom-2 right-[13px] top-2 w-0 border-r-2 border-dashed border-[#c9a227]/40" aria-hidden />
              {archive.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openSnap(a.id)}
                  className="relative flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e4dcc4] bg-white/80 px-3.5 py-2.5 text-right transition hover:border-[#c9a227]/60 hover:shadow-md"
                >
                  <span className="absolute right-[-1px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-[#c9a227] bg-[#fffdf6]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-black">{a.jalaliLabel || a.forDate}</span>
                    <span className="block text-[9px] text-muted-foreground">ثبت: {a.createdByName}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold">
                    <span className="rounded-full bg-[#e9f0e4] px-2 py-0.5 text-[#0e7a4a]">سفارش دیروز {faNum(a.digest.createdYesterday)}</span>
                    <span className="rounded-full bg-[#fbe9e0] px-2 py-0.5 text-[#c96f4a]">مرسوله {faNum(a.digest.todayDeliveries)}</span>
                    {a.digest.overdueOrders > 0 && <span className="rounded-full bg-[#fee2e2] px-2 py-0.5 text-[#b3372f]">سرآمده {faNum(a.digest.overdueOrders)}</span>}
                    <span className="rounded-full bg-[#fdf6dd] px-2 py-0.5 text-[#8a6d10]">چک {faNum(a.digest.dueCheques)}</span>
                    {typeof a.digest.priceCheckRemaining === 'number' && a.digest.priceCheckRemaining > 0 && (
                      <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[#a16207]">⏳ قیمت {faNum(a.digest.priceCheckRemaining)}</span>
                    )}
                    {typeof a.digest.priceCheckRed === 'number' && a.digest.priceCheckRed > 0 && (
                      <span className="rounded-full bg-[#fee2e2] px-2 py-0.5 text-[#b3372f]">حاشیه بحرانی {faNum(a.digest.priceCheckRed)}</span>
                    )}
                    <span className="text-[#c9a227]">مشاهده ←</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* the sheet */}
      <div className="briefing-sheet print-area mx-auto w-full max-w-4xl overflow-hidden rounded-2xl shadow-xl">
        {/* header */}
        <div className="hero-emerald relative border-b-2 border-[#c9a227]/60 p-6 text-center">
          <div className="hero-ornament tl">
            <svg width="110" height="60" viewBox="0 0 110 60" fill="none" stroke="#c9a227" strokeWidth="1.4" opacity="0.65">
              <path d="M4 44 C20 44 30 30 34 16 C38 30 48 42 62 44 M34 16 C36 26 40 36 48 42" />
              <circle cx="34" cy="14" r="3.5" fill="#c9a227" stroke="none" />
              <path d="M70 50 C84 46 92 36 96 24 C100 36 106 44 108 46" opacity="0.7" />
              <circle cx="96" cy="21" r="2.5" fill="#93c572" stroke="none" />
            </svg>
          </div>
          <div className="hero-ornament br">
            <svg width="110" height="60" viewBox="0 0 110 60" fill="none" stroke="#c9a227" strokeWidth="1.4" opacity="0.65">
              <path d="M4 44 C20 44 30 30 34 16 C38 30 48 42 62 44 M34 16 C36 26 40 36 48 42" />
              <circle cx="34" cy="14" r="3.5" fill="#c9a227" stroke="none" />
              <path d="M70 50 C84 46 92 36 96 24 C100 36 106 44 108 46" opacity="0.7" />
              <circle cx="96" cy="21" r="2.5" fill="#93c572" stroke="none" />
            </svg>
          </div>
          <div className="relative z-10">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a227] to-[#14532d] shadow-lg">
              <Sunrise size={24} className="text-[#fffdf6]" />
            </div>
            <h1 className="text-xl font-black text-white sm:text-2xl">صبح‌نامه هایپر زیتون 🌿</h1>
            <p className="mt-1 text-sm font-bold text-[#93c572]">
              {d.todayLabel}
              {d.holiday && <span className="mr-2 rounded-full bg-[#b3372f]/25 px-2.5 py-0.5 text-[11px] font-black text-[#ffd9d4]">🎉 {d.holiday.title}</span>}
            </p>
            <p className="mt-0.5 text-[10px] text-[#cfe3d4]/80">
              تنظیم: {formatJalaliDateTime(d.generatedAt)} • تیم {faNum(d.teamSize)} نفره — گزارش جلسه صبح
            </p>
            {isArchived && snapMeta && (
              <p className="mx-auto mt-2 w-fit rounded-full bg-[#c9a227]/25 px-3 py-1 text-[10px] font-black text-[#f3e6bd]">
                🗂️ نسخه آرشیوی — ثبت توسط {snapMeta.createdByName}
              </p>
            )}
          </div>
          <div className="shimmer-line absolute bottom-0 right-0 h-1 w-full" />
        </div>

        <div className="p-5 sm:p-7">
          {/* headline numbers */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {headStats.map((h) => (
              <div key={h.label} className="rounded-xl border border-[#e4dcc4] bg-white/80 p-3 text-center">
                <p className="text-[10px] font-bold text-muted-foreground">{h.label}</p>
                <p className={cn('mt-0.5 text-xl font-black', h.tone)}>{h.value}</p>
                <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{h.sub}</p>
              </div>
            ))}
          </div>

          <div className="ornament-divider my-5">
            <span className="ornament-diamond" />
          </div>

          {/* تابلوی کنترل قیمت روزانه — خلاصه برای جلسه صبح */}
          {(() => {
            const pc = d.priceCheck
            if (!pc) return null
            const alarm = pc.red > 0
            return (
              <button
                onClick={() => !isArchived && ctx.navigate('pricecheck')}
                className={cn(
                  'mb-5 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-right transition',
                  alarm ? 'border-[#b3372f]/40 bg-gradient-to-l from-[#fee2e2]/70 to-[#fff5f4]' : 'border-[#c9a227]/40 bg-gradient-to-l from-[#fdf6dd]/80 to-[#fffdf6]',
                  !isArchived && 'hover:shadow-md'
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-lg shadow-sm">🏷️</span>
                  <span>
                    <span className={cn('block text-xs font-black', alarm ? 'text-[#b3372f]' : 'text-[#8a6d10]')}>
                      کنترل قیمت چاپ‌شده امروز — {pc.remaining > 0 ? `${faNum(pc.remaining)} قلم مانده` : 'همه کنترل شد ✓'}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold text-muted-foreground">
                      حاشیه بحرانی {faNum(pc.red)} • کم‌حاشیه {faNum(pc.yellow)} • مناسب {faNum(pc.green)} از {faNum(pc.total)} قلم
                      {!isArchived && ' — بازکردن تابلو ←'}
                    </span>
                  </span>
                </span>
                <span className={cn('rounded-full px-3 py-1 text-[10px] font-black', alarm ? 'bg-[#b3372f] text-white' : 'bg-[#c9a227] text-white')}>
                  {pc.checkedToday}/{faNum(pc.total)} ✓
                </span>
              </button>
            )
          })()}

          {/* deliveries + overdue */}
          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-[#0e7a4a]">🚚 مرسوله‌های امروز</h2>
              {d.deliveriesList.length === 0 ? (
                <p className="rounded-xl bg-muted/60 p-3 text-[11px] text-muted-foreground">امروز مرسوله‌ای برای دریافت نداریم.</p>
              ) : (
                <ul className="space-y-1.5">
                  {d.deliveriesList.map((d) => (
                    <li key={d.code} className="flex items-center justify-between rounded-xl border border-[#e4dcc4] bg-white/70 px-3 py-2">
                      <span className="text-[11px] font-extrabold">{d.providerName}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {d.code} • {faNum(d.itemsCount)} قلم • {d.payMethod === 'CHEQUE' ? 'چکی' : 'نقدی'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-[#b3372f]">⏰ سفارش‌های سرآمده</h2>
              {d.overdueList.length === 0 ? (
                <p className="rounded-xl bg-[#e9f0e4]/70 p-3 text-[11px] font-bold text-[#0e7a4a]">هیچ سفارشی عقب نیست — عالی! ✅</p>
              ) : (
                <ul className="space-y-1.5">
                  {d.overdueList.map((o) => (
                    <li key={o.code} className="flex items-center justify-between rounded-xl border border-[#b3372f]/25 bg-[#fee2e2]/50 px-3 py-2">
                      <span className="text-[11px] font-extrabold">{o.providerName}</span>
                      <span className="text-[10px] text-[#b3372f]">{o.code} • {faMoney(o.totalAmount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* cheques */}
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-[#8a6d10]">💰 چک‌های هفته پیش‌رو</h2>
              {d.chequesList.length === 0 ? (
                <p className="rounded-xl bg-muted/60 p-3 text-[11px] text-muted-foreground">تا ۷ روز آینده سررسید چکی نداریم.</p>
              ) : (
                <table className="w-full text-right text-[10px] table-luxe">
                  <thead>
                    <tr className="border-b border-[#e4dcc4] text-[9px] text-muted-foreground">
                      <th className="p-1.5">شماره</th>
                      <th className="p-1.5">مبلغ (تومان)</th>
                      <th className="p-1.5">گیرنده</th>
                      <th className="p-1.5">سررسید</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.chequesList.map((c) => (
                      <tr key={c.number} className="border-b border-[#e4dcc4]/50">
                        <td className="p-1.5 font-mono">{faNum(c.number)}</td>
                        <td className="p-1.5 font-black text-[#8a6d10]">{faMoney(c.amount)}</td>
                        <td className="p-1.5">{c.recipientName}</td>
                        <td className="p-1.5">{faNum(c.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* stock */}
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-[#c96f4a]">🧺 هشدار انبار</h2>
              {d.stockList.length === 0 ? (
                <p className="rounded-xl bg-[#e9f0e4]/70 p-3 text-[11px] font-bold text-[#0e7a4a]">موجودی همه کالاها سالم است ✅</p>
              ) : (
                <ul className="scroll-gold max-h-44 space-y-1 overflow-y-auto pl-1">
                  {d.stockList.map((p) => (
                    <li key={p.name} className="flex items-center justify-between rounded-lg border border-[#e4dcc4]/70 bg-white/60 px-2.5 py-1.5">
                      <span className="truncate text-[10px] font-bold">{p.name}</span>
                      <span className={cn('shrink-0 text-[10px] font-black', p.stock === 0 ? 'text-[#b3372f]' : 'text-[#a16207]')}>
                        {p.stock === 0 ? 'ناموجود!' : `${faNum(p.stock)} از ${faNum(p.reorderLevel)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* expiring */}
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-[#a16207]">⏳ نزدیک به انقضا</h2>
              {d.expiringList.length === 0 ? (
                <p className="rounded-xl bg-[#e9f0e4]/70 p-3 text-[11px] font-bold text-[#0e7a4a]">خبر خوب: کالای نزدیک انقضا نداریم ✅</p>
              ) : (
                <ul className="space-y-1">
                  {d.expiringList.map((e, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg border border-[#a16207]/25 bg-[#fef9c3]/50 px-2.5 py-1.5">
                      <span className="truncate text-[10px] font-bold">{e.productName}</span>
                      <span className={cn('shrink-0 text-[10px] font-black', e.daysLeft <= 3 ? 'text-[#b3372f]' : 'text-[#a16207]')}>
                        {e.daysLeft < 0 ? 'منقضی!' : `${faNum(e.daysLeft)} روز`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* tasks */}
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-[#0e7a4a]">📋 وظایف آماده یا سرآمده امروز</h2>
              {d.tasksList.length === 0 ? (
                <p className="rounded-xl bg-muted/60 p-3 text-[11px] text-muted-foreground">وظیفه معوقی برای امروز نیست.</p>
              ) : (
                <ul className="space-y-1">
                  {d.tasksList.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-[#e4dcc4]/70 bg-white/60 px-2.5 py-1.5">
                      <span className="truncate text-[10px] font-bold">{t.title}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[9px] text-muted-foreground">{t.assignedToName}</span>
                        <Pill label={PRIORITY_LABEL[t.priority]?.label || t.priority} color={PRIORITY_LABEL[t.priority]?.color || '#6b7280'} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ideas + requests */}
            <section className="lg:col-span-2">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-[#77934a]">💡 ایده‌های تازه تیم و پرتقاضاترین کالاهای مشتریان</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-[#e4dcc4] bg-white/70 p-3">
                  <p className="mb-1.5 text-[10px] font-black text-muted-foreground">ایده‌های در انتظار بررسی ({faNum(s.newIdeas)})</p>
                  {d.ideasList.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">ایده جدیدی نیست.</p>
                  ) : (
                    <ul className="space-y-1">
                      {d.ideasList.map((f, i) => (
                        <li key={i} className="text-[11px] leading-5">«{f.content}» — <b className="text-[10px]">{f.authorName}</b></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-[#e4dcc4] bg-white/70 p-3">
                  <p className="mb-1.5 text-[10px] font-black text-muted-foreground">مشتریان دنبال این کالاها بودند</p>
                  {d.requestsList.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">درخواستی ثبت نشده.</p>
                  ) : (
                    <ul className="space-y-1">
                      {d.requestsList.map((r) => (
                        <li key={r.productName} className="flex items-center justify-between text-[11px]">
                          <span className="font-bold">{r.productName}</span>
                          <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[9px] font-black text-[#b3372f]">{faNum(r.count)} بار</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="ornament-divider my-5">
            <span className="ornament-diamond" />
          </div>

          {/* signature */}
          <div className="grid grid-cols-2 gap-8 text-center">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground">مدیر عملیات — کیانوش صفاپور</p>
              <div className="mt-6 border-t border-dashed border-[#c9a227]/70" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground">مدیر کل — مینا لطفی</p>
              <div className="mt-6 border-t border-dashed border-[#c9a227]/70" />
            </div>
          </div>
          <p className="mt-4 text-center text-[9px] text-muted-foreground">صبح‌نامه هر روز صبح با جدیدترین داده‌ها ساخته می‌شود • هایپر زیتون کرمان 🌿</p>
        </div>
      </div>
    </div>
  )
}
