'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliDateTime, formatJalaliFull, formatJalaliShort, todayIso } from '@/lib/jalali'
import { ORDER_STATUSES, ORDER_FLOW } from '@/lib/constants'
import { SectionCard, Pill, EmptyState, SearchInput, Labeled, KeyValue, stockStatus, CATEGORY_EMOJI } from '@/components/app/ui-bits'
import { JalaliDatePicker, useHolidays } from '@/components/app/jalali-widgets'
import type { AppCtx } from '@/components/app/ui-bits'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus, X, ClipboardList, History, CheckCircle2, AlertTriangle, Pencil, Send, Ban, Warehouse, Printer, BadgeCheck, Wallet, ShieldCheck, Clock, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { printElement } from '@/lib/print'

type Provider = { id: string; name: string; personName: string; phone: string; type: string; companyNames: string[]; productCount: number }
type Product = { id: string; name: string; barcodes: string[]; category: string; brand: string; unit: string; buyPrice: number; sellPrice: number; stock: number; reorderLevel: number; providerId: string | null; imageUrl: string }
type CorrectionState = { windowHours: number; anchorAt: string | null; openUntil: string | null; remainingMinutes: number | null; editable: boolean; expired: boolean }
type OrderRow = { id: string; code: string; providerName: string; status: string; deliveryDate: string; totalAmount: number; itemsCount: number; createdByName: string; isOverdue: boolean; payMethod: string; notes: string; history: any[]; createdAt: string; pendingApproval?: boolean; correction?: CorrectionState }
type DraftItem = { productId: string; name: string; qty: number; unitBuyPrice: number }

/* ── round-19e: گیت تأیید نهایی مدیر + اصلاح ۴۸ ساعته ── */
const HISTORY_LABELS: Record<string, string> = {
  'final-approval': 'تایید نهایی مدیر — ثبت نهایی سفارش',
  'correction': 'اصلاح سفارش',
}
const historyLabel = (a: string) => HISTORY_LABELS[a] || a

/** «۲۳ ساعت و ۱۲ دقیقه» با ارقام فارسی */
function remainingFa(mins: number): string {
  if (mins <= 0) return '۰'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${faNum(h)} ساعت و ${faNum(m)} دقیقه`
  if (h) return `${faNum(h)} ساعت`
  return `${faNum(m)} دقیقه`
}

/** تاریخ+ساعت شمسی فارسی‌رقم — نسخهٔ مطمئن برای ISO کامل.
 *  (formatJalaliDateTime تاریخیِ Date را به formatJalaliShort می‌دهد و در V8 سال ۲۰۰۱ تفسیر می‌شود → ۱۳۸۰؛
 *   اینجا از رشتهٔ ISO مستقیم استفاده می‌کنیم تا سال درست بماند — باگ کتابخانه در worklog ثبت شد.) */
function faDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatJalaliShort(String(iso))} - ${faNum(`${hh}:${mm}`)}`
}

export default function OrdersView({ ctx }: { ctx: AppCtx }) {
  // param can be 'new' or an order id — mode is derived, not state
  const mode: 'list' | 'new' | 'detail' = ctx.param === 'new' ? 'new' : ctx.param ? 'detail' : 'list'

  if (mode === 'new') return <NewOrderWizard ctx={ctx} onDone={(id) => ctx.navigate('orders', id)} />
  if (mode === 'detail') return <OrderDetail ctx={ctx} orderId={ctx.param} onBack={() => ctx.navigate('orders')} />
  return <OrdersList ctx={ctx} onOpen={(id) => ctx.navigate('orders', id)} />
}

/* ───────────────────────── List ───────────────────────── */

