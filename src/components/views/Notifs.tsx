'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, formatJalaliDateTime } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { ROLE_LABELS } from '@/lib/constants'
import { BellRing, RefreshCw, BellOff, Settings2, Volume2, Workflow, Pencil, FlaskConical, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Notif = {
  id: string
  category: 'order' | 'cheque' | 'stock' | 'task' | 'team' | 'workflow'
  severity: 'critical' | 'warning' | 'info'
  icon: string
  title: string
  detail: string
  go: string
  count?: number
  ruleKey?: string
  outboxId?: string
  ts?: number
}

type Summary = { total: number; critical: number; warning: number; info: number }
type Prefs = { mutedCats: string[]; snoozeUntil: string }

/* ── جریان اعلان‌ها (workflow) ── */
type EscalationStep = { afterMinutes: number; to: { roles: string[]; users: string[] }; mode: 'notify' | 'reassign' }
type NotifRuleDto = {
  key: string; name: string; event: string; enabled: boolean
  severity: 'critical' | 'important' | 'info'
  icon: string
  targets: { roles: string[]; users?: string[]; fieldRef?: string }
  escalation: EscalationStep[]
  digest: { enabled: boolean; slots: string[] }
  dedupeHours: number
  note: string
  updatedByName: string
  updatedAt: string
  lastFired: string | null
  firedCount: number
  configured: boolean
}
type EventDef = { key: string; label: string; icon: string; severity: string; defaultTargets: { roles: string[]; fieldRef?: string }; description: string; fieldRefs: string[] }
type RulesData = { rules: NotifRuleDto[]; catalog: EventDef[] }
type UserDto = { id: string; name: string; role: string; hidden?: boolean }
type Draft = {
  key: string; label: string; icon: string; fieldRefs: string[]
  severity: 'critical' | 'important' | 'info'
  enabled: boolean
  roles: string[]; users: string[]; fieldRef: string
  dedupeHours: number
  digestEnabled: boolean; digestSlots: string[]
  escalation: { afterMinutes: number; roles: string[]; mode: 'notify' | 'reassign' }[]
}

const SEV: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  critical: { label: 'فوری', color: '#b3372f', bg: '#fee2e2', ring: 'border-[#b3372f]/40' },
  warning: { label: 'مهم', color: '#a16207', bg: '#fef9c3', ring: 'border-[#a16207]/40' },
  info: { label: 'اطلاع', color: '#0e7a4a', bg: '#e9f0e4', ring: 'border-border' },
}
const RULE_SEV: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'فوری — همان لحظه (سقف ۵/روز)', color: '#b3372f', bg: '#fee2e2' },
  important: { label: 'مهم — تجمیعی (۳ نوبت)', color: '#a16207', bg: '#fef9c3' },
  info: { label: 'اطلاع — روزانه', color: '#0e7a4a', bg: '#e9f0e4' },
}

const CAT: Record<string, { label: string; icon: string }> = {
  all: { label: 'همه', icon: '📮' },
  workflow: { label: 'جریان کار', icon: '⚙️' },
  order: { label: 'سفارش‌ها', icon: '🚚' },
  cheque: { label: 'چک‌ها', icon: '💰' },
  stock: { label: 'انبار', icon: '📦' },
  task: { label: 'وظایف', icon: '📋' },
  team: { label: 'تیم و فروش', icon: '👥' },
}

const CAT_ORDER: string[] = ['all', 'workflow', 'order', 'stock', 'cheque', 'task', 'team']

const ROLE_KEYS = Object.keys(ROLE_LABELS)
const FIELD_REF_FA: Record<string, string> = {
  submitter: 'درخواست‌دهندهٔ رخداد',
  approver: 'تأییدکننده',
  asker: 'پرسشگر',
  zoneOwner: 'مسئول زون',
  oversight: 'ناظر تعیین‌شده',
}
const DIGEST_SLOTS = ['09:00', '14:00', '19:00']
const DIGEST_SLOT_FA: Record<string, string> = { '09:00': 'نوبت صبح ۹:۰۰', '14:00': 'نوبت ظهر ۱۴:۰۰', '19:00': 'نوبت عصر ۱۹:۰۰' }
const ESC_MODE_FA: Record<string, string> = { notify: 'اطلاع مجدد', reassign: 'ارجاع کار' }

