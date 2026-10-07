'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { api } from '@/lib/client'
import { faMoney, faNum } from '@/lib/jalali'
import { EmptyState } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { cn } from '@/lib/utils'
import { FileSpreadsheet, Banknote, Users, ClipboardList, Boxes, Download, ArrowRight, BadgePercent, TrendingUp } from 'lucide-react'

type ReportData = {
  title: string
  columns: string[]
  rows: (string | number)[][]
  summary: { label: string; value: number; extra: string }
  unit?: string
  moneyColumns?: string[]
}

type ReportMeta = {
  key: string
  label: string
  desc: string
  icon: React.ReactNode
  tint: string
  tintBg: string
}

const REPORTS: ReportMeta[] = [
  {
    key: 'cheques',
    label: 'چک‌های پرداختی',
    desc: 'همه چک‌ها با سررسید شمسی، گیرنده و وضعیت — برای جلسه با مالک و مرتب‌سازی دفتر هلو',
    icon: <Banknote size={20} />,
    tint: '#8a6d10',
    tintBg: 'from-[#fdf6dd] to-[#fffdf6]',
  },
  {
    key: 'staff',
    label: 'عملکرد تیم',
    desc: 'امتیاز، وظایف انجام‌شده و قدردانی هر همکار — مبنای تشویق منصفانه در جلسه هفتگی',
    icon: <Users size={20} />,
    tint: '#0e7a4a',
    tintBg: 'from-[#e9f0e4] to-[#fffdf6]',
  },
  {
    key: 'orders',
    label: 'سفارش‌های ۳۰ روز',
    desc: 'گردش خرید یک ماه اخیر به تفکیک تأمین‌کننده و وضعیت — مقایسه با ماه قبل',
    icon: <ClipboardList size={20} />,
    tint: '#c96f4a',
    tintBg: 'from-[#fbe9e0] to-[#fffdf6]',
  },
  {
    key: 'inventory',
    label: 'موجودی و ارزش انبار',
    desc: 'ارزش ریالی قفسه‌ها، نقطه سفارش و سرعت فروش هر کالا — پایه تصمیم خرید',
    icon: <Boxes size={20} />,
    tint: '#77934a',
    tintBg: 'from-[#eef3e3] to-[#fffdf6]',
  },
  {
    key: 'pricechanges',
    label: 'تغییرات قیمت ۳۰ روز',
    desc: 'هر قیمتی که در تابلوی کنترل قیمت ثبت یا تأیید شده — فهرست به‌روزرسانی دفتر هلو',
    icon: <BadgePercent size={20} />,
    tint: '#b3372f',
    tintBg: 'from-[#fdeee9] to-[#fffdf6]',
  },
  {
    key: 'pricetrend',
    label: 'روند هفتگی قیمت خرید',
    desc: 'میانگین قیمت خرید هر کالا در ۱۰ هفته اخیر و تورم کل — سند مذاکره با تأمین‌کننده‌ها',
    icon: <TrendingUp size={20} />,
    tint: '#c9a227',
    tintBg: 'from-[#fdf3d3] to-[#fffdf6]',
  },
]

