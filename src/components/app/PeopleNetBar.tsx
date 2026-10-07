'use client'

/* ───────────────── PeopleNetBar — نوار شبکهٔ اشخاص (round-18-C) ─────────────────
 * «تأمین‌کنندگان» و «دفتر اشخاص» با هم طراحی شده‌اند (حتی اگر ماژول‌هایشان جدا فروخته
 * شوند: people→archive، crm→crm در لایسنس) — همین نوار سه گرهٔ شبکه را کنار هم نگه
 * می‌دارد تا کاربر بین دفتر اشخاص، تأمین‌کنندگان و CRM بدون گم‌شدن جابه‌جا شود.
 *
 * ۳ گرهٔ شبکه با شمارش تنبل (فقط وقتی یکی از دو نمای شبکه باز شود واکشی می‌شود):
 *   📇 دفتر اشخاص ← /api/sales-reps (دفتر واحد اشخاص شامل نمایندگان)
 *   🚛 تأمین‌کنندگان ← /api/providers
 *   🛒 CRM مشتریان ← /api/customers (بدون دسترسی CRM به‌آرامی «—» می‌شود، بدون خطا)
 *
 * جست‌وجوی یکپارچهٔ شبکه: هم‌زمان روی اشخاص/نمایندگان (نام، موبایل، سمت، شرکت)،
 * تأمین‌کنندگان (نام، نام رابط) و مشتریان — سمت کلاینت روی همان فهرست‌های واکشی‌شده،
 * حداکثر ۸ نتیجه گروه‌بندی‌شده با لینک عمیق به نمای مقصد.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { api } from '@/lib/client'
import { faNum } from '@/lib/jalali'
import type { AppCtx } from '@/components/app/ui-bits'
import { cn } from '@/lib/utils'

type NetRep = { id: string; fullName: string; mobile: string; kind: string; jobRole: string; providerName: string }
type NetProvider = { id: string; name: string; personName: string; phone: string }
type NetCustomer = { id: string; name: string; phone: string; tier: string }

/** نرمال‌سازی متن فارسی برای جست‌وجو: ارقام فارسی/عربی → لاتین، ي/ك → ی/ک، نیم‌فاصله و فاصلهٔ تکراری */
function norm(s: string): string {
  return (s || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

type Hit = { id: string; emoji: string; title: string; info: string; go: () => void }
type Group = { label: string; hits: Hit[] }

/** سقف هر گروه در نتایج — مجموع نهایی ۸ آیتم (طبق قرارداد دراپ‌داون) */
const GROUP_CAPS = [3, 3, 3, 2]
const MAX_RESULTS = 8

export function PeopleNetBar({ active, ctx }: { active: 'people' | 'providers' | 'crm'; ctx: AppCtx }) {
  const [reps, setReps] = useState<NetRep[] | null>(null) // null = در حال واکشی
  const [providers, setProviders] = useState<NetProvider[] | null>(null)
  const [customers, setCustomers] = useState<NetCustomer[] | null>(null)
  const [crmBlocked, setCrmBlocked] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  /* واکشی تنبل سه منبع شبکه — شکست هرکدام آرام است (شمارش «—»، بدون توست خطا) */
  useEffect(() => {
    let alive = true
    api<{ reps: NetRep[] }>('/api/sales-reps?all=1')
      .then((d) => { if (alive) setReps(d.reps || []) })
      .catch(() => { if (alive) setReps([]) })
    api<{ providers: NetProvider[] }>('/api/providers')
      .then((d) => { if (alive) setProviders(d.providers || []) })
      .catch(() => { if (alive) setProviders([]) })
    api<{ customers: NetCustomer[] }>('/api/customers')
      .then((d) => { if (alive) setCustomers(d.customers || []) })
      .catch(() => { if (alive) { setCustomers([]); setCrmBlocked(true) } })
    return () => { alive = false }
  }, [])

  /* بستن دراپ‌داون با کلیک بیرون از جعبهٔ جست‌وجو */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const nodes: { key: 'people' | 'providers' | 'crm'; emoji: string; label: string; count: string }[] = [
    { key: 'people', emoji: '📇', label: 'دفتر اشخاص', count: reps === null ? '…' : faNum(reps.length) },
    { key: 'providers', emoji: '🚛', label: 'تأمین‌کنندگان', count: providers === null ? '…' : faNum(providers.length) },
    {
      key: 'crm',
      emoji: '🛒',
      label: 'CRM مشتریان',
      count: customers === null ? (crmBlocked ? '—' : '…') : crmBlocked ? '—' : faNum(customers.length),
    },
  ]

  /* جست‌وجوی یکپارچه — همه‌چیز سمت کلاینت روی فهرست‌های موجود (بدون فراخوانی به‌ازای هر حرف) */
  const groups: Group[] = useMemo(() => {
    const nq = norm(q)
    if (!nq) return []
    const out: Group[] = []

    if (reps) {
      const matchRep = (r: NetRep) => norm(`${r.fullName} ${r.mobile} ${r.jobRole} ${r.providerName}`).includes(nq)
      const repHits: Hit[] = reps
        .filter((r) => r.kind === 'REP' && matchRep(r))
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          emoji: '🧑‍💼',
          title: r.fullName,
          info: [r.jobRole, r.providerName, r.mobile ? faNum(r.mobile) : ''].filter(Boolean).join(' • '),
          go: () => ctx.navigate('people', r.id),
        }))
      if (repHits.length) out.push({ label: '🧑‍💼 نمایندگان', hits: repHits })
    }

    if (providers) {
      const providerHits: Hit[] = providers
        .filter((p) => norm(`${p.name} ${p.personName}`).includes(nq))
        .slice(0, 10)
        .map((p) => ({
          id: p.id,
          emoji: '🏢',
          title: p.name,
          info: [p.personName, p.phone ? faNum(p.phone) : ''].filter(Boolean).join(' • '),
          go: () => ctx.navigate('providers', p.id),
        }))
      if (providerHits.length) out.push({ label: '🏢 تأمین‌کنندگان', hits: providerHits })
    }

    if (reps) {
      const personHits: Hit[] = reps
        .filter((r) => r.kind !== 'REP' && norm(`${r.fullName} ${r.mobile} ${r.jobRole} ${r.providerName}`).includes(nq))
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          emoji: '📇',
          title: r.fullName,
          info: [r.jobRole, r.providerName, r.mobile ? faNum(r.mobile) : ''].filter(Boolean).join(' • '),
          go: () => ctx.navigate('people', r.id),
        }))
      if (personHits.length) out.push({ label: '📇 اشخاص دیگر', hits: personHits })
    }

    if (customers && !crmBlocked) {
      const customerHits: Hit[] = customers
        .filter((c) => norm(`${c.name} ${c.phone} ${c.tier}`).includes(nq))
        .slice(0, 10)
        .map((c) => ({
          id: c.id,
          emoji: '🛒',
          title: c.name,
          info: [c.tier === 'VIP' ? 'مشتری ویژه' : '', c.phone ? faNum(c.phone) : ''].filter(Boolean).join(' • '),
          go: () => ctx.navigate('crm'), // CRM این راند پارامتر ندارد — ناوبری ساده
        }))
      if (customerHits.length) out.push({ label: '🛒 مشتریان', hits: customerHits })
    }

    return out
  }, [q, reps, providers, customers, crmBlocked, ctx])

  /* تخت‌سازی گروه‌ها با سقف مجموع ۸ نتیجه */
  const flat = useMemo(() => {
    const items: { g: number; hit: Hit }[] = []
    let used = 0
    for (let gi = 0; gi < groups.length && used < MAX_RESULTS; gi++) {
      for (const h of groups[gi].hits.slice(0, GROUP_CAPS[gi] ?? 2)) {
        if (used >= MAX_RESULTS) break
        items.push({ g: gi, hit: h })
        used++
      }
    }
    return items
  }, [groups])

  const pick = (h: Hit) => {
    setOpen(false)
    setQ('')
    h.go()
  }

  return (
    <div className="fade-in-up rounded-2xl border border-[#8a5a2b]/25 bg-[#f7efe2] p-1.5 sm:p-2">
      <div className="flex flex-col gap-1.5 lg:flex-row lg:items-stretch">
        {/* سه گرهٔ شبکهٔ اشخاص — اهداف لمسی ۴۴px */}
        <div className="grid flex-1 grid-cols-3 gap-1.5" role="tablist" aria-label="شبکهٔ اشخاص">
          {nodes.map((n) => (
            <button
              key={n.key}
              type="button"
              role="tab"
              aria-selected={active === n.key}
              onClick={() => { setOpen(false); setQ(''); ctx.navigate(n.key) }}
              className={cn(
                'flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 transition sm:flex-row sm:gap-1.5',
                active === n.key
                  ? 'bg-[#0e7a4a] text-white shadow-md'
                  : 'bg-white/70 text-[#5c4a32] hover:bg-white hover:shadow-sm',
              )}
            >
              <span className="text-base leading-none">{n.emoji}</span>
              <span className="text-[11px] font-extrabold leading-tight">{n.label}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none',
                  active === n.key ? 'bg-white/20 text-white' : 'bg-[#0e7a4a]/10 text-[#0e7a4a]',
                )}
              >
                {n.count}
              </span>
            </button>
          ))}
        </div>

        {/* جست‌وجوی یکپارچهٔ شبکه — اشخاص + نمایندگان + تأمین‌کنندگان + مشتریان */}
        <div ref={boxRef} className="relative lg:w-80">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => { if (q.trim()) setOpen(true) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setOpen(false); setQ('') }
              if (e.key === 'Enter' && flat.length > 0) pick(flat[0].hit)
            }}
            placeholder="جست‌وجو در شبکهٔ اشخاص — نام، موبایل، سمت…"
            aria-label="جست‌وجوی یکپارچه در دفتر اشخاص، تأمین‌کنندگان و مشتریان"
            className="min-h-[44px] w-full rounded-xl border border-input bg-white/90 pe-8 ps-9 text-xs font-bold shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[#8a5a2b]" />
          {q && (
            <button
              type="button"
              onClick={() => { setQ(''); setOpen(false) }}
              aria-label="پاک‌کردن جست‌وجو"
              className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-muted/70 text-muted-foreground hover:bg-muted"
            >
              <X size={12} />
            </button>
          )}

          {open && q.trim() && (
            <div className="scroll-gold absolute inset-x-0 top-[calc(100%+4px)] z-40 max-h-80 overflow-y-auto rounded-xl border border-border bg-white shadow-xl">
              {flat.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] font-bold text-muted-foreground">
                  {reps === null || providers === null ? '…در حال آماده‌سازی شبکهٔ اشخاص' : 'نتیجه‌ای در شبکهٔ اشخاص پیدا نشد'}
                </p>
              ) : (
                flat.map((it, idx) => {
                  const showHeader = idx === 0 || flat[idx - 1].g !== it.g
                  return (
                    <div key={`${it.g}-${it.hit.id}`}>
                      {showHeader && (
                        <p className="sticky top-0 z-10 bg-[#f7efe2] px-3 py-1.5 text-[10px] font-black text-[#8a5a2b]">
                          {groups[it.g].label}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => pick(it.hit)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-right transition hover:bg-[#f3f6ec]"
                      >
                        <span className="truncate text-xs font-black text-foreground">
                          {it.hit.emoji} {it.hit.title}
                        </span>
                        <span className="shrink-0 truncate text-[10px] text-muted-foreground">{it.hit.info || '—'}</span>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
