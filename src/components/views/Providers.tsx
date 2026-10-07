'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, Labeled, stockStatus, CATEGORY_EMOJI } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { PersonFormModal } from '@/components/views/People'
import { PeopleNetBar } from '@/components/app/PeopleNetBar'
import type { AppCtx } from '@/components/app/ui-bits'
import { Truck, Plus, Pencil, Trash2, UserCog, ChevronDown, Factory } from 'lucide-react'
import { cn } from '@/lib/utils'

type Provider = { id: string; name: string; personName: string; phone: string; type: string; companyNames: string[]; manufacturerId: string; notes: string; productCount: number }
type Product = { id: string; name: string; brand: string; category: string; buyPrice: number; sellPrice: number; stock: number; reorderLevel: number; imageUrl: string; providerId?: string | null }
type ManufacturerLite = { id: string; name: string; brands: string[] }
type RepLite = { id: string; fullName: string; kind: string; jobRole: string; mobile: string; providerName: string; active: boolean }
type OrderLite = { id: string; providerId: string; status: string }

/* ── کارت امتیاز تأمین‌کننده (Supplier Scorecard — round-18-C) ──
 * اصل SRM: «آنچه مشکل را پیش‌بینی می‌کند بسنج» — فعلاً سلامت موجودی (fill-rate proxy)
 * از /api/products (stock مقابل reorderLevel) + سفارش‌های در جریان از /api/orders
 * (سفارش‌ها providerId دارند، پس مستقیماً به تأمین‌کننده نگاشت می‌شوند).
 * NOTE فاز ۲ — قابلیت اطمینان زمان تحویل (lead-time reliability): تاریخ دریافت واقعی
 * در history سفارش ساخت‌یافته نیست و به تأمین‌کننده نگاشت پایدار ندارد؛ وقتی تاریخ
 * دریافت به‌ازای هر آیتم/تأمین‌کننده ثبت شود، اینجا به کارت امتیاز اضافه می‌شود.
 */
const OPEN_ORDER_STATUSES = ['SUBMITTED', 'APPROVED', 'RECEIVING']
type ProviderScore = { total: number; low: number; out: number; open: number; tier: 'green' | 'yellow' | 'red' }

