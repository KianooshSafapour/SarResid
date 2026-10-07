'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { api } from '@/lib/client'
import { printElement } from '@/lib/print'
import { faMoney, faNum, formatJalaliFull, parseFaNumber } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, KeyValue } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import MarginCalculator from '@/components/views/MarginCalculator'
import type { AppCtx } from '@/components/app/ui-bits'
import { cn } from '@/lib/utils'
import { Calculator, FileSpreadsheet, Printer, CheckCircle2, ArrowLeftRight, UploadCloud, Banknote, CreditCard, Wallet, Lock } from 'lucide-react'

type AccItem = any

/* ── round-19f: تعیین روش پرداخت هر سفارش توسط حسابدار — نقدی / کارتخوان فروشگاه / چک ── */
const ORDER_PAY_LABEL: Record<string, string> = { CASH: 'نقدی', POS: 'کارتخوان فروشگاه', CHEQUE: 'چک' }
const PAY_REF_HINT: Record<string, string> = {
  CASH: 'مرجع: سریال صیاد (اختیاری)',
  POS: 'مرجع: ۴ رقم آخر کارت',
  CHEQUE: 'مرجع: شماره چک',
}
const KIND_FA: Record<string, string> = { CASH: 'نقدی', POS: 'کارتخوان فروشگاه', TRANSFER: 'کارت به کارت', OTHER: 'چک' }

