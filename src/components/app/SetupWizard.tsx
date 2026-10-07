'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  جادوگر نصب سررسید (SarResid Installation Wizard) — round-16
 *  اولین اجرای سامانه برای هر کسب‌وکار؛ چهار مرحله:
 *    ۱) معرفی کسب‌وکار   ۲) ساختار سازمانی و تیم   ۳) پلن و ماژول‌ها   ۴) پایان
 *  میان‌بر مخفی هایپر زیتون: ۵ بار کلیک روی نشان سررسید → پنل کلید پیش‌تنظیم.
 *  همهٔ ارسال‌ها فقط با دکمهٔ صریح انجام می‌شود (بدون submit خودکار).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { enDigits, faMoney, faNum } from '@/lib/jalali'
import { ROLE_LABELS } from '@/lib/constants'
import { MODULE_LABELS, TIER_MODULES } from '@/lib/license'
import { Logo } from '@/components/app/Logo'
import { Check, ChevronLeft, ChevronRight, Lock, Plus, Sparkles, Trash2 } from 'lucide-react'

type Member = { name: string; role: string; pin: string; color: string }
type PresetMember = { id: string; name: string; role: string; secondaryRoles: string[]; pin: string; color: string; active: boolean }
type PresetData = {
  preset: string
  business: { name: string; brand: string; city: string; kind: string; founder: boolean }
  license: { tier: string; founder: boolean }
  members: PresetMember[]
  personnel: Array<{ firstName: string; lastName: string; jobTitle: string; active: boolean }>
  note: string
}

/* ─────────── فهرست رسمی نقش‌ها — نام‌گذاری بر پایهٔ کارکرد (function-first) ─────────── */
const ROLE_CATALOG: Array<{ role: string; title: string; aliases: string }> = [
  { role: 'OWNER', title: 'مالک / مدیرعامل', aliases: 'صاحب فروشگاه · مدیر ارشد · رئیس' },
  { role: 'GM', title: 'مدیرکل', aliases: 'مدیر فروشگاه · مدیر شعبه' },
  { role: 'OM', title: 'مدیر عملیات', aliases: 'سرپرست عملیات · معاون فروشگاه' },
  { role: 'ADMIN', title: 'مدیر سامانه', aliases: 'IT · روت سامانه · پشتیبانی فنی' },
  { role: 'ACC', title: 'حسابدار', aliases: 'حسابدار فروشگاه · کارشناس مالی' },
  { role: 'HC', title: 'سرصندوقدار', aliases: 'مسئول صندوق · سرپرست صندوقداران' },
  { role: 'SK', title: 'انباردار', aliases: 'مسئول انبار · سرپرست انبار' },
  { role: 'SALES', title: 'کارشناس فروش', aliases: 'فروشنده · ویزیتور داخلی' },
  { role: 'CASHIER', title: 'صندوقدار', aliases: 'اپراتور صندوق · تحویل‌دار فروش' },
  { role: 'MERCH', title: 'کارشناس چیدمان', aliases: 'مسئول ویترین · چیدمان قفسه' },
  { role: 'PM', title: 'مدیر خرید', aliases: 'مسئول خرید · کارشناس تأمین' },
  { role: 'RECEIVER', title: 'کارشناس دریافت کالا', aliases: 'تحویل‌گیر کالا · مسئول بارگیری' },
]
/* ─────────── ماژول‌های افزودنی — هر ماژول قابل خرید برای مدت مشخص ─────────── */
const MODULE_PRICE: Record<string, number> = {
  accounting: 3000000, cheques: 2500000, archive: 1500000, payroll: 3500000,
  planogram: 4000000, crm: 2500000, analytics: 4500000,
}
const MODULE_ICON: Record<string, string> = {
  accounting: '🧮', cheques: '🧾', archive: '🗄️', payroll: '🧑‍💼',
  planogram: '🛒', crm: '💞', analytics: '📊',
}
const DURATIONS = [1, 3, 6, 12]

