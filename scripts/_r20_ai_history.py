import io, re

p = 'hz-ext/src/views/ai.tsx'
s = io.open(p, encoding='utf-8').read()

# ── state های جدید ──
s = s.replace("""  const [messages, setMessages] = useState<Msg[]>([])""",
"""  const [messages, setMessages] = useState<Msg[]>([])
  const [sessionId, setSessionId] = useState('')
  const [sessions, setSessions] = useState<{ id: string; title: string; updatedAt: string; count: number }[]>([])
  const [histOpen, setHistOpen] = useState(false)""")

# ── بارگذاری فهرست جلسات ──
s = s.replace("""  useEffect(() => { if (allowed) loadSettings() }, [allowed])""",
"""  useEffect(() => { if (allowed) loadSettings() }, [allowed])
  const loadSessions = () => {
    api('/api/ai/sessions').then((r: any) => { if (r.ok) setSessions(r.data.sessions || []) }).catch(() => {})
  }
  useEffect(() => { if (allowed) loadSessions() }, [allowed])""")

# ── send: ارسال sessionId + دریافت sessionId جدید + refresh ──
s = s.replace("""      const r = await api('/api/ai/chat', {
        method: 'POST',
        body: { messages: next.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content })) },
      })
      if (r.ok) setMessages([...next, { role: 'assistant', content: r.data.answer, tools: r.data.tools, at: r.data.model }])""",
"""      const r = await api('/api/ai/chat', {
        method: 'POST',
        body: {
          messages: next.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content })),
          sessionId: sessionId || undefined,
        },
      })
      if (r.ok) {
        setMessages([...next, { role: 'assistant', content: r.data.answer, tools: r.data.tools, at: r.data.model }])
        if (r.data.sessionId) setSessionId(r.data.sessionId)
        loadSessions()
      }""")

# ── بارگذاری جلسه / گفت‌وگوی جدید / حذف ──
s = s.replace("""  async function saveCfg() {""",
"""  async function openSession(id: string) {
    const r = await api(`/api/ai/sessions/${id}`)
    if (!r.ok) return toast.error(r.error || 'باز نشد')
    setSessionId(id)
    setMessages((r.data.session.messages || []).map((m: any) => ({ role: m.role, content: m.content, tools: m.tools, at: m.at })))
    setHistOpen(false)
  }
  function newChat() {
    setSessionId('')
    setMessages([])
    setHistOpen(false)
  }
  async function removeSession(id: string) {
    const r = await api(`/api/ai/sessions/${id}`, { method: 'DELETE' })
    if (r.ok) { loadSessions(); if (sessionId === id) newChat() }
  }

  async function saveCfg() {""")

# ── دکمهٔ تاریخچه در سربرگ ──
s = s.replace("""<I.sparkles size={18} className="text-violet-600" /> دستیار هوشمند سر رسید""",
"""<I.sparkles size={18} className="text-violet-600" /> دستیار هوشمند سر رسید
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistOpen(!histOpen)}>🕘 تاریخچه ({fa(sessions.length)})</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={newChat}>＋ گفت‌وگوی جدید</Button>""")

# ── پنل تاریخچه (درج بعد از سربرگ کارت، قبل از بدنه) ──
anchor = s.index('SUGGESTIONS.map') if 'SUGGESTIONS.map' in s else -1
hist_panel = """{histOpen && (
          <div className="mb-3 rounded-xl border border-stone-200 bg-stone-50 p-2 max-h-64 overflow-auto">
            {sessions.length === 0 && <p className="text-xs text-stone-400 text-center py-4">هنوز گفت‌وگویی ذخیره نشده — گفت‌وگوهای شما خودکار اینجا ذخیره می‌شوند</p>}
            {sessions.map((ss) => (
              <div key={ss.id} className={cn('group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white cursor-pointer', sessionId === ss.id && 'bg-white ring-1 ring-stone-200')} onClick={() => openSession(ss.id)}>
                <span className="flex-1 text-xs font-medium truncate">{ss.title}</span>
                <span className="text-[10px] text-stone-400 shrink-0">{fa(ss.count)} پیام</span>
                <button className="opacity-0 group-hover:opacity-100 text-red-500 text-xs px-1" onClick={(e) => { e.stopPropagation(); removeSession(ss.id) }}>حذف</button>
              </div>
            ))}
          </div>
        )}
"""
# درج پنل در ابتدای محتوای چت — بعد از اولین <CardContent> که پیام‌ها را نشان می‌دهد
idx = s.find('<CardContent', s.find('CardTitle'))
if idx > -1:
    close_tag = s.find('>', idx) + 1
    s = s[:close_tag] + '\n        ' + hist_panel + s[close_tag:]

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ai.tsx history sidebar added')