export default function ProvidersView({ ctx }: { ctx: AppCtx }) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [manufacturers, setManufacturers] = useState<ManufacturerLite[]>([])
  const [orders, setOrders] = useState<OrderLite[]>([])
  const [openFor, setOpenFor] = useState<Provider | null>(null)
  const [company, setCompany] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editFor, setEditFor] = useState<Provider | null>(null)
  // ── نمایندگان هر تأمین‌کننده (round-15) ──
  const [repsFor, setRepsFor] = useState('')
  const [reps, setReps] = useState<RepLite[]>([])
  const [repModalFor, setRepModalFor] = useState<Provider | null>(null)
  const [repEdit, setRepEdit] = useState<RepLite | null>(null)
  // ── دفتر اشخاص برای لینک متقابل «📇 پرونده در دفتر» (round-18-C، تنبل) ──
  const [peopleDir, setPeopleDir] = useState<Record<string, string>>({})
  const peopleDirRef = useRef(false)

  const canManage = ['GM', 'PM', 'OM'].includes(ctx.user!.role)

  const load = () => {
    api<{ providers: Provider[] }>('/api/providers').then((d) => setProviders(d.providers))
    api<{ products: Product[] }>('/api/products').then((d) => setProducts(d.products))
    api<{ manufacturers: ManufacturerLite[] }>('/api/manufacturers').then((d) => setManufacturers(d.manufacturers || [])).catch(() => { /* بدون تولیدکننده هم کار می‌کند */ })
    api<{ orders: OrderLite[] }>('/api/orders').then((d) => setOrders(d.orders || [])).catch(() => { /* کارت امتیاز بدون سفارش هم کار می‌کند */ })
  }
  useEffect(() => { load() }, [])

  const loadReps = (providerId: string) => {
    api<{ reps: RepLite[] }>(`/api/sales-reps?providerId=${providerId}&all=1`)
      .then((d) => setReps(d.reps || []))
      .catch((e) => toast.error(e.message))
  }

  const toggleReps = (p: Provider) => {
    if (repsFor === p.id) return setRepsFor('')
    setRepsFor(p.id)
    ensurePeopleDir() // لینک متقابل «پرونده در دفتر» — با نخستین بازشدن پنل لود می‌شود
    loadReps(p.id)
  }

  /** دفتر اشخاص به‌صورت تنبل برای تطبیق نام (round-18-C) — فقط یک‌بار واکشی می‌شود */
  const ensurePeopleDir = () => {
    if (peopleDirRef.current) return
    peopleDirRef.current = true
    api<{ reps: { id: string; fullName: string }[] }>('/api/sales-reps?all=1')
      .then((d) => {
        const m: Record<string, string> = {}
        for (const r of d.reps || []) if (r.fullName && !m[r.fullName]) m[r.fullName] = r.id
        setPeopleDir(m)
      })
      .catch(() => { peopleDirRef.current = false }) // دفعهٔ بعد دوباره تلاش می‌شود
  }

  const mfgName = (id: string) => manufacturers.find((m) => m.id === id)?.name || ''

  // ── deep-link شبکهٔ اشخاص (round-18-C) ──
  // navigate('providers', providerId) → مودال کالاهای همان تأمین‌کننده خودکار باز می‌شود
  // (از چیپ «🚛 تأمین‌کننده» در دفتر اشخاص و نتایج PeopleNetBar). اگر فهرست هنوز نرسیده
  // باشد، مصرف پارامتر تا بعد از لود عقب می‌افتد؛ تأمین‌کنندهٔ ناموجود بی‌سروصدا رد می‌شود.
  const [lastParam, setLastParam] = useState('')
  if (ctx.param && ctx.param !== lastParam && providers.length > 0) {
    const target = providers.find((x) => x.id === ctx.param)
    setLastParam(ctx.param)
    if (target) { setOpenFor(target); setCompany('') }
  }

  // ── کارت امتیاز تأمین‌کننده — محاسبهٔ کامل سمت کلاینت از دادهٔ موجود (round-18-C) ──
  const scoreMap = useMemo(() => {
    const m = new Map<string, ProviderScore>()
    for (const p of providers) {
      const mine = products.filter((pr) => pr.providerId === p.id)
      const out = mine.filter((pr) => pr.stock === 0).length
      const low = mine.filter((pr) => pr.stock > 0 && pr.stock < pr.reorderLevel).length
      const open = orders.filter((o) => o.providerId === p.id && OPEN_ORDER_STATUSES.includes(o.status)).length
      const tier: ProviderScore['tier'] = out > 0 || low >= 4 ? 'red' : low > 0 ? 'yellow' : 'green'
      m.set(p.id, { total: mine.length, low, out, open, tier })
    }
    return m
  }, [providers, products, orders])

  return (
    <div className="space-y-4">
      {/* نوار مشترک شبکهٔ اشخاص — دفتر اشخاص + تأمین‌کنندگان + CRM (round-18-C) */}
      <PeopleNetBar active="providers" ctx={ctx} />
      <SectionCard
        title="تأمین‌کنندگان، پخش‌ها و ویزیتورها"
        subtitle="با انتخاب هر تأمین‌کننده، شرکت‌هایی که کار می‌کند و کالاهایش را می‌بینید — تولیدکنندهٔ مادر و نمایندگانش هم اینجاست"
        icon={<Truck size={18} />}
        actions={canManage && (
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white">
            <Plus size={14} /> تأمین‌کننده جدید
          </button>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <div key={p.id} className="glow-card rounded-2xl bg-white/80 p-4">
              <div className="flex items-start justify-between">
                <button onClick={() => { setOpenFor(p); setCompany('') }} className="text-right">
                  <p className="text-sm font-black">{p.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{p.personName} • {faNum(p.phone)}</p>
                </button>
                <Pill label={p.type === 'DIRECT' ? 'کارخانه' : p.type === 'VISITOR' ? 'ویزیتور' : 'پخش'} color={p.type === 'DIRECT' ? '#0e7a4a' : p.type === 'VISITOR' ? '#c96f4a' : '#8a6d10'} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.companyNames.map((c) => (
                  <button key={c} onClick={() => { setOpenFor(p); setCompany(c) }} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground transition hover:bg-[#dcead4]">
                    {c}
                  </button>
                ))}
              </div>
              {p.manufacturerId && (
                <p className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-[#8a5a2b]">
                  <Factory size={11} /> تولیدکنندهٔ مادر: {mfgName(p.manufacturerId) || '—'}
                </p>
              )}
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{faNum(p.productCount)} قلم کالا</span>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => setEditFor(p)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><Pencil size={13} /></button>
                    <button onClick={async () => { await api(`/api/providers/${p.id}`, { method: 'DELETE' }); toast.success('حذف شد'); load() }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-[#fee2e2] hover:text-[#b3372f]"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              {/* ── کارت امتیاز تأمین — سلامت موجودی + سفارش در جریان (round-18-C) ──
                  سبز: بدون هشدار • زرد: ۱ تا ۳ کالای زیر نقطهٔ سفارش • قرمز: کالای تمام‌شده یا ۴+ زیر نقطه */}
              {(() => {
                const s = scoreMap.get(p.id)
                if (!s || (s.total === 0 && s.open === 0)) return null // بدون کالا و سفارش، سیگنالی نیست
                const tone = s.tier === 'green' ? { c: '#0e7a4a', l: 'سبز' } : s.tier === 'yellow' ? { c: '#b8860b', l: 'زرد' } : { c: '#b3372f', l: 'قرمز' }
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-muted/40 px-2.5 py-2 text-[10px] font-bold">
                    <span
                      className="flex items-center gap-1 font-black"
                      style={{ color: tone.c }}
                      title="سبز: بدون هشدار • زرد: ۱ تا ۳ کالای زیر نقطهٔ سفارش • قرمز: کالای تمام‌شده یا ۴+ کالای زیر نقطهٔ سفارش"
                    >
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone.c }} />
                      سلامت تأمین: {tone.l}
                    </span>
                    <span className="text-muted-foreground">📦 {faNum(s.total)} قلم</span>
                    {s.low > 0 && <span style={{ color: '#b8860b' }}>⚠️ {faNum(s.low)} زیر نقطهٔ سفارش</span>}
                    {s.out > 0 && <span style={{ color: '#b3372f' }}>⛔ {faNum(s.out)} تمام‌شده</span>}
                    {s.open > 0 && <span className="text-muted-foreground">🚚 {faNum(s.open)} سفارش در جریان</span>}
                  </div>
                )
              })()}
              {/* نمایندگان این تأمین‌کننده */}
              <button
                type="button"
                onClick={() => toggleReps(p)}
                className="mt-2 flex w-full items-center justify-between rounded-xl bg-[#f3f6ec] px-2.5 py-2 text-[11px] font-black text-[#0e7a4a]"
              >
                <span className="flex items-center gap-1.5"><UserCog size={13} /> نمایندگان این تأمین‌کننده</span>
                <ChevronDown size={13} className={cn('transition-transform', repsFor === p.id && 'rotate-180')} />
              </button>
              {repsFor === p.id && (
                <div className="mt-2 space-y-1.5 rounded-xl bg-[#fdf6dd]/70 p-2.5">
                  {reps.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">هنوز نماینده‌ای برای این تأمین‌کننده ثبت نشده است.</p>
                  )}
                  {reps.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/85 px-2.5 py-1.5">
                      <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-black">
                        {r.fullName}
                        <span className="rounded-md bg-[#0e7a4a]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#0e7a4a]">{r.jobRole || 'نماینده'}</span>
                        {!r.active && <span className="text-[9px] text-muted-foreground">(غیرفعال)</span>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {r.mobile && <a href={`tel:${r.mobile}`} dir="ltr" className="rounded-md bg-[#0e7a4a]/10 px-1.5 py-0.5 text-[9px] font-black text-[#0e7a4a]">{faNum(r.mobile)}</a>}
                        {/* 📇 لینک متقابل به پروندهٔ شخص در دفتر اشخاص (round-18-C) — تطبیق نام از دفتر (تنبل) */}
                        {peopleDir[r.fullName] && (
                          <button
                            type="button"
                            onClick={() => ctx.navigate('people', peopleDir[r.fullName])}
                            title="پروندهٔ این شخص در دفتر اشخاص"
                            className="rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b] transition hover:bg-[#c9a227]/30"
                          >
                            📇 پرونده در دفتر
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => { setRepEdit(r); setRepModalFor(p) }}
                            className="rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b]"
                          >
                            ✏️ ویرایش
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => { setRepEdit(null); setRepModalFor(p) }}
                      className="w-full rounded-lg bg-primary py-2 text-[11px] font-extrabold text-white"
                    >
                      <Plus size={12} className="ml-1 inline" /> افزودن نماینده
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {providers.length === 0 && <EmptyState emoji="🚛" title="تأمین‌کننده‌ای ثبت نشده" />}
      </SectionCard>

      {/* provider detail: companies → products */}
      {openFor && (
        <Modal title={`کالاهای ${openFor.name}${company ? ` — شرکت ${company}` : ''}`} onClose={() => setOpenFor(null)} wide>
          {openFor.companyNames.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button onClick={() => setCompany('')} className={!company ? 'rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white' : 'rounded-full border px-3 py-1 text-[11px] font-bold'}>همه شرکت‌ها</button>
              {openFor.companyNames.map((c) => (
                <button key={c} onClick={() => setCompany(c)} className={company === c ? 'rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white' : 'rounded-full border px-3 py-1 text-[11px] font-bold'}>{c}</button>
              ))}
            </div>
          )}
          <div className="scroll-gold grid max-h-[56vh] grid-cols-2 gap-2.5 overflow-y-auto sm:grid-cols-3">
            {products
              .filter((p) => p.providerId === openFor.id && (!company || p.brand === company))
              .map((p) => {
                const st = stockStatus(p.stock, p.reorderLevel)
                return (
                  <div key={p.id} className="rounded-2xl border border-border bg-white p-3">
                    <div className="mb-1.5 flex h-14 items-center justify-center rounded-xl bg-gradient-to-br from-secondary to-muted text-2xl">
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full rounded-xl object-cover" /> : CATEGORY_EMOJI[p.category] || '📦'}
                    </div>
                    <p className="line-clamp-2 min-h-8 text-[11px] font-extrabold leading-4">{p.name}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#8a6d10]">{faMoney(p.sellPrice)}</span>
                      <span className="text-[11px] font-black" style={{ color: st.color }}>{faNum(p.stock)}</span>
                    </div>
                  </div>
                )
              })}
          </div>
          {/* محصولات خویشاوند — همان برندها از تأمین‌کنندگان دیگر (مرجع واحد داده) */}
          {(() => {
            const related = products.filter(
              (p) => p.providerId !== openFor.id && p.brand && openFor.companyNames.includes(p.brand)
            )
            if (related.length === 0) return null
            return (
              <div className="mt-4 border-t border-dashed border-border pt-3">
                <p className="mb-2 text-[11px] font-black text-foreground">
                  🔗 محصولات خویشاوند — همین برندها از تأمین‌کنندگان دیگر ({faNum(related.length)} قلم)
                </p>
                <div className="scroll-gold flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {related.map((p) => (
                    <span key={p.id} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
        </Modal>
      )}

      {(addOpen || editFor) && (
        <ProviderModal
          key={editFor?.id || 'new'}
          provider={editFor}
          manufacturers={manufacturers}
          onClose={() => { setAddOpen(false); setEditFor(null) }}
          onSaved={() => { setAddOpen(false); setEditFor(null); load() }}
        />
      )}

      {/* مودال نمایندهٔ تأمین‌کننده — همان مودال دفتر اشخاص با پیش‌پرکردن */}
      {repModalFor && (
        <PersonFormModal
          key={repEdit?.id || `new-${repModalFor.id}`}
          rep={repEdit ? ({ ...repEdit, tags: [], providerHistory: [] } as any) : null}
          defaults={repEdit ? undefined : { providerId: repModalFor.id, providerName: repModalFor.name, kind: 'REP' }}
          onClose={() => { setRepModalFor(null); setRepEdit(null) }}
          onSaved={() => { setRepModalFor(null); setRepEdit(null); toast.success(repEdit ? 'نماینده ویرایش شد' : 'نماینده ثبت شد'); if (repsFor) loadReps(repsFor) }}
        />
      )}
    </div>
  )
}

function ProviderModal({ provider, manufacturers, onClose, onSaved }: { provider: Provider | null; manufacturers: ManufacturerLite[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(() =>
    provider ? { ...provider } : { name: '', personName: '', phone: '', type: 'DISTRIBUTOR', manufacturerId: '', notes: '' }
  )
  const [companyList, setCompanyList] = useState<string[]>(() => provider?.companyNames ?? [])
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return toast.error('نام الزامی است')
    const body = { ...form, companyNames: companyList, manufacturerId: form.manufacturerId || '' }
    if (provider) await api(`/api/providers/${provider.id}`, { method: 'PATCH', body })
    else await api('/api/providers', { method: 'POST', body })
    toast.success('ذخیره شد ✅')
    onSaved()
  }

  return (
    <Modal title={provider ? 'ویرایش تأمین‌کننده' : 'تأمین‌کننده جدید'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نام شرکت/پخش *"><input value={form.name} onChange={(e) => set('name', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="نام رابط"><input value={form.personName} onChange={(e) => set('personName', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="تلفن"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" dir="ltr" /></Labeled>
        <Labeled label="نوع">
          <div className="grid grid-cols-3 gap-1.5">
            {[['DISTRIBUTOR', 'پخش'], ['DIRECT', 'کارخانه'], ['VISITOR', 'ویزیتور']].map(([v, l]) => (
              <button key={v} onClick={() => set('type', v)} className={form.type === v ? 'rounded-xl bg-primary px-2 py-2.5 text-[11px] font-extrabold text-white' : 'rounded-xl border px-2 py-2.5 text-[11px] font-bold'}>{l}</button>
            ))}
          </div>
        </Labeled>
        <Labeled label="تولیدکنندهٔ مادر" hint={manufacturers.length === 0 ? 'تولیدکننده‌ای ثبت نشده — از دفتر اشخاص → تب «تولیدکنندگان» ثبت کنید' : 'کارخانهٔ اصلی که محصولات این پخش را تولید می‌کند'}>
          <select value={form.manufacturerId || ''} onChange={(e) => set('manufacturerId', e.target.value)} className="w-full rounded-xl border border-input bg-white p-3 text-sm">
            <option value="">— بدون تولیدکنندهٔ مادر —</option>
            {manufacturers.map((m) => <option key={m.id} value={m.id}>🏭 {m.name}{m.brands.length ? ` (${m.brands.join('، ')})` : ''}</option>)}
          </select>
        </Labeled>
        <Labeled label="یادداشت"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="شرکت‌هایی که توزیع می‌کند (برندها)">
          <div className="flex gap-1.5">
            <input
              placeholder="نام شرکت + Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (v && !companyList.includes(v)) setCompanyList((l) => [...l, v])
                  ;(e.target as HTMLInputElement).value = ''
                }
              }}
              className="flex-1 rounded-xl border border-input p-3 text-sm"
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {companyList.map((c) => (
              <button key={c} onClick={() => setCompanyList((l) => l.filter((x) => x !== c))} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold">
                {c} ×
              </button>
            ))}
          </div>
        </Labeled>
      </div>
      <button onClick={save} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white">ذخیره ✅</button>
    </Modal>
  )
}
