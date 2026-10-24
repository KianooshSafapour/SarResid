import {
  useState, useEffect, useMemo, useRef, useCallback, api, useShell, toast, cn,
  Button, Input, Textarea, Card, CardContent,
  Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  faSlash, jsDateToJalali,
  fa, toFaDigits, todayJalali,
  I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   tasks/messages — «پیام‌ها» (جایگزین کامل نمای قدیمی)
   چیدمان دوستونهٔ کاملاً راست‌به‌چپ:
   ستون راست: فهرست گفتگوها / تب گروهی (اعلان‌های همگانی) + جست‌وجو
   ستون چپ : گفتگوی فعال — حباب‌ها، زمان، وضعیت خوانده‌شدن، پیوست،
              جعبهٔ ارسال (Enter = ارسال، Shift+Enter = سطر جدید)
   امکانات: گفتگوی جدید از فهرست پرسنل، ارسال گروهی (مدیران)،
            نشان خوانده‌نشده، به‌روزرسانی خودکار هر ۱۰ ثانیه
   API: GET /api/messages (+ ?with=) · POST · PUT (دیدن گروهی) · DELETE
   ───────────────────────────────────────────────────────────── */

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']
const POLL_MS = 10_000
const MAX_ATTACHMENT = 500_000 // ~۵۰۰KB (محدودیت سرور ۷۰۰KB رشته)

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** آواتار کاربر — از avatarJson {emoji,color} یا حرف اول نام */
function Avatar({ u, size = 36 }: { u: { fullName?: string; honorific?: string; avatarJson?: string | null }; size?: number }) {
  const parsed = useMemo(() => {
    try {
      const j = u.avatarJson ? JSON.parse(u.avatarJson) : null
      if (j && (j.emoji || j.color)) return { emoji: j.emoji as string | undefined, color: j.color as string | undefined }
    } catch { /* ignore */ }
    return null
  }, [u.avatarJson])
  const name = `${u.honorific || ''} ${u.fullName || ''}`.trim()
  if (parsed?.emoji) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full border"
        style={{ width: size, height: size, backgroundColor: parsed.color ? `${parsed.color}1a` : '#f5f5f4', borderColor: `${parsed.color || '#d6d3d1'}55`, fontSize: size * 0.5 }}
      >
        {parsed.emoji}
      </span>
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-emerald-50 font-bold text-emerald-700"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {name.slice(-1) || '؟'}
    </span>
  )
}

/** زمان فشرده: امروز → ساعت؛ غیر از آن → ۱۴۰۵/۰۷/۲۸ */
function shortTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = jsDateToJalali(d) === todayJalali()
  return sameDay
    ? toFaDigits(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)
    : faSlash(jsDateToJalali(d))
}

function clockFa(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return toFaDigits(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)
}

function dateFa(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return faSlash(jsDateToJalali(d))
}

/* ── حباب پیام ──────────────────────────────────────────── */