export default function ReportsView({ ctx }: { ctx: AppCtx }) {
  const [active, setActive] = useState<string>('')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!active) return
    const run = async () => {
      setErr('')
      setLoading(true)
      try {
        const d = await api<ReportData>(`/api/reports?type=${active}`)
        setData(d)
      } catch (e: any) {
        setErr(e.message || 'خطا در دریافت گزارش')
      } finally {
        setLoading(false)
      }
    }
    const t = setTimeout(run, 0)
    return () => clearTimeout(t)
  }, [active])

  const downloadXls = () => {
    if (!data || !active) return
    try {
      const meta = REPORTS.find((r) => r.key === active)!
      const aoa: (string | number)[][] = [
        [`${data.title} — هایپر زیتون کرمان`],
        [new Date().toLocaleDateString('fa-IR')],
        [],
        data.columns,
        ...data.rows,
        [],
        [data.summary.label, data.summary.value, data.summary.extra],
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = data.columns.map((c) => ({ wch: Math.max(12, Math.min(42, c.length + 6)) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, meta.label.slice(0, 28))
      XLSX.writeFile(wb, `hyper-zeytoon-${active}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success('فایل اکسل گزارش دانلود شد 📊')
    } catch {
      toast.error('ساخت فایل اکسل ناموفق بود — دوباره تلاش کنید')
    }
  }

  const activeMeta = useMemo(() => REPORTS.find((r) => r.key === active), [active])

  if (!ctx.user) return null

  return (
    <div className="space-y-4">
      {/* hero */}
      <div className="hero-emerald relative overflow-hidden rounded-2xl border-b-2 border-[#c9a227]/60 p-5 sm:p-6">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a227] to-[#14532d] shadow-lg">
              <FileSpreadsheet size={24} className="text-[#fffdf6]" />
            </span>
            <div>
              <h1 className="text-lg font-black text-white sm:text-xl">گزارش‌ها و خروجی اکسل 📊</h1>
              <p className="mt-0.5 text-[11px] font-bold text-[#93c572]">
                هر گزارش با یک کلیک آماده است — خروجی اکسل برای هلو و جلسات مدیریتی
              </p>
            </div>
          </div>
          <p className="rounded-xl bg-white/10 px-3 py-1.5 text-[10px] font-bold text-[#cfe3d4]">
            تاریخ‌ها همه شمسی • اعداد فارسی
          </p>
        </div>
        <div className="shimmer-line absolute bottom-0 right-0 h-1 w-full" />
      </div>

      {/* report picker cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setActive(r.key)}
            className={cn(
              'glow-card group flex flex-col rounded-2xl bg-gradient-to-bl p-4 text-right transition hover:-translate-y-0.5 hover:shadow-xl',
              r.tintBg,
              active === r.key && 'ring-2 ring-[#c9a227]'
            )}
          >
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl shadow-md transition group-hover:scale-105" style={{ background: r.tint }}>
              <span className="text-[#fffdf6]">{r.icon}</span>
            </span>
            <p className="text-sm font-black">{r.label}</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{r.desc}</p>
            {active === r.key && <p className="mt-2 text-[10px] font-black" style={{ color: r.tint }}>● در حال نمایش</p>}
          </button>
        ))}
      </div>

      {/* report area */}
      {!active && (
        <EmptyState
          emoji="🗂️"
          title="یکی از گزارش‌ها را انتخاب کنید"
          hint="چک‌ها، عملکرد تیم، سفارش‌ها یا موجودی انبار — پیش‌نمایش همین‌جا و خروجی اکسل با یک دکمه"
        />
      )}

      {active && activeMeta && (
        <section className="glow-card gold-glow-border fade-in-up rounded-2xl bg-card p-4 sm:p-6">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[#fffdf6]" style={{ background: activeMeta.tint }}>
                {activeMeta.icon}
              </span>
              <div>
                <h2 className="text-base font-bold">{data?.title || 'در حال بارگذاری…'}</h2>
                {data && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {faNum(data.rows.length)} ردیف • {faNum(data.columns.length)} ستون
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setActive(''); setData(null) }}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-extrabold transition hover:border-[#c9a227]/60"
              >
                <ArrowRight size={13} /> بازگشت
              </button>
              <button
                onClick={downloadXls}
                disabled={!data || loading}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
              >
                <Download size={14} /> دانلود اکسل
              </button>
            </div>
          </header>

          {/* summary strip */}
          {data && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#c9a227]/30 bg-[#fdf6dd]/50 p-3.5">
              <span className="text-[11px] font-bold text-muted-foreground">{data.summary.label}:</span>
              <span className="text-lg font-black text-[#8a6d10]">{faMoney(data.summary.value)}</span>
              <span className="text-[10px] font-bold text-muted-foreground">{data.unit || 'تومان'} • {data.summary.extra}</span>
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-xl bg-muted/60" />
              ))}
            </div>
          )}
          {err && !loading && (
            <div className="rounded-xl border border-[#b3372f]/40 bg-[#fee2e2]/60 p-3.5 text-xs font-bold text-[#b3372f]">{err}</div>
          )}

          {data && !loading && !err && (
            <div className="scroll-gold max-h-96 overflow-auto rounded-xl border border-[#e4dcc4]">
              <table className="table-luxe w-full min-w-[860px] text-right text-[11px]">
                <thead className="sticky top-0 z-10 bg-[#f7f3e6]">
                  <tr>
                    <th className="p-2.5 text-[10px] font-black text-muted-foreground">#</th>
                    {data.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap p-2.5 text-[10px] font-black text-muted-foreground">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, ri) => (
                    <tr key={ri} className="transition hover:bg-[#fdf6dd]/40">
                      <td className="p-2.5 text-[10px] text-muted-foreground">{faNum(ri + 1)}</td>
                      {row.map((cell, ci) => {
                        const col = data.columns[ci]
                        const isMoney = typeof cell === 'number' && cell >= 1000 && (data.moneyColumns?.includes(col) || col.includes('مبلغ') || col.includes('تومان') || col.includes('ارزش'))
                        const isInflation = typeof cell === 'number' && col.includes('تورم')
                        const isNegative = typeof cell === 'number' && cell < 0
                        return (
                          <td
                            key={ci}
                            className={cn(
                              'whitespace-nowrap p-2.5',
                              typeof cell === 'number' ? 'font-black tabular-nums' : 'font-medium',
                              isMoney && 'text-[#8a6d10]',
                              isInflation && (cell > 0 ? 'text-[#b3372f]' : 'text-[#0e7a4a]'),
                              isNegative && 'text-[#b3372f]'
                            )}
                          >
                            {typeof cell === 'number' ? (isMoney ? faMoney(cell) : faNum(cell)) : cell}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && !loading && data.rows.length === 0 && (
            <EmptyState emoji="🍃" title="داده‌ای برای این گزارش نیست" hint="به‌محض ثبت اولین داده، گزارش ساخته می‌شود" />
          )}

          <p className="mt-3 text-[10px] text-muted-foreground">
            💡 خروجی اکسل مستقیماً برای پیوست گزارش جلسه یا مقایسه با دفتر هلو قابل استفاده است؛ تاریخ‌ها شمسی ذخیره می‌شوند.
          </p>
        </section>
      )}
    </div>
  )
}
