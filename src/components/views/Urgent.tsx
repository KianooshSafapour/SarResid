'use client'
/** پرسش‌های فوری — همکار سریع می‌پرسد، مدیران بدون قطع‌شدن کارشان در مرکز اعلان‌ها می‌بینند و پاسخ برمی‌گردد.
 *  غیرقطع‌کننده (Camunda non-interrupting): severity critical اما بدون مزاحمت — نردبان toast ندارد. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, formatJalaliDateTime } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, Avatar } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Zap, Send, RefreshCw, Trash2, MessageSquareReply, CheckCircle2, Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'

type UrgentQ = {
  id: string
  question: string
  context: string
  askedById: string
  askedByName: string
  answered: boolean
  answer: string
  answeredById: string
  answeredByName: string
  answeredAt: string | null
  createdAt: string
}

type UrgentData = { canAnswer: boolean; mine: UrgentQ[]; open: UrgentQ[]; recent: UrgentQ[] }

export default function UrgentView({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<UrgentData>({ canAnswer: false, mine: [], open: [], recent: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [question, setQuestion] = useState('')
  const [context, setContext] = useState('')
  const [sending, setSending] = useState(false)
  const [answeringId, setAnsweringId] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [tab, setTab] = useState<'queue' | 'recent'>('queue')
  const seenIds = useRef<Set<string>>(new Set())

  const load = useCallback((silent = false) => {
    if (!silent) setRefreshing(true)
    return api<UrgentData>('/api/urgent?scope=all')
      .then((d) => {
        setData(d)
        // اعلان آرام فقط برای پاسخ‌های تازه به پرسش‌های من (بدون اسپم)
        for (const q of d.mine) {
          if (q.answered && !seenIds.current.has(q.id) && seenIds.current.size > 0) {
            toast.success('پاسخ پرسش فوری شما رسید 💬', { description: `${q.answeredByName}: ${q.answer.slice(0, 60)}` })
          }
          seenIds.current.add(q.id)
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(true), 0)
    const iv = setInterval(() => load(true), 60000)
    return () => {
      clearTimeout(t)
      clearInterval(iv)
    }
  }, [load])

  const submitQuestion = async () => {
    if (question.trim().length < 3) {
      toast.error('متن پرسش را بنویسید')
      return
    }
    setSending(true)
    try {
      await api('/api/urgent', { method: 'POST', body: { question, context } })
      setQuestion('')
      setContext('')
      toast.success('پرسشتان رسید — مدیران مطلع شدند 🌿', { description: 'پاسخ در همین بخش و مرکز اعلان‌ها نمایش داده می‌شود' })
      ctx.refreshNotifications()
      await load(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  const submitAnswer = async (id: string) => {
    if (answerText.trim().length < 2) {
      toast.error('متن پاسخ را بنویسید')
      return
    }
    setAnsweringId(id)
    try {
      await api('/api/urgent', { method: 'PATCH', body: { id, answer: answerText } })
      setAnswerText('')
      toast.success('پاسخ ثبت شد و به پرسشگر رسید ✅')
      ctx.refreshNotifications()
      await load(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAnsweringId('')
    }
  }

  const removeQuestion = async (id: string) => {
    try {
      await api(`/api/urgent?id=${id}`, { method: 'DELETE' })
      toast.success('پرسش حذف شد')
      await load(true)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const QCard = ({ q, queue }: { q: UrgentQ; queue?: boolean }) => (
    <div className={cn('glow-card rounded-2xl bg-white/80 p-4', q.answered ? 'border border-[#c9a227]/40' : 'border border-border')}>
      <div className="flex items-start gap-3">
        <Avatar name={q.askedByName} color="#77934a" size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black">{q.askedByName}</span>
            {q.context && <Pill label={`📦 ${q.context}`} color="#8a6d10" bg="#fdf6dd" />}
            {queue && !q.answered && <Pill label="در انتظار پاسخ" color="#b3372f" bg="#fee2e2" />}
            {!queue && (q.answered ? <Pill label="پاسخ داده شد ✅" color="#8a6d10" bg="#fdf6dd" /> : <Pill label="در انتظار پاسخ" color="#a16207" bg="#fef9c3" />)}
          </div>
          <p className="mt-1.5 text-sm leading-6 text-foreground">{q.question}</p>
          <p className="mt-1 text-[10px] font-bold text-muted-foreground">
            <Clock3 size={10} className="ml-1 inline" />
            {formatJalaliDateTime(q.createdAt)}
          </p>

          {/* پاسخ — برجسته طلایی */}
          {q.answered && (
            <div className="mt-3 rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd]/70 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-black text-[#8a6d10]">
                <CheckCircle2 size={13} /> پاسخ {q.answeredByName} — {q.answeredAt ? formatJalaliDateTime(q.answeredAt) : ''}
              </p>
              <p className="mt-1 text-sm font-bold leading-6 text-[#6b5410]">{q.answer}</p>
            </div>
          )}

          {/* فرم پاسخ خطی — فقط مدیران، فقط باز */}
          {queue && !q.answered && (
            <div className="mt-3 border-t border-dashed border-border pt-3">
              {answeringId === q.id ? (
                <div className="space-y-2">
                  <textarea
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    rows={2}
                    placeholder="پاسخ کوتاه و کاربردی بنویسید…"
                    className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => submitAnswer(q.id)}
                      disabled={answeringId === q.id && answerText.trim().length < 2}
                      className="flex h-11 min-h-11 items-center gap-1.5 rounded-xl bg-[#0e7a4a] px-4 text-xs font-extrabold text-white shadow transition hover:shadow-lg disabled:opacity-50"
                    >
                      <Send size={14} /> ارسال پاسخ
                    </button>
                    <button
                      onClick={() => { setAnsweringId(''); setAnswerText('') }}
                      className="flex h-11 min-h-11 items-center rounded-xl border border-border bg-card px-4 text-xs font-extrabold transition hover:bg-secondary"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setAnsweringId(q.id); setAnswerText('') }}
                  className="flex h-11 min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-[#0e7a4a]/40 bg-[#e9f0e4]/60 px-4 text-xs font-extrabold text-[#0e7a4a] transition hover:bg-[#e9f0e4]"
                >
                  <MessageSquareReply size={14} /> پاسخ به این پرسش
                </button>
              )}
            </div>
          )}

          {/* حذف پرسش بی‌پاسخ خودم */}
          {!queue && !q.answered && q.askedById === ctx.user?.id && (
            <button
              onClick={() => removeQuestion(q.id)}
              title="حذف پرسش"
              className="mt-2 flex h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-bold text-[#b3372f] transition hover:bg-[#fee2e2]/60"
            >
              <Trash2 size={12} /> حذف
            </button>
          )}
        </div>
      </div>
    </div>
  )

  const openCount = data.open.length

  return (
    <div className="space-y-4">
      {/* توضیح + فرم پرسش */}
      <SectionCard
        title="پرسش فوری بپرسید"
        subtitle="پاسخ سریع از مدیریت، بدون جلسه و بدون مزاحمت"
        icon={<Zap size={18} className="text-[#c9a227]" />}
        actions={
          <button onClick={() => load()} disabled={refreshing} className="flex h-11 min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[11px] font-extrabold transition hover:border-[#c9a227]/60 disabled:opacity-50">
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} /> به‌روزرسانی
          </button>
        }
      >
        <div className="mb-4 rounded-xl border border-dashed border-[#c9a227]/50 bg-[#fdf6dd]/50 px-4 py-3 text-[11px] font-bold leading-6 text-[#8a6d10]">
          ⚡ پرسش فوری کاری مدیران را قطع نمی‌کند — در مرکز اعلان‌ها با اولویت دیده می‌شود و پاسخش به همین‌جا برمی‌گردد. برای جزئیات محصول، قیمت، مجوز یا هر ابهام کاری سریع استفاده کنید.
        </div>
        <div className="space-y-2.5">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="پرسشتان را کوتاه و دقیق بنویسید… (مثلاً: قیمت شیر پرچرب تأمین‌کننده الف چقدر شد؟)"
            className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              maxLength={200}
              placeholder="زمینه / کالای مربوطه (اختیاری — مثلاً: لبنیات، یخچال شماره ۲)"
              className="flex-1 rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={submitQuestion}
              disabled={sending || question.trim().length < 3}
              className="flex h-12 min-h-12 items-center justify-center gap-2 rounded-xl bg-[#c9a227] px-6 text-sm font-black text-white shadow transition hover:shadow-lg disabled:opacity-50"
            >
              <Send size={16} /> {sending ? 'در حال ارسال…' : 'ارسال پرسش فوری'}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">مدیران عملیات بلافاصله مطلع می‌شوند — اما صدایی بلند نمی‌شود؛ اعلان در مرکز اعلان‌ها با اولویت می‌نشیند.</p>
        </div>
      </SectionCard>

      {/* صف پاسخ مدیران */}
      {data.canAnswer && (
        <SectionCard
          title="صف پاسخ به پرسش‌ها"
          subtitle={`${faNum(openCount)} پرسش باز در انتظار پاسخ — قدیمی‌ها اول`}
          icon={<MessageSquareReply size={18} className="text-[#0e7a4a]" />}
          actions={
            <div className="flex gap-1.5">
              <button
                onClick={() => setTab('queue')}
                className={cn('h-11 min-h-11 rounded-xl border px-3 text-[11px] font-extrabold transition', tab === 'queue' ? 'border-transparent bg-[#0e7a4a] text-white shadow' : 'border-border bg-card hover:bg-secondary')}
              >
                باز ({faNum(openCount)})
              </button>
              <button
                onClick={() => setTab('recent')}
                className={cn('h-11 min-h-11 rounded-xl border px-3 text-[11px] font-extrabold transition', tab === 'recent' ? 'border-transparent bg-[#0e7a4a] text-white shadow' : 'border-border bg-card hover:bg-secondary')}
              >
                پاسخ‌داده‌های اخیر ({faNum(data.recent.length)})
              </button>
            </div>
          }
        >
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : tab === 'queue' ? (
            openCount === 0 ? (
              <EmptyState emoji="🫒" title="صف پاسخ خالی است — عالی!" hint="هیچ پرسش فوری بی‌پاسخی نمانده؛ به تیم اعتماد داشته باشید" />
            ) : (
              <div className="scroll-gold max-h-[520px] space-y-2.5 overflow-y-auto pl-1">
                {data.open.map((q) => <QCard key={q.id} q={q} queue />)}
              </div>
            )
          ) : data.recent.length === 0 ? (
            <EmptyState emoji="💬" title="این هفته پاسخی ثبت نشده" hint="پاسخ‌های هفتهٔ اخیر اینجا آرشیو می‌شوند" />
          ) : (
            <div className="scroll-gold max-h-[520px] space-y-2.5 overflow-y-auto pl-1">
              {data.recent.map((q) => <QCard key={q.id} q={q} queue />)}
            </div>
          )}
        </SectionCard>
      )}

      {/* پرسش‌های من */}
      <SectionCard title="پرسش‌های من" subtitle="وضعیت پاسخ پرسش‌هایی که خودتان پرسیده‌اید" icon={<Zap size={18} className="text-[#77934a]" />}>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : data.mine.length === 0 ? (
          <EmptyState emoji="🙋" title="هنوز پرسشی نپرسیده‌اید" hint="هر ابهام کاری سریع را از فرم بالا بپرسید — پاسخ همین‌جا می‌آید" />
        ) : (
          <div className="scroll-gold max-h-[520px] space-y-2.5 overflow-y-auto pl-1">
            {data.mine.map((q) => <QCard key={q.id} q={q} />)}
          </div>
        )}
      </SectionCard>

      <p className="text-center text-[10px] text-muted-foreground">هر ۶۰ ثانیه به‌روزرسانی می‌شود — پاسخ تازه با یک اعلان آرام خبر می‌دهد</p>
    </div>
  )
}
