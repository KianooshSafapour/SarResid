/**
 * finance/stats — آمار و تحلیل سود (R15 — جایگزین نمای فروزن خراب).
 * KPIها + توزیع حاشیه + توضیح صادقانهٔ «حاشیهٔ قرمز» + پرفروش‌ها + تأمین‌کنندگان + دسته‌ها + روند روزانه.
 * دکمهٔ «بازبینی در فاکتورنویس»: فاکتورِ آخرین خریدِ همان کالا را باز می‌کند؛
 * اگر نهایی/بایگانی باشد، فرم جدید با همان کالا پیش‌پر می‌شود (?product=).
 */
import { useState, useEffect, useMemo, api, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, money, toman, fa, toFaDigits, toJalali, JALALI_MONTHS, jalaliWeekday, I } from '../lib/hz'

const STATE_FA: Record<string, string> = {
  draft: 'پیش‌نویس', delivered: 'تحویل‌شده', reviewing: 'در بررسی', final: 'فاکتور خرید', archived: 'بایگانی‌شده', cancelled: 'لغوشده',
}

export default function StatsView() {
  const { go } = useShell()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [shift, setShift] = useState<any>(null)

  const load = (f = from, t = to) => {
    setLoading(true)
    const qs = `?${new URLSearchParams({ ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) }).toString()}`
    api('/api/margin/stats' + qs)
      .then((r: any) => {
        if (r.ok) setData(r.data)
        else toast.error(r.error || 'آمار دریافت نشد')
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load('', '') }, [])
  useEffect(() => { api('/api/analytics/shifts').then((r: any) => { if (r.ok) setShift(r.data) }) }, [])

  const k = data?.kpis
  const dist = data?.distribution
  const distTotal = dist ? dist.red + dist.yellow + dist.green + (dist.free ?? 0) : 0
  const trend = useMemo(() => (data?.trend ?? []).map((t: any) => ({ label: t.label, value: Math.round(t.profit / 1_000_000) })), [data])
  const trendMax = trend.length ? Math.max(...trend.map((t: any) => Math.abs(t.value)), 1) : 1

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <I.barChart size={18} className="text-teal-700" /> آمار و تحلیل سود
            <span className="text-xs font-normal text-stone-400">سود برآوردی از فاکتورهای سودسنج — قیمت فروش منهای بهای خرید</span>
            <span className="flex-1" />
            <Input value={from} onChange={(e: any) => setFrom(e.target.value)} placeholder="از ۱۴۰۵-۰۸-۰۱" className="h-8 w-32 text-[11px]" dir="ltr" />
            <Input value={to} onChange={(e: any) => setTo(e.target.value)} placeholder="تا ۱۴۰۵-۰۸-۳۰" className="h-8 w-32 text-[11px]" dir="ltr" />
            <Button size="sm" variant="outline" onClick={() => load()}>اعمال</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-stone-400">در حال محاسبه…</div>
          ) : !data ? (
            <div className="py-10 text-center text-sm text-stone-400">داده‌ای نیست</div>
          ) : (
            <div className="space-y-4">
              {/* KPI */}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: 'فاکتورها', value: fa(k?.invoiceCount ?? 0), cls: 'text-stone-800' },
                  { label: 'اقلام', value: fa(k?.itemCount ?? 0), cls: 'text-stone-800' },
                  { label: 'جمع خرید', value: `${money(k?.totalPurchase)} ریال`, cls: 'text-stone-800' },
                  { label: 'درآمد برآوردی', value: `${money(k?.totalExpectedRevenue)} ریال`, cls: 'text-emerald-700' },
                  { label: 'سود برآوردی', value: `${money(k?.totalExpectedProfit)} ریال`, cls: (k?.totalExpectedProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700' },
                  { label: 'حاشیهٔ وزنی', value: k?.weightedMargin == null ? '—' : `${fa(Math.round(k.weightedMargin * 100) / 100)}٪`, cls: (k?.weightedMargin ?? 0) >= (data.thresholds?.red ?? 12) ? 'text-emerald-700' : 'text-rose-700' },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl border border-stone-200 bg-white p-2.5">
                    <div className="text-[10px] text-stone-400">{c.label}</div>
                    <div dir="rtl" className={cn('mt-0.5 text-xs font-black', c.cls)}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* توضیح صادقانهٔ حاشیهٔ قرمز + توزیع */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-white p-3">
                  <p className="text-[12px] font-bold text-stone-700">توزیع حاشیهٔ سود اقلام</p>
                  <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-stone-100" dir="rtl">
                    {dist && distTotal > 0 && (
                      <>
                        <div className="bg-rose-500" style={{ width: `${(dist.red / distTotal) * 100}%` }} title={`قرمز: ${dist.red}`} />
                        <div className="bg-amber-400" style={{ width: `${(dist.yellow / distTotal) * 100}%` }} title={`کهربایی: ${dist.yellow}`} />
                        <div className="bg-emerald-500" style={{ width: `${(dist.green / distTotal) * 100}%` }} title={`سبز: ${dist.green}`} />
                        {!!dist.free && <div className="bg-stone-300" style={{ width: `${(dist.free / distTotal) * 100}%` }} title={`رایگان: ${dist.free}`} />}
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-600">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> قرمز (زیر {fa(data.thresholds?.red ?? 12)}٪): {fa(dist?.red ?? 0)} قلم</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> کهربایی ({fa(data.thresholds?.red ?? 12)}–{fa(data.thresholds?.yellow ?? 21)}٪): {fa(dist?.yellow ?? 0)}</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> سبز (بالای {fa(data.thresholds?.yellow ?? 21)}٪): {fa(dist?.green ?? 0)}</span>
                    {!!dist?.free && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-stone-300" /> رایگان (۱۰۰٪): {fa(dist.free)}</span>}
                  </div>
                  <p className="mt-2 rounded-lg bg-stone-50 p-2 text-[10px] leading-5 text-stone-500">
                    «حاشیهٔ قرمز» یعنی: بهای خریدِ آن قلم در برابر قیمت فروشش کمتر از {fa(data.thresholds?.red ?? 12)}٪ سود می‌دهد —
                    در تورم بالا معمولاً یعنی قیمت‌گذاری عقب مانده یا تخفیف ورودی سنگین بوده. راه‌حل: در «بررسی حسابداری» یا
                    «فهرست زیر» قیمت را به نرخ روز اصلاح کنید یا قلم را به تأمین‌کننده برگردانید (مرجوعی).
                  </p>
                </div>

                {/* روند روزانه سود */}
                <div className="rounded-xl border border-stone-200 bg-white p-3">
                  <p className="text-[12px] font-bold text-stone-700">روند سود برآوردی روزانه (میلیون ریال)</p>
                  {trend.length ? (
                    <div className="mt-2 flex h-24 items-end gap-1" dir="rtl">
                      {trend.map((t: any, i: number) => (
                        <div key={i} className="flex-1" title={`${t.label}: ${money(t.value * 1_000_000)} ریال`}>
                          <div
                            className={cn('w-full rounded-t', t.value >= 0 ? 'bg-emerald-400' : 'bg-rose-400')}
                            style={{ height: `${Math.max(3, (Math.abs(t.value) / trendMax) * 88)}px` }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-[11px] text-stone-400">فاکتوری در این بازه نیست</p>
                  )}
                </div>
              </div>

              {/* R17: تحلیل دو-شیفته + ساعتی + مقایسه با هفتهٔ قبل (بازطراحی) */}
              {shift ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {/* امروز + مقایسهٔ هفتگی */}
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="text-[12px] font-bold text-stone-700">شیفت‌های امروز</p>
                    <div className="mt-2 space-y-2">
                      {(['M', 'A'] as const).map((k) => (
                        <div key={k} className="rounded-lg border border-stone-100 bg-stone-50 p-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-700">
                            <span className={cn('h-2 w-2 rounded-full', k === 'M' ? 'bg-teal-500' : 'bg-amber-500')} />
                            {shift.today[k].label}
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-2">
                            <span className="num text-[15px] font-black text-stone-800">{fa(shift.today[k].count)}</span>
                            <span className="num text-[10px] text-stone-500">{money(shift.today[k].amount)} ریال</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 rounded-lg border border-stone-100 bg-white p-2 text-[10px] leading-5 text-stone-600">
                      <span className="font-bold text-stone-700">این هفته در برابر قبل:</span>{' '}
                      <span className="num">
                        {shift.compare.countPct == null ? 'بدون دادهٔ هفتهٔ قبل' : (
                          <span className={cn('font-bold', shift.compare.countPct >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                            {shift.compare.countPct >= 0 ? <I.trendingUp size={11} className="inline align-[-2px]" /> : <I.trendingDown size={11} className="inline align-[-2px]" />}
                            {' '}{shift.compare.countPct > 0 ? '+' : ''}{fa(shift.compare.countPct)}٪ رخداد
                            {shift.compare.amountPct != null && <> · {shift.compare.amountPct > 0 ? '+' : ''}{fa(shift.compare.amountPct)}٪ مبلغ</>}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* نمودار ساعتی — امروز در برابر دیروز */}
                  <div className="rounded-xl border border-stone-200 bg-white p-3 lg:col-span-2">
                    <p className="flex items-center justify-between text-[12px] font-bold text-stone-700">
                      عملکرد ساعتی — امروز در برابر دیروز
                      <span className="flex items-center gap-2.5 text-[9.5px] font-normal text-stone-500">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal-500" /> امروز</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-stone-300" /> دیروز</span>
                      </span>
                    </p>
                    {(() => {
                      const mx = Math.max(1, ...shift.hourly.map((x: any) => Math.max(x.today.amount, x.yesterday.amount)))
                      return (
                        <div className="mt-2" dir="ltr">
                          <div className="flex h-24 items-end gap-[3px]">
                            {shift.hourly.map((h: any) => (
                              <div key={h.hour} className="flex h-full flex-1 items-end justify-center gap-px" title={`ساعت ${fa(h.hour)} — امروز: ${fa(h.today.count)} رخداد / ${money(h.today.amount)} ریال\nدیروز: ${fa(h.yesterday.count)} رخداد / ${money(h.yesterday.amount)} ریال`}>
                                <div className="h-full w-full max-w-[10px] rounded-t-sm bg-stone-200" style={{ height: `${Math.max(2, (h.yesterday.amount / mx) * 100)}%` }} />
                                <div className="h-full w-full max-w-[10px] rounded-t-sm bg-teal-500" style={{ height: `${Math.max(2, (h.today.amount / mx) * 100)}%` }} />
                              </div>
                            ))}
                          </div>
                          <div className="mt-1 flex justify-between text-[9px] leading-4 text-stone-400">
                            {[0, 3, 6, 9, 12, 15, 18, 21, 23].map((hh) => <span key={hh}>{toFaDigits(String(hh))}</span>)}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* هفت روز اخیر به تفکیک شیفت */}
                  <div className="rounded-xl border border-stone-200 bg-white p-3 lg:col-span-3">
                    <p className="flex items-center justify-between text-[12px] font-bold text-stone-700">
                      هفت روز اخیر به تفکیک شیفت (شمار رخداد)
                      <span className="flex items-center gap-2.5 text-[9.5px] font-normal text-stone-500">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal-500" /> شیفت صبح</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" /> شیفت عصر</span>
                      </span>
                    </p>
                    {(() => {
                      const weekMax = Math.max(1, ...shift.week.map((d: any) => Math.max(d.M.count, d.A.count)))
                      return (
                        <div className="mt-2 grid grid-cols-7 gap-1.5" dir="rtl">
                          {shift.week.map((d: any, i: number) => {
                            const g = new Date(`${d.date}T12:00:00`)
                            const j = toJalali(g)
                            return (
                              <div key={i} className="rounded-lg border border-stone-100 bg-stone-50/70 p-1.5 text-center"
                                title={`${jalaliWeekday(g)} ${toFaDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} — صبح: ${fa(d.M.count)} رخداد / ${money(d.M.amount)} ریال — عصر: ${fa(d.A.count)} رخداد / ${money(d.A.amount)} ریال`}>
                                <div className="text-[9.5px] font-bold leading-4 text-stone-600">{jalaliWeekday(g)}</div>
                                <div className="num text-[9px] leading-4 text-stone-400">{toFaDigits(j.jd)} {JALALI_MONTHS[j.jm - 1]}</div>
                                <div className="mt-1 flex h-14 items-end justify-center gap-1">
                                  <div className="w-2.5 rounded-t-sm bg-teal-500" style={{ height: `${Math.max(d.M.count > 0 ? 4 : 1, Math.round((d.M.count / weekMax) * 56))}px` }} />
                                  <div className="w-2.5 rounded-t-sm bg-amber-400" style={{ height: `${Math.max(d.A.count > 0 ? 4 : 1, Math.round((d.A.count / weekMax) * 56))}px` }} />
                                </div>
                                <div className="num mt-1 text-[10px] font-bold leading-4 text-teal-700">{fa(d.M.count)}</div>
                                <div className="num text-[10px] font-bold leading-4 text-amber-600">{fa(d.A.count)}</div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              ) : null}

              {/* فهرست حاشیهٔ قرمز — با بازبینی در فاکتورنویسِ درست */}
              <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                <p className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-rose-800">
                  <I.alertTriangle size={14} /> کالاهای با حاشیهٔ قرمز — قیمت‌گذاری‌شان را بازبینی کنید
                  <span className="text-[10px] font-normal text-stone-500">(فقط اقلام غیررایگانِ زیر {fa(data.thresholds?.red ?? 12)}٪ — تا ۶۰ کالا)</span>
                </p>
                {(data.lowMargin ?? []).length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-[11px]">
                      <thead>
                        <tr className="border-b border-rose-200 text-right text-[10px] text-rose-700">
                          <th className="p-1.5">کالا</th>
                          <th className="p-1.5 text-center">اقلام</th>
                          <th className="p-1.5 text-center">کمترین حاشیه</th>
                          <th className="p-1.5 text-center">آخرین فاکتور</th>
                          <th className="p-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {(data.lowMargin ?? []).map((r: any, i: number) => (
                          <tr key={i} className="border-b border-rose-100 last:border-b-0">
                            <td className="p-1.5 font-medium text-stone-800">{r.name}</td>
                            <td className="p-1.5 text-center">{fa(r.count)}</td>
                            <td className={cn('p-1.5 text-center font-bold', r.minPct < 0 ? 'text-rose-700' : 'text-amber-700')}>{fa(Math.round(r.minPct * 100) / 100)}٪</td>
                            <td className="p-1.5 text-center">
                              {r.lastInvoice ? (
                                <span>#{fa(r.lastInvoice.number)} · {r.lastInvoice.supplierName ?? '—'} <Badge variant="outline" className="ms-1 text-[9px]">{STATE_FA[r.lastInvoice.status] ?? r.lastInvoice.status}</Badge></span>
                              ) : '—'}
                            </td>
                            <td className="p-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 border-rose-300 px-2 text-[10px] text-rose-700 hover:bg-rose-100"
                                onClick={() => {
                                  /* فاکتورِ اخیر قابل ویرایش است؟ بازش کن؛ وگرنه فرم جدید با همین کالا */
                                  if (r.lastInvoice && (r.lastInvoice.status === 'draft' || r.lastInvoice.status === 'delivered')) {
                                    go(`finance/builder?id=${r.lastInvoice.id}`)
                                  } else if (r.productId) {
                                    go(`finance/builder?product=${r.productId}`)
                                  } else if (r.lastInvoice) {
                                    go(`finance/builder?id=${r.lastInvoice.id}`)
                                  } else {
                                    go('finance/builder')
                                  }
                                }}
                              >
                                <I.pencil size={11} /> بازبینی در فاکتورنویس
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-4 text-center text-[11px] text-emerald-700">هیچ قلمی زیر آستانهٔ {fa(data.thresholds?.red ?? 12)}٪ نیست — عالی!</p>
                )}
              </div>

              {/* پرسودترین‌ها + تأمین‌کنندگان */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <p className="p-2.5 pb-1 text-[12px] font-bold text-stone-700">پرسودترین کالاها</p>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {(data.topProfit ?? []).map((t: any, i: number) => (
                        <tr key={i} className="border-t border-stone-100">
                          <td className="p-1.5 font-medium text-stone-800">{t.name}</td>
                          <td className="p-1.5 text-center text-stone-500">{fa(t.count)} قلم</td>
                          <td className="p-1.5 text-center font-bold text-emerald-700">{money(t.profit)} ریال</td>
                          <td className="p-1.5 text-center text-stone-600">{t.margin == null ? '—' : `${fa(Math.round(t.margin * 100) / 100)}٪`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <p className="p-2.5 pb-1 text-[12px] font-bold text-stone-700">سود به تفکیک تأمین‌کننده</p>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {(data.suppliers ?? []).slice(0, 10).map((s: any, i: number) => (
                        <tr key={i} className="border-t border-stone-100">
                          <td className="p-1.5 font-medium text-stone-800">{s.name}</td>
                          <td className="p-1.5 text-center text-stone-500">{fa(s.invoices)} فاکتور</td>
                          <td className={cn('p-1.5 text-center font-bold', s.profit >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{money(s.profit)}</td>
                          <td className="p-1.5 text-center text-stone-600">{s.margin == null ? '—' : `${fa(Math.round(s.margin * 100) / 100)}٪`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
