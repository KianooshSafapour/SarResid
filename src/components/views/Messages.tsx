'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { io } from 'socket.io-client'
import { api } from '@/lib/client'
import { faNum, formatJalaliDateTime } from '@/lib/jalali'
import { ROLE_LABELS } from '@/lib/constants'
import { SectionCard, Avatar, EmptyState, Labeled } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { JalaliDatePicker } from '@/components/app/jalali-widgets'
import { MessageCircle, Send, ShieldCheck, Paperclip, X, Clock, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

type Conversation = { userId: string; name: string; role: string; color: string; lastAt: string | null; lastBody: string; unread: number }
type Att = { name: string; kind: string; size: number; dataUrl: string }
type Msg = { id: string; fromId: string; toId: string; fromName: string; body: string; attachment: Att | null; scheduledFor: string; status: string; createdAt: string; readAt: string | null }

const MAX_ATTACH = 512 * 1024
const OK_KINDS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

function kbSize(bytes: number): string {
  return `${faNum(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`
}

/** پیوست داخل حباب پیام — تصویر بندانگشتی یا چیپ دانلود */
function AttachView({ att, mine, onZoom }: { att: Att; mine: boolean; onZoom: (a: Att) => void }) {
  if (!att?.dataUrl) return null
  if (att.kind.startsWith('image/')) {
    return (
      <button
        onClick={() => onZoom(att)}
        title="نمایش در اندازهٔ کامل"
        className="mt-1 block overflow-hidden rounded-xl border border-white/30 transition hover:opacity-90"
      >
        <img src={att.dataUrl} alt={att.name} className="max-h-44 max-w-[240px] object-cover" />
      </button>
    )
  }
  const isPdf = att.kind === 'application/pdf'
  return (
    <a
      href={att.dataUrl}
      download={att.name}
      className={cn(
        'mt-1 flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-black transition',
        mine ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-secondary text-foreground hover:bg-secondary/70'
      )}
    >
      <FileText size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{att.name}</span>
        <span className="block text-[9px] font-bold opacity-70">{isPdf ? 'سند PDF' : 'متن ساده'} • {kbSize(att.size)} — دانلود</span>
      </span>
      ⬇
    </a>
  )
}

export default function MessagesView({ ctx }: { ctx: AppCtx }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [att, setAtt] = useState<Att | null>(null) // پیش‌نمایش پیوست آمادهٔ ارسال
  // زمان‌بندی ارسال
  const [schedMode, setSchedMode] = useState(false)
  const [schedDate, setSchedDate] = useState('')
  const [schedHour, setSchedHour] = useState<number>(9)
  const [schedMin, setSchedMin] = useState<number>(0)
  const [scheduled, setScheduled] = useState<Msg[]>([])
  const [lightbox, setLightbox] = useState<Att | null>(null)
  const me = ctx.user!
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadConvs = useCallback(() => {
    api<{ conversations: Conversation[]; scheduled: Msg[] }>('/api/messages').then((d) => {
      setConversations(d.conversations)
      setScheduled(d.scheduled || [])
      if (!active && d.conversations.length) setActive(d.conversations[0].userId)
    }).catch(() => {})
  }, [active])

  const loadThread = useCallback((userId: string) => {
    api<{ messages: Msg[] }>(`/api/messages?with=${userId}`).then((d) => setMessages(d.messages)).catch(() => {})
  }, [])

  useEffect(() => { loadConvs() }, [loadConvs])
  useEffect(() => { if (active) loadThread(active) }, [active, loadThread])

  // fallback polling + socket refresh + motor ارسال پیام‌های زمان‌رسیده (بدون cron)
  useEffect(() => {
    const pump = () => {
      api<{ sent: number }>('/api/messages', { method: 'POST', body: { action: 'send-scheduled' } })
        .then((r) => { if (r.sent > 0) { loadConvs(); if (active) loadThread(active) } })
        .catch(() => {})
    }
    pump()
    const t = setInterval(() => {
      pump()
      loadConvs()
      if (active) loadThread(active)
    }, 12000)
    return () => clearInterval(t)
  }, [active, loadConvs, loadThread])

  // socket live push
  useEffect(() => {
    const s = ctx.socket
    if (!s) return
    const onMsg = (data: any) => {
      if (data.toId === me.id) {
        if (data.fromId === active) loadThread(active as string)
        loadConvs()
      }
    }
    s.on('hz-msg', onMsg)
    return () => { s.off('hz-msg', onMsg) }
  }, [ctx.socket, active, me.id, loadThread, loadConvs])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const pickFile = (f: File | null | undefined) => {
    if (!f) return
    if (f.size > MAX_ATTACH) return toast.error('حجم فایل بیش از سقف مجاز است — حداکثر ۵۱۲ کیلوبایت')
    if (!OK_KINDS.includes(f.type)) return toast.error('فقط تصویر، PDF یا متن ساده مجاز است')
    const r = new FileReader()
    r.onload = () => {
      const dataUrl = String(r.result || '')
      const b64 = dataUrl.split(',')[1] || ''
      setAtt({ name: f.name, kind: f.type, size: f.size, dataUrl })
      void b64
    }
    r.readAsDataURL(f)
  }

  const clearDraft = () => { setAtt(null); setText(''); setSchedMode(false); setSchedDate('') }
  if (fileRef.current) fileRef.current.value = ''

  const send = async () => {
    if (!active) return
    if (!text.trim() && !att) return
    let scheduledFor: string | undefined
    if (schedMode) {
      if (!schedDate) return toast.error('تاریخ ارسال را انتخاب کنید')
      const d = new Date(`${schedDate}T00:00:00`)
      d.setHours(schedHour, schedMin, 0, 0)
      if (d.getTime() <= Date.now()) return toast.error('زمان ارسال باید در آینده باشد')
      scheduledFor = d.toISOString()
    }
    setSending(true)
    try {
      const res = await api<{ message: Msg }>('/api/messages', {
        method: 'POST',
        body: {
          toId: active,
          body: text.trim(),
          attachment: att ? { name: att.name, kind: att.kind, size: att.size, dataBase64: (att.dataUrl.split(',')[1] || '') } : undefined,
          scheduledFor,
        },
      })
      if (res.message?.status === 'SCHEDULED') {
        toast.success('پیام زمان‌بندی شد 🕒 — سر وقت ارسال می‌شود')
        setScheduled((s) => [...s, res.message])
      } else {
        setMessages((m) => [...m, res.message])
        ctx.socket?.emit('hz-msg', { toId: active, fromId: me.id, fromName: me.name, body: text.trim() })
      }
      clearDraft()
      loadConvs()
    } catch (e: any) { toast.error(e.message) } finally { setSending(false) }
  }

  const cancelScheduled = async (id: string) => {
    try {
      await api(`/api/messages?id=${id}`, { method: 'DELETE' })
      setScheduled((s) => s.filter((m) => m.id !== id))
      toast.success('پیام زمان‌بندی‌شده لغو شد')
    } catch (e: any) { toast.error(e.message) }
  }

  const activeConv = conversations.find((c) => c.userId === active)
  const nameOf = (id: string) => conversations.find((c) => c.userId === id)?.name || 'همکار'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* conversations */}
        <SectionCard title="گفتگوها" subtitle="پیام خصوصی و امن بین همکاران — چیزی برای نمایش به دیگران نیست" icon={<MessageCircle size={18} />} className="lg:col-span-1">
          <div className="scroll-gold max-h-[52vh] space-y-1.5 overflow-y-auto pl-1">
            {conversations.length === 0 && <EmptyState emoji="💬" title="هنوز گفتگویی نیست" hint="از فهرست همکاران یک نفر را انتخاب کنید" />}
            {conversations.map((c) => (
              <button
                key={c.userId}
                onClick={() => setActive(c.userId)}
                className={cn('flex w-full items-center gap-3 rounded-2xl p-3 text-right transition', active === c.userId ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-secondary')}
              >
                <Avatar name={c.name} color={c.color} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1">
                    <b className="truncate text-xs">{c.name}</b>
                    {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b3372f] px-1.5 text-[9px] font-black text-white">{faNum(c.unread)}</span>}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{c.lastBody || ROLE_LABELS[c.role]}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/70 p-2.5 text-[10px] font-bold text-secondary-foreground">
            <ShieldCheck size={14} className="shrink-0 text-primary" />
            پیام‌ها فقط بین فرستنده و گیرنده قابل مشاهده است. پیوست مجاز: تصویر، PDF و متن تا ۵۱۲ کیلوبایت.
          </div>
        </SectionCard>

        {/* thread */}
        <SectionCard
          title={activeConv ? activeConv.name : 'انتخاب گفتگو'}
          subtitle={activeConv ? `${ROLE_LABELS[activeConv.role]} • گفتگوی خصوصی` : undefined}
          icon={<MessageCircle size={18} />}
          className="lg:col-span-2"
        >
          {!active ? (
            <EmptyState emoji="👈" title="یک همکار را از فهرست انتخاب کنید" />
          ) : (
            <div className="flex flex-col" style={{ height: '58vh' }}>
              <div className="scroll-gold flex-1 space-y-2 overflow-y-auto rounded-2xl bg-gradient-to-b from-[#f7f3e6] to-[#faf7ee] p-4">
                {messages.length === 0 && <p className="pt-8 text-center text-xs text-muted-foreground">اولین پیام را بفرستید 👋</p>}
                {messages.map((m) => {
                  const mine = m.fromId === me.id
                  const isSched = m.status === 'SCHEDULED' && mine
                  return (
                    <div key={m.id} className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
                      <div className={cn('max-w-[75%] rounded-2xl px-4 py-2.5 text-xs shadow-sm', isSched ? 'border-2 border-dashed border-[#c9a227]/60 bg-white/70' : mine ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm bg-white')}>
                        {isSched && (
                          <p className="mb-1 flex items-center gap-1 text-[9px] font-black text-[#8a6d10]">
                            <Clock size={11} /> در انتظار ارسال — {formatJalaliDateTime(m.scheduledFor)}
                          </p>
                        )}
                        {m.body && <p className="whitespace-pre-wrap leading-5">{m.body}</p>}
                        {m.attachment && <AttachView att={m.attachment} mine={mine && !isSched} onZoom={setLightbox} />}
                        <p className={cn('mt-1 text-[9px]', mine && !isSched ? 'text-white/70' : 'text-muted-foreground')}>
                          {new Date(m.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* پیش‌نمایش پیوست */}
              {att && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd] p-2 pl-2">
                  {att.kind.startsWith('image/') ? (
                    <img src={att.dataUrl} alt={att.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-lg"><FileText size={20} className="text-[#8a6d10]" /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[11px] text-[#5c4a08]">{att.name}</b>
                    <span className="text-[9px] font-bold text-[#8a6d10]">{kbSize(att.size)}</span>
                  </span>
                  <button onClick={() => setAtt(null)} title="حذف پیوست" className="flex h-11 w-11 items-center justify-center rounded-xl text-[#b3372f] transition hover:bg-[#b3372f]/10">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* زمان‌بندی ارسال */}
              {schedMode && (
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 p-3 sm:grid-cols-4">
                  <div className="col-span-2 sm:col-span-2">
                    <Labeled label="تاریخ ارسال">
                      <JalaliDatePicker value={schedDate} onChange={setSchedDate} minDate={new Date().toISOString().slice(0, 10)} quickChips={false} holidays={new Map()} />
                    </Labeled>
                  </div>
                  <Labeled label="ساعت">
                    <select value={schedHour} onChange={(e) => setSchedHour(Number(e.target.value))} className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-primary">
                      {HOURS.map((h) => <option key={h} value={h}>{faNum(String(h).padStart(2, '0'))}</option>)}
                    </select>
                  </Labeled>
                  <Labeled label="دقیقه">
                    <select value={schedMin} onChange={(e) => setSchedMin(Number(e.target.value))} className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-primary">
                      {MINUTES.map((m) => <option key={m} value={m}>{faNum(String(m).padStart(2, '0'))}</option>)}
                    </select>
                  </Labeled>
                </div>
              )}

              <div className="mt-3 flex items-end gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                  placeholder={schedMode ? 'متن پیام زمان‌بندی‌شده…' : 'پیام خود را بنویسید…'}
                  className="flex-1 rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:border-primary"
                />
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                <button
                  onClick={() => fileRef.current?.click()}
                  title="پیوست تصویر، PDF یا متن (حداکثر ۵۱۲ کیلوبایت)"
                  className={cn('flex h-12 w-12 items-center justify-center rounded-xl border transition', att ? 'border-[#c9a227] bg-[#fdf6dd] text-[#8a6d10]' : 'border-border bg-white text-muted-foreground hover:border-[#c9a227] hover:text-[#8a6d10]')}
                >
                  <Paperclip size={18} />
                </button>
                <button
                  onClick={() => setSchedMode((s) => !s)}
                  title="ارسال در زمان مشخص"
                  className={cn('flex h-12 w-12 items-center justify-center rounded-xl border transition', schedMode ? 'border-[#c9a227] bg-[#c9a227] text-white' : 'border-border bg-white text-muted-foreground hover:border-[#c9a227] hover:text-[#8a6d10]')}
                >
                  <Clock size={18} />
                </button>
                <button onClick={send} disabled={sending || (!text.trim() && !att)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-[#12905a] disabled:opacity-40">
                  <Send size={18} className="-scale-x-100" />
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* پیام‌های زمان‌بندی‌شدهٔ من */}
      <SectionCard
        title="پیام‌های زمان‌بندی‌شده"
        subtitle="پیام‌هایی که سر وقتِ انتخابی‌تان برای همکار ارسال می‌شود — فقط خودتان آن‌ها را می‌بینید"
        icon={<Clock size={18} />}
      >
        {scheduled.length === 0 ? (
          <EmptyState emoji="🕒" title="پیام زمان‌بندی‌شده‌ای ندارید" hint="در گفتگو، دکمهٔ ساعت را بزنید و زمان ارسال را انتخاب کنید" />
        ) : (
          <div className="scroll-gold max-h-[40vh] space-y-2 overflow-y-auto pl-1">
            {scheduled.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-[#c9a227]/35 bg-[#fdf6dd]/50 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#c9a227]/15 text-[#8a6d10]"><Clock size={16} /></span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-xs">به {nameOf(m.toId)} — {m.body || (m.attachment ? `📎 ${m.attachment.name}` : '')}</b>
                  <span className="text-[10px] font-bold text-[#8a6d10]">ارسال: {formatJalaliDateTime(m.scheduledFor)}</span>
                </span>
                <button
                  onClick={() => cancelScheduled(m.id)}
                  className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-[#b3372f]/40 px-3 py-2 text-[10px] font-black text-[#b3372f] transition hover:bg-[#b3372f]/10"
                >
                  <X size={13} /> لغو
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* lightbox تصویر */}
      {lightbox && (
        <Modal title={lightbox.name} onClose={() => setLightbox(null)} wide>
          <div className="flex items-center justify-center">
            <img src={lightbox.dataUrl} alt={lightbox.name} className="max-h-[70vh] max-w-full rounded-xl object-contain" />
          </div>
          <p className="mt-2 text-center text-[10px] font-bold text-muted-foreground">{lightbox.name} — {kbSize(lightbox.size)}</p>
        </Modal>
      )}
    </div>
  )
}