export default function AccountingView({ ctx }: { ctx: AppCtx }) {
  const [orders, setOrders] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [openState, setOpenState] = useState<string | null>(null)
  const [tab, setTab] = useState<'queue' | 'calc' | 'ack'>('queue')
  const openOrder = ctx.param || openState

  const loadPayments = () =>
    api<{ payments: any[] }>('/api/payments')
      .then((d) => setPayments(d.payments))
      .catch(() => setPayments([]))

  useEffect(() => {
    api<{ orders: any[] }>('/api/orders').then((d) =>
      setOrders(d.orders.filter((o) => ['VERIFIED', 'ACCOUNTED', 'DONE'].includes(o.status)))
    )
    loadPayments()
  }, [])

  // آخرین پرداخت ثبت‌شده برای هر سفارش = علامت «قفل دفتر» (ثبت در دفتر انجام شده)
  const payByOrder = useMemo(() => {
    const m: Record<string, any> = {}
    for (const p of payments) if (p.orderId && !m[p.orderId]) m[p.orderId] = p
    return m
  }, [payments])

  if (openOrder) return <AccountingDetail ctx={ctx} orderId={openOrder} onBack={() => { setOpenState(null); ctx.navigate('accounting') }} />

  return (
    <div className="space-y-4">
      {/* tool tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab('queue')}
          className={`rounded-2xl px-5 py-2.5 text-xs font-extrabold transition ${tab === 'queue' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'glow-card bg-card text-foreground/70'}`}
        >
          🧾 نوبت حسابداری ({faNum(orders.filter((o) => o.status === 'VERIFIED').length)})
        </button>
        <button
          onClick={() => setTab('calc')}
          className={`rounded-2xl px-5 py-2.5 text-xs font-extrabold transition ${tab === 'calc' ? 'bg-[#8a6d10] text-white shadow-lg shadow-[#c9a227]/30' : 'glow-card bg-card text-foreground/70'}`}
        >
          🧮 ماشین‌حساب حاشیه سود
        </button>
        <button
          onClick={() => setTab('ack')}
          className={`rounded-2xl px-5 py-2.5 text-xs font-extrabold transition ${tab === 'ack' ? 'bg-[#0f766e] text-white shadow-lg shadow-[#0f766e]/30' : 'glow-card bg-card text-foreground/70'}`}
        >
          <ArrowLeftRight size={13} className="inline" /> تطبیق قیمت با هلو
        </button>
      </div>

      {tab === 'calc' ? (
        <SectionCard
          title="ماشین‌حساب حاشیه سود — نسخه هوشمند فایل اکسل"
          subtitle="همان محاسبه همیشگی: قیمت چاپ‌شده ÷ (مبلغ کل خط ÷ تعداد) — اما بدون تایپ دوباره در هلو"
          icon={<Calculator size={18} />}
        >
          <MarginCalculator />
        </SectionCard>
      ) : tab === 'ack' ? (
        <SectionCard
          title="تطبیق قیمت قفسه با هلو — بستن حلقه قیمت"
          subtitle="قیمت‌های جدید را در هلو ثبت کردید؟ فایل خروجی هلو را این‌جا بیاورید تا قیمت رسمی روی تابلوی کنترل قیمت بنشیند و همان روز «کنترل شده» شود"
          icon={<ArrowLeftRight size={18} />}
        >
          <HolooAckWizard />
        </SectionCard>
      ) : (
        <SectionCard title="نوبت حسابداری" subtitle="سفارش‌های تأییدشده انبار — خروجی بگیرید، در هلو ثبت کنید و «ثبت شد» بزنید" icon={<Calculator size={18} />}>
        {orders.length === 0 ? (
          <EmptyState emoji="🧾" title="سفارشی در نوبت حسابداری نیست" hint="وقتی سرپرست انبار تأیید کند، سفارش اینجا ظاهر می‌شود" />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {orders.map((o) => (
              <div key={o.id} className="glow-card rounded-2xl bg-white/70 p-4 text-right">
                <button onClick={() => setOpenState(o.id)} className="w-full text-right" aria-label={`بازکردن حسابداری سفارش ${o.code}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black">{o.code}</span>
                    <Pill label={o.status === 'VERIFIED' ? 'آماده ثبت در هلو' : o.status === 'ACCOUNTED' ? 'ثبت شد — در انتظار تکمیل' : 'تکمیل شده ✅'} color={o.status === 'VERIFIED' ? '#0f766e' : o.status === 'ACCOUNTED' ? '#3f6212' : '#3f6212'} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{o.providerName} • {faNum(o.itemsCount)} قلم</p>
                  <p className="mt-1 text-sm font-black text-[#8a6d10]">{faMoney(o.totalAmount)} تومان</p>
                </button>
                <OrderPayStrip o={o} payment={payByOrder[o.id]} isOwner={ctx.user?.role === 'OWNER'} onChanged={loadPayments} />
              </div>
            ))}
          </div>
        )}
        </SectionCard>
      )}
    </div>
  )
}

/** نوار تعیین روش پرداخت روی کارت هر سفارش — ذخیرهٔ طراحی + «ثبت در دفتر» (قفل) */
function OrderPayStrip({ o, payment, isOwner, onChanged }: { o: any; payment?: any; isOwner: boolean; onChanged: () => void }) {
  const [method, setMethod] = useState<string>(o.payMethod || 'CASH')
  const [ref, setRef] = useState<string>(o.paymentRef || '')
  const [busy, setBusy] = useState(false)

  const locked = !!payment // ردیف Payment برای این سفارش موجود است → طراحی قفل است
  const editable = !locked || isOwner

  const setPay = async () => {
    setBusy(true)
    try {
      await api('/api/payments', { method: 'PATCH', body: { action: 'set-order-payment', orderId: o.id, payMethod: method, paymentRef: ref } })
      toast.success(`روش پرداخت سفارش ${o.code} ذخیره شد ✅`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const finalize = async () => {
    setBusy(true)
    try {
      const res = await api<{ deduped?: boolean }>('/api/payments', {
        method: 'PATCH',
        body: { action: 'finalize-order-payment', orderId: o.id, payMethod: method, paymentRef: ref },
      })
      toast.success(
        res.deduped
          ? `سفارش ${o.code} قبلاً در دفتر ثبت شده بود — ردیف تکراری ساخته نشد ✅`
          : `سفارش ${o.code} در دفتر ثبت شد 🔒 — پرداخت قفل شد`
      )
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  // قفل‌شده و کاربر مالک نیست — نمایش فقط‌خواندنی
  if (locked && !isOwner) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-[#0e7a4a]/25 bg-[#eef7f4]/70 px-3 py-2 text-[11px] font-bold text-[#0e7a4a]">
        <Lock size={12} aria-hidden />
        <span>ثبت‌شده در دفتر — {KIND_FA[payment.kind] || payment.kind}</span>
        {(payment.note || o.paymentRef) && <span className="text-foreground/60">• مرجع: {faNum(payment.note || o.paymentRef)}</span>}
      </div>
    )
  }

  return (
    <div className="mt-3 border-t border-dashed border-border/70 pt-3">
      {locked && isOwner && <p className="mb-1.5 text-[10px] font-bold text-[#8a6d10]">🔒 قبلاً در دفتر ثبت شده — ویرایش فقط با دسترسی مالک</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-label={`روش پرداخت سفارش ${o.code}`} className="flex flex-wrap gap-1.5">
          {([
            { key: 'CASH', label: 'نقدی', Icon: Banknote },
            { key: 'POS', label: 'کارتخوان فروشگاه', Icon: CreditCard },
            { key: 'CHEQUE', label: 'چک', Icon: Wallet },
          ] as const).map(({ key, label, Icon }) => {
            const active = method === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!editable || busy}
                onClick={() => setMethod(key)}
                className={cn(
                  'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition disabled:opacity-50',
                  active ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white shadow-sm shadow-[#0e7a4a]/25' : 'border-border bg-white text-foreground/70 hover:border-[#0e7a4a]/50'
                )}
              >
                <Icon size={12} aria-hidden /> {label}
              </button>
            )
          })}
        </div>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          disabled={!editable || busy}
          placeholder={PAY_REF_HINT[method] || 'مرجع پرداخت'}
          aria-label="مرجع پرداخت — شماره چک، سریال صیاد یا ۴ رقم آخر کارت"
          className="h-8 min-w-[9rem] flex-1 rounded-lg border border-input bg-white px-2.5 text-[11px] outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={setPay}
          disabled={busy || !editable}
          className="rounded-lg border border-[#0e7a4a]/50 bg-[#eef7f4] px-3 py-1.5 text-[11px] font-black text-[#0e7a4a] transition hover:bg-[#0e7a4a]/10 disabled:opacity-50"
        >
          ذخیره
        </button>
        <button
          type="button"
          onClick={finalize}
          disabled={busy || locked}
          title={locked ? 'این سفارش قبلاً در دفتر ثبت شده' : 'ثبت ردیف پرداخت در دفتر مالی و قفل‌کردن روش پرداخت'}
          className="flex items-center gap-1 rounded-lg bg-gradient-to-l from-[#c9a227] to-[#b8952a] px-3 py-1.5 text-[11px] font-black text-white shadow-md transition hover:brightness-105 disabled:opacity-60"
        >
          <Wallet size={12} aria-hidden /> {locked ? 'در دفتر ثبت شد ✓' : 'ثبت در دفتر'}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        روش پرداخت را مشخص کنید (تحویل‌گیر با کارتخوان فروشگاه؟ چک؟) — «ثبت در دفتر» ردیف پرداخت را در دفتر مالی می‌نشاند و طراحی را قفل می‌کند (بازکردن قفل فقط با مالک).
      </p>
    </div>
  )
}

function AccountingDetail({ ctx, orderId, onBack }: { ctx: AppCtx; orderId: string; onBack: () => void }) {
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<AccItem[]>([])
  const [printOpen, setPrintOpen] = useState(false)
  const [vat, setVat] = useState(9)
  const [taxTotal, setTaxTotal] = useState(0)

  useEffect(() => {
    api<{ order: any; items: AccItem[] }>(`/api/orders/${orderId}`).then((d) => {
      setOrder(d.order)
      setItems(d.items)
      const sub = d.items.reduce((s: number, i: any) => s + (i.receivedQty || i.qty) * (i.printedPrice ?? i.unitBuyPrice) - (i.discount || 0), 0)
      setTaxTotal(Math.round((sub * 9) / 100))
    })
  }, [orderId])

  if (!order) return <div className="py-16 text-center text-sm text-muted-foreground">در حال بارگذاری…</div>

  const rows = items.map((it) => {
    const qty = it.receivedQty ?? it.qty
    const unit = it.printedPrice ?? it.unitBuyPrice
    const gross = qty * unit
    const net = gross - (it.discount || 0)
    const itemVat = Math.round((net * vat) / 100)
    return { ...it, qty, unit, gross, net, itemVat, total: net + itemVat }
  })
  const subtotal = rows.reduce((s, r) => s + r.net, 0)
  const totalVat = rows.reduce((s, r) => s + r.itemVat, 0)
  const grand = subtotal + totalVat
  const orderTotalDiff = grand - order.totalAmount
  const smallDiff = Math.abs(orderTotalDiff) <= 1000 // زیر ۱ هزار تومان قابل چشم‌پوشی (مطابق رویه فعلی)

  const exportXls = () => {
    const aoa: (string | number)[][] = [
      [`خروجی سفارش ${order.code} — هایپر زیتون`],
      [`تأمین‌کننده: ${order.providerName}`],
      [`تاریخ تحویل: ${formatJalaliFull(order.deliveryDate)}`],
      [],
      ['بارکد', 'نام کالا (هلو)', 'تعداد', 'قیمت واحد (تومان)', 'تخفیف', 'مالیات و ارزش افزوده', 'مبلغ کل'],
      ...rows.map((r) => [r.barcode || '', r.productName, r.qty, r.unit, r.discount || 0, r.itemVat, r.total]),
      [],
      ['', 'جمع کل', rows.reduce((s, r) => s + r.qty, 0), '', rows.reduce((s, r) => s + (r.discount || 0), 0), totalVat, grand],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'سفارش')
    XLSX.writeFile(wb, `${order.code}.xlsx`)
    toast.success('فایل اکسل آماده ورود به هلو دانلود شد 📊')
  }

  const markAccounted = async (done: boolean) => {
    try {
      await api(`/api/orders/${orderId}`, { method: 'PATCH', body: { action: 'account', done, detail: done ? 'تسویه کامل توسط حسابدار' : 'ثبت در هلو انجام شد' } })
      toast.success(done ? 'سفارش تکمیل شد ✅ — مدیریت و مالک مطلع شدند' : 'به‌عنوان ثبت‌شده در هلو علامت خورد')
      onBack()
    } catch (e: any) { toast.error(e.message) }
  }

  const canFinalize = ['ACC', 'OM', 'OWNER'].includes(ctx.user!.role)

  return (
    <div className="space-y-4">
      <SectionCard
        title={`حسابداری — ${order.code}`}
        subtitle={`${order.providerName} • تحویل ${formatJalaliFull(order.deliveryDate)}`}
        icon={<Calculator size={18} />}
        actions={<button onClick={onBack} className="rounded-lg border px-3 py-1.5 text-xs font-bold">→ بازگشت</button>}
      >
        {/* discrepancy banner like the manual Holoo check */}
        {Math.abs(orderTotalDiff) > 0 && (
          <div className={`mb-4 rounded-xl border p-3 text-xs font-bold ${smallDiff ? 'border-[#a16207]/40 bg-[#fef9c3]/70 text-[#8a6d10]' : 'border-[#b3372f]/40 bg-[#fee2e2]/70 text-[#b3372f]'}`}>
            {smallDiff
              ? `اختلاف جزئی ${faMoney(orderTotalDiff)} تومان (زیر ۱ هزار تومان) — مطابق رویه فعلی قابل چشم‌پوشی است`
              : `اختلاف معنادار ${faMoney(orderTotalDiff)} تومان با مبلغ فاکتور اصلی (${faMoney(order.totalAmount)}) — قبل از ثبت بررسی کنید (اقلام رد/کسری، تخفیف، مالیات)`}
          </div>
        )}

        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          <KeyValue k="جمع اقلام" v={`${faMoney(subtotal)} تومان`} />
          <KeyValue k="مالیات و ارزش افزوده" v={`${faMoney(totalVat)} تومان`} />
          <KeyValue k="مبلغ قابل پرداخت" v={<span className="text-[#8a6d10]">{faMoney(grand)}</span>} />
          <KeyValue k="مبلغ فاکتور اصلی" v={faMoney(order.totalAmount)} />
          <KeyValue
            k="روش پرداخت"
            v={order.paymentRef ? `${ORDER_PAY_LABEL[order.payMethod] || order.payMethod} — مرجع: ${faNum(order.paymentRef)}` : ORDER_PAY_LABEL[order.payMethod] || order.payMethod}
          />
        </div>

        {/* Holoo-ready table */}
        <div className="scroll-gold overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-right text-xs table-luxe">
            <thead className="bg-secondary/70">
              <tr className="text-[10px] text-muted-foreground">
                <th className="p-2.5">بارکد</th>
                <th className="p-2.5">نام کالا</th>
                <th className="p-2.5">تعداد</th>
                <th className="p-2.5">قیمت واحد</th>
                <th className="p-2.5">تخفیف</th>
                <th className="p-2.5">مالیات/VAT</th>
                <th className="p-2.5">مبلغ کل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/50">
                  <td className="p-2.5 font-mono text-[10px]" dir="ltr">{r.barcode || '—'}</td>
                  <td className="p-2.5 font-bold">{r.productName}{r.status === 'REJECTED' && <Pill className="mr-1" label="رد شده" color="#b3372f" />}{r.status === 'SHORT' && <Pill className="mr-1" label="کسری" color="#a16207" />}</td>
                  <td className="p-2.5">{faNum(r.qty)}</td>
                  <td className="p-2.5">{faMoney(r.unit)}</td>
                  <td className="p-2.5">{r.discount ? faMoney(r.discount) : '—'}</td>
                  <td className="p-2.5">{faMoney(r.itemVat)}</td>
                  <td className="p-2.5 font-black">{faMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={exportXls} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg">
            <FileSpreadsheet size={15} /> خروجی اکسل برای هلو
          </button>
          <button onClick={() => setPrintOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-primary/50 bg-secondary px-4 py-2.5 text-xs font-extrabold text-primary">
            <Printer size={15} /> چاپ / PDF
          </button>
          {canFinalize && order.status === 'VERIFIED' && (
            <button onClick={() => markAccounted(false)} className="flex items-center gap-1.5 rounded-xl border border-[#0f766e]/50 px-4 py-2.5 text-xs font-extrabold text-[#0f766e]">
              <CheckCircle2 size={15} /> ثبت‌شده در هلو
            </button>
          )}
          {canFinalize && order.status === 'ACCOUNTED' && (
            <button onClick={() => markAccounted(true)} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#c9a227] to-[#b8952a] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg">
              ✅ تکمیل و اطلاع به مدیریت
            </button>
          )}
        </div>
      </SectionCard>

      {printOpen && (
        <Modal title="پیش‌نمایش چاپ" onClose={() => setPrintOpen(false)} wide>
          <div id="acc-print-area" className="print-area rounded-xl bg-white p-5 text-black" dir="rtl">
            <div className="mb-3 flex items-center justify-between border-b-2 border-[#c9a227] pb-2">
              <div>
                <p className="text-base font-black">هایپر زیتون — رسید سفارش خرید</p>
                <p className="text-[11px]">کرمان • سامانه مدیریت عملیات</p>
              </div>
              <div className="text-left text-[11px]">
                <p>کد سفارش: <b>{order.code}</b></p>
                <p>تأمین‌کننده: <b>{order.providerName}</b></p>
                <p>تاریخ: <b>{formatJalaliFull(order.deliveryDate)}</b></p>
              </div>
            </div>
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="p-1.5">#</th><th className="p-1.5">بارکد</th><th className="p-1.5">کالا</th>
                  <th className="p-1.5">تعداد</th><th className="p-1.5">قیمت واحد</th><th className="p-1.5">تخفیف</th><th className="p-1.5">جمع</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-200">
                    <td className="p-1.5">{i + 1}</td>
                    <td className="p-1.5" dir="ltr">{r.barcode}</td>
                    <td className="p-1.5">{r.productName}</td>
                    <td className="p-1.5">{r.qty}</td>
                    <td className="p-1.5">{r.unit.toLocaleString('en-US')}</td>
                    <td className="p-1.5">{r.discount || 0}</td>
                    <td className="p-1.5 font-bold">{r.net.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t-2 border-[#c9a227] pt-2 text-xs font-bold">
              <span>مالیات و ارزش افزوده: {totalVat.toLocaleString('en-US')} تومان</span>
              <span>مبلغ نهایی: {grand.toLocaleString('en-US')} تومان</span>
            </div>
            <div className="mt-8 flex justify-between text-[10px]">
              <span>امضای تحویل‌گیرنده: ................</span>
              <span>امضای تأمین‌کننده: ................</span>
              <span>مهر حسابداری: ................</span>
            </div>
          </div>
          <button onClick={() => printElement(document.getElementById('acc-print-area'))} className="no-print w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white">
            🖨️ چاپ یا ذخیره PDF
          </button>
        </Modal>
      )}
    </div>
  )
}

/* ───────────────── تطبیق قیمت قفسه با هلو — Holoo price acknowledgment wizard ───────────────── */

type AckRow = {
  name: string
  barcode: string
  holooCode: string
  holooPrice: number
  platformPrice: number
  status: 'same' | 'diff' | 'unmatched'
  matchedName?: string
}

function HolooAckWizard() {
  const [rows, setRows] = useState<AckRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set()) // row indices to apply
  const [products, setProducts] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    api<{ products: any[] }>('/api/products').then((d) => setProducts(d.products)).catch(() => {})
  }, [])

  const diffCount = rows.filter((r) => r.status === 'diff').length
  const sameCount = rows.filter((r) => r.status === 'same').length
  const unmatchedCount = rows.filter((r) => r.status === 'unmatched').length
  const selCount = selected.size

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: '' })
      const get = (r: any, ...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(r).find((rk) => rk.trim() === k || rk.includes(k))
          if (found && r[found] !== '') return r[found]
        }
        return ''
      }
      const byBarcode = new Map<string, any>()
      const byHoloo = new Map<string, any>()
      const byName = new Map<string, any>()
      for (const p of products) {
        // API returns barcodes as an array — accept legacy string form too
        const bars: string[] = Array.isArray(p.barcodes) ? p.barcodes : (() => { try { return JSON.parse(p.barcodes || '[]') as string[] } catch { return [] as string[] } })()
        for (const b of bars) byBarcode.set(String(b), p)
        if (p.holooCode) byHoloo.set(String(p.holooCode).trim(), p)
        byName.set(p.name.trim().toLowerCase(), p)
      }
      const mapped: AckRow[] = json
        .map((r: any) => {
          const name = String(get(r, 'کالا', 'شرح کالا', 'نام کالا', 'شرح', 'name') || '').trim()
          const barcode = String(get(r, 'بارکد', 'کد بارکد', 'barcode') || '').trim()
          const holooCode = String(get(r, 'کد هلو', 'کد کالا', 'کد', 'code') || '').trim()
          const holooPrice = parseFaNumber(get(r, 'قیمت فروش', 'فروش', 'sellPrice', 'قیمت فروشنده', 'قیمت'))
          return { name, barcode, holooCode, holooPrice }
        })
        .filter((r: any) => r.holooPrice > 0)
        .map((r: any) => {
          const hit = (r.barcode && byBarcode.get(r.barcode)) || (r.holooCode && byHoloo.get(r.holooCode)) || (r.name && byName.get(r.name.toLowerCase()))
          if (!hit) return { ...r, platformPrice: 0, status: 'unmatched' as const }
          return { ...r, platformPrice: hit.sellPrice, status: hit.sellPrice === r.holooPrice ? ('same' as const) : ('diff' as const), matchedName: hit.name }
        })
      setRows(mapped)
      setSelected(new Set(mapped.map((r, i) => (r.status !== 'unmatched' ? i : -1)).filter((i) => i >= 0)))
      setResult(null)
      if (!mapped.length) toast.error('سطری با «قیمت فروش» پیدا نشد — ستون‌های فایل هلو را بررسی کنید')
      else toast.success(`${faNum(mapped.length)} سطر خوانده شد — ${faNum(mapped.filter((x) => x.status === 'diff').length)} مورد قیمتش با قفسه فرق دارد`)
    } catch (err: any) {
      toast.error('خواندن فایل ناموفق بود: ' + err.message)
    }
  }

  const toggleRow = (i: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

  const apply = async () => {
    if (!selected.size) return toast.error('هیچ سطری انتخاب نشده — تیک کنار کالاهای موردنظر را بزنید')
    setBusy(true)
    try {
      const items = rows.filter((_, i) => selected.has(i)).map((r) => ({ name: r.name, barcode: r.barcode, holooCode: r.holooCode, sellPrice: r.holooPrice }))
      const res = await api<any>('/api/products/ack-holoo', { method: 'POST', body: { items } })
      setResult(res)
      toast.success(`تطبیق کامل شد ✅ — ${faNum(res.updated)} قیمت به‌روز شد، ${faNum(res.samePrice)} تأیید بدون تغییر`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-3xl">🤝</p>
        <p className="text-sm font-black">حلقه قیمت بسته شد — قفسه و هلو یکی است</p>
        <div className="grid grid-cols-3 gap-2">
          <KeyValue k="قیمت به‌روز شد" v={faNum(result.updated)} />
          <KeyValue k="تأیید بدون تغییر" v={faNum(result.samePrice)} />
          <KeyValue k="تطبیق‌نشده" v={faNum(result.unmatched)} />
        </div>
        {result.log?.length > 0 && (
          <div className="scroll-gold max-h-40 overflow-y-auto rounded-xl bg-muted/40 p-3 text-right text-[11px]">
            {result.log.map((l: string, i: number) => <p key={i}>• {l}</p>)}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">این کالاها از امروز در تابلوی «کنترل قیمت روزانه» سبزِ «امروز کنترل شد» هستند؛ گزارش تغییرات قیمت ۳۰ روز هم این عملیات را ثبت کرده است.</p>
        <button onClick={() => { setResult(null); setRows([]) }} className="w-full rounded-xl border border-border py-2.5 text-xs font-extrabold">فایل دیگری تطبیق بدهم</button>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="ack-upload rounded-2xl border-2 border-dashed border-[#0f766e]/40 bg-[#eef7f4]/60 p-8 text-center">
        <UploadCloud size={40} className="mx-auto mb-3 text-[#0f766e]" />
        <p className="text-sm font-black">فایل اکسل خروجی هلو را انتخاب کنید (.xls / .xlsx / .csv)</p>
        <p className="mx-auto mt-1 max-w-lg text-[11px] leading-5 text-muted-foreground">
          بعد از ثبت قیمت‌های جدید در هلو، همان فایلی که «قیمت فروش» دارد را این‌جا بیاورید. سامانه با <b>بارکد، کد هلو یا نام</b> کالا را پیدا می‌کند و قیمت رسمی هلو را روی قیمت چاپ‌شده می‌نشاند.
        </p>
        <p className="mx-auto mt-2 max-w-md rounded-xl bg-[#c9a227]/10 px-3 py-2 text-[10px] font-bold text-[#8a6d10]">
          💡 ترتیب پیشنهادی: ثبت قیمت جدید در تابلو ← خروجی «تغییرات قیمت ۳۰ روز» برای هلو ← ثبت در هلو ← برگشت همین فایل به این‌جا
        </p>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0f766e] px-6 py-3 text-sm font-extrabold text-white shadow-lg transition hover:bg-[#12907f]">
          📁 انتخاب فایل هلو
          <input type="file" accept=".xls,.xlsx,.csv" hidden onChange={onFile} />
        </label>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#c9a227]/30 bg-[#fdf6dd]/60 p-3 text-[11px] font-bold">
        <Pill label={`${faNum(diffCount)} قیمت فرق دارد`} color="#8a6d10" />
        <Pill label={`${faNum(sameCount)} یکی است`} color="#0e7a4a" />
        <Pill label={`${faNum(unmatchedCount)} تطبیق نشد`} color="#b3372f" />
        <span className="mr-auto text-muted-foreground">{faNum(selCount)} از {faNum(rows.length)} سطر انتخاب شده</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelected(new Set(rows.map((r, i) => (r.status !== 'unmatched' ? i : -1)).filter((i) => i >= 0)))}
          className="rounded-full border border-[#c9a227]/40 bg-[#c9a227]/10 px-3 py-1 text-[10px] font-bold text-[#8a6d10] transition hover:bg-[#c9a227]/20"
        >
          انتخاب همه تطبیق‌شده‌ها
        </button>
        <button onClick={() => setSelected(new Set())} className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[10px] font-bold text-foreground/60 transition hover:bg-secondary">
          پاک کردن انتخاب ({faNum(selCount)})
        </button>
      </div>

      <div className="scroll-gold max-h-80 overflow-y-auto rounded-xl border border-border">
        <table className="w-full min-w-[600px] text-right text-[11px]">
          <thead className="sticky top-0 bg-secondary">
            <tr>
              <th className="p-2">اعمال</th>
              <th className="p-2">کالا</th>
              <th className="p-2">بارکد / کد هلو</th>
              <th className="p-2">قیمت قفسه (سامانه)</th>
              <th className="p-2">قیمت هلو</th>
              <th className="p-2">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isSel = selected.has(i)
              return (
                <tr key={i} className={cn(r.status === 'diff' && 'bg-[#fdf6dd]/70', r.status === 'unmatched' && 'bg-[#fee2e2]/40', isSel && 'row-picked', 'border-t border-border/50')}>
                  <td className="p-2">
                    <button
                      onClick={() => toggleRow(i)}
                      role="checkbox"
                      aria-checked={isSel}
                      aria-label={`اعمال قیمت هلو برای ${r.matchedName || r.name}`}
                      className={cn(
                        'ack-check flex h-5 w-5 items-center justify-center rounded-md border-2 transition',
                        isSel ? 'border-[#c9a227] bg-[#c9a227] text-white shadow-sm shadow-[#c9a227]/30' : 'border-border bg-white text-transparent hover:border-[#c9a227]/60'
                      )}
                    >
                      <CheckCircle2 size={12} />
                    </button>
                  </td>
                  <td className="max-w-44 truncate p-2 font-bold">{r.matchedName || r.name}</td>
                  <td className="p-2 font-mono text-[10px]" dir="ltr">{r.barcode || r.holooCode || '—'}</td>
                  <td className="p-2">{r.platformPrice ? faMoney(r.platformPrice) : '—'}</td>
                  <td className="p-2 font-black">{faMoney(r.holooPrice)}</td>
                  <td className="p-2">
                    {r.status === 'same' && <Pill label="یکی است ✓" color="#0e7a4a" />}
                    {r.status === 'diff' && <Pill label="به‌روز می‌شود" color="#8a6d10" />}
                    {r.status === 'unmatched' && <Pill label="در سامانه نیست" color="#b3372f" />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button onClick={apply} disabled={busy} className="w-full rounded-xl bg-[#0f766e] py-3 text-sm font-extrabold text-white shadow-lg transition hover:bg-[#12907f] disabled:opacity-50">
        {busy ? 'در حال تطبیق…' : `تأیید و اعمال قیمت‌های هلو (${faNum(selCount)} کالا)`}
      </button>
      <button onClick={() => setRows([])} className="w-full rounded-xl border border-border py-2 text-[11px] font-bold text-muted-foreground">انصراف — فایل دیگر</button>
    </div>
  )
}