/** گزینه‌های سکوت موقت — فقط اعلان‌های فوری همیشه زنگ می‌خورند */
function snoozeTarget(hours: number): string {
  return new Date(Date.now() + hours * 3600000).toISOString()
}
function tomorrowMorning(): string {
  const d = new Date(Date.now() + 24 * 3600000)
  d.setHours(7, 0, 0, 0)
  return d.toISOString()
}
const SNOOZE_OPTIONS = [
  { label: '۱ ساعت', run: () => snoozeTarget(1) },
  { label: '۳ ساعت', run: () => snoozeTarget(3) },
  { label: 'تا فردا صبح ۷:۰۰', run: tomorrowMorning },
]

export default function NotifsView({ ctx }: { ctx: AppCtx }) {
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [cat, setCat] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>({ mutedCats: [], snoozeUntil: '' })
  const [silenced, setSilenced] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [prefSaving, setPrefSaving] = useState(false)

  /* ── جریان اعلان‌ها (workflow) ── */
  const [rulesData, setRulesData] = useState<RulesData | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [users, setUsers] = useState<UserDto[]>([])
  const [editKey, setEditKey] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [testing, setTesting] = useState(false)

  const load = (silent = false) => {
    if (!silent) setRefreshing(true)
    return api<{ notifications: Notif[]; summary: Summary; prefs: Prefs; silencedCount: number }>('/api/notifications')
      .then((d) => {
        setNotifs(d.notifications)
        setSummary(d.summary)
        setPrefs(d.prefs)
        setSilenced(d.silencedCount || 0)
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }

  // قواعد فقط برای ویرایشگر (cap notif.rules یا اجرایی) بارگذاری می‌شود — ۴۰۳ یعنی پنهان
  const loadRules = () =>
    api<RulesData>('/api/notif-rules')
      .then((d) => setRulesData(d))
      .catch(() => setRulesData(null))

  useEffect(() => {
    const t = setTimeout(() => load(true), 0)
    const iv = setInterval(() => load(true), 60000)
    const t2 = setTimeout(() => loadRules(), 0)
    return () => {
      clearTimeout(t)
      clearInterval(iv)
      clearTimeout(t2)
    }
  }, [])

  const savePrefs = async (patch: Partial<Prefs>, okMsg?: string) => {
    setPrefSaving(true)
    try {
      const r = await api<{ prefs: Prefs }>('/api/notif-prefs', { method: 'PUT', body: patch })
      setPrefs(r.prefs)
      if (okMsg) toast.success(okMsg)
      await load(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setPrefSaving(false)
    }
  }

  const toggleCat = (c: string) => {
    const muted = prefs.mutedCats.includes(c)
      ? prefs.mutedCats.filter((x) => x !== c)
      : [...prefs.mutedCats, c]
    savePrefs(
      { mutedCats: muted },
      muted ? `اعلان‌های «${CAT[c].label}» بی‌صدا شد 🔕` : `اعلان‌های «${CAT[c].label}» دوباره فعال شد 🔔`
    )
  }

  const openNotif = (n: Notif) => {
    if (n.outboxId) api('/api/notifications', { method: 'POST', body: { action: 'read-outbox', id: n.outboxId } }).catch(() => {})
    ctx.navigate(n.go)
  }

  const snoozedNow = !!prefs.snoozeUntil && new Date(prefs.snoozeUntil).getTime() > Date.now()

  const filtered = useMemo(() => (cat === 'all' ? notifs : notifs.filter((n) => n.category === cat)), [notifs, cat])
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const n of notifs) m[n.category] = (m[n.category] || 0) + 1
    return m
  }, [notifs])

  /* ── ویرایشگر بصری قواعد ── */
  const catalogMap = useMemo(() => Object.fromEntries((rulesData?.catalog || []).map((e) => [e.key, e])), [rulesData])
  const ruleMap = useMemo(() => Object.fromEntries((rulesData?.rules || []).map((r) => [r.key, r])), [rulesData])
  const allEvents: EventDef[] = useMemo(() => {
    // همهٔ رخدادهای کاتالوگ + هر قاعدهٔ قدیمی خارج از کاتالوگ
    const keys = new Set<string>([...(rulesData?.catalog || []).map((e) => e.key), ...(rulesData?.rules || []).map((r) => r.key)])
    return Array.from(keys).map((k) => catalogMap[k] || ({ key: k, label: ruleMap[k]?.name || k, icon: ruleMap[k]?.icon || '🔔', severity: ruleMap[k]?.severity || 'important', defaultTargets: { roles: [] }, description: '', fieldRefs: [] } as EventDef))
  }, [rulesData, catalogMap, ruleMap])

  const effectiveRule = (key: string): NotifRuleDto => {
    const r = ruleMap[key]
    if (r) return r
    const ev = catalogMap[key]
    return {
      key,
      name: ev?.label || key,
      event: key,
      enabled: true,
      severity: (ev?.severity as NotifRuleDto['severity']) || 'important',
      icon: ev?.icon || '🔔',
      targets: ev?.defaultTargets || { roles: [] },
      escalation: [],
      digest: { enabled: false, slots: [...DIGEST_SLOTS] },
      dedupeHours: 12,
      note: '',
      updatedByName: '',
      updatedAt: '',
      lastFired: null,
      firedCount: 0,
      configured: false,
    }
  }

  const openEditor = async (key: string) => {
    const r = effectiveRule(key)
    const ev = catalogMap[key]
    setDraft({
      key,
      label: ev?.label || r.name,
      icon: r.icon,
      fieldRefs: ev?.fieldRefs || [],
      severity: r.severity,
      enabled: r.enabled,
      roles: [...(r.targets.roles || [])],
      users: [...(r.targets.users || [])],
      fieldRef: r.targets.fieldRef || '',
      dedupeHours: r.dedupeHours,
      digestEnabled: r.digest.enabled,
      digestSlots: [...(r.digest.slots || [])],
      escalation: (r.escalation || []).map((s) => ({ afterMinutes: s.afterMinutes, roles: [...(s.to?.roles || [])], mode: s.mode })),
    })
    setEditKey(key)
    if (users.length === 0) {
      try {
        const d = await api<{ users: UserDto[] }>('/api/users')
        setUsers(d.users.filter((u) => !u.hidden))
      } catch {
        /* فهرست کاربران اختیاری است */
      }
    }
  }

  const saveRule = async () => {
    if (!draft) return
    setSavingRule(true)
    try {
      await api('/api/notif-rules', {
        method: 'PUT',
        body: {
          key: draft.key,
          enabled: draft.enabled,
          severity: draft.severity,
          targets: { roles: draft.roles, users: draft.users, fieldRef: draft.fieldRef },
          escalation: draft.escalation.map((s) => ({ afterMinutes: s.afterMinutes, to: { roles: s.roles, users: [] }, mode: s.mode })),
          digest: { enabled: draft.digestEnabled, slots: draft.digestSlots },
          dedupeHours: draft.dedupeHours,
        },
      })
      toast.success('قاعده ذخیره شد — تغییرات در کمتر از ۳۰ ثانیه روی همه اعمال می‌شود 🌿')
      setEditKey('')
      await loadRules()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSavingRule(false)
    }
  }

  const testRule = async (key: string) => {
    setTesting(true)
    try {
      await api('/api/notif-rules', { method: 'PATCH', body: { key, action: 'test' } })
      toast.success('اعلان تست برای شما ارسال شد — مرکز اعلان‌ها را ببینید 🧪')
      await load(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setTesting(false)
    }
  }

  const toggleDraftRole = (r: string) =>
    setDraft((d) => (d ? { ...d, roles: d.roles.includes(r) ? d.roles.filter((x) => x !== r) : [...d.roles, r] } : d))
  const toggleDraftUser = (id: string) =>
    setDraft((d) => (d ? { ...d, users: d.users.includes(id) ? d.users.filter((x) => x !== id) : [...d.users, id] } : d))
  const toggleDraftSlot = (s: string) =>
    setDraft((d) => (d ? { ...d, digestSlots: d.digestSlots.includes(s) ? d.digestSlots.filter((x) => x !== s) : [...d.digestSlots, s] } : d))
  const toggleEscRole = (i: number, r: string) =>
    setDraft((d) => {
      if (!d) return d
      const esc = d.escalation.map((s, idx) => (idx === i ? { ...s, roles: s.roles.includes(r) ? s.roles.filter((x) => x !== r) : [...s.roles, r] } : s))
      return { ...d, escalation: esc }
    })

  const editingEvent = editKey ? catalogMap[editKey] : null

  return (
    <div className="space-y-4">
      {/* summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="glow-card gold-glow-border fade-in-up rounded-2xl bg-card p-4">
          <p className="text-[11px] font-bold text-muted-foreground">کل اعلان‌های فعال</p>
          <p className="mt-1 text-2xl font-black text-foreground">{summary ? faNum(summary.total) : '…'}</p>
        </div>
        <div className="glow-card fade-in-up rounded-2xl bg-card p-4">
          <p className="text-[11px] font-bold text-muted-foreground">فوری 🚨</p>
          <p className={cn('mt-1 text-2xl font-black', summary?.critical ? 'text-[#b3372f]' : 'text-foreground')}>
            {summary ? faNum(summary.critical) : '…'}
          </p>
        </div>
        <div className="glow-card fade-in-up rounded-2xl bg-card p-4">
          <p className="text-[11px] font-bold text-muted-foreground">مهم ⚠️</p>
          <p className={cn('mt-1 text-2xl font-black', (summary?.warning || 0) > 0 ? 'text-[#a16207]' : 'text-foreground')}>
            {summary ? faNum(summary.warning) : '…'}
          </p>
        </div>
        <div className="glow-card fade-in-up rounded-2xl bg-card p-4">
          <p className="text-[11px] font-bold text-muted-foreground">اطلاع‌رسانی ℹ️</p>
          <p className="mt-1 text-2xl font-black text-foreground">{summary ? faNum(summary.info) : '…'}</p>
        </div>
      </div>

      <SectionCard
        title="مرکز اعلان‌ها"
        subtitle="هرچه باید امروز انجام شود — به‌ترتیب اهمیت و متناسب با نقش شما"
        icon={<BellRing size={18} />}
        actions={
          <div className="flex items-center gap-1.5">
            {rulesData && (
              <button
                onClick={() => setShowRules((v) => !v)}
                className={cn(
                  'flex h-11 min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-extrabold transition',
                  showRules ? 'border-[#0e7a4a] bg-[#e9f0e4] text-[#0e7a4a]' : 'border-border bg-card hover:border-[#0e7a4a]/60'
                )}
              >
                <Workflow size={13} /> جریان اعلان‌ها
              </button>
            )}
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={cn(
                'flex h-11 min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-extrabold transition',
                showSettings ? 'border-[#c9a227] bg-[#fdf6dd] text-[#8a6d10]' : 'border-border bg-card hover:border-[#c9a227]/60'
              )}
            >
              <Settings2 size={13} /> تنظیمات
            </button>
            <button onClick={() => load()} disabled={refreshing} className="flex h-11 min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[11px] font-extrabold transition hover:border-[#c9a227]/60 disabled:opacity-50">
              <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} /> به‌روزرسانی
            </button>
          </div>
        }
      >
        {/* ── جریان اعلان‌ها (workflow) — ویرایشگر بصری قواعد ── */}
        {rulesData && showRules && (
          <div className="fade-in-up mb-4 rounded-2xl border border-[#0e7a4a]/30 bg-gradient-to-bl from-[#e9f0e4]/60 to-white/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-black text-[#0e7a4a]">
                <Workflow size={14} /> جریان اعلان‌ها (workflow) — چه رخدادی به چه کسی برسد
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">تغییرات در کمتر از ۳۰ ثانیه روی همه اعمال می‌شود</p>
            </div>
            <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
              بودجهٔ خستگی: 🚨 فوری همان لحظه (حداکثر ۵ در روز) • ⚠️ مهم در نوبت‌های تجمیعی • ℹ️ اطلاع روزانه • سکوت شبانه ۲۲ تا ۷
            </p>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2">
              {allEvents.map((ev) => {
                const r = effectiveRule(ev.key)
                const sev = RULE_SEV[r.severity]
                return (
                  <div key={ev.key} className={cn('rounded-2xl bg-white/85 p-3.5', r.enabled ? 'border border-border' : 'border border-dashed border-border opacity-75')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg">{r.icon}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black">{ev.label || r.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{ev.description || r.note || r.event}</p>
                        </div>
                      </div>
                      {/* سوییچ روشن/خاموش */}
                      <button
                        role="switch"
                        aria-checked={r.enabled}
                        title={r.enabled ? 'روشن — برای خاموش‌کردن بزنید' : 'خاموش — برای روشن‌کردن بزنید'}
                        onClick={async () => {
                          try {
                            await api('/api/notif-rules', { method: 'PUT', body: { key: ev.key, enabled: !r.enabled } })
                            toast.success(!r.enabled ? 'قاعده روشن شد 🔔' : 'قاعده خاموش شد 🔕')
                            await loadRules()
                          } catch (e: any) {
                            toast.error(e.message)
                          }
                        }}
                        className={cn('relative h-6 w-11 shrink-0 rounded-full transition', r.enabled ? 'bg-[#0e7a4a]' : 'bg-border')}
                      >
                        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', r.enabled ? 'right-0.5' : 'right-5.5')} />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Pill label={sev.label} color={sev.color} bg={sev.bg} />
                      {(r.targets.roles || []).map((role) => (
                        <Pill key={role} label={ROLE_LABELS[role] || role} color="#0e7a4a" bg="#e9f0e4" />
                      ))}
                      {(r.targets.users || []).length > 0 && <Pill label={`${faNum((r.targets.users || []).length)} کاربر مشخص`} color="#8a6d10" bg="#fdf6dd" />}
                      {r.targets.fieldRef && <Pill label={`↩ ${FIELD_REF_FA[r.targets.fieldRef] || r.targets.fieldRef}`} color="#c96f4a" bg="#fdeae2" />}
                      {!r.configured && <Pill label="پیش‌فرض — هنوز ذخیره نشده" color="#6b7280" bg="#f3f4f6" />}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-border pt-2">
                      <p className="text-[10px] font-bold text-muted-foreground">
                        {r.firedCount > 0 ? `۷ روز اخیر: ${faNum(r.firedCount)} بار${r.lastFired ? ` • آخرین: ${formatJalaliDateTime(r.lastFired)}` : ''}` : 'در ۷ روز اخیر فعال نبوده'}
                      </p>
                      <button
                        onClick={() => openEditor(ev.key)}
                        className="flex h-9 min-h-9 items-center gap-1 rounded-lg border border-[#c9a227]/50 bg-[#fdf6dd]/60 px-3 text-[10px] font-extrabold text-[#8a6d10] transition hover:bg-[#fdf6dd]"
                      >
                        <Pencil size={11} /> ویرایش مقصدها
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* تنظیمات اعلان‌ها — سکوت دسته‌ها و سکوت موقت */}
        {showSettings && (
          <div className="fade-in-up mb-4 rounded-2xl border border-[#c9a227]/35 bg-gradient-to-bl from-[#fdf6dd]/70 to-white/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-black text-[#8a6d10]">
                <BellOff size={14} /> کدام دسته‌ها بی‌صدا باشند؟
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">اعلان‌های 🚨 فوری همیشه به صدا درمی‌آیند — چیزی از دست نمی‌دهید</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CAT_ORDER.filter((c) => c !== 'all').map((c) => {
                const muted = prefs.mutedCats.includes(c)
                return (
                  <button
                    key={c}
                    onClick={() => toggleCat(c)}
                    disabled={prefSaving}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-60',
                      muted
                        ? 'border-[#b3372f]/40 bg-[#fee2e2]/60 text-[#b3372f] line-through decoration-2'
                        : 'border-border bg-card text-foreground/80 hover:border-[#0e7a4a]/50 hover:bg-[#e9f0e4]/50'
                    )}
                  >
                    {muted ? '🔇' : '🔔'} {CAT[c].icon} {CAT[c].label}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-[#c9a227]/30 pt-3">
              <p className="flex items-center gap-1.5 text-[11px] font-black text-[#8a6d10]">
                <Volume2 size={13} /> سکوت موقت همه‌چیز (جز فوری‌ها):
              </p>
              {SNOOZE_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  onClick={() => savePrefs({ snoozeUntil: o.run() }, `سامانه تا ${o.label} ساکت است — فقط فوری‌ها زنگ می‌خورند 😌`)}
                  disabled={prefSaving}
                  className="rounded-xl border border-border bg-card px-3 py-1.5 text-[10px] font-extrabold transition hover:border-[#c9a227] hover:bg-[#fdf6dd] disabled:opacity-60"
                >
                  {o.label}
                </button>
              ))}
              {snoozedNow && (
                <button
                  onClick={() => savePrefs({ snoozeUntil: '' }, 'سکوت موقت لغو شد — اعلان‌ها برگشتند 🔔')}
                  disabled={prefSaving}
                  className="rounded-xl bg-[#0e7a4a] px-3 py-1.5 text-[10px] font-extrabold text-white shadow transition hover:shadow-lg disabled:opacity-60"
                >
                  بیدارکردن همین حالا
                </button>
              )}
              {snoozedNow && (
                <span className="rounded-lg bg-[#e9f0e4] px-2.5 py-1 text-[10px] font-bold text-[#0e7a4a]">
                  🔕 تا {formatJalaliDateTime(prefs.snoozeUntil)} بی‌صداست
                </span>
              )}
            </div>
          </div>
        )}

        {/* نوار سکوت فعال + شمار بی‌صداشده‌ها */}
        {(snoozedNow || silenced > 0) && !showSettings && (
          <button
            onClick={() => setShowSettings(true)}
            className="mb-3 flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-[#c9a227]/50 bg-[#fdf6dd]/40 px-3 py-2 text-[10px] font-bold text-[#8a6d10] transition hover:bg-[#fdf6dd]/80"
          >
            {snoozedNow && <span>🔕 سکوت موقت فعال تا {formatJalaliDateTime(prefs.snoozeUntil)}</span>}
            {silenced > 0 && <span>• {faNum(silenced)} اعلان بر اساس تنظیمات شما پنهان است</span>}
            <span className="text-[#c9a227]">(تنظیمات ←)</span>
          </button>
        )}

        {/* category chips */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CAT_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[11px] font-bold transition',
                cat === c ? 'border-transparent bg-[#0e7a4a] text-white shadow' : 'border-border bg-card text-foreground/70 hover:bg-secondary'
              )}
            >
              {CAT[c].icon} {CAT[c].label}
              {c !== 'all' && counts[c] ? <span className="mr-1 opacity-80">({faNum(counts[c])})</span> : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState emoji="🎉" title={cat === 'all' ? 'همه‌چیز مرتب و تحت کنترل است!' : 'در این دسته اعلانی نیست'} hint="سامانه هر دقیقه وضعیت را بررسی می‌کند — خیالتان راحت" />
        ) : (
          <div className="grid gap-2.5">
            {filtered.map((n) => {
              const sev = SEV[n.severity]
              return (
                <button
                  key={n.id}
                  onClick={() => openNotif(n)}
                  className={cn('glow-card notif-item group flex items-start gap-3 rounded-2xl bg-white/80 p-4 text-right', sev.ring)}
                >
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl', n.severity === 'critical' ? 'pulse-dot' : '')} style={{ background: sev.bg }}>
                    {n.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black">{n.title}</span>
                      <Pill label={sev.label} color={sev.color} bg={sev.bg} />
                      {CAT[n.category] && <span className="text-[10px] font-bold text-muted-foreground">{CAT[n.category].icon} {CAT[n.category].label}</span>}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{n.detail}</span>
                    {n.ruleKey && (
                      <span className="mt-1.5 inline-block rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                        ⚙️ قاعده: {catalogMap[n.ruleKey]?.label || n.ruleKey}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 shrink-0 text-[11px] font-black text-[#8a6d10] opacity-0 transition group-hover:opacity-100">
                    برو ←
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* ── مودال ویرایش بصری قاعده ── */}
      {draft && (
        <Modal title={`${draft.icon} ویرایش جریان: ${draft.label}`} onClose={() => setEditKey('')} wide>
          <p className="rounded-xl bg-[#fdf6dd]/70 px-3 py-2 text-[10px] font-bold leading-5 text-[#8a6d10]">
            تغییرات در کمتر از ۳۰ ثانیه روی همه اعمال می‌شود — مقصدها همان‌هایی هستند که اعلان برایشان می‌آید.
          </p>

          {/* severity + enabled */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-foreground/80">سطح اهمیت (بودجهٔ خستگی)</span>
              <select
                value={draft.severity}
                onChange={(e) => setDraft((d) => (d ? { ...d, severity: e.target.value as Draft['severity'] } : d))}
                className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-primary"
              >
                <option value="critical">🚨 فوری — همان لحظه (سقف ۵ در روز)</option>
                <option value="important">⚠️ مهم — تجمیعی (۳ نوبت)</option>
                <option value="info">ℹ️ اطلاع — روزانه</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-foreground/80">ضدتکرار — پنجره (ساعت)</span>
              <input
                type="number"
                min={0}
                max={720}
                value={draft.dedupeHours}
                onChange={(e) => setDraft((d) => (d ? { ...d, dedupeHours: Math.max(0, Math.min(720, Number(e.target.value) || 0)) } : d))}
                className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-primary"
              />
              <span className="mt-1 block text-[10px] text-muted-foreground">در این بازه برای همان رخداد دوباره اعلان نمی‌رود (۰ = غیرفعال)</span>
            </label>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2.5">
            <span className="text-xs font-black">قاعده فعال باشد؟</span>
            <button
              role="switch"
              aria-checked={draft.enabled}
              onClick={() => setDraft((d) => (d ? { ...d, enabled: !d.enabled } : d))}
              className={cn('relative h-6 w-11 rounded-full transition', draft.enabled ? 'bg-[#0e7a4a]' : 'bg-border')}
            >
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', draft.enabled ? 'right-0.5' : 'right-5.5')} />
            </button>
          </div>

          {/* مقصدها: نقش‌ها */}
          <div>
            <p className="mb-1.5 text-xs font-bold text-foreground/80">نقش‌های مقصد</p>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_KEYS.map((r) => {
                const on = draft.roles.includes(r)
                return (
                  <button
                    key={r}
                    onClick={() => toggleDraftRole(r)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-bold transition',
                      on ? 'border-transparent bg-[#0e7a4a] text-white shadow' : 'border-border bg-card text-foreground/70 hover:bg-secondary'
                    )}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* مقصدها: کاربران مشخص */}
          <div>
            <p className="mb-1.5 text-xs font-bold text-foreground/80">
              کاربران مشخص {draft.users.length > 0 && <span className="text-[#8a6d10]">({faNum(draft.users.length)} انتخاب)</span>}
            </p>
            <div className="scroll-gold max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border bg-white/80 p-2">
              {users.map((u) => {
                const on = draft.users.includes(u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleDraftUser(u.id)}
                    className={cn('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-right text-xs font-bold transition', on ? 'bg-[#e9f0e4] text-[#0e7a4a]' : 'hover:bg-secondary')}
                  >
                    <span>{u.name}</span>
                    <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[u.role] || u.role} {on ? '✓' : ''}</span>
                  </button>
                )
              })}
              {users.length === 0 && <p className="px-2 py-2 text-[10px] text-muted-foreground">فهرست کاربران بارگذاری نشد</p>}
            </div>
          </div>

          {/* fieldRef */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-foreground/80">کاربر مرتبط با رخداد (مقصود پویا)</span>
            <select
              value={draft.fieldRef}
              onChange={(e) => setDraft((d) => (d ? { ...d, fieldRef: e.target.value } : d))}
              className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-primary"
            >
              <option value="">— بدون مقصود پویا —</option>
              {draft.fieldRefs.map((f) => (
                <option key={f} value={f}>{FIELD_REF_FA[f] || f}</option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-muted-foreground">مثلاً «درخواست‌دهنده» یعنی خودِ کسی که رخداد را ساخته مطلع می‌شود</span>
          </label>

          {/* digest slots */}
          <div className="rounded-xl border border-border bg-white/70 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black">ارسال تجمیعی (digest)</span>
              <button
                role="switch"
                aria-checked={draft.digestEnabled}
                onClick={() => setDraft((d) => (d ? { ...d, digestEnabled: !d.digestEnabled } : d))}
                className={cn('relative h-6 w-11 rounded-full transition', draft.digestEnabled ? 'bg-[#c9a227]' : 'bg-border')}
              >
                <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', draft.digestEnabled ? 'right-0.5' : 'right-5.5')} />
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">به‌جای اعلان لحظه‌ای، در نوبت‌های زیر یک‌جا ارسال می‌شود (برای سطوح «مهم» و «اطلاع»)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DIGEST_SLOTS.map((s) => {
                const on = draft.digestSlots.includes(s)
                return (
                  <button
                    key={s}
                    onClick={() => toggleDraftSlot(s)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-bold transition',
                      on ? 'border-transparent bg-[#c9a227] text-white shadow' : 'border-border bg-card text-foreground/70 hover:bg-secondary'
                    )}
                  >
                    {DIGEST_SLOT_FA[s]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* escalation editor */}
          <div className="rounded-xl border border-border bg-white/70 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black">تشدید (escalation) — اگر کسی رسیدگی نکرد</span>
              <button
                onClick={() => setDraft((d) => (d ? { ...d, escalation: [...d.escalation, { afterMinutes: 480, roles: ['GM'], mode: 'notify' }] } : d))}
                className="flex h-9 min-h-9 items-center gap-1 rounded-lg border border-[#0e7a4a]/40 px-2.5 text-[10px] font-extrabold text-[#0e7a4a] transition hover:bg-[#e9f0e4]"
              >
                <Plus size={12} /> مرحله
              </button>
            </div>
            {draft.escalation.length === 0 && <p className="mt-1 text-[10px] text-muted-foreground">بدون تشدید — پیش‌فرض کافی است</p>}
            <div className="mt-2 space-y-2">
              {draft.escalation.map((s, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[10px] font-bold text-muted-foreground">پس از</span>
                    <input
                      type="number"
                      min={1}
                      value={s.afterMinutes}
                      onChange={(e) => setDraft((d) => d ? { ...d, escalation: d.escalation.map((x, idx) => idx === i ? { ...x, afterMinutes: Math.max(1, Number(e.target.value) || 1) } : x) } : d)}
                      className="w-20 rounded-lg border border-input bg-white px-2 py-1.5 text-center text-xs font-black outline-none focus:border-primary"
                    />
                    <span className="shrink-0 text-[10px] font-bold text-muted-foreground">دقیقه →</span>
                    <select
                      value={s.mode}
                      onChange={(e) => setDraft((d) => d ? { ...d, escalation: d.escalation.map((x, idx) => idx === i ? { ...x, mode: e.target.value as 'notify' | 'reassign' } : x) } : d)}
                      className="flex-1 rounded-lg border border-input bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-primary"
                    >
                      <option value="notify">{ESC_MODE_FA.notify}</option>
                      <option value="reassign">{ESC_MODE_FA.reassign}</option>
                    </select>
                    <button
                      onClick={() => setDraft((d) => (d ? { ...d, escalation: d.escalation.filter((_, idx) => idx !== i) } : d))}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#b3372f] transition hover:bg-[#fee2e2]/60"
                      title="حذف مرحله"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ROLE_KEYS.map((r) => {
                      const on = s.roles.includes(r)
                      return (
                        <button
                          key={r}
                          onClick={() => toggleEscRole(i, r)}
                          className={cn(
                            'rounded-full border px-2 py-1 text-[10px] font-bold transition',
                            on ? 'border-transparent bg-[#77934a] text-white' : 'border-border bg-card text-foreground/60 hover:bg-secondary'
                          )}
                        >
                          {ROLE_LABELS[r]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* actions */}
          <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-3">
            <button
              onClick={saveRule}
              disabled={savingRule}
              className="flex h-11 min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0e7a4a] px-4 text-xs font-black text-white shadow transition hover:shadow-lg disabled:opacity-50"
            >
              {savingRule ? 'در حال ذخیره…' : 'ذخیرهٔ قاعده'}
            </button>
            <button
              onClick={() => testRule(draft.key)}
              disabled={testing}
              className="flex h-11 min-h-11 items-center gap-1.5 rounded-xl border border-[#c9a227] bg-[#fdf6dd] px-4 text-xs font-black text-[#8a6d10] transition hover:bg-[#fdf6dd]/80 disabled:opacity-50"
            >
              <FlaskConical size={13} /> {testing ? 'در حال ارسال…' : 'ارسال اعلان تست'}
            </button>
          </div>
        </Modal>
      )}

      <p className="text-center text-[10px] text-muted-foreground">
        اعلان‌ها بر اساس نقش شما محاسبه می‌شوند و هر ۶۰ ثانیه به‌روزرسانی می‌شوند — نیازی به ذخیره نیست
      </p>
    </div>
  )
}