function OrdersList({ ctx, onOpen }: { ctx: AppCtx; onOpen: (id: string) => void }) {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => api<{ orders: OrderRow[] }>('/api/orders').then((d) => setOrders(d.orders)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const filtered = useMemo(
    () => orders.filter((o) => (!status || o.status === status) && (!q || o.code.includes(q) || o.providerName.includes(q))),
    [orders, status, q]
  )

  const canCreate = ['GM', 'PM', 'OM'].includes(ctx.user!.role)

  return (
    <div className="space-y-4">
      <SectionCard
        title="سفارش‌های تأمین‌کننده"
        subtitle="از ثبت تا تحویل، تأیید انبار و حسابداری — همه در یک مسیر شفاف"
        icon={<ClipboardList size={18} />}
        actions={
          canCreate && (
            <button onClick={() => ctx.navigate('orders', 'new')} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg transition hover:shadow-xl">
              <Plus size={15} /> سفارش جدید
            </button>
          )
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="جستجوی کد سفارش یا تأمین‌کننده…" className="w-full sm:w-72" />
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={!status} label="همه" onClick={() => setStatus('')} />
            {['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED', 'ACCOUNTED', 'DONE', 'CANCELLED'].map((s) => (
              <FilterChip key={s} active={status === s} label={ORDER_STATUSES[s].label} color={ORDER_STATUSES[s].color} onClick={() => setStatus(s)} />
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState emoji="📦" title="سفارشی یافت نشد" hint="با دکمه «سفارش جدید» اولین سفارش را ثبت کنید" />
        ) : (
          <div className="grid gap-2.5">
            {filtered.map((o) => {
              const st = ORDER_STATUSES[o.status]
              return (
                <button key={o.id} onClick={() => onOpen(o.id)} className="glow-card group rounded-2xl bg-white/70 p-3.5 text-right sm:p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style={{ background: st.bg }}>🚚</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black">{o.code}</span>
                        <Pill label={st.label} color={st.color} bg={st.bg} />
                        {o.pendingApproval && <Pill label="در انتظار تایید مدیر" color="#8a6d10" bg="#fdf6dd" />}
                        {o.isOverdue && <Pill label="سرآمده ⚠️" color="#b3372f" bg="#fee2e2" />}
                        {o.payMethod === 'CHEQUE' && <Pill label="چکی" color="#8a6d10" bg="#fdf6dd" />}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {o.providerName} • {faNum(o.itemsCount)} قلم • ثبت: {o.createdByName} • تحویل: {formatJalaliFull(o.deliveryDate)}
                      </p>
                    </div>
                    <span className="text-sm font-black text-[#8a6d10]">{faMoney(o.totalAmount)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function FilterChip({ active, label, onClick, color }: { active: boolean; label: string; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('rounded-full border px-3 py-1.5 text-[11px] font-bold transition', active ? 'border-transparent text-white shadow' : 'border-border bg-card text-foreground/70 hover:bg-secondary')}
      style={active ? { background: color || '#0e7a4a' } : {}}
    >
      {label}
    </button>
  )
}

/* ───────────────────────── Create wizard ───────────────────────── */

function NewOrderWizard({ ctx, onDone }: { ctx: AppCtx; onDone: (id: string) => void }) {
  const holidays = useHolidays()
  const [step, setStep] = useState(1)
  const [providers, setProviders] = useState<Provider[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [providerId, setProviderId] = useState('')
  const [company, setCompany] = useState('')
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [deliveryDate, setDeliveryDate] = useState('')
  const [payMethod, setPayMethod] = useState('CASH')
  const [notes, setNotes] = useState('')
  const [detailFor, setDetailFor] = useState<Product | null>(null)
  const [busy, setBusy] = useState(false)
  const [margins, setMargins] = useState<Record<string, { marginPct: number; buyPrice: number; sellPrice: number; orderCode: string; at: string }>>({})

  function add(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }

  useEffect(() => {
    api<{ providers: Provider[] }>('/api/providers').then((d) => setProviders(d.providers))
    api<{ products: Product[] }>('/api/products').then((d) => setProducts(d.products))
    setDeliveryDate(add(1))
  }, [])

  // حاشیه سود آخرین خریدها از همین تأمین‌کننده — «همان کالا از منابع مختلف، حاشیهٔ هر منبع»
  useEffect(() => {
    if (!providerId) { setMargins({}); return }
    api<{ margins: Record<string, { marginPct: number; buyPrice: number; sellPrice: number; orderCode: string; at: string }> }>(`/api/orders/margins?providerId=${providerId}`)
      .then((d) => setMargins(d.margins || {}))
      .catch(() => setMargins({}))
  }, [providerId])

  const marginTone = (pct: number) => (pct < 10 ? { c: '#b3372f', l: 'کم' } : pct < 25 ? { c: '#a16207', l: 'متوسط' } : { c: '#166534', l: 'خوب' })

  const provider = providers.find((p) => p.id === providerId)
  const isGM = ctx.user!.role === 'GM' || ctx.user!.role === 'OM'
  const prodsOfCompany = useMemo(() => {
    if (!provider) return []
    return products.filter((p) => p.providerId === providerId && (!company || p.brand === company))
  }, [products, provider, company, providerId])
  const draftItems: DraftItem[] = Object.entries(draft).filter(([, q]) => q > 0).map(([pid, qty]) => {
    const p = products.find((x) => x.id === pid)!
    return { productId: pid, name: p.name, qty, unitBuyPrice: p.buyPrice }
  })
  const total = draftItems.reduce((s, i) => s + i.qty * i.unitBuyPrice, 0)

  const submit = async (approve: boolean) => {
    if (!provider || draftItems.length === 0 || !deliveryDate) return
    setBusy(true)
    try {
      const res = await api<{ order: any }>('/api/orders', {
        method: 'POST',
        body: {
          providerId, providerName: provider.name,
          items: draftItems,
          deliveryDate, payMethod, notes,
          status: approve ? 'APPROVED' : 'SUBMITTED',
        },
      })
      toast.success(approve ? 'سفارش ثبت و تأیید شد ✅' : 'سفارش ثبت شد — در انتظار تأیید مدیر کل')
      onDone(res.order.id)
    } catch (e: any) {
      toast.error(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* steps */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black', step >= s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>{faNum(s)}</span>
            <span className={cn('hidden text-xs font-bold sm:block', step >= s ? 'text-foreground' : 'text-muted-foreground')}>
              {s === 1 ? 'تأمین‌کننده' : s === 2 ? 'انتخاب کالا' : s === 3 ? 'زمان و پرداخت' : 'بازبینی و ثبت'}
            </span>
            {s < 4 && <span className={cn('h-0.5 flex-1 rounded', step > s ? 'bg-primary' : 'bg-border')} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <SectionCard title="انتخاب تأمین‌کننده / ویزیتور" subtitle="شرکت‌هایی که هر پخش‌کننده کار می‌کند را ببینید" icon={<Plus size={18} />}>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((p) => (
              <button key={p.id} onClick={() => { setProviderId(p.id); setCompany(''); setStep(2) }}
                className={cn('glow-card rounded-2xl bg-white/70 p-4 text-right', providerId === p.id && 'ring-2 ring-primary')}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black">{p.name}</span>
                  <Pill label={p.type === 'DIRECT' ? 'کارخانه' : p.type === 'VISITOR' ? 'ویزیتور' : 'پخش'} color={p.type === 'DIRECT' ? '#0e7a4a' : p.type === 'VISITOR' ? '#c96f4a' : '#8a6d10'} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.personName} • {faNum(p.phone)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.companyNames.map((c) => <Pill key={c} label={c} color="#0e7a4a" className="!bg-secondary" />)}
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {step === 2 && provider && (
        <SectionCard
          title={`کالاهای ${provider.name}`}
          subtitle="روی دکمه + بزنید تا به سفارش اضافه شود — رنگ نشانگر، وضعیت انبار است"
          icon={<Plus size={18} />}
          actions={<button onClick={() => setStep(1)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">← تغییر تأمین‌کننده</button>}
        >
          {provider.companyNames.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <FilterChip active={!company} label="همه شرکت‌ها" onClick={() => setCompany('')} />
              {provider.companyNames.map((c) => <FilterChip key={c} active={company === c} label={c} onClick={() => setCompany(c)} />)}
            </div>
          )}
          <div className="scroll-gold grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto pl-1 sm:grid-cols-3 lg:grid-cols-4">
            {prodsOfCompany.map((p) => {
              const st = stockStatus(p.stock, p.reorderLevel)
              const qty = draft[p.id] || 0
              return (
                <div key={p.id} className="glow-card relative flex flex-col rounded-2xl bg-white/80 p-3">
                  <button onClick={() => setDetailFor(p)} className="mb-2 flex h-20 items-center justify-center rounded-xl bg-gradient-to-br from-secondary to-muted text-3xl">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full rounded-xl object-cover" /> : CATEGORY_EMOJI[p.category] || '📦'}
                  </button>
                  <p className="line-clamp-2 min-h-9 text-xs font-extrabold leading-4">{p.name}</p>
                  {margins[p.id] && margins[p.id].marginPct >= 0 && (() => { const t = marginTone(margins[p.id].marginPct); return (
                    <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black" style={{ background: `${t.c}18`, color: t.c }} title={`آخرین خرید از همین تأمین‌کننده — سفارش ${margins[p.id].orderCode}`}>
                      حاشیه اخیر: {faNum(margins[p.id].marginPct)}٪ ({t.l})
                    </span>
                  ) })()}
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">{p.brand}</span>
                    <span className="font-black" style={{ color: st.color }}>{st.label} {faNum(p.stock)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#8a6d10]">{faMoney(p.buyPrice)}</span>
                    <div className="flex items-center gap-1">
                      {qty > 0 && (
                        <>
                          <button className="stepper-btn !h-8 !w-8 !text-base" onClick={() => setDraft((d) => ({ ...d, [p.id]: Math.max(0, (d[p.id] || 0) - 1) }))}>−</button>
                          <span className="w-8 text-center text-sm font-black">{faNum(qty)}</span>
                        </>
                      )}
                      <button className="stepper-btn !h-8 !w-8 !text-base !border-primary !bg-primary !text-white" onClick={() => setDraft((d) => ({ ...d, [p.id]: (d[p.id] || 0) + 1 }))}>+</button>
                    </div>
                  </div>
                  <button onClick={() => setDetailFor(p)} className="mt-1.5 rounded-lg bg-muted/70 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted">
                    📊 سفارش و فروش ماه اخیر
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary/60 p-3">
            <span className="text-xs font-bold">{faNum(draftItems.length)} قلم انتخاب شده</span>
            <button disabled={!draftItems.length} onClick={() => setStep(3)} className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-white disabled:opacity-40">
              ادامه →
            </button>
          </div>
        </SectionCard>
      )}

      {step === 3 && (
        <SectionCard title="زمان تحویل و روش پرداخت" subtitle="تقویم شمسی با نشان‌دادن تعطیلات رسمی" icon={<Plus size={18} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="تاریخ تحویل مورد انتظار">
              <JalaliDatePicker value={deliveryDate} onChange={setDeliveryDate} holidays={holidays} minDate={todayIso()} warnHoliday />
            </Labeled>
            <Labeled label="روش پرداخت">
              <div className="grid grid-cols-2 gap-2">
                {[['CASH', 'نقدی هنگام تحویل 💵'], ['CHEQUE', 'چک 🧾']].map(([v, l]) => (
                  <button key={v} onClick={() => setPayMethod(v)} className={cn('rounded-xl border p-3 text-xs font-bold transition', payMethod === v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-secondary')}>
                    {l}
                  </button>
                ))}
              </div>
            </Labeled>
          </div>
          <div className="mt-4">
            <Labeled label="یادداشت سفارش (اختیاری)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary" placeholder="مثلاً: تحویل قبل ساعت ۹ صبح" />
            </Labeled>
          </div>
          <div className="mt-4 flex justify-between">
            <button onClick={() => setStep(2)} className="rounded-xl border px-5 py-2.5 text-xs font-bold">→ بازگشت</button>
            <button disabled={!deliveryDate} onClick={() => setStep(4)} className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-white disabled:opacity-40">بازبینی نهایی ←</button>
          </div>
        </SectionCard>
      )}

      {step === 4 && (
        <SectionCard title="بازبینی و ثبت سفارش" subtitle="قبل از ثبت، همه چیز را چک کنید" icon={<CheckCircle2 size={18} />}>
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <KeyValue k="تأمین‌کننده" v={provider?.name} />
            <KeyValue k="تاریخ تحویل" v={formatJalaliFull(deliveryDate)} />
            <KeyValue k="مبلغ کل" v={`${faMoney(total)} تومان`} />
          </div>
          <ul className="scroll-gold mb-4 max-h-56 space-y-1.5 overflow-y-auto">
            {draftItems.map((i) => (
              <li key={i.productId} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <span className="font-bold">{i.name}</span>
                <span>{faNum(i.qty)} × {faMoney(i.unitBuyPrice)} = <b>{faMoney(i.qty * i.unitBuyPrice)}</b></span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-between gap-2">
            <button onClick={() => setStep(3)} className="rounded-xl border px-5 py-2.5 text-xs font-bold">→ بازگشت</button>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => submit(false)} className="rounded-xl border border-primary bg-secondary px-5 py-2.5 text-xs font-extrabold text-primary">
                ثبت و ارسال برای تأیید {isGM ? '' : '(مدیر کل)'}
              </button>
              {isGM && (
                <button disabled={busy} onClick={() => submit(true)} className="rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-5 py-2.5 text-xs font-extrabold text-white shadow-lg">
                  ثبت و تأیید نهایی ✅
                </button>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* product history modal */}
      {detailFor && <ProductHistoryModal product={detailFor} onClose={() => setDetailFor(null)} onOrder={(q) => { setDraft((d) => ({ ...d, [detailFor.id]: (d[detailFor.id] || 0) + q })); setDetailFor(null) }} />}
    </div>
  )
}

function ProductHistoryModal({ product, onClose, onOrder }: { product: Product; onClose: () => void; onOrder: (q: number) => void }) {
  const [history, setHistory] = useState<any>(null)
  useEffect(() => {
    api<{ history: any }>(`/api/products/${product.id}`).then((d) => setHistory(d.history)).catch(() => {})
  }, [product.id])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="scroll-gold glow-card max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-5">
        <div className="mb-3 flex items-start justify-between">
          <h3 className="text-sm font-black">{product.name}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {history ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <KeyValue k="سفارش ماه اخیر" v={`${faNum(history.orderedLastMonth)} عدد`} />
              <KeyValue k="تعداد سفارش" v={`${faNum(history.ordersLastMonth)} بار`} />
              <KeyValue k="قیمت فروش فعلی" v={`${faMoney(product.sellPrice)} تومان`} />
              <KeyValue k="موجودی" v={faNum(product.stock)} />
            </div>
            <p className="mb-2 text-xs font-black text-muted-foreground">آخرین سفارش‌ها:</p>
            {history.lastOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground">در ماه اخیر سفارشی ثبت نشده</p>
            ) : (
              <ul className="mb-4 space-y-1">
                {history.lastOrders.map((o: any, i: number) => (
                  <li key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-[11px]">
                    <span className="font-bold">{o.code}</span>
                    <span>{faNum(o.qty)} عدد</span>
                    <span className="text-muted-foreground">{formatJalaliShort(o.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">در حال بارگذاری…</div>
        )}
        <div className="flex gap-2">
          <button onClick={() => onOrder(1)} className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white">+ افزودن ۱ عدد به سفارش</button>
          <button onClick={() => onOrder(6)} className="rounded-xl bg-secondary px-4 py-2.5 text-xs font-extrabold text-primary">+{faNum(6)}</button>
          <button onClick={() => onOrder(12)} className="rounded-xl bg-secondary px-4 py-2.5 text-xs font-extrabold text-primary">+{faNum(12)}</button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Detail + workflow ───────────────────────── */

function OrderDetail({ ctx, orderId, onBack }: { ctx: AppCtx; orderId: string; onBack: () => void }) {
  const holidays = useHolidays()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [corrOpen, setCorrOpen] = useState(false)
  const [corrTitle, setCorrTitle] = useState('')
  const [corrDetail, setCorrDetail] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editPay, setEditPay] = useState('CASH')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [correctOpen, setCorrectOpen] = useState(false)

  const load = () =>
    api<{ order: any; items: any[] }>(`/api/orders/${orderId}`).then((d) => {
      setOrder(d.order)
      setItems(d.items)
    })
  useEffect(() => { load() }, [orderId])

  if (!order) return <div className="py-16 text-center text-sm text-muted-foreground">در حال بارگذاری…</div>

  const st = ORDER_STATUSES[order.status]
  const role = ctx.user!.role
  const isExec = ['OWNER', 'GM', 'OM', 'ADMIN'].includes(role)
  const act = async (body: any, successMsg: string) => {
    try {
      await api(`/api/orders/${orderId}`, { method: 'PATCH', body })
      toast.success(successMsg)
      await load()
      ctx.refreshNotifications()
    } catch (e: any) { toast.error(e.message) }
  }

  const canApprove = order.status === 'SUBMITTED' && ['GM', 'OM'].includes(role)
  const canSubmitDraft = order.status === 'DRAFT' && ['GM', 'PM', 'OM'].includes(role)
  const canReceive = ['APPROVED', 'RECEIVING'].includes(order.status) && ['GM', 'OM', 'SK'].includes(role) || (['APPROVED', 'RECEIVING'].includes(order.status) && ctx.user!.secondaryRoles.includes('RECEIVER'))
  const canVerify = order.status === 'RECEIVED' && ['SK', 'GM', 'OM'].includes(role)
  const canEdit = !['RECEIVED', 'VERIFIED', 'ACCOUNTED', 'DONE', 'CANCELLED'].includes(order.status) && ['GM', 'PM', 'OM'].includes(role)
  const canCancel = !['DONE', 'CANCELLED'].includes(order.status) && ['GM', 'OM'].includes(role)
  const canCheckout = ['RECEIVED', 'VERIFIED', 'ACCOUNTED'].includes(order.status) && (role === 'ACC' || isExec)
  const canEditLive = !canEdit && !['DONE', 'CANCELLED'].includes(order.status) && (role === 'ACC' || isExec)
  // ── round-19e: گیت تأیید نهایی + اصلاح مدیریتی ۴۸ ساعته ──
  const isManager = ['GM', 'OM', 'OWNER', 'ADMIN'].includes(role)
  const canFinalApprove = !!order.pendingApproval && isManager
  const canCorrect = isManager && !!order.correction?.editable
  const corr: CorrectionState | null = order.correction || null

  return (
    <div className="space-y-4">
      <SectionCard
        title={`${order.code} — ${order.providerName}`}
        subtitle={`ثبت‌کننده: ${order.createdByName} • ${formatJalaliFull(order.createdAt)}`}
        icon={<ClipboardList size={18} />}
        actions={<button onClick={onBack} className="rounded-lg border px-3 py-1.5 text-xs font-bold">→ همه سفارش‌ها</button>}
      >
        {/* status pipeline */}
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          {ORDER_FLOW.map((s, i) => {
            const idx = ORDER_FLOW.indexOf(order.status)
            const done = idx >= 0 && i < idx
            const current = order.status === s
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black', current ? 'text-white shadow' : done ? 'bg-[#0e7a4a]/15 text-[#0e7a4a]' : 'bg-muted text-muted-foreground')} style={current ? { background: ORDER_STATUSES[s].color } : {}}>
                  {ORDER_STATUSES[s].label}
                </span>
                {i < ORDER_FLOW.length - 1 && <span className={cn('h-0.5 w-4 rounded', done ? 'bg-[#0e7a4a]' : 'bg-border')} />}
              </div>
            )
          })}
          {order.status === 'CANCELLED' && <Pill label="لغو شده" color="#b3372f" bg="#fee2e2" />}
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          <KeyValue k="تاریخ تحویل" v={formatJalaliFull(order.deliveryDate)} />
          <KeyValue k="مبلغ کل" v={`${faMoney(order.totalAmount)} تومان`} />
          <KeyValue k="پرداخت" v={order.payMethod === 'CHEQUE' ? 'چک' : 'نقدی'} />
          <KeyValue k="وضعیت" v={<Pill label={st.label} color={st.color} bg={st.bg} />} />
        </div>

        {order.checkedByName && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#0e7a4a]/30 bg-[#0e7a4a]/8 p-3 text-xs font-black text-[#0e7a4a]">
            <BadgeCheck size={16} />
            تأیید حسابداری ✓ — قابل بایگانی
            <span className="text-[10px] font-bold text-muted-foreground">
              بررسی‌کننده: {order.checkedByName} • {order.checkedAt ? formatJalaliFull(order.checkedAt) : ''}
            </span>
          </div>
        )}

        {/* round-19e: گیت تأیید نهایی مدیر — سفارش فقط با تأیید صریح مدیر DONE می‌شود */}
        {order.pendingApproval && (
          <div className="mb-4 rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd]/70 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black text-[#8a6d10]">
              <Clock size={15} />
              در انتظار تایید مدیر
              {!isManager && <span className="font-bold">— پس از تأیید صریح مدیر، سفارش «تکمیل‌شده» و بایگانی می‌شود</span>}
            </div>
            {corr && corr.anchorAt && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="mt-1.5 inline-flex cursor-help items-center gap-1.5 rounded-full bg-[#c9a227]/15 px-2.5 py-1 text-[10.5px] font-black text-[#8a6d10]">
                    <Clock size={11} />
                    {corr.expired
                      ? `پنجرهٔ اصلاح ${faNum(corr.windowHours)} ساعته بسته شد`
                      : `پنجرهٔ اصلاح ${faNum(corr.windowHours)} ساعته: ${remainingFa(corr.remainingMinutes || 0)} باقی‌مانده`}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64 text-right leading-5">
                  پنجرهٔ اصلاح ۴۸ ساعته — منطبق با اصل دورهٔ مالی و کنترل‌های SOX
                  <br />
                  مبدأ: تأیید انبار ({faDateTime(corr.anchorAt)})
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {order.isOverdue && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#b3372f]/30 bg-[#fee2e2]/60 p-3 text-xs font-bold text-[#b3372f]">
            <AlertTriangle size={16} /> این سفارش از تاریخ تحویل گذشته و هنوز دریافت نشده — با تأمین‌کننده فالوآپ کنید.
          </div>
        )}
        {order.notes && <p className="mb-4 rounded-xl bg-accent/60 p-3 text-xs">📝 {order.notes}</p>}

        {/* items */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs table-luxe">
            <thead>
              <tr className="border-b border-border text-[10px] text-muted-foreground">
                <th className="p-2">کالا</th>
                <th className="p-2">بارکد</th>
                <th className="p-2">سفارش</th>
                <th className="p-2">قیمت واحد</th>
                <th className="p-2">جمع</th>
                <th className="p-2">دریافتی</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border/40">
                  <td className="p-2 font-bold">{it.productName}</td>
                  <td className="p-2 font-mono text-[10px] text-muted-foreground">{it.barcode ? faNum(it.barcode) : '—'}</td>
                  <td className="p-2">{faNum(it.qty)}</td>
                  <td className="p-2">{faMoney(it.unitBuyPrice)}</td>
                  <td className="p-2 font-bold">{faMoney(it.qty * it.unitBuyPrice)}</td>
                  <td className="p-2">
                    {it.receivedQty != null ? (
                      <Pill label={`${faNum(it.receivedQty)} / ${faNum(it.qty)}`} color={it.receivedQty < it.qty ? '#a16207' : '#166534'} />
                    ) : it.status === 'REJECTED' ? <Pill label="رد شده" color="#b3372f" /> : it.status === 'SHORT' ? <Pill label="کسری" color="#a16207" /> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* actions */}
        <div className="mt-5 flex flex-wrap gap-2">
          {canSubmitDraft && (
            <button onClick={() => act({ action: 'submit' }, 'پیش‌نویس برای تأیید ارسال شد ✉️')} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#8a5a2b] to-[#a97436] px-4 py-2.5 text-xs font-extrabold text-white">
              <Send size={14} /> ارسال پیش‌نویس برای تأیید
            </button>
          )}
          {canApprove && (
            <button onClick={() => act({ action: 'approve' }, 'سفارش تأیید و به تأمین‌کننده اطلاع داده شد ✅')} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-4 py-2.5 text-xs font-extrabold text-white">
              <CheckCircle2 size={15} /> تأیید و ارسال به تأمین‌کننده
            </button>
          )}
          {canReceive && (
            <button onClick={() => ctx.navigate('receiving', order.id)} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#c96f4a] to-[#d98a5f] px-4 py-2.5 text-xs font-extrabold text-white">
              🚚 دریافت مرسوله
            </button>
          )}
          {canVerify && (
            <button onClick={() => ctx.navigate('verify', order.id)} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#77934a] to-[#8fa85e] px-4 py-2.5 text-xs font-extrabold text-white">
              <Warehouse size={15} /> تأیید انبار
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setEditDate(order.deliveryDate); setEditNotes(order.notes); setEditOpen(true) }} className="flex items-center gap-1.5 rounded-xl border border-primary/50 bg-secondary px-4 py-2.5 text-xs font-extrabold text-primary">
              <Pencil size={14} /> ویرایش سفارش
            </button>
          )}
          {canCheckout && (
            <button onClick={() => setCheckoutOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#3f6212] to-[#77934a] px-4 py-2.5 text-xs font-extrabold text-white shadow">
              <BadgeCheck size={15} /> تحویل و نهایی‌سازی (تصویب حسابداری)
            </button>
          )}
          {/* round-19e: گیت نهایی — فقط مدیر/مالک، فقط در وضعیت انتظار تایید */}
          {canFinalApprove && (
            <button onClick={() => act({ action: 'final-approval', detail: `تایید نهایی توسط ${ctx.user!.name}` }, 'تایید نهایی ثبت شد — سفارش تکمیل و بایگانی شد ✅')} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#a87d0e] to-[#c9a227] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg">
              <ShieldCheck size={15} /> تایید نهایی (ثبت سفارش تکمیل‌شده)
            </button>
          )}
          {/* round-19e: اصلاح مدیریتی با پنجرهٔ ۴۸ ساعته */}
          {canCorrect && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setCorrectOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd]/60 px-4 py-2.5 text-xs font-extrabold text-[#8a6d10]">
                  <Pencil size={14} /> اصلاح سفارش (مدیر)
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-right leading-5">
                پنجرهٔ اصلاح ۴۸ ساعته — منطبق با اصل دورهٔ مالی و کنترل‌های SOX
              </TooltipContent>
            </Tooltip>
          )}
          {canEditLive && (
            <button onClick={() => { setEditDate(order.deliveryDate); setEditNotes(order.notes); setEditPay(order.payMethod || 'CASH'); setEditOpen(true) }} className="flex items-center gap-1.5 rounded-xl border border-[#8a6d10]/50 bg-[#fdf6dd]/60 px-4 py-2.5 text-xs font-extrabold text-[#8a6d10]">
              <Wallet size={14} /> ویرایش در جریان
            </button>
          )}
          {['RECEIVED', 'VERIFIED', 'ACCOUNTED', 'DONE'].includes(order.status) && ['GM', 'PM', 'OM', 'ACC'].includes(role) && (
            <button onClick={() => setCorrOpen(true)} className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-extrabold text-muted-foreground">
              <History size={14} /> ثبت اصلاحیه
            </button>
          )}
          <button onClick={() => setSheetOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd]/60 px-4 py-2.5 text-xs font-extrabold text-[#8a6d10]">
            <Printer size={14} /> چاپ برگ سفارش
          </button>
          {canCancel && (
            <button onClick={() => act({ action: 'cancel', detail: 'لغو توسط ' + ctx.user!.name }, 'سفارش لغو شد')} className="flex items-center gap-1.5 rounded-xl border border-[#b3372f]/40 px-4 py-2.5 text-xs font-extrabold text-[#b3372f]">
              <Ban size={14} /> لغو سفارش
            </button>
          )}
        </div>

        {/* round-19e: «تاریخچهٔ تغییرات» — جدیدترین رویدادها اول، با تاریخ شمسی فارسی‌رقم */}
        {order.history.length > 0 && (
          <Collapsible className="mt-4 border-t border-border/60 pt-3">
            <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-xs font-black text-foreground/80 transition hover:bg-muted/70">
              <span className="flex items-center gap-1.5">
                <History size={14} className="text-[#8a6d10]" />
                تاریخچهٔ تغییرات ({faNum(order.history.length)} رخداد — جدید → قدیم)
              </span>
              <ChevronDown size={15} className="transition-transform data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ol className="scroll-gold mt-2 max-h-72 space-y-1.5 overflow-y-auto pl-1">
                {[...order.history].slice().reverse().map((h: any, i: number) => (
                  <li key={i} className="rounded-lg bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <p className="text-[11px] font-extrabold">{historyLabel(String(h.action || ''))}</p>
                      <p className="text-[10px] font-bold text-muted-foreground">{faDateTime(h.at)}</p>
                    </div>
                    {h.detail && <p className="mt-0.5 text-[10.5px] leading-4 text-muted-foreground">{h.detail}</p>}
                    <p className="mt-0.5 text-[10px] text-muted-foreground/80">👤 {h.userName}</p>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        )}
      </SectionCard>

      {/* history timeline */}
      <SectionCard title="تاریخچه کامل سفارش" subtitle="هر تغییر با نام و زمان ثبت می‌شود — شفافیت کامل" icon={<History size={18} />}>
        <ol className="relative space-y-3 border-r-2 border-dashed border-[#c9a227]/40 pr-5">
          {order.history.map((h: any, i: number) => (
            <li key={i} className="relative">
              <span className="absolute -right-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-[#c9a227] bg-card" />
              <p className="text-xs font-extrabold">{historyLabel(String(h.action || ''))}</p>
              {h.detail && <p className="text-[11px] text-muted-foreground">{h.detail}</p>}
              <p className="text-[10px] text-muted-foreground">{h.userName} • {formatJalaliFull(h.at)} {new Date(h.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</p>
            </li>
          ))}
        </ol>
      </SectionCard>

      {/* provider order sheet print */}
      {sheetOpen && (
        <Modal title="برگ سفارش برای تأمین‌کننده" onClose={() => setSheetOpen(false)} wide>
          <div className="print-area rounded-xl bg-white p-5 text-black" dir="rtl">
            <div className="mb-3 flex items-center justify-between border-b-2 border-[#c9a227] pb-2">
              <div>
                <p className="text-base font-black">هایپر زیتون — برگ سفارش خرید</p>
                <p className="text-[11px]">کرمان • سامانه مدیریت عملیات</p>
              </div>
              <div className="text-left text-[11px]">
                <p>کد سفارش: <b>{order.code}</b></p>
                <p>تأمین‌کننده: <b>{order.providerName}</b></p>
                <p>تاریخ تحویل: <b>{formatJalaliFull(order.deliveryDate)}</b></p>
              </div>
            </div>
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="p-1.5">#</th><th className="p-1.5">کالا</th><th className="p-1.5">بارکد</th>
                  <th className="p-1.5">تعداد</th><th className="p-1.5">قیمت واحد</th><th className="p-1.5">جمع</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, i: number) => (
                  <tr key={it.id} className="border-b border-gray-200">
                    <td className="p-1.5">{i + 1}</td>
                    <td className="p-1.5">{it.productName}</td>
                    <td className="p-1.5" dir="ltr">{it.barcode || '—'}</td>
                    <td className="p-1.5 font-bold">{it.qty}</td>
                    <td className="p-1.5">{it.unitBuyPrice.toLocaleString('en-US')}</td>
                    <td className="p-1.5 font-bold">{(it.qty * it.unitBuyPrice).toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t-2 border-[#c9a227] pt-2 text-xs font-bold">
              <span>تعداد اقلام: {items.length}</span>
              <span>مبلغ تقریبی: {order.totalAmount.toLocaleString('en-US')} تومان</span>
            </div>
            <p className="mt-3 text-[10px]">لطفاً تاریخ انقضای اقلام فاسدشدنی روی فاکتور درج شود. اقلام با برچسب قیمت اشتباه یا تاریخ کوتاه پذیرش نمی‌شود.</p>
            <div className="mt-8 flex justify-between text-[10px]">
              <span>امضای سفارش‌دهنده: ................</span>
              <span>امضای تأمین‌کننده: ................</span>
            </div>
          </div>
          <button onClick={() => printElement(document.querySelector('.print-area'))} className="no-print w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white">
            🖨️ چاپ یا ذخیره PDF برگ سفارش
          </button>
        </Modal>
      )}

      {/* edit modal */}
      {editOpen && (
        <Modal title="ویرایش سفارش" onClose={() => setEditOpen(false)}>
          <Labeled label="تاریخ تحویل">
            <JalaliDatePicker value={editDate} onChange={setEditDate} holidays={holidays} minDate={todayIso()} warnHoliday={false} compact />
          </Labeled>
          <Labeled label="روش پرداخت">
            <div className="flex gap-2">
              {['CASH', 'CHEQUE'].map((m) => (
                <button key={m} type="button" onClick={() => setEditPay(m)} className={cn('flex-1 rounded-xl border px-3 py-2 text-xs font-black transition', editPay === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground')}>
                  {m === 'CASH' ? 'نقدی' : 'چک'}
                </button>
              ))}
            </div>
          </Labeled>
          <Labeled label="یادداشت">
            <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-input p-3 text-sm" />
          </Labeled>
          <p className="rounded-lg bg-accent/60 p-2.5 text-[11px]">برای تغییر تعداد اقلام، پیش از دریافت مرسوله با پشتیبانی حسابداری هماهنگ کنید؛ یا پس از دریافت از «اصلاحیه» استفاده نمایید.</p>
          <button onClick={async () => { await act({ action: 'edit', deliveryDate: editDate, notes: editNotes, payMethod: editPay, detail: 'ویرایش تاریخ/روش پرداخت/یادداشت' }, 'سفارش ویرایش شد ✏️'); setEditOpen(false) }} className="mt-2 w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white">
            ذخیره تغییرات
          </button>
        </Modal>
      )}

      {/* checkout modal — تحویل و تصویب حسابداری */}
      {checkoutOpen && (
        <CheckoutModal
          order={order}
          items={items}
          onClose={() => setCheckoutOpen(false)}
          onDone={() => { setCheckoutOpen(false); load(); ctx.refreshNotifications() }}
        />
      )}

      {/* correction modal */}
      {corrOpen && (
        <Modal title="ثبت اصلاحیه (بدون تغییر تاریخچه)" onClose={() => setCorrOpen(false)}>
          <Labeled label="عنوان اصلاحیه"><input value={corrTitle} onChange={(e) => setCorrTitle(e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="مثلاً: اصلاح تعداد شیر پگاه" /></Labeled>
          <Labeled label="توضیح"><textarea value={corrDetail} onChange={(e) => setCorrDetail(e.target.value)} rows={3} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
          <button
            onClick={async () => {
              if (!corrTitle.trim()) return toast.error('عنوان اصلاحیه را بنویسید')
              await act({ action: 'correct', title: corrTitle, detail: corrDetail }, 'اصلاحیه ثبت شد و در تاریخچه ماند 📜')
              setCorrOpen(false); setCorrTitle(''); setCorrDetail('')
            }}
            className="mt-2 w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white"
          >
            ثبت اصلاحیه
          </button>
        </Modal>
      )}

      {/* round-19e: اصلاح مدیریتی سفارش — فیلدها + اقلام با پنجرهٔ ۴۸ ساعته */}
      {correctOpen && (
        <CorrectOrderDialog
          order={order}
          items={items}
          onClose={() => setCorrectOpen(false)}
          onDone={() => { setCorrectOpen(false); load() }}
        />
      )}
    </div>
  )
}

/** مودال تحویل و نهایی‌سازی — بازبینی حسابدار: دریافتی/کسری/مرجوعی/قیمت چاپی/انقضا + جمع نهایی */
function CheckoutModal({ order, items, onClose, onDone }: { order: any; items: any[]; onClose: () => void; onDone: () => void }) {
  const holidays = useHolidays()
  const [rows, setRows] = useState(() =>
    items.map((it) => ({
      id: it.id as string,
      productName: it.productName as string,
      qty: it.qty as number,
      unitBuyPrice: it.unitBuyPrice as number,
      receivedQty: it.receivedQty ?? it.qty,
      missingQty: it.missingQty || 0,
      returned: !!it.returned,
      returnReason: it.returnReason || '',
      printedPrice: it.printedPrice ?? '',
      expiryDate: it.expiryDate || '',
      note: it.note || '',
    }))
  )
  const [checkNote, setCheckNote] = useState('')
  const [busy, setBusy] = useState(false)

  const patchRow = (id: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  // جمع‌ها: سفارش اولیه vs نهایی (موثر = بدون مرجوعی و منهای کسری)
  const initialTotal = rows.reduce((s, r) => s + r.qty * r.unitBuyPrice, 0)
  const finalTotal = rows.reduce((s, r) => s + (r.returned ? 0 : Math.max(0, Number(r.receivedQty ?? r.qty) - r.missingQty)) * r.unitBuyPrice, 0)
  const returnedCount = rows.filter((r) => r.returned).length
  const missingCount = rows.filter((r) => !r.returned && r.missingQty > 0).length
  const diffColor = finalTotal === initialTotal ? '#0e7a4a' : '#b3372f'

  const submit = async () => {
    setBusy(true)
    try {
      await api(`/api/orders/${order.id}`, {
        method: 'PATCH',
        body: {
          action: 'checkout',
          checkNote,
          items: rows.map((r) => ({
            id: r.id,
            receivedQty: Number(r.receivedQty) || 0,
            missingQty: Number(r.missingQty) || 0,
            returned: r.returned,
            returnReason: r.returnReason,
            printedPrice: r.printedPrice === '' ? undefined : Number(r.printedPrice),
            expiryDate: r.expiryDate || undefined,
            note: r.note,
          })),
        },
      })
      toast.success('تحویل نهایی شد و در حسابداری ثبت گردید ✓')
      onDone()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`تحویل و نهایی‌سازی ${order.code} — بازبینی حسابدار`} onClose={onClose} wide>
      <p className="rounded-xl bg-[#fdf6dd]/70 px-3 py-2 text-[11px] leading-5 text-[#8a5a2b]">
        کالای دریافتی را با فاکتور مطابقت دهید: قیمت چاپی اشتباه، انقضای کوتاه، کسری و مرجوعی را همین‌جا اصلاح کنید. مبلغ نهایی به‌صورت خودکار بازمحاسبه می‌شود.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className={cn('rounded-2xl border p-3', r.returned ? 'border-[#b3372f]/40 bg-[#b3372f]/5' : 'border-border bg-white/70')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black">{r.productName}</p>
              <div className="flex items-center gap-2 text-[10.5px] font-bold text-muted-foreground">
                <span>سفارش: {faNum(r.qty)} عدد</span>
                <span>• واحد: {faMoney(r.unitBuyPrice)}</span>
                <label className="flex cursor-pointer items-center gap-1 rounded-lg bg-[#b3372f]/10 px-2 py-1 text-[10.5px] font-black text-[#b3372f]">
                  <input type="checkbox" checked={r.returned} onChange={(e) => patchRow(r.id, { returned: e.target.checked })} className="accent-[#b3372f]" />
                  مرجوع
                </label>
              </div>
            </div>
            {r.returned && (
              <Labeled label="دلیل مرجوعی (حداقل ۳ حرف) *">
                <input value={r.returnReason} onChange={(e) => patchRow(r.id, { returnReason: e.target.value })} placeholder="مثلاً: قیمت چاپی با فاکتور نمی‌خواند" className="w-full rounded-xl border border-input p-2 text-xs" />
              </Labeled>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Labeled label="دریافتی">
                <input type="number" min={0} dir="ltr" value={r.receivedQty} onChange={(e) => patchRow(r.id, { receivedQty: Number(e.target.value) })} className="w-full rounded-xl border border-input p-2 text-center text-xs font-bold" />
              </Labeled>
              <Labeled label="کسری">
                <input type="number" min={0} dir="ltr" value={r.missingQty} onChange={(e) => patchRow(r.id, { missingQty: Number(e.target.value) || 0 })} className="w-full rounded-xl border border-input p-2 text-center text-xs font-bold" />
              </Labeled>
              <Labeled label="قیمت چاپی">
                <input type="number" min={0} dir="ltr" value={r.printedPrice} onChange={(e) => patchRow(r.id, { printedPrice: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="—" className="w-full rounded-xl border border-input p-2 text-center text-xs font-bold" />
              </Labeled>
              <Labeled label="انقضا">
                <JalaliDatePicker value={r.expiryDate} onChange={(iso) => patchRow(r.id, { expiryDate: iso })} holidays={holidays} compact />
              </Labeled>
            </div>
            <Labeled label="یادداشت قلم">
              <input value={r.note} onChange={(e) => patchRow(r.id, { note: e.target.value })} className="mt-1 w-full rounded-xl border border-input p-2 text-xs" placeholder="مثلاً: ۲ عدد اضافه آمد — مرجوع شد" />
            </Labeled>
          </div>
        ))}
      </div>

      {/* جمع‌های زنده */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/40 p-3 text-center sm:grid-cols-4">
        <div><p className="text-sm font-black">{faMoney(initialTotal)}</p><p className="text-[10px] font-bold text-muted-foreground">سفارش اولیه</p></div>
        <div><p className="text-sm font-black" style={{ color: diffColor }}>{faMoney(finalTotal)}</p><p className="text-[10px] font-bold text-muted-foreground">مبلغ نهایی تحویل</p></div>
        <div><p className="text-sm font-black text-[#b3372f]">{faNum(returnedCount)}</p><p className="text-[10px] font-bold text-muted-foreground">قلم مرجوع</p></div>
        <div><p className="text-sm font-black text-[#a16207]">{faNum(missingCount)}</p><p className="text-[10px] font-bold text-muted-foreground">قلم دارای کسری</p></div>
      </div>
      <Labeled label="یادداشت بازبینی (checkNote)">
        <textarea value={checkNote} onChange={(e) => setCheckNote(e.target.value)} rows={2} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="مثلاً: فاکتور با نرم‌افزار تطبیق داده شد؛ مغایرت قیمت قلم دوم مرجوع شد" />
      </Labeled>
      <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-gradient-to-l from-[#3f6212] to-[#77934a] py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ثبت تحویل و تصویب حسابداری ✓'}
      </button>
    </Modal>
  )
}

/** round-19e: اصلاح مدیریتی سفارش — فیلدهای سرصفحه + تعداد/قیمت/تخفیف اقلام؛
 *  هر تغییر به‌صورت «field: old → new» در تاریخچه ثبت می‌شود؛ پنجرهٔ اصلاح ۴۸ ساعته از تأیید انبار. */
function CorrectOrderDialog({ order, items, onClose, onDone }: { order: any; items: any[]; onClose: () => void; onDone: () => void }) {
  const holidays = useHolidays()
  const [deliveryDate, setDeliveryDate] = useState(order.deliveryDate)
  const [notes, setNotes] = useState(order.notes || '')
  const [payMethod, setPayMethod] = useState(order.payMethod || 'CASH')
  const [paymentRef, setPaymentRef] = useState(order.paymentRef || '')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState(() =>
    items.map((it) => ({ id: it.id as string, productName: it.productName as string, qty: it.qty as number, unitBuyPrice: it.unitBuyPrice as number, discount: (it.discount || 0) as number }))
  )
  const [busy, setBusy] = useState(false)

  const patchRow = (id: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const headerChanged =
    deliveryDate !== order.deliveryDate ||
    notes !== (order.notes || '') ||
    payMethod !== (order.payMethod || 'CASH') ||
    paymentRef !== (order.paymentRef || '')
  const itemsChanged = rows.some((r) => {
    const it = items.find((x) => x.id === r.id)
    if (!it) return false
    return r.qty !== it.qty || r.unitBuyPrice !== it.unitBuyPrice || r.discount !== (it.discount || 0)
  })
  const changedCount = Number(headerChanged) + Number(itemsChanged) + (note.trim() ? 1 : 0)
  const newTotal = rows.reduce((s, r) => s + Math.max(0, r.qty * r.unitBuyPrice - r.discount), 0)

  const submit = async () => {
    if (!headerChanged && !itemsChanged && !note.trim()) return toast.error('تغییری برای ثبت وجود ندارد — ابتدا مقادیر را ویرایش کنید')
    setBusy(true)
    try {
      await api(`/api/orders/${order.id}`, {
        method: 'PATCH',
        body: {
          action: 'correct',
          deliveryDate,
          notes,
          payMethod,
          paymentRef,
          note,
          items: rows.map((r) => ({ id: r.id, qty: r.qty, unitBuyPrice: r.unitBuyPrice, discount: r.discount })),
        },
      })
      toast.success(`اصلاح ثبت شد (${faNum(changedCount)} مورد) — در تاریخچهٔ تغییرات ماند 📜`)
      onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const corr = order.correction as CorrectionState | null

  return (
    <Modal title={`اصلاح سفارش ${order.code} — دست مدیر`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fdf6dd]/70 px-3 py-2.5 text-[11px] leading-5 text-[#8a5a2b]">
        <span>
          مقادیر اشتباه سفارش را اصلاح کنید؛ هر تغییر با «مقدار قبلی → جدید»، نام و زمان در تاریخچه می‌ماند. مبلغ کل به‌صورت خودکار بازمحاسبه می‌شود.
        </span>
        {corr?.anchorAt && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-full bg-[#c9a227]/15 px-2.5 py-1 text-[10px] font-black text-[#8a6d10]">
                <Clock size={11} />
                {corr.expired
                  ? `پنجرهٔ ${faNum(corr.windowHours)} ساعته بسته شد`
                  : `${remainingFa(corr.remainingMinutes || 0)} باقی‌مانده`}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72 text-right leading-5">
              پنجرهٔ اصلاح ۴۸ ساعته — منطبق با اصل دورهٔ مالی و کنترل‌های SOX
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="تاریخ تحویل">
          <JalaliDatePicker value={deliveryDate} onChange={setDeliveryDate} holidays={holidays} minDate={todayIso()} warnHoliday={false} compact />
        </Labeled>
        <Labeled label="روش پرداخت">
          <div className="grid grid-cols-3 gap-2">
            {[['CASH', 'نقدی'], ['CHEQUE', 'چک'], ['POS', 'کارتخوان']].map(([m, l]) => (
              <button key={m} type="button" onClick={() => setPayMethod(m)} className={cn('rounded-xl border px-2 py-2 text-xs font-black transition', payMethod === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground')}>
                {l}
              </button>
            ))}
          </div>
        </Labeled>
        <Labeled label="مرجع پرداخت (شماره چک / سریال صیاد / ۴ رقم آخر کارت)">
          <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} dir="ltr" className="w-full rounded-xl border border-input p-2.5 text-sm" placeholder="—" />
        </Labeled>
        <Labeled label="یادداشت سفارش">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-input p-2.5 text-sm" />
        </Labeled>
      </div>

      <p className="mt-1 text-[11px] font-black text-muted-foreground">اقلام — تعداد، قیمت واحد و تخفیف قابل اصلاح است:</p>
      <div className="scroll-gold max-h-64 space-y-2 overflow-y-auto pl-1">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-white/70 p-3">
            <p className="mb-2 text-xs font-black">{r.productName}</p>
            <div className="grid grid-cols-3 gap-2">
              <Labeled label="تعداد">
                <input type="number" min={1} dir="ltr" value={r.qty} onChange={(e) => patchRow(r.id, { qty: Math.round(Number(e.target.value)) || 0 })} className="w-full rounded-xl border border-input p-2 text-center text-xs font-bold" />
              </Labeled>
              <Labeled label="قیمت واحد (تومان)">
                <input type="number" min={0} dir="ltr" value={r.unitBuyPrice} onChange={(e) => patchRow(r.id, { unitBuyPrice: Number(e.target.value) || 0 })} className="w-full rounded-xl border border-input p-2 text-center text-xs font-bold" />
              </Labeled>
              <Labeled label="تخفیف (تومان)">
                <input type="number" min={0} dir="ltr" value={r.discount} onChange={(e) => patchRow(r.id, { discount: Math.max(0, Number(e.target.value) || 0) })} className="w-full rounded-xl border border-input p-2 text-center text-xs font-bold" />
              </Labeled>
            </div>
            <p className="mt-1 text-left text-[10.5px] font-bold text-muted-foreground">جمع خط: {faMoney(Math.max(0, r.qty * r.unitBuyPrice - r.discount))} تومان</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/40 p-3 text-xs">
        <span className="font-bold">مبلغ کل پس از اصلاح: <b className="text-[#8a6d10]">{faMoney(newTotal)}</b> تومان</span>
        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black', changedCount > 0 ? 'bg-[#c9a227]/15 text-[#8a6d10]' : 'bg-muted text-muted-foreground')}>
          {changedCount > 0 ? `${faNum(changedCount)} مورد تغییر` : 'بدون تغییر'}
        </span>
      </div>
      <Labeled label="یادداشت اصلاح (اختیاری — در تاریخچه ثبت می‌شود)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="مثلاً: تعداد شیر بنا به هماهنگی تلفنی با پخش اصلاح شد" />
      </Labeled>
      <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-gradient-to-l from-[#a87d0e] to-[#c9a227] py-3 text-sm font-extrabold text-white shadow disabled:opacity-50">
        {busy ? '…' : 'ثبت اصلاح و ثبت در تاریخچه 📜'}
      </button>
    </Modal>
  )
}

export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  // الگوی WAI-ARIA dialog: بستن با کلید Escape — یک‌بار اینجا، برای همهٔ مودال‌های سامانه
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn('scroll-gold glow-card max-h-[85vh] w-full overflow-y-auto rounded-2xl bg-card p-5', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  )
}
