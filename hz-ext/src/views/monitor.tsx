/**
 * system/monitor — پایش زندهٔ سرور (R13) — فقط مالک/ادمین.
 * هر ۵ ثانیه /api/system/monitor را می‌خواند و سنجه‌ها را زنده نشان می‌دهد:
 * CPU، رم، دیسک، دیتابیس (حجم/تأخیر)، وضعیت سرویس‌ها و آپ‌تایم.
 */
import { useState, useEffect, useRef, api, useShell, toast, cn, Button, Card, CardContent, CardHeader, CardTitle, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, fa, money, formatJalali, I } from '../lib/hz'

interface Metrics {
  at: string
  tookMs: number
  cpu: { pct: number; cores: number; model: string; load1: number; load5: number; load15: number }
  mem: { total: number; free: number; used: number; usedPct: number; rss: number; heapUsed: number }
  disk: { total: number; free: number; used: number; usedPct: number; path: string } | null
  db: { size: number | null; latencyMs: number | null; productCount: number; userCount: number; orderToday: number; invoiceOpen: number; notifToday: number }
  services: { name: string; systemd: string | null; tcp: boolean }[]
  runtime: { platform: string; hostname: string; bun: string | null; node: string; processUptimeSec: number; serverUptimeSec: number }
}

function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${fa(Math.round(v * 10) / 10)} ${units[i]}`
}
function uptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return d > 0 ? `${fa(d)} روز و ${fa(h)} ساعت` : h > 0 ? `${fa(h)} ساعت و ${fa(m)} دقیقه` : `${fa(m)} دقیقه`
}
function Gauge({ pct, label, detail, danger = 90, warn = 75 }: { pct: number; label: string; detail: string; danger?: number; warn?: number }) {
  const color = pct >= danger ? 'bg-rose-500' : pct >= warn ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-stone-500">{label}</span>
        <span className={cn('text-sm font-black', pct >= danger ? 'text-rose-600' : pct >= warn ? 'text-amber-600' : 'text-emerald-700')}>{fa(pct)}٪</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-1.5 text-[10px] text-stone-400" dir="rtl">{detail}</div>
    </div>
  )
}
function jdate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : fa(formatJalali(d).replace(/-/g, '/'))
}

export default function MonitorView() {
  const { user } = useShell()
  const [m, setM] = useState<Metrics | null>(null)
  const [err, setErr] = useState('')
  const [auto, setAuto] = useState(true)
  const [history, setHistory] = useState<number[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadOnce = (quiet = false) => {
    api('/api/system/monitor')
      .then((r: any) => {
        if (r.ok) {
          setM(r.data as Metrics)
          setErr('')
          setHistory((h) => [...h.slice(-59), r.data.cpu.pct])
        } else {
          setErr(r.error || 'دریافت سنجه‌ها ناموفق بود')
          if (!quiet) toast.error(r.error || 'دریافت سنجه‌ها ناموفق بود')
        }
      })
      .catch(() => setErr('ارتباط با سرور برقرار نشد'))
  }

  useEffect(() => { loadOnce(false) }, [])
  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (auto) timer.current = setInterval(() => loadOnce(true), 5000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [auto])

  const allowed = !!user && ['OWNER', 'ADMIN', 'GM'].includes(String(user.role))
  if (!allowed) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <I.lock size={28} className="mx-auto text-stone-300" />
          <p className="mt-3 text-sm font-bold text-stone-600">پایش سرور فقط برای مدیر سامانه (مالک/ادمین) است</p>
        </CardContent>
      </Card>
    )
  }

  /* R14: از همان نخستین نمونه یک خطِ صاف رسم می‌شود — نه پس از ۵ ثانیه */
  const sparkPts = history.length === 1 ? [history[0], history[0]] : history
  const cpuSpark = sparkPts.length > 1
    ? `M ${sparkPts.map((v, i) => `${(i / Math.max(1, sparkPts.length - 1)) * 100},${40 - (v / 100) * 36}`).join(' L ')}`
    : ''

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <I.zap size={18} className="text-amber-500" /> پایش زندهٔ سرور
            {m ? (
              <Badge variant="outline" className={cn('gap-1 border-transparent text-[10px]', auto ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-500')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', auto ? 'animate-pulse bg-emerald-500' : 'bg-stone-400')} />
                {auto ? 'زنده — هر ۵ ثانیه' : 'متوقف'}
              </Badge>
            ) : null}
            {m ? <span className="text-[11px] font-normal text-stone-400">آخرین نمونه: {jdate(m.at)} · {fa(m.tookMs)}ms</span> : null}
            <span className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => { loadOnce(false) }}><I.refresh size={14} /> نمونه‌گیری</Button>
            <Button size="sm" variant={auto ? 'outline' : 'default'} onClick={() => setAuto((a) => !a)}>
              {auto ? 'توقف خودکار' : 'شروع خودکار'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {err ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>
          ) : !m ? (
            <div className="py-10 text-center text-sm text-stone-400">در حال دریافت سنجه‌ها…</div>
          ) : (
            <div className="space-y-4">
              {/* سنجه‌های اصلی */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Gauge pct={m.cpu.pct} label={`پردازنده — ${fa(m.cpu.cores)} هسته`} detail={`لود ۱/۵/۱۵ دقیقه: ${fa(m.cpu.load1)} / ${fa(m.cpu.load5)} / ${fa(m.cpu.load15)}`} />
                <Gauge pct={m.mem.usedPct} label="حافظهٔ سرور" detail={`${bytes(m.mem.used)} از ${bytes(m.mem.total)} — آزاد: ${bytes(m.mem.free)}`} />
                {m.disk ? (
                  <Gauge pct={m.disk.usedPct} label={`دیسک — ${m.disk.path}`} detail={`${bytes(m.disk.used)} از ${bytes(m.disk.total)} — آزاد: ${bytes(m.disk.free)}`} />
                ) : (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] text-stone-400">دیسک: در این محیط قابل خواندن نیست</div>
                )}
              </div>

              {/* اسپارک CPU */}
              {cpuSpark ? (
                <div className="rounded-xl border border-stone-200 bg-white p-3">
                  <p className="mb-1 text-[11px] font-bold text-stone-500">روند پردازنده (۶۰ نمونهٔ اخیر)</p>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-14 w-full" dir="ltr">
                    <line x1="0" y1="40" x2="100" y2="40" stroke="#e7e5e4" strokeWidth="0.5" />
                    <line x1="0" y1="20" x2="100" y2="20" stroke="#f5f5f4" strokeWidth="0.5" />
                    <path d={cpuSpark} fill="none" stroke="#f59e0b" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  </svg>
                </div>
              ) : null}

              {/* سرویس‌ها */}
              <div>
                <p className="mb-2 text-[12px] font-bold text-stone-600">سرویس‌های سر رسید</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {m.services.map((s) => {
                    const active = s.systemd === 'active' || (s.name === 'sarresid-web' ? true : s.tcp)
                    return (
                      <div key={s.name} className={cn('flex items-center justify-between rounded-xl border p-3', active ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60')}>
                        <div>
                          <div className="font-mono text-[12px] font-bold text-stone-800" dir="ltr">{s.name}</div>
                          <div className="text-[10px] text-stone-400">
                            systemd: {s.systemd ?? '—'}{s.name !== 'sarresid-web' ? ` · پورت: ${s.tcp ? 'باز ✓' : 'بسته ✗'}` : ' · همین درخواست ✓'}
                          </div>
                        </div>
                        <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', active ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')}>
                          <span className={cn('h-1.5 w-1.5 rounded-full bg-white', active && 'animate-pulse')} />
                          {active ? 'فعال' : 'دچار مشکل'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* دیتابیس + ران‌تایم */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-teal-800"><I.layers size={14} /> دیتابیس</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px] leading-5">
                    <span className="text-stone-500">حجم فایل:</span><b className="text-stone-800">{bytes(m.db.size)}</b>
                    <span className="text-stone-500">تأخیر پرس‌وجو:</span><b className={cn(m.db.latencyMs != null && m.db.latencyMs > 200 ? 'text-amber-700' : 'text-emerald-700')}>{m.db.latencyMs == null ? '—' : `${fa(m.db.latencyMs)} میلی‌ثانیه`}</b>
                    <span className="text-stone-500">کالاها:</span><b className="text-stone-800">{fa(m.db.productCount)}</b>
                    <span className="text-stone-500">کاربران:</span><b className="text-stone-800">{fa(m.db.userCount)}</b>
                    <span className="text-stone-500">سفارش امروز:</span><b className="text-stone-800">{fa(m.db.orderToday)}</b>
                    <span className="text-stone-500">فاکتورهای باز:</span><b className="text-stone-800">{fa(m.db.invoiceOpen)}</b>
                    <span className="text-stone-500">اعلان امروز:</span><b className="text-stone-800">{fa(m.db.notifToday)}</b>
                  </div>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-sky-800"><I.info size={14} /> سرور و پروسه</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px] leading-5">
                    <span className="text-stone-500">میزبان:</span><b className="truncate font-mono text-stone-800" dir="ltr">{m.runtime.hostname}</b>
                    <span className="text-stone-500">سامانه:</span><b className="font-mono text-stone-800" dir="ltr">{m.runtime.platform}</b>
                    <span className="text-stone-500">Bun:</span><b className="font-mono text-stone-800" dir="ltr">{m.runtime.bun ?? '—'}</b>
                    <span className="text-stone-500">Node:</span><b className="font-mono text-stone-800" dir="ltr">{m.runtime.node}</b>
                    <span className="text-stone-500">آپ‌تایم پروسهٔ وب:</span><b className="text-stone-800">{uptime(m.runtime.processUptimeSec)}</b>
                    <span className="text-stone-500">آپ‌تایم سرور:</span><b className="text-stone-800">{uptime(m.runtime.serverUptimeSec)}</b>
                    <span className="text-stone-500">رم پروسهٔ وب (RSS):</span><b className="text-stone-800">{bytes(m.mem.rss)}</b>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
