'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliFull, todayIso, formatJalaliShort } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, SearchInput, Labeled, FaPriceInput } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { JalaliDatePicker, useHolidays } from '@/components/app/jalali-widgets'
import { openBarcodeScanner } from '@/components/app/BarcodeScanner'
import type { AppCtx } from '@/components/app/ui-bits'
import { PackageCheck, ScanBarcode, AlertTriangle, Plus, CalendarClock, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'

type Item = {
  id: string; productId: string; productName: string; barcode: string; qty: number
  unitBuyPrice: number; receivedQty: number | null; status: string; note: string
  printedPrice: number | null; discount: number; vat: number
}

export default function ReceivingView({ ctx }: { ctx: AppCtx }) {
  const [orders, setOrders] = useState<any[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    api<{ orders: any[] }>('/api/orders').then((d) =>
      setOrders(d.orders.filter((o) => ['APPROVED', 'RECEIVING'].includes(o.status)))
    )
  }, [])

  if (ctx.param) return <ReceivingScreen ctx={ctx} orderId={ctx.param} onBack={() => ctx.navigate('receiving')} />

  const today = todayIso()
  const todayOrders = orders.filter((o) => o.deliveryDate === today)
  const other = orders.filter((o) => o.deliveryDate !== today && (!q || o.code.includes(q) || o.providerName.includes(q)))

  return (
    <div className="space-y-4">
      {todayOrders.length > 0 && (
        <SectionCard title="مرسوله‌های امروز 🚚" subtitle="روی هر سفارش بزنید و دریافت را ثبت کنید — همه‌چیز لمسی و سریع است" icon={<PackageCheck size={18} />}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {todayOrders.map((o) => (
              <button key={o.id} onClick={() => ctx.navigate('receiving', o.id)} className="glow-card rounded-2xl bg-white/70 p-4 text-right">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black">{o.code}</span>
                  <Pill label="امروز" color="#c96f4a" bg="#ffedd5" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{o.providerName} • {faNum(o.itemsCount)} قلم • {faMoney(o.totalAmount)} تومان</p>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="همه سفارش‌های در انتظار دریافت" subtitle="سفارش‌های تأییدشده که هنوز تحویل نگرفته‌اید" icon={<PackageCheck size={18} />}>
        <SearchInput value={q} onChange={setQ} placeholder="جستجو…" className="mb-3 w-full sm:w-72" />
        {orders.length === 0 ? (
          <EmptyState emoji="📭" title="سفارشی در انتظار دریافت نیست" hint="سفارش‌های تأییدشده مدیر کل اینجا نمایش داده می‌شوند" />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {other.map((o) => (
              <button key={o.id} onClick={() => ctx.navigate('receiving', o.id)} className="glow-card rounded-2xl bg-white/70 p-3.5 text-right">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black">{o.code}</span>
                  {o.isOverdue ? <Pill label="سرآمده ⚠️" color="#b3372f" bg="#fee2e2" /> : <Pill label={formatJalaliFull(o.deliveryDate)} color="#6d7a6e" bg="#f1ecdd" />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{o.providerName} • {faNum(o.itemsCount)} قلم</p>
              </button>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function ReceivingScreen({ ctx, orderId, onBack }: { ctx: AppCtx; orderId: string; onBack: () => void }) {
  const holidays = useHolidays()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<Item[]>([])
  const [scan, setScan] = useState('')
  const [newProductOpen, setNewProductOpen] = useState(false)
  const [expiryMap, setExpiryMap] = useState<Record<string, string>>({})
  const scanRef = useRef<HTMLInputElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    api<{ order: any; items: Item[] }>(`/api/orders/${orderId}`).then((d) => {
      setOrder(d.order)
      setItems(
        d.items.map((it: any) => ({
          ...it,
          receivedQty: it.receivedQty ?? it.qty,
          printedPrice: it.printedPrice ?? it.unitBuyPrice,
        }))
      )
    })
  }, [orderId])

  const matchItem = useMemo(() => {
    if (!scan.trim()) return null
    const s = scan.trim()
    return items.find(
      (it) =>
        it.barcode === s ||
        it.productName.includes(s) ||
        it.id === s
    )
  }, [scan, items])

  if (!order) return <div className="py-16 text-center text-sm text-muted-foreground">در حال بارگذاری…</div>

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)))

  const addBarcodeToProduct = async (item: Item) => {
    const code = scan.trim()
    if (!code) return
    try {
      await api(`/api/products/${item.productId}`, { method: 'PATCH', body: { addBarcode: code } })
      updateItem(item.id, { barcode: code })
      toast.success('بارکد جدید به کالا اضافه شد ✅')
      setScan('')
      api('/api/activity', { method: 'POST', body: { action: 'بارکد جدید هنگام دریافت', entity: 'barcode', entityId: code, detail: `${item.productName} — ${order.code}` } }).catch(() => {})
    } catch (e: any) { toast.error(e.message) }
  }

  const submit = async () => {
    try {
      await api(`/api/orders/${orderId}`, {
        method: 'PATCH',
        body: {
          action: 'receive',
          detail: `دریافت توسط ${ctx.user!.name} — ${items.filter((i) => i.status === 'RECEIVED').length} قلم تأیید`,
          items: items.map((it) => ({
            id: it.id,
            receivedQty: it.receivedQty,
            printedPrice: it.printedPrice,
            discount: it.discount,
            vat: it.vat,
            status: it.status === 'PENDING' ? 'RECEIVED' : it.status,
            note: it.note,
            expiryDate: expiryMap[it.id] || (it as any).expiryDate || '',
          })),
        },
      })
      toast.success('دریافت ثبت شد ✅ — سرپرست انبار مطلع شد')
      ctx.refreshNotifications()
      onBack()
    } catch (e: any) { toast.error(e.message) }
  }

  const rejectedCount = items.filter((i) => i.status === 'REJECTED').length
  const shortCount = items.filter((i) => i.status === 'SHORT' || (i.receivedQty != null && i.receivedQty < i.qty)).length

  return (
    <div className="space-y-4">
      <SectionCard
        title={`دریافت مرسوله — ${order.code}`}
        subtitle={`${order.providerName} • ${formatJalaliFull(order.deliveryDate)}`}
        icon={<PackageCheck size={18} />}
        actions={<button onClick={onBack} className="rounded-lg border px-3 py-1.5 text-xs font-bold">→ بازگشت</button>}
      >
        {/* scanner bar */}
        <div className="mb-4 rounded-2xl border-2 border-dashed border-[#c9a227]/50 bg-[#fdf6dd]/50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0e7a4a]/10 text-primary">
              <ScanBarcode size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black">بارکد کالا را اسکن کنید (دستگاه اسکنر مثل تایپ می‌کند) یا نام کالا را بنویسید</p>
              <input
                ref={scanRef}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (matchItem) {
                      const idx = items.findIndex((i) => i.id === matchItem.id)
                      setActiveIdx(idx)
                      toast.success(`✅ ${matchItem.productName} — تایید شد`)
                      setScan('')
                      api('/api/activity', { method: 'POST', body: { action: 'اسکن بارکد دریافت مرسوله', entity: 'barcode', entityId: matchItem.barcode || matchItem.productName, detail: `${matchItem.productName} — ${order.code}` } }).catch(() => {})
                    } else if (scan.trim()) {
                      toast.error('کالایی با این بارکد در سفارش نیست')
                      api('/api/activity', { method: 'POST', body: { action: 'اسکن بی‌نتیجه در دریافت', entity: 'barcode', entityId: scan.trim(), detail: order.code } }).catch(() => {})
                    }
                  }
                }}
                placeholder="بارکد را اینجا اسکن کنید…"
                className="mt-2 w-full rounded-xl border-2 border-[#c9a227]/40 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#c9a227]"
                autoFocus
              />
            </div>
            <button
              onClick={() => openBarcodeScanner((code) => {
                setScan(code)
                const hit = items.find((it) => it.barcode === code || it.productName.includes(code) || it.id === code)
                if (hit) {
                  setActiveIdx(items.findIndex((i) => i.id === hit.id))
                  toast.success(`✅ ${hit.productName} — با دوربین تأیید شد`)
                  setScan('')
                  api('/api/activity', { method: 'POST', body: { action: 'اسکن دوربین دریافت مرسوله', entity: 'barcode', entityId: code, detail: `${hit.productName} — ${order.code}` } }).catch(() => {})
                } else {
                  toast.error('کالایی با این بارکد در سفارش نیست')
                }
              })}
              title="اسکن با دوربین موبایل"
              className="flex items-center gap-1.5 rounded-xl bg-[#0b2e20] px-4 py-2.5 text-xs font-extrabold text-[#c9a227] shadow-md"
            >
              <Camera size={15} /> دوربین
            </button>
            <button onClick={() => setNewProductOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2.5 text-xs font-extrabold text-primary">
              <Plus size={14} /> کالای جدید (مثل F5 هلو)
            </button>
          </div>
          {matchItem && (
            <div className="mt-2 rounded-xl bg-white p-2.5 text-xs">
              <b>{matchItem.productName}</b> — سفارش: {faNum(matchItem.qty)} | دریافتی فعلی: {faNum(matchItem.receivedQty || 0)}
            </div>
          )}
        </div>

        {shortCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#a16207]/40 bg-[#fef9c3]/70 p-3 text-xs font-bold text-[#8a6d10]">
            <AlertTriangle size={15} /> {faNum(shortCount)} قلم کسری دارد و {faNum(rejectedCount)} قلم رد شده — در ثبت نهایی ثبت می‌شود
          </div>
        )}

        {/* expiry tracking — protects against short-dated deliveries */}
        <details className="mb-4 rounded-2xl border border-border bg-white/70 p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-black text-foreground">
            <CalendarClock size={16} className="text-[#8a6d10]" />
            تاریخ انقضای اقلام (اختیاری — برای لبنیات و پروتئینی حتماً وارد کنید)
            {Object.keys(expiryMap).length > 0 && (
              <Pill label={`${faNum(Object.keys(expiryMap).length)} قلم ثبت شد`} color="#0e7a4a" />
            )}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {items.filter((it) => it.status !== 'REJECTED').map((it) => (
              <div key={it.id} className="rounded-xl bg-muted/40 p-3">
                <p className="mb-1.5 text-[11px] font-bold">{it.productName}</p>
                <JalaliDatePicker
                  value={expiryMap[it.id] || ''}
                  onChange={(iso) => setExpiryMap((m) => ({ ...m, [it.id]: iso }))}
                  holidays={holidays}
                  placeholder="تاریخ انقضا روی بسته‌بندی"
                  quickChips={false}
                  warnHoliday={false}
                />
                {expiryMap[it.id] && (
                  <p className={cn('mt-1 text-[10px] font-black', (new Date(expiryMap[it.id] + 'T12:00:00').getTime() - Date.now()) / 86400000 < 14 ? 'text-[#b3372f]' : 'text-[#0e7a4a]')}>
                    {formatJalaliShort(expiryMap[it.id])} — {Math.round((new Date(expiryMap[it.id] + 'T12:00:00').getTime() - Date.now()) / 86400000)} روز مانده
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
            اگر تاریخ انقضا کمتر از دوسوم عمر مجاز کالا باشد، همان قلم را با دکمه «رد کالا» برگردانید — طبق روال دریافت صبحگاهی.
          </p>
        </details>

        {/* items — big touch cards */}
        <div className="space-y-3">
          {items.map((it, idx) => {
            const active = idx === activeIdx
            const diff = (it.receivedQty ?? 0) !== it.qty
            return (
              <div key={it.id} className={cn('rounded-2xl border-2 bg-white/80 p-4 transition-all', active ? 'border-[#c9a227] shadow-lg' : 'border-border/60', it.status === 'REJECTED' && 'opacity-60')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button onClick={() => setActiveIdx(idx)} className="text-right">
                    <p className="text-sm font-black">{it.productName}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{it.barcode ? faNum(it.barcode) : 'بدون بارکد'}</p>
                  </button>
                  <div className="flex gap-1.5">
                    <button onClick={() => updateItem(it.id, { status: it.status === 'SHORT' ? 'RECEIVED' : 'SHORT', note: it.status === 'SHORT' ? '' : 'کسری در تحویل' })}
                      className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black transition', it.status === 'SHORT' ? 'bg-[#a16207] text-white' : 'bg-[#fef9c3] text-[#8a6d10]')}>
                      کسری
                    </button>
                    <button onClick={() => updateItem(it.id, { status: it.status === 'REJECTED' ? 'RECEIVED' : 'REJECTED', note: it.status === 'REJECTED' ? '' : 'رد به دلیل مشکل کیفیت/تاریخ' })}
                      className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black transition', it.status === 'REJECTED' ? 'bg-[#b3372f] text-white' : 'bg-[#fee2e2] text-[#b3372f]')}>
                      رد کالا
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {/* qty stepper */}
                  <div className={cn('rounded-xl p-3', diff ? 'bg-[#fef9c3]/70' : 'bg-secondary/50')}>
                    <p className="mb-1.5 text-[10px] font-bold text-muted-foreground">تعداد سفارش: {faNum(it.qty)} — دریافتی:</p>
                    <div className="flex items-center justify-center gap-2">
                      <button className="stepper-btn" onClick={() => updateItem(it.id, { receivedQty: Math.max(0, (it.receivedQty || 0) - 1) })}>−</button>
                      <FaPriceInput
                        value={it.receivedQty ?? 0}
                        onChange={(v) => updateItem(it.id, { receivedQty: v === '' ? 0 : v })}
                        ariaLabel={`تعداد دریافتی ${it.productName}`}
                        className="h-11 w-20 rounded-xl border border-input bg-white text-lg"
                      />
                      <button className="stepper-btn" onClick={() => updateItem(it.id, { receivedQty: (it.receivedQty || 0) + 1 })}>+</button>
                    </div>
                    {it.receivedQty != null && it.receivedQty !== it.qty && (
                      <p className="mt-1.5 text-center text-[10px] font-black text-[#a16207]">اختلاف با سفارش: {faNum(it.receivedQty - it.qty)}</p>
                    )}
                  </div>
                  {/* printed price */}
                  <div className="rounded-xl bg-secondary/50 p-3">
                    <p className="mb-1.5 text-[10px] font-bold text-muted-foreground">قیمت چاپ‌شده روی کالا (قابل اصلاح):</p>
                    <div className="flex items-center gap-1">
                      <FaPriceInput
                        value={it.printedPrice ?? ''}
                        onChange={(v) => updateItem(it.id, { printedPrice: v === '' ? null : v })}
                        ariaLabel={`قیمت چاپ‌شده ${it.productName}`}
                        className="h-11 w-full rounded-xl border border-input bg-white px-2 text-sm"
                      />
                      <span className="text-[10px] font-bold text-muted-foreground">تومان</span>
                    </div>
                    {it.printedPrice != null && it.unitBuyPrice > 0 && (
                      <p className={cn('mt-1.5 text-center text-[10px] font-black', Math.abs(it.printedPrice - it.unitBuyPrice) / it.unitBuyPrice > 0.15 ? 'text-[#b3372f]' : 'text-[#0e7a4a]')}>
                        اختلاف با فاکتور: {faMoney(it.printedPrice - it.unitBuyPrice)}
                      </p>
                    )}
                  </div>
                  {/* note + barcode */}
                  <div className="rounded-xl bg-secondary/50 p-3">
                    <p className="mb-1.5 text-[10px] font-bold text-muted-foreground">توضیح (دلیل رد/کسری):</p>
                    <input value={it.note} onChange={(e) => updateItem(it.id, { note: e.target.value })} className="h-11 w-full rounded-xl border border-input bg-white px-3 text-xs outline-none focus:border-primary" placeholder="مثلاً: تاریخ نزدیک، برچسب اشتباه…" />
                    {scan.trim() && matchItem?.id === it.id && it.barcode !== scan.trim() && (
                      <button onClick={() => addBarcodeToProduct(it)} className="mt-1.5 w-full rounded-lg bg-[#c9a227]/20 py-1.5 text-[10px] font-black text-[#8a6d10]">
                        + افزودن بارکد اسکن‌شده به این کالا
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-secondary/60 p-4">
          <div className="text-xs">
            <p className="font-black">{faNum(items.length)} قلم در این مرسوله</p>
            <p className="text-muted-foreground">پس از ثبت، سفارش برای تأیید سرپرست انبار می‌رود و حسابدار خبردار می‌شود</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => api(`/api/orders/${orderId}`, { method: 'PATCH', body: { action: 'start_receiving' } }).catch(() => {})} className="rounded-xl border px-4 py-2.5 text-xs font-bold">ذخیره موقت</button>
            <button onClick={submit} className="rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-6 py-2.5 text-xs font-extrabold text-white shadow-lg">
              ✅ ثبت نهایی دریافت
            </button>
          </div>
        </div>
      </SectionCard>

      {newProductOpen && (
        <QuickProductModal
          onClose={() => setNewProductOpen(false)}
          onCreated={(p) => {
            setNewProductOpen(false)
            toast.success(`کالای «${p.name}» ساخته شد — می‌توانید آن را به سفارش اضافه کنید`)
            setScan(p.barcodes?.[0] || '')
          }}
          defaultBarcode={scan.trim()}
        />
      )}
    </div>
  )
}

/** The "F5 + Plus" flow of Holoo, but friendly */
export function QuickProductModal({ onClose, onCreated, defaultBarcode = '' }: { onClose: () => void; onCreated: (p: any) => void; defaultBarcode?: string }) {
  const [form, setForm] = useState({ name: '', barcodes: defaultBarcode, brand: '', category: 'عمومی', unit: 'عدد', buyPrice: '', sellPrice: '', sellPrice2: '', stock: '0', reorderLevel: '12' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return toast.error('نام کالا الزامی است')
    setBusy(true)
    try {
      const res = await api<{ product: any }>('/api/products', {
        method: 'POST',
        body: {
          ...form,
          barcodes: [form.barcodes].filter(Boolean),
          buyPrice: Number(form.buyPrice) || 0,
          sellPrice: Number(form.sellPrice) || 0,
          sellPrice2: Number(form.sellPrice2) || 0,
        },
      })
      onCreated(res.product)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="افزودن کالای جدید به سیستم" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نام کالا *"><input value={form.name} onChange={(e) => set('name', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="مثلاً: شیر پرچرب پگاه ۱ لیتری" /></Labeled>
        <Labeled label="بارکد (اسکن یا تایپ)"><input value={form.barcodes} onChange={(e) => set('barcodes', e.target.value)} className="w-full rounded-xl border border-input p-3 font-mono text-sm" dir="ltr" /></Labeled>
        <Labeled label="برند"><input value={form.brand} onChange={(e) => set('brand', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="دسته"><input value={form.category} onChange={(e) => set('category', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="قیمت خرید (تومان)"><FaPriceInput value={form.buyPrice === '' ? '' : Number(form.buyPrice)} onChange={(v) => set('buyPrice', v === '' ? '' : String(v))} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="قیمت فروش (تومان)"><FaPriceInput value={form.sellPrice === '' ? '' : Number(form.sellPrice)} onChange={(v) => set('sellPrice', v === '' ? '' : String(v))} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="قیمت فروش با تخفیف (اختیاری)"><FaPriceInput value={form.sellPrice2 === '' ? '' : Number(form.sellPrice2)} onChange={(v) => set('sellPrice2', v === '' ? '' : String(v))} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="واحد"><input value={form.unit} onChange={(e) => set('unit', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
      </div>
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? 'در حال ذخیره…' : 'ذخیره کالا ✅'}
      </button>
    </Modal>
  )
}