/* ─────────── پلن‌ها ─────────── */
const TIERS: Array<{ key: string; title: string; price: number; badge?: string; desc: string }> = [
  { key: 'BASE', title: 'پایه', price: 3500000, desc: 'هستهٔ عملیات روزانه: سفارش، دریافت، انبار، فروش، وظایف و پرسنل' },
  { key: 'PRO', title: 'حرفه‌ای', price: 9900000, badge: '⭐ پیشنهاد ما', desc: 'پایه + حسابداری و کنترل قیمت، چک‌ها و CRM مشتریان' },
  { key: 'ENTERPRISE', title: 'سازمانی', price: 24900000, desc: 'همهٔ ماژول‌ها: حقوق و دستمزد، بایگانی، چیدمان، تحلیل داده' },
]

const COLORS = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#2e6f6a', '#8a6d10', '#6b5b3e']
const KINDS = ['سوپرمارکت', 'هایپرمارکت', 'زنجیره‌ای', 'فروشگاه']

const inputCls =
  'min-h-[44px] w-full rounded-xl border border-border bg-white px-3.5 text-sm text-foreground outline-none transition focus:border-[#0e7a4a] focus:ring-2 focus:ring-[#0e7a4a]/20'

export default function SetupWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)

  /* میان‌بر مخفی هایپر زیتون */
  const tapsRef = useRef(0)
  const [showHzKey, setShowHzKey] = useState(false)
  const [hzKeyInput, setHzKeyInput] = useState('')
  const [preset, setPreset] = useState<PresetData | null>(null)

  /* گام ۱ — کسب‌وکار */
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [kind, setKind] = useState('سوپرمارکت')
  const [phone, setPhone] = useState('')

  /* گام ۲ — تیم */
  const [members, setMembers] = useState<Member[]>([{ name: '', role: 'OWNER', pin: '1234', color: COLORS[0] }])

  /* گام ۳ — لایسنس */
  const [tier, setTier] = useState('PRO')
  const [founder, setFounder] = useState(false)
  const [moduleMonths, setModuleMonths] = useState<Record<string, number>>({})

  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const steps = ['معرفی', 'ساختار سازمانی', 'پلن و ماژول‌ها', 'پایان']

  /* ───── میان‌بر مخفی: ۵ بار کلیک روی نشان سررسید (ref counter — مقاوم به کلیک سریع) ───── */
  const tapBrand = () => {
    if (showHzKey || preset) return
    tapsRef.current += 1
    if (tapsRef.current >= 5) {
      tapsRef.current = 0
      setShowHzKey(true)
      toast.info('🔐 پنل کلید اختصاصی باز شد')
    }
  }

  const loadPreset = async () => {
    const key = hzKeyInput.trim()
    if (!key) return toast.error('کلید پیش‌تنظیم را وارد کنید')
    setBusy(true)
    try {
      const d = await api<PresetData>(`/api/setup?preset=hz&key=${encodeURIComponent(key)}`)
      setPreset(d)
      setName(d.business.name)
      setCity(d.business.city)
      setKind(d.business.kind)
      setTier('ENTERPRISE')
      setFounder(true)
      setShowHzKey(false)
      toast.success(`پیش‌تنظیم «${d.business.name}» بارگذاری شد — نام‌های تیم قابل اصلاح‌اند`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'کلید نامعتبر است')
    } finally {
      setBusy(false)
    }
  }

  /* اعمال نام‌های ویرایش‌شدهٔ تیم فعلی (میان‌بر مخفی) */
  const applyPresetNames = async (silent = false) => {
    if (!preset) return
    const renamed = preset.members.filter((m) => m.name.trim()).map((m) => ({ id: m.id, name: m.name.trim() }))
    if (!renamed.length) {
      if (!silent) toast.error('نامی برای اعمال وجود ندارد')
      return
    }
    setBusy(true)
    try {
      const r = await api<{ ok: boolean; renamed: number }>('/api/setup', { method: 'POST', body: { action: 'rename-team', members: renamed } })
      if (!silent) toast.success(`${faNum(r.renamed)} نام عضو تیم اعمال شد ✓`)
    } catch (e: unknown) {
      if (!silent) toast.error(e instanceof Error ? e.message : 'اعمال نام‌ها ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  /* ───── پایان نصب ───── */
  const complete = async () => {
    if (!name.trim()) return toast.error('نام کسب‌وکار الزامی است')
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        action: 'complete',
        name: name.trim(),
        city: city.trim(),
        kind,
        phone: phone.trim(),
        license: {
          tier: preset ? 'ENTERPRISE' : tier,
          founder: preset ? true : founder,
          moduleMonths: founder ? {} : moduleMonths,
        },
        members: preset
          ? []
          : members
              .filter((m) => m.name.trim())
              .map((m) => ({ name: m.name.trim(), role: m.role, pin: enDigits(m.pin) || '1234', color: m.color })),
      }
      await api('/api/setup', { method: 'POST', body })
      if (preset) await applyPresetNames(true)
      toast.success('نصب کامل شد — به سررسید خوش آمدید 🌿')
      onDone()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'ثبت نصب ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  /* پیش‌نمایش سندباکس دمو پیش از شروع — سرور مسیرها را مدیریت می‌کند */
  const previewSandbox = async () => {
    setBusy(true)
    try {
      await api('/api/setup', { method: 'POST', body: { action: 'sandbox-enter' } })
      toast.success('سندباکس دمو آماده شد — در حال ورود به محیط نمایشی…')
      window.location.reload()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'ورود به سندباکس ناموفق بود')
      setBusy(false)
    }
  }

  /* ───── اعتبارسنجی گام‌ها ───── */
  const canNext = useMemo(() => {
    if (step === 0) return name.trim().length >= 2
    if (step === 1) return !!preset || members.some((m) => m.name.trim())
    return true
  }, [step, name, members, preset])

  const goNext = () => {
    if (!canNext) return
    if (step === 0 && !name.trim().length) return
    setStep((s) => Math.min(3, s + 1))
  }
  const goPrev = () => setStep((s) => Math.max(0, s - 1))

  const addMember = (role = 'SALES') =>
    setMembers((ms) => [...ms, { name: '', role, pin: '1234', color: COLORS[ms.length % COLORS.length] }])

  const updMember = (i: number, patch: Partial<Member>) =>
    setMembers((ms) => ms.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const addOnsTotal = Object.entries(moduleMonths).reduce((s, [k, m]) => (m > 0 ? s + (MODULE_PRICE[k] || 0) : s), 0)
  const tierInfo = TIERS.find((t) => t.key === tier)

  return (
    <div className="pattern-girih flex min-h-screen items-center justify-center p-3 sm:p-6" dir="rtl">
      <div className="w-full max-w-3xl rounded-3xl border border-[#c9a227]/30 bg-[#fffdf6] shadow-2xl">
        {/* ═══ سربرگ — نشان سررسید (۵ بار کلیک = میان‌بر مخفی) ═══ */}
        <div className="rounded-t-3xl border-b border-[#e4dcc4] bg-[#faf7ee] px-5 pt-6 pb-4 sm:px-8">
          <div className="flex flex-col items-center gap-1 text-center">
            <button
              type="button"
              onClick={tapBrand}
              aria-label="سررسید SarResid"
              className="flex cursor-pointer select-none items-center gap-3 rounded-2xl px-3 py-1.5 outline-none transition hover:bg-[#c9a227]/10 focus-visible:ring-2 focus-visible:ring-[#c9a227]"
            >
              <Logo size={52} />
              <span className="text-start">
                <span className="block text-2xl font-black leading-7 text-[#0b2e20]">سررسید</span>
                <span className="block text-[11px] font-bold text-[#8a6d10]">SarResid — دفتر حساب دیجیتال فروشگاه شما</span>
              </span>
            </button>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              نصب و راه‌اندازی اختصاصی برای کسب‌وکار شما — همهٔ داده‌ها از صفر ساخته می‌شود و فقط در اختیار خودتان است.
            </p>
          </div>

          {/* نشانگر مراحل */}
          <div className="mt-5 flex items-center justify-center gap-1 sm:gap-2" aria-hidden>
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1 sm:gap-2">
                <div
                  className={`flex h-9 min-w-9 items-center justify-center rounded-full border text-xs font-black transition ${
                    i < step
                      ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white'
                      : i === step
                        ? 'border-[#0e7a4a] bg-white text-[#0e7a4a] ring-2 ring-[#0e7a4a]/30'
                        : 'border-[#e4dcc4] bg-[#f3eedd] text-[#a09a86]'
                  }`}
                >
                  {i < step ? <Check size={15} /> : faNum(i + 1)}
                </div>
                <span className={`hidden text-[11px] font-extrabold sm:block ${i === step ? 'text-[#0b2e20]' : 'text-muted-foreground'}`}>{s}</span>
                {i < steps.length - 1 && <div className={`h-0.5 w-5 rounded sm:w-9 ${i < step ? 'bg-[#0e7a4a]' : 'bg-[#e4dcc4]'}`} />}
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] font-black text-[#8a6d10]">
            گام {faNum(step + 1)} از {faNum(4)} — {steps[step]}
          </p>
        </div>

        {/* پنل کلید میان‌بر مخفی */}
        {showHzKey && !preset && (
          <div className="mx-5 mt-5 rounded-2xl border border-[#c9a227]/50 bg-[#fdf6dd] p-4 sm:mx-8 fade-in-up">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-black text-[#8a6d10]">
              <Lock size={13} /> میان‌بر اختصاصی استقرار
            </p>
            <p className="mb-3 text-[11px] leading-5 text-[#8a6d10]/80">
              اگر کلید استقرار اختصاصی دارید، وارد کنید تا پیش‌تنظیم کسب‌وکار و تیم فعلی بارگذاری شود.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={hzKeyInput}
                onChange={(e) => setHzKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadPreset()}
                placeholder="کلید پیش‌تنظیم"
                aria-label="کلید پیش‌تنظیم"
                className={`${inputCls} border-[#c9a227]/50 focus:border-[#c9a227] focus:ring-[#c9a227]/25`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={loadPreset}
                disabled={busy || !hzKeyInput.trim()}
                className="min-h-[44px] rounded-xl bg-[#0b2e20] px-5 text-xs font-extrabold text-[#f3ead0] transition hover:bg-[#14532d] disabled:opacity-40"
              >
                {busy ? 'در حال بررسی…' : 'بارگذاری پیش‌تنظیم'}
              </button>
            </div>
          </div>
        )}

        {preset && (
          <div className="mx-5 mt-5 flex items-center gap-2 rounded-2xl border border-[#0e7a4a]/30 bg-[#f0f7ee] px-4 py-2.5 text-[11px] font-black text-[#0e7a4a] sm:mx-8 fade-in-up">
            <Sparkles size={14} />
            پیش‌تنظیم اختصاصی «{preset.business.name}» فعال است — گام‌ها با اطلاعات فعلی پر شده‌اند
          </div>
        )}

        {/* ═══ بدنه — محتوای هر گام ═══ */}
        <div className="px-5 py-6 sm:px-8">
          {/* ─────── گام ۱: معرفی ─────── */}
          {step === 0 && (
            <div className="fade-in-up">
              <h2 className="text-base font-black text-[#0b2e20]">معرفی کسب‌وکار شما</h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                سررسید، دفتر حساب دیجیتال فروشگاه شماست: سفارش و دریافت کالا، حسابداری، چک‌ها، تیم و مشتریان — همه در یک سامانه.
                ابتدا هویت فروشگاهتان را ثبت کنید؛ این نام در منو، گزارش‌ها و اسناد رسمی نمایش داده می‌شود.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-extrabold text-[#0b2e20]">نام کسب‌وکار *</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً هایپر نمونه" className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-extrabold text-[#0b2e20]">شهر</span>
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="مثلاً کرمان" className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-extrabold text-[#0b2e20]">نوع فعالیت</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-extrabold text-[#0b2e20]">تلفن فروشگاه</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="مثلاً ۰۳۴-۳۳۳۳۳۳۳۳"
                    className={inputCls}
                    dir="ltr"
                    inputMode="tel"
                  />
                </label>
              </div>
            </div>
          )}

          {/* ─────── گام ۲: ساختار سازمانی ─────── */}
          {step === 1 && (
            <div className="fade-in-up">
              <h2 className="text-base font-black text-[#0b2e20]">ساختار سازمانی و تیم</h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                نقش‌ها بر پایهٔ «کارکرد واقعی» نام‌گذاری شده‌اند، نه لقب سازمانی؛ هر نقش عنوان رسمی و معادل‌های رایج در فروشگاه‌های
                زنجیره‌ای کشور را دارد. برای هر همکار، نقش متناسب با کارش را انتخاب کنید.
              </p>

              {/* فهرست نقش‌های رسمی — انتخاب نقش = افزودن همکار با همان نقش */}
              {!preset && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-black text-[#8a6d10]">راهنمای نقش‌های رسمی — برای افزودن سریع، روی نقش بزنید:</p>
                  <div className="scroll-gold grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pe-1 sm:grid-cols-2 lg:grid-cols-3">
                    {ROLE_CATALOG.map((r) => {
                      const count = members.filter((m) => m.role === r.role).length
                      return (
                        <button
                          key={r.role}
                          type="button"
                          onClick={() => { addMember(r.role); toast.success(`عضو جدید با نقش «${r.title}» اضافه شد`) }}
                          className="rounded-xl border border-border bg-white px-3 py-2.5 text-start transition hover:border-[#0e7a4a]/50 hover:bg-[#f0f7ee] focus-visible:ring-2 focus-visible:ring-[#0e7a4a]/40"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-black text-[#0b2e20]">
                            {r.title}
                            {count > 0 && (
                              <span className="rounded-full bg-[#0e7a4a] px-1.5 text-[10px] text-white">{faNum(count)}</span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{r.aliases}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {preset ? (
                /* تیم فعلی هایپر زیتون — نام‌ها قابل ویرایش پیش از اعمال */
                <div className="mt-4 rounded-2xl border border-[#0e7a4a]/25 bg-[#f0f7ee] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black text-[#0e7a4a]">
                      تیم فعلی {preset.business.name} — {faNum(preset.members.length)} عضو (نام‌ها قابل اصلاح‌اند)
                    </p>
                    <button
                      type="button"
                      onClick={() => applyPresetNames(false)}
                      disabled={busy}
                      className="min-h-[44px] rounded-xl bg-[#0e7a4a] px-4 text-xs font-extrabold text-white transition hover:bg-[#12905a] disabled:opacity-40"
                    >
                      اعمال نام‌ها
                    </button>
                  </div>
                  <div className="scroll-gold max-h-64 space-y-2 overflow-y-auto pe-1">
                    {preset.members.map((m) => (
                      <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color || '#0e7a4a' }} aria-hidden />
                        <input
                          value={m.name}
                          onChange={(e) =>
                            setPreset({ ...preset, members: preset.members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)) })
                          }
                          aria-label={`نام عضو با نقش ${ROLE_LABELS[m.role] || m.role}`}
                          className="min-h-[36px] min-w-40 flex-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm font-bold outline-none focus:border-[#0e7a4a] focus:ring-2 focus:ring-[#0e7a4a]/20"
                        />
                        <span className="rounded-lg bg-[#fdf6dd] px-2 py-1 text-[10px] font-black text-[#8a6d10]">{ROLE_LABELS[m.role] || m.role}</span>
                        {m.secondaryRoles.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">+ {m.secondaryRoles.map((r) => ROLE_LABELS[r] || r).join('، ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[10px] leading-5 text-muted-foreground">{preset.note}</p>
                </div>
              ) : (
                <>
                  <div className="mt-4 space-y-2.5">
                    {members.map((m, i) => (
                      <div key={i} className="rounded-2xl border border-border bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={m.name}
                            onChange={(e) => updMember(i, { name: e.target.value })}
                            placeholder="نام و نام خانوادگی"
                            aria-label={`نام عضو ${faNum(i + 1)}`}
                            className={`${inputCls} min-w-40 flex-[2]`}
                          />
                          <select
                            value={m.role}
                            onChange={(e) => updMember(i, { role: e.target.value })}
                            aria-label={`نقش عضو ${faNum(i + 1)}`}
                            className={`${inputCls} flex-1 text-xs font-bold`}
                          >
                            {ROLE_CATALOG.map((r) => (
                              <option key={r.role} value={r.role}>{r.title}</option>
                            ))}
                          </select>
                          {members.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setMembers(members.filter((_, j) => j !== i))}
                              aria-label={`حذف عضو ${faNum(i + 1)}`}
                              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#b3372f]/30 text-[#b3372f] transition hover:bg-[#b3372f]/10 focus-visible:ring-2 focus-visible:ring-[#b3372f]/40"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <label className="flex items-center gap-2 text-[11px] font-extrabold text-muted-foreground">
                            پین ورود
                            <input
                              value={m.pin}
                              onChange={(e) => updMember(i, { pin: enDigits(e.target.value).replace(/\D/g, '').slice(0, 6) })}
                              placeholder="۱۲۳۴"
                              aria-label={`پین عضو ${faNum(i + 1)}`}
                              dir="ltr"
                              inputMode="numeric"
                              className="h-11 w-20 rounded-xl border border-border bg-[#faf7ee] px-2 text-center text-sm font-black tracking-widest outline-none focus:border-[#0e7a4a] focus:ring-2 focus:ring-[#0e7a4a]/20"
                            />
                          </label>
                          <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`رنگ عضو ${faNum(i + 1)}`}>
                            {COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                role="radio"
                                aria-checked={m.color === c}
                                aria-label={`رنگ ${c}`}
                                onClick={() => updMember(i, { color: c })}
                                className={`flex h-8 w-8 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:ring-[#0e7a4a] ${
                                  m.color === c ? 'ring-2 ring-[#0b2e20] ring-offset-1' : ''
                                }`}
                              >
                                <span className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: c }} />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addMember('SALES')}
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#0e7a4a]/40 text-xs font-extrabold text-[#0e7a4a] transition hover:bg-[#f0f7ee] focus-visible:ring-2 focus-visible:ring-[#0e7a4a]/40"
                  >
                    <Plus size={15} /> افزودن عضو تیم
                  </button>
                </>
              )}
            </div>
          )}

          {/* ─────── گام ۳: پلن و ماژول‌ها ─────── */}
          {step === 2 && (
            <div className="fade-in-up">
              <h2 className="text-base font-black text-[#0b2e20]">پلن و ماژول‌ها</h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                پلن پایه شامل هستهٔ عملیات روزانه است؛ هر ماژول تخصصی را می‌توانید جداگانه و برای مدت دلخواه خریداری کنید.
                بعداً از بخش «لایسنس و ماژول‌ها» هم قابل ارتقا و تمدید است.
              </p>

              {/* کارت‌های پلن */}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {TIERS.map((t) => {
                  const active = tier === t.key && !founder
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => { setTier(t.key); setFounder(false) }}
                      aria-pressed={active}
                      className={`relative rounded-2xl border-2 p-4 text-start transition focus-visible:ring-2 focus-visible:ring-[#0e7a4a]/40 ${
                        active ? 'border-[#0e7a4a] bg-[#f0f7ee] shadow-md' : 'border-border bg-white hover:border-[#0e7a4a]/40'
                      }`}
                    >
                      {t.badge && (
                        <span className="absolute -top-2.5 start-3 rounded-full bg-[#c9a227] px-2 py-0.5 text-[10px] font-black text-white shadow">
                          {t.badge}
                        </span>
                      )}
                      <p className="text-sm font-black text-[#0b2e20]">پلن {t.title}</p>
                      <p className="mt-1.5 text-lg font-black text-[#8a6d10]">
                        {faMoney(t.price)} <span className="text-[10px] font-bold">تومان/ماه</span>
                      </p>
                      <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{t.desc}</p>
                      {active && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#0e7a4a] px-2 py-0.5 text-[10px] font-black text-white">
                          <Check size={11} /> انتخاب شد
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* استقرار بنیان‌گذار */}
              <button
                type="button"
                onClick={() => setFounder(true)}
                aria-pressed={founder}
                disabled={!!preset}
                className={`mt-3 flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-start transition focus-visible:ring-2 focus-visible:ring-[#c9a227]/50 disabled:cursor-default ${
                  founder ? 'border-[#c9a227] bg-[#fdf6dd]' : 'border-border bg-white hover:border-[#c9a227]/50'
                }`}
              >
                <span className="mt-0.5 text-xl">🗝️</span>
                <span>
                  <span className="block text-sm font-black text-[#8a6d10]">استقرار بنیان‌گذار — بدون محدودیت ماژول</span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">
                    فقط برای استقرار اختصاصی سازندهٔ سامانه؛ همهٔ ماژول‌ها همیشه فعال‌اند.
                    {preset && ' (با کلید اختصاصی فعال شده است)'}
                  </span>
                </span>
              </button>

              {/* ماژول‌های افزودنی */}
              {!founder && (
                <div className="mt-4 rounded-2xl border border-border bg-white p-4">
                  <p className="text-xs font-black text-[#0b2e20]">ماژول‌های افزودنی — هر ماژول جداگانه و برای مدت دلخواه</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    ماژول‌های داخل پلن شما به‌صورت خودکار فعال‌اند؛ بقیه را می‌توانید همین‌جا برای مدت مشخص فعال کنید.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {Object.keys(MODULE_LABELS).map((k) => {
                      const inTier = TIER_MODULES[tier as keyof typeof TIER_MODULES]?.includes(k) || false
                      const checked = !!moduleMonths[k]
                      const price = MODULE_PRICE[k] || 0
                      return (
                        <div
                          key={k}
                          className={`flex items-start gap-2.5 rounded-xl border p-3 transition ${
                            inTier ? 'border-[#0e7a4a]/25 bg-[#f0f7ee]/60' : checked ? 'border-[#c9a227]/50 bg-[#fdf6dd]/50' : 'border-border bg-[#faf7ee]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={inTier || checked}
                            disabled={inTier}
                            onChange={(e) => setModuleMonths((mm) => ({ ...mm, [k]: e.target.checked ? 12 : 0 }))}
                            aria-label={`فعال‌سازی ماژول ${MODULE_LABELS[k]}`}
                            className="mt-1 h-4 w-4 shrink-0 accent-[#0e7a4a]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-1.5 text-xs font-black text-[#0b2e20]">
                              <span>{MODULE_ICON[k]}</span>
                              {MODULE_LABELS[k]}
                              {inTier && <span className="rounded-full bg-[#0e7a4a] px-1.5 text-[9px] font-black text-white">جزو پلن ✓</span>}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{faMoney(price)} تومان/ماه</p>
                            {!inTier && checked && (
                              <label className="mt-1.5 flex items-center gap-1.5 text-[10px] font-extrabold text-[#8a6d10]">
                                مدت اشتراک:
                                <select
                                  value={moduleMonths[k] || 12}
                                  onChange={(e) => setModuleMonths((mm) => ({ ...mm, [k]: Number(e.target.value) }))}
                                  aria-label={`مدت اشتراک ماژول ${MODULE_LABELS[k]}`}
                                  className="min-h-[36px] rounded-lg border border-[#c9a227]/40 bg-white px-1.5 text-[11px] font-black outline-none focus:border-[#c9a227]"
                                >
                                  {DURATIONS.map((d) => (
                                    <option key={d} value={d}>{faNum(d)} ماه</option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {addOnsTotal > 0 && (
                    <p className="mt-3 rounded-xl bg-[#fdf6dd] px-3 py-2 text-[11px] font-black text-[#8a6d10]">
                      جمع ماژول‌های افزودنی: {faMoney(addOnsTotal)} تومان/ماه (علاوه بر پلن {tierInfo?.title})
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─────── گام ۴: پایان ─────── */}
          {step === 3 && (
            <div className="fade-in-up">
              <h2 className="text-base font-black text-[#0b2e20]">مرور نهایی و شروع به کار</h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-[#0e7a4a]/25">
                {[
                  ['🏪 کسب‌وکار', name || '—'],
                  ['📍 شهر و نوع فعالیت', [city, kind].filter(Boolean).join(' — ') || '—'],
                  ['☎️ تلفن', phone || '—'],
                  [
                    '👥 تیم',
                    preset
                      ? `${faNum(preset.members.length)} عضو فعلی (نام‌ها پس از تأیید اعمال می‌شود)`
                      : `${faNum(members.filter((m) => m.name.trim()).length)} عضو تعریف‌شده`,
                  ],
                  [
                    '💎 پلن',
                    founder
                      ? 'استقرار بنیان‌گذار — بدون محدودیت ماژول 🗝️'
                      : `پلن ${tierInfo?.title} — ${faMoney(tierInfo?.price || 0)} تومان/ماه`,
                  ],
                  [
                    '🧩 ماژول‌های فعال',
                    founder
                      ? 'همهٔ ماژول‌ها (بنیان‌گذار)'
                      : TIER_MODULES[tier as keyof typeof TIER_MODULES]?.length
                        ? `${TIER_MODULES[tier as keyof typeof TIER_MODULES].map((m) => MODULE_LABELS[m]).join('، ')}${
                            Object.entries(moduleMonths).filter(([, m]) => m > 0).length
                              ? ' + ' + Object.entries(moduleMonths).filter(([, m]) => m > 0).map(([k, m]) => `${MODULE_LABELS[k]} (${faNum(m)} ماه)`).join('، ')
                              : ''
                          }`
                        : 'هستهٔ پایه',
                  ],
                ].map(([k, v], i) => (
                  <div key={k} className={`flex flex-wrap items-center gap-2 px-4 py-3 ${i % 2 ? 'bg-[#faf7ee]' : 'bg-white'}`}>
                    <span className="min-w-36 text-[11px] font-black text-muted-foreground">{k}</span>
                    <span className="flex-1 text-xs font-bold text-[#0b2e20]">{v}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 p-4">
                <p className="text-[11px] leading-6 text-[#8a6d10]">
                  🌿 پس از ثبت نصب، سامانه آمادهٔ ورود داده و کار روزمره است. اگر می‌خواهید پیش از شروع، یک محیط نمایشی کاملاً
                  جداشده با دادهٔ دمو («هایپر نمونه») را ببینید، از دکمهٔ سندباکس استفاده کنید — دادهٔ واقعی شما هرگز دست نمی‌خورد.
                </p>
                <button
                  type="button"
                  onClick={previewSandbox}
                  disabled={busy || saving}
                  className="mt-3 min-h-[44px] w-full rounded-xl border-2 border-[#c9a227]/60 bg-white px-4 text-xs font-extrabold text-[#8a6d10] transition hover:bg-[#fdf6dd] focus-visible:ring-2 focus-visible:ring-[#c9a227]/50 disabled:opacity-40"
                >
                  {busy ? 'در حال آماده‌سازی…' : 'قبل از شروع، سندباکس دمو را ببینید 🧪'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══ نوار ناوبری ═══ */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-3xl border-t border-[#e4dcc4] bg-[#faf7ee] px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 0 || saving}
            className="flex min-h-[44px] items-center gap-1 rounded-xl border border-border bg-white px-4 text-xs font-extrabold text-muted-foreground transition hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight size={15} /> قبلی
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext || saving}
              className="flex min-h-[44px] items-center gap-1 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-7 text-xs font-extrabold text-white shadow-lg shadow-[#0e7a4a]/25 transition hover:opacity-95 disabled:opacity-40"
            >
              بعدی <ChevronLeft size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={complete}
              disabled={saving || busy}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-7 text-sm font-extrabold text-white shadow-lg shadow-[#0e7a4a]/25 transition hover:opacity-95 disabled:opacity-50"
            >
              {saving ? 'در حال ثبت نصب…' : 'شروع به کار با سررسید'} <Check size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