function Bubble({ m, mine, onDelete }: { m: any; mine: boolean; onDelete?: (m: any) => void }) {
  const isImage = !!m.attachment && String(m.attachment).startsWith('data:image/')
  /* در چیدمان راست‌به‌چپ: پیام‌های من سمت چپ (مثل تلگرام/واتساپ فارسی) و پیام‌های طرف مقابل سمت راست.
     align با style صریح — کلاس self-end در CSS فروزن وجود ندارد. */
  return (
    <div
      className={cn('flex max-w-[80%] flex-col gap-0.5', mine ? 'items-end' : 'items-start')}
      style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}
    >
      <div
        dir="rtl"
        className={cn(
          'whitespace-pre-line break-words rounded-2xl px-3 py-2 text-[13px] leading-6 shadow-sm',
          mine ? 'rounded-bl-sm bg-emerald-600 text-white' : 'rounded-br-sm border border-stone-200 bg-white text-stone-700',
        )}
      >
        {m.content}
        {m.attachment ? (
          isImage ? (
            <img src={m.attachment} alt="پیوست" className="mt-1.5 max-h-52 rounded-lg border border-black/10" />
          ) : (
            <a href={m.attachment} download="attachment" className={cn('mt-1 flex items-center gap-1 text-[11px] underline', mine ? 'text-emerald-50' : 'text-teal-700')}>
              <I.link size={12} /> دانلود پیوست
            </a>
          )
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-[9.5px] text-stone-400" dir="rtl">
        <span className="num">{clockFa(m.createdAt)}</span>
        {mine ? (
          m.readAt ? <span className="text-emerald-500" title="خوانده شد">✓✓</span> : <span title="هنوز خوانده نشده">✓</span>
        ) : null}
        {onDelete ? (
          <button type="button" onClick={() => onDelete(m)} className="rounded p-0.5 text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-500" title="حذف پیام">
            <I.trash size={11} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

/* ── نمای اصلی ──────────────────────────────────────────── */

export default function MessagesView() {
  const { user, refreshBadges } = useShell()
  const isManager = !!user && MANAGER_ROLES.includes(String(user.role))

  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<any[]>([])
  const [broadcasts, setBroadcasts] = useState<any[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [unreadBroadcasts, setUnreadBroadcasts] = useState(0)

  /* تب ستون راست: گفتگوها | گروهی */
  const [tab, setTab] = useState<'chats' | 'group'>('chats')
  const [q, setQ] = useState('')

  /* گفتگوی فعال */
  const [activeId, setActiveId] = useState<string | null>(null)
  const [peer, setPeer] = useState<any>(null)
  const [thread, setThread] = useState<any[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

  /* جعبهٔ ارسال */
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  /* دیالوگ‌ها */
  const [newOpen, setNewOpen] = useState(false)
  const [newQ, setNewQ] = useState('')
  const [bcastOpen, setBcastOpen] = useState(false)
  const [bcastText, setBcastText] = useState('')
  const [bcastBusy, setBcastBusy] = useState(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const markedSeenRef = useRef(false)

  /* ───────── بارگذاری ───────── */

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const r = await api('/api/messages')
    if (!silent) setLoading(false)
    if (!r.ok) { if (!silent) toast.error(r.error || 'خطا در دریافت پیام‌ها'); return }
    setConversations(r.data?.conversations || [])
    setBroadcasts(r.data?.broadcasts || [])
    setRoster(r.data?.roster || [])
    setUnreadBroadcasts(Number(r.data?.unreadBroadcasts) || 0)
  }, [])

  const loadThread = useCallback(async (peerId: string) => {
    setThreadLoading(true)
    const r = await api(`/api/messages${qsWith(peerId)}`)
    setThreadLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت گفتگو'); return }
    setPeer(r.data?.peer || null)
    setThread(r.data?.messages || [])
    // گفتگو باز شد → پیام‌های طرف مقابل خوانده شدند؛ فهرست را هم به‌روز کن
    setConversations((prev) => prev.map((c) => (c.peer?.id === peerId ? { ...c, unread: 0 } : c)))
  }, [])

  function qsWith(peerId: string) {
    return `?with=${encodeURIComponent(peerId)}`
  }

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  /* به‌روزرسانی خودکار هر ۱۰ ثانیه (مثل نمای قبلی) */
  useEffect(() => {
    const t = setInterval(() => {
      void loadOverview(true)
      if (activeId) void loadThread(activeId)
    }, POLL_MS)
    return () => clearInterval(t)
  }, [activeId, loadOverview, loadThread])

  /* اسکرول به آخرین پیام */
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread, activeId])

  /* باز کردن تب گروهی → همهٔ پیام‌های گروهی «دیده‌شده» می‌شوند */
  useEffect(() => {
    if (tab === 'group' && unreadBroadcasts > 0 && !markedSeenRef.current) {
      markedSeenRef.current = true
      void (async () => {
        const r = await api('/api/messages', { method: 'PUT' })
        if (r.ok) {
          setUnreadBroadcasts(0)
          setBroadcasts((prev) => prev.map((b) => ({ ...b, mine: true })))
          refreshBadges?.()
        }
      })()
    }
    if (tab === 'chats') markedSeenRef.current = false
  }, [tab, unreadBroadcasts, refreshBadges])

  /* ───────── ارسال ───────── */

  async function send() {
    const content = draft.trim()
    if (!content && !attachment) return toast.error('متن پیام را بنویسید')
    if (!activeId) return
    setSending(true)
    const r = await api('/api/messages', {
      method: 'POST',
      body: { toId: activeId, content: content || '📎', attachment: attachment || undefined },
    })
    setSending(false)
    if (!r.ok) return toast.error(r.error || 'ارسال پیام انجام نشد')
    setDraft('')
    setAttachment(null)
    await loadThread(activeId)
    void loadOverview(true)
  }

  function onDraftKey(e: any) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  function pickFile(e: any) {
    const f = e.target?.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > MAX_ATTACHMENT) return toast.error('حجم پیوست حداکثر ۵۰۰ کیلوبایت است')
    const reader = new FileReader()
    reader.onload = () => setAttachment(String(reader.result || ''))
    reader.readAsDataURL(f)
  }

  async function sendBroadcast() {
    const content = bcastText.trim()
    if (!content) return toast.error('متن پیام گروهی را بنویسید')
    setBcastBusy(true)
    const r = await api('/api/messages', { method: 'POST', body: { toId: null, content } })
    setBcastBusy(false)
    if (!r.ok) return toast.error(r.error || 'ارسال پیام گروهی انجام نشد')
    toast.success('پیام گروهی برای همه کارکنان ارسال شد')
    setBcastText('')
    setBcastOpen(false)
    await loadOverview(true)
    setTab('group')
  }

  async function removeMessage(m: any) {
    const r = await api(`/api/messages?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' })
    if (!r.ok) return toast.error(r.error || 'حذف پیام انجام نشد')
    setThread((prev) => prev.filter((x) => x.id !== m.id))
    void loadOverview(true)
  }

  /* ───────── فهرست‌های مشتق ───────── */

  const filteredConvs = useMemo(() => {
    const needle = q.trim()
    if (!needle) return conversations
    return conversations.filter((c) =>
      String(c.peer?.fullName || '').indexOf(needle) > -1 ||
      String(c.last || '').indexOf(needle) > -1)
  }, [conversations, q])

  const filteredRoster = useMemo(() => {
    const needle = newQ.trim()
    if (!needle) return roster
    return roster.filter((u) =>
      String(u.fullName || '').indexOf(needle) > -1 ||
      String(u.title || '').indexOf(needle) > -1)
  }, [roster, newQ])

  const activeConv = conversations.find((c) => c.peer?.id === activeId)

  /* ───────── رندر ───────── */

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      {/* ═══════ ستون راست: فهرست گفتگوها / گروهی ═══════ */}
      <Card className="flex h-[calc(100vh-190px)] min-h-96 flex-col overflow-hidden">
        <CardContent className="flex h-full flex-col gap-2.5 p-3.5">
          {/* سربرگ + تب‌ها */}
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1" dir="rtl">
              <button
                type="button"
                onClick={() => setTab('chats')}
                className={cn('relative rounded-md py-1.5 text-xs font-medium transition-colors',
                  tab === 'chats' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:bg-stone-100')}
              >
                گفتگوها
                {conversations.length ? <span className="num mr-1 text-[9.5px] text-stone-400">({fa(conversations.length)})</span> : null}
              </button>
              <button
                type="button"
                onClick={() => setTab('group')}
                className={cn('relative rounded-md py-1.5 text-xs font-medium transition-colors',
                  tab === 'group' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:bg-stone-100')}
              >
                گروهی
                {unreadBroadcasts > 0 ? (
                  <span className="num absolute -top-1.5 left-1.5 rounded-full bg-rose-500 px-1.5 text-[9px] font-bold leading-4 text-white">{fa(unreadBroadcasts)}</span>
                ) : null}
              </button>
            </div>
            <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" title="گفتگوی جدید" onClick={() => { setNewQ(''); setNewOpen(true) }}>
              <I.send size={15} />
            </Button>
          </div>

          {/* جست‌وجو (فقط تب گفتگوها) */}
          {tab === 'chats' ? (
            <div className="relative">
              <I.search size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
              <Input className="h-9 pr-8 text-xs" placeholder="جست‌وجوی گفتگو…" value={q} onChange={(e: any) => setQ(e.target.value)} />
            </div>
          ) : null}

          {/* فهرست */}
          <div className="flex-1 overflow-y-auto pr-1" dir="rtl">
            {loading ? (
              <div className="space-y-2 pt-1">
                {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-stone-100" />)}
              </div>
            ) : tab === 'chats' ? (
              filteredConvs.length === 0 ? (
                <div className="py-8 text-center">
                  <I.send className="mx-auto mb-2 text-stone-400" size={24} />
                  <p className="text-xs font-medium text-stone-500">گفتگویی وجود ندارد</p>
                  <p className="mt-0.5 text-[10.5px] text-stone-400">با دکمهٔ ارسال، گفتگوی جدیدی شروع کنید</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredConvs.map((c) => {
                    const isActive = c.peer?.id === activeId
                    return (
                      <button
                        key={c.peer?.id} type="button" dir="rtl"
                        onClick={() => { setActiveId(c.peer?.id ?? null); void loadThread(c.peer?.id) }}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-right transition-colors',
                          isActive ? 'border-emerald-300 bg-emerald-50' : 'border-transparent hover:bg-stone-100',
                        )}
                      >
                        <Avatar u={c.peer || {}} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-xs font-bold text-stone-700">
                              {`${c.peer?.honorific ? c.peer.honorific + ' ' : ''}${c.peer?.fullName || ''}`}
                            </span>
                            <span className="num mr-auto shrink-0 text-[9.5px] text-stone-400">{shortTime(c.lastAt)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5">
                            <span className={cn('truncate text-[11px]', c.unread > 0 ? 'font-medium text-stone-700' : 'text-stone-400')}>
                              {c.mine ? 'شما: ' : ''}{c.last || '—'}
                            </span>
                            {c.unread > 0 ? (
                              <span className="num mr-auto shrink-0 rounded-full bg-emerald-600 px-1.5 text-[9px] font-bold leading-4 text-white">{fa(c.unread)}</span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            ) : (
              /* تب گروهی — اعلان‌های همگانی */
              <div className="space-y-1">
                {isManager ? (
                  <button
                    type="button" dir="rtl"
                    onClick={() => setBcastOpen(true)}
                    className="mb-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-2.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    <I.zap size={14} /> ارسال پیام گروهی جدید
                  </button>
                ) : null}
                {broadcasts.length === 0 ? (
                  <div className="py-8 text-center">
                    <I.zap className="mx-auto mb-2 text-stone-400" size={24} />
                    <p className="text-xs font-medium text-stone-500">پیام گروهی‌ای وجود ندارد</p>
                  </div>
                ) : broadcasts.map((b) => (
                  <div key={b.id} dir="rtl" className="rounded-xl border border-stone-200 bg-white p-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar u={b.from || {}} size={26} />
                      <span className="truncate text-[11px] font-bold text-stone-700">
                        {`${b.from?.honorific ? b.from.honorific + ' ' : ''}${b.from?.fullName || '—'}`}
                      </span>
                      {b.fromMe ? <Badge variant="secondary" className="text-[9px]">ارسال شما</Badge> : null}
                      <span className="num mr-auto shrink-0 text-[9.5px] text-stone-400" dir="rtl">{dateFa(b.createdAt)} · {clockFa(b.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line break-words rounded-lg bg-stone-50 p-2 text-[11.5px] leading-5 text-stone-700">{b.content}</p>
                    {b.attachment ? (
                      String(b.attachment).startsWith('data:image/') ? (
                        <img src={b.attachment} alt="پیوست" className="mt-1.5 max-h-44 rounded-lg border border-stone-200" />
                      ) : (
                        <a href={b.attachment} download="attachment" className="mt-1 flex items-center gap-1 text-[10.5px] text-teal-700 underline"><I.link size={11} /> دانلود پیوست</a>
                      )
                    ) : null}
                    <div className="mt-1 flex items-center gap-1 text-[9.5px] text-stone-400">
                      <I.eye size={11} /> <span className="num">{fa(b.seenCount || 0)}</span> نفر دیدند
                      {!b.mine ? <span className="mr-auto rounded-full bg-rose-100 px-1.5 font-bold text-rose-600">جدید</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="border-t border-stone-200 pt-1.5 text-center text-[9px] text-stone-400">به‌روزرسانی خودکار هر ۱۰ ثانیه</p>
        </CardContent>
      </Card>

      {/* ═══════ ستون چپ: گفتگوی فعال ═══════ */}
      <Card className="flex h-[calc(100vh-190px)] min-h-96 flex-col overflow-hidden">
        {!activeId ? (
          <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <I.users className="text-stone-400" size={40} />
            <p className="text-sm font-bold text-stone-500">یک گفتگو را انتخاب کنید</p>
            <p className="text-xs text-stone-400">یا از دکمهٔ ارسال، گفتگوی جدیدی شروع کنید</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { setNewQ(''); setNewOpen(true) }}>
              <I.send size={13} className="ml-1" /> گفتگوی جدید
            </Button>
          </CardContent>
        ) : (
          <CardContent className="flex h-full flex-col p-0">
            {/* سربرگ گفتگو */}
            <div className="flex items-center gap-2.5 border-b border-stone-200 bg-stone-50/70 p-3" dir="rtl">
              <Avatar u={peer || activeConv?.peer || {}} size={38} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-stone-700">
                  {`${(peer?.honorific || activeConv?.peer?.honorific) ? (peer?.honorific || activeConv?.peer?.honorific) + ' ' : ''}${peer?.fullName || activeConv?.peer?.fullName || ''}`}
                </p>
                <p className="truncate text-[10.5px] text-stone-400">{peer?.title || ''}</p>
              </div>
              <span className="mr-auto" />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-stone-400" title="به‌روزرسانی"
                onClick={() => { void loadThread(activeId); void loadOverview(true) }}>
                <I.refresh size={15} />
              </Button>
            </div>

            {/* پیام‌ها */}
            <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5" dir="rtl">
              {threadLoading && thread.length === 0 ? (
                <div className="space-y-2.5">
                  {[0, 1, 2].map((i) => <div key={i} className="h-10 w-2/3 animate-pulse rounded-2xl bg-stone-100" />)}
                </div>
              ) : thread.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-stone-400">هنوز پیامی رد و بدل نشده — اولین پیام را بفرستید</p>
                </div>
              ) : (
                thread.map((m) => (
                  <Bubble key={m.id} m={m} mine={m.fromId === user?.id} onDelete={m.fromId === user?.id ? (x) => void removeMessage(x) : undefined} />
                ))
              )}
            </div>

            {/* جعبهٔ ارسال */}
            <div className="border-t border-stone-200 bg-stone-50/70 p-2.5">
              {attachment ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5" dir="rtl">
                  <I.link size={13} className="text-teal-600" />
                  <span className="truncate text-[11px] text-teal-700">پیوست آماده ارسال</span>
                  <button type="button" className="mr-auto rounded p-0.5 text-stone-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => setAttachment(null)} title="حذف پیوست">
                    <I.x size={13} />
                  </button>
                </div>
              ) : null}
              <div className="flex items-end gap-2" dir="rtl">
                <input ref={fileRef} type="file" className="hidden" onChange={pickFile} />
                <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" title="پیوست (حداکثر ۵۰۰KB)" onClick={() => fileRef.current?.click()}>
                  <I.link size={15} />
                </Button>
                <Textarea
                  rows={1}
                  className="max-h-28 min-h-9 flex-1 resize-none bg-white text-[13px] leading-6"
                  placeholder="پیام خود را بنویسید… (Enter = ارسال، Shift+Enter = سطر جدید)"
                  value={draft}
                  onChange={(e: any) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                />
                <Button className="h-9 shrink-0" disabled={sending || (!draft.trim() && !attachment)} onClick={() => void send()}>
                  {sending ? <I.loader size={15} className="animate-spin" /> : <I.send size={15} className="ml-1" />}
                  <span className="hidden sm:inline">{sending ? '…' : 'ارسال'}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ═══════ دیالوگ گفتگوی جدید ═══════ */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">گفتگوی جدید</DialogTitle>
            <DialogDescription className="text-xs">همکار را برای شروع گفتگو انتخاب کنید.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <I.search size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
            <Input className="h-9 pr-8 text-xs" placeholder="جست‌وجوی همکار…" value={newQ} onChange={(e: any) => setNewQ(e.target.value)} />
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto" dir="rtl">
            {filteredRoster.length === 0 ? (
              <p className="py-6 text-center text-xs text-stone-400">همکاری یافت نشد</p>
            ) : filteredRoster.map((u) => (
              <button
                key={u.id} type="button" dir="rtl"
                onClick={() => { setActiveId(u.id); setPeer(u); setThread([]); setNewOpen(false); void loadThread(u.id) }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-transparent p-2 text-right transition-colors hover:bg-stone-100"
              >
                <Avatar u={u} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-stone-700">{`${u.honorific ? u.honorific + ' ' : ''}${u.fullName}`}</span>
                  <span className="block truncate text-[10px] text-stone-400">{u.title || ''}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════ دیالوگ پیام گروهی (مدیران) ═══════ */}
      <Dialog open={bcastOpen} onOpenChange={setBcastOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm"><I.zap size={16} className="text-amber-600" /> پیام گروهی به همه کارکنان</DialogTitle>
            <DialogDescription className="text-xs">پیام برای تمام کاربران فعال ارسال و در بخش «گروهی» نمایش داده می‌شود.</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4} className="text-sm"
            placeholder="مثلاً: یادآوری جلسه صبحگاهی فردا ساعت ۸…"
            value={bcastText} onChange={(e: any) => setBcastText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBcastOpen(false)}>انصراف</Button>
            <Button onClick={() => void sendBroadcast()} disabled={bcastBusy || !bcastText.trim()}>
              {bcastBusy ? <I.loader size={14} className="ml-1 animate-spin" /> : <I.send size={14} className="ml-1" />}
              {bcastBusy ? 'در حال ارسال…' : 'ارسال به همه'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
