'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliFull } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, KeyValue } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Warehouse, CheckCircle2 } from 'lucide-react'

export default function VerifyView({ ctx }: { ctx: AppCtx }) {
  const [orders, setOrders] = useState<any[]>([])

  useEffect(() => {
    api<{ orders: any[] }>('/api/orders').then((d) =>
      setOrders(d.orders.filter((o) => ['RECEIVED', 'VERIFIED'].includes(o.status)))
    )
  }, [])

  if (ctx.param) return <VerifyScreen ctx={ctx} orderId={ctx.param} onBack={() => ctx.navigate('verify')} />

  return (
    <SectionCard title="تأیید انبار" subtitle="مرسوله‌های دریافتی را بررسی، اصلاح و تأیید کنید — موجودی پس از تأیید بالا می‌رود" icon={<Warehouse size={18} />}>
      {orders.length === 0 ? (
        <EmptyState emoji="📦" title="سفارشی در انتظار تأیید نیست" hint="وقتی تحویل‌گیر دریافت را ثبت کند، اینجا نمایش داده می‌شود" />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {orders.map((o) => (
            <button key={o.id} onClick={() => ctx.navigate('verify', o.id)} className="glow-card rounded-2xl bg-white/70 p-4 text-right">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black">{o.code}</span>
                <Pill label={o.status === 'RECEIVED' ? 'نیاز به تأیید' : 'تأییدشده (اصلاح)'} color={o.status === 'RECEIVED' ? '#6d28d9' : '#166534'} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{o.providerName} • {faNum(o.itemsCount)} قلم • {faMoney(o.totalAmount)}</p>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function VerifyScreen({ ctx, orderId, onBack }: { ctx: AppCtx; orderId: string; onBack: () => void }) {
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    api<{ order: any; items: any[] }>(`/api/orders/${orderId}`).then((d) => {
      setOrder(d.order)
      setItems(d.items)
    })
  }, [orderId])

  if (!order) return <div className="py-16 text-center text-sm text-muted-foreground">در حال بارگذاری…</div>

  const update = (id: string, patch: any) => setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)))

  const verify = async () => {
    try {
      await api(`/api/orders/${orderId}`, {
        method: 'PATCH',
        body: {
          action: 'verify',
          detail: `تأیید توسط ${ctx.user!.name}`,
          items: items.map((it) => ({ id: it.id, receivedQty: it.receivedQty, printedPrice: it.printedPrice, status: it.status, note: it.note })),
        },
      })
      toast.success('انبار تأیید شد ✅ — موجودی به‌روز شد و برای حسابداری ارسال گردید')
      ctx.refreshNotifications()
      onBack()
    } catch (e: any) { toast.error(e.message) }
  }

  const totalReceived = items.reduce((s, it) => s + (it.receivedQty || 0) * it.unitBuyPrice, 0)

  return (
    <div className="space-y-4">
      <SectionCard
        title={`بررسی نهایی — ${order.code}`}
        subtitle={`${order.providerName} • دریافت‌کننده اولیه ثبت کرده است؛ شما تأیید نهایی هستید`}
        icon={<Warehouse size={18} />}
        actions={<button onClick={onBack} className="rounded-lg border px-3 py-1.5 text-xs font-bold">→ بازگشت</button>}
      >
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <KeyValue k="مبلغ فاکتور" v={`${faMoney(order.totalAmount)} تومان`} />
          <KeyValue k="جمع دریافتی تأییدشده" v={`${faMoney(totalReceived)} تومان`} />
          <KeyValue k="تاریخ تحویل" v={formatJalaliFull(order.deliveryDate)} />
        </div>

        <div className="space-y-2.5">
          {items.map((it) => (
            <div key={it.id} className={`rounded-2xl border p-3.5 ${it.status === 'REJECTED' ? 'border-[#b3372f]/40 bg-[#fee2e2]/40' : it.receivedQty !== it.qty ? 'border-[#a16207]/40 bg-[#fef9c3]/40' : 'border-border/60 bg-white/70'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black">{it.productName}</p>
                {it.note && <span className="text-[11px] font-bold text-muted-foreground">📝 {it.note}</span>}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-muted/60 p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">سفارش</p>
                  <p className="text-sm font-black">{faNum(it.qty)}</p>
                </div>
                <div className="rounded-xl bg-muted/60 p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">دریافتی (اصلاح‌پذیر)</p>
                  <input type="number" value={it.receivedQty ?? 0} onChange={(e) => update(it.id, { receivedQty: Number(e.target.value) })} className="h-9 w-full rounded-lg border border-input bg-white text-center text-sm font-black" />
                </div>
                <div className="rounded-xl bg-muted/60 p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">قیمت واحد</p>
                  <p className="text-sm font-black">{faMoney(it.printedPrice ?? it.unitBuyPrice)}</p>
                </div>
                <div className="rounded-xl bg-muted/60 p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">جمع دریافتی</p>
                  <p className="text-sm font-black text-[#8a6d10]">{faMoney((it.receivedQty || 0) * (it.printedPrice ?? it.unitBuyPrice))}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={verify} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] py-3.5 text-sm font-extrabold text-white shadow-lg transition hover:shadow-xl">
          <CheckCircle2 size={18} /> تأیید نهایی انبار و افزودن به موجودی
        </button>
      </SectionCard>
    </div>
  )
}
