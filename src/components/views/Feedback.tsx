'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, formatJalaliDateTime } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Lightbulb, Bird, MessageSquarePlus } from 'lucide-react'

type Feedback = {
  id: string
  userId: string | null
  authorName: string
  type: 'ANON' | 'IDEA'
  content: string
  status: string
  response: string
  points: number
  createdAt: string
}

const FB_STATUSES: Record<string, { label: string; color: string }> = {
  NEW: { label: 'جدید', color: '#6b7280' },
  REVIEWING: { label: 'در بررسی', color: '#a16207' },
  ACCEPTED: { label: 'پذیرفته شد', color: '#0e7a4a' },
  IMPLEMENTED: { label: 'اجرا شد', color: '#5c7236' },
  REJECTED: { label: 'رد شد', color: '#b3372f' },
}

const AWARD_OPTIONS = [15, 30, 50]

export default function FeedbackView({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = useState<'anon' | 'ideas'>('anon')
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IDEA' | 'ANON'>('ALL')

  const load = () => {
    api<{ feedback: Feedback[]; canManage: boolean }>('/api/feedback')
      .then((d) => { setFeedback(d.feedback); setCanManage(d.canManage) })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      {/* tabs */}
      <div className="flex rounded-2xl border border-border bg-card p-1 shadow-sm">
        <button
          onClick={() => setTab('anon')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold transition sm:flex-none sm:px-6 ${tab === 'anon' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Bird size={14} /> بازخورد ناشناس 🕊️
        </button>
        <button
          onClick={() => setTab('ideas')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold transition sm:flex-none sm:px-6 ${tab === 'ideas' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Lightbulb size={14} /> ایده‌های من و همکاران 💡
        </button>
      </div>

      {tab === 'anon' ? (
        <AnonComposer onSent={load} />
      ) : (
        <IdeasSection
          feedback={feedback}
          canManage={canManage}
          loading={loading}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          onSent={load}
          reload={load}
        />
      )}
    </div>
  )
}

/* ─────────────── Tab 1: anonymous feedback ─────────────── */

function AnonComposer({ onSent }: { onSent: () => void }) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!content.trim()) return toast.error('متن بازخورد را بنویس')
    setSending(true)
    try {
      await api('/api/feedback', { method: 'POST', body: { type: 'ANON', content: content.trim(), anonymous: true } })
      toast.success('ثبت شد — سپاس از صداقتتان 🕊️')
      setContent('')
      onSent()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <SectionCard
      title="بازخورد ناشناس"
      subtitle="حرف دل‌تان را بی‌نام بنویسید"
      icon={<Bird size={18} />}
    >
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#77934a]/30 bg-[#f0f7ee] px-4 py-3 text-[11px] font-bold leading-5 text-[#5c7236] sm:text-xs">
        <span className="text-base leading-none">🕊️</span>
        <span>نام شما ثبت نمی‌شود؛ صرفاً به بهترشدن سامانه کمک می‌کند. حتی خودِ سامانه هم بعد از ارسال، فرستنده را نشان نمی‌دهد.</span>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="چه چیزی می‌تواند بهتر شود؟ چه چیزی اذیت‌تان می‌کند؟ بنویس، بی‌دغدغه…"
        className="w-full rounded-xl border border-input bg-white/90 p-4 text-sm leading-7 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <button
        onClick={send}
        disabled={sending}
        className="mt-3 w-full rounded-xl bg-[#77934a] py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {sending ? 'در حال ارسال…' : 'ارسال ناشناس 🕊️'}
      </button>
    </SectionCard>
  )
}

/* ─────────────── Tab 2: ideas ─────────────── */

function IdeasSection({
  feedback,
  canManage,
  loading,
  typeFilter,
  setTypeFilter,
  onSent,
  reload,
}: {
  feedback: Feedback[]
  canManage: boolean
  loading: boolean
  typeFilter: 'ALL' | 'IDEA' | 'ANON'
  setTypeFilter: (t: 'ALL' | 'IDEA' | 'ANON') => void
  onSent: () => void
  reload: () => void
}) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!content.trim()) return toast.error('ایده‌ات را با چند کلمه توضیح بده')
    setSending(true)
    try {
      await api('/api/feedback', { method: 'POST', body: { type: 'IDEA', content: content.trim() } })
      toast.success('ایده‌ات ثبت شد — ممنون از خلاقیتت 💡')
      setContent('')
      onSent()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  const items = feedback.filter((f) => typeFilter === 'ALL' || f.type === typeFilter)

  return (
    <div className="space-y-4">
      {/* idea composer */}
      <SectionCard title="ثبت ایده" subtitle="ایده‌ات با نام خودت ثبت می‌شود و اگر پذیرفته شود، امتیاز می‌گیری" icon={<MessageSquarePlus size={18} />}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="مثلاً: اگر بارکد نوار بهاری به سامانه اضافه شود، سرعت صندوق بیشتر می‌شود…"
          className="w-full rounded-xl border border-input bg-white/90 p-4 text-sm leading-7 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          onClick={send}
          disabled={sending}
          className="mt-3 w-full rounded-xl bg-[#c9a227] py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {sending ? 'در حال ثبت…' : 'ثبت ایده 💡'}
        </button>
      </SectionCard>

      {/* list */}
      <SectionCard title={canManage ? 'صندوق بازخورد تیم' : 'ایده‌های من'} subtitle={canManage ? 'همه ایده‌ها و بازخوردهای ناشناس تیم — وضعیت، پاسخ و امتیاز را مدیریت کن' : 'وضعیت ایده‌هایی که ثبت کرده‌ای'} icon={<Lightbulb size={18} />}>
        {canManage && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([['ALL', 'همه'], ['IDEA', 'ایده‌ها 💡'], ['ANON', 'بازخورد ناشناس 🕊️']] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setTypeFilter(v)}
                className={typeFilter === v ? 'rounded-full bg-[#0e7a4a] px-3.5 py-1.5 text-[11px] font-bold text-white' : 'rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:border-primary/60'}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/60" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState emoji="💡" title={canManage ? 'هنوز بازخوردی در صندوق نیست' : 'هنوز ایده‌ای ثبت نکرده‌ای'} hint={canManage ? undefined : 'اولین ایده را در کادر بالا بنویس — اگر اجرا شود امتیاز می‌گیری 🏆'} />
        ) : (
          <div className="scroll-gold max-h-[62vh] space-y-3 overflow-y-auto pl-1">
            {items.map((f) => (canManage ? <ManagerCard key={f.id} f={f} reload={reload} /> : <StaffCard key={f.id} f={f} />))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* non-manager view of own ideas */
function StaffCard({ f }: { f: Feedback }) {
  const st = FB_STATUSES[f.status] || FB_STATUSES.NEW
  return (
    <div className="glow-card rounded-2xl bg-white/85 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-muted-foreground">{formatJalaliDateTime(f.createdAt)}</p>
        <div className="flex items-center gap-1.5">
          {f.points > 0 && <Pill label={`+${faNum(f.points)} امتیاز 🏆`} color="#8a6d10" bg="#fdf6dd" />}
          <Pill label={st.label} color={st.color} />
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{f.content}</p>
      {f.response && (
        <div className="mt-3 rounded-xl border border-[#77934a]/30 bg-[#f0f7ee] px-3 py-2.5 text-xs leading-6 text-[#3f6212]">
          <span className="font-black">پاسخ مدیریت: </span>
          {f.response}
        </div>
      )}
    </div>
  )
}

/* manager management card */
function ManagerCard({ f, reload }: { f: Feedback; reload: () => void }) {
  const [response, setResponse] = useState(f.response || '')
  const [busy, setBusy] = useState(false)
  const st = FB_STATUSES[f.status] || FB_STATUSES.NEW

  const patch = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true)
    try {
      await api('/api/feedback', { method: 'PATCH', body: { id: f.id, ...body } })
      toast.success(successMsg)
      reload()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glow-card rounded-2xl bg-white/85 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill label={f.type === 'IDEA' ? 'ایده 💡' : 'بازخورد ناشناس 🕊️'} color={f.type === 'IDEA' ? '#c9a227' : '#77934a'} />
          <span className="text-xs font-extrabold text-foreground/85">👤 {f.authorName || 'ناشناس'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {f.points > 0 && <Pill label={`+${faNum(f.points)} امتیاز داده شد`} color="#8a6d10" bg="#fdf6dd" />}
          <Pill label={st.label} color={st.color} />
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{f.content}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{formatJalaliDateTime(f.createdAt)}</p>

      {/* status chips */}
      <div className="mt-3 border-t border-border/60 pt-3">
        <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">تغییر وضعیت:</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(FB_STATUSES).map(([v, s]) => (
            <button
              key={v}
              disabled={busy}
              onClick={() => patch({ status: v }, `وضعیت: ${s.label}`)}
              className={f.status === v ? 'rounded-full px-3 py-1.5 text-[11px] font-extrabold text-white shadow' : 'rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:border-primary/60'}
              style={f.status === v ? { background: s.color } : undefined}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* response */}
      <div className="mt-3">
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={2}
          placeholder="پاسخ به صاحب ایده (دیده می‌شود)…"
          className="w-full rounded-xl border border-input bg-white/90 p-3 text-xs leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          disabled={busy}
          onClick={() => {
            if (!response.trim()) return toast.error('متن پاسخ را بنویس')
            patch({ response: response.trim() }, 'پاسخ ثبت شد ✅')
          }}
          className="mt-2 rounded-xl bg-secondary px-4 py-2.5 text-[11px] font-extrabold text-secondary-foreground transition hover:bg-[#dcead4] disabled:opacity-60"
        >
          ثبت پاسخ
        </button>
      </div>

      {/* award points */}
      {f.type === 'IDEA' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#fdf6dd] px-3 py-2.5">
          <span className="text-[11px] font-black text-[#8a6d10]">اعطای امتیاز:</span>
          {AWARD_OPTIONS.map((p) => (
            <button
              key={p}
              disabled={busy}
              onClick={() => patch({ points: p }, `${faNum(p)} امتیاز به صاحب ایده داده شد 🎁`)}
              className="rounded-full bg-[#c9a227] px-3.5 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              +{faNum(p)}
            </button>
          ))}
          <span className="text-[10px] text-[#8a6d10]/80">امتیاز خودکار به صاحب ایده واریز می‌شود</span>
        </div>
      )}
    </div>
  )
}
