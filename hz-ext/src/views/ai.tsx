/**
 * system/ai — دستیار هوشمند سر رسید (R14) — z.ai / GLM.
 * گفت‌وگو دربارهٔ پلتفرم + تحلیل فروش/انبار/قیمت با ابزارهای فقط-خواندنی.
 * مالک/ادمین؛ کلید z.ai همین‌جا ذخیره می‌شود (سمت سرور می‌ماند).
 */
import { useState, useEffect, useRef, api, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Textarea, fa, I } from '../lib/hz'

interface Msg { role: 'user' | 'assistant'; content: string; tools?: string[]; at?: string }
interface AiSettings { configured: boolean; baseUrl: string; model: string; apiKeyMasked: string | null }

const SUGGESTIONS = [
  'وضعیت فروش این ماه چطور است؟ چه چیزی بهتر بفروخته؟',
  'کم‌موجودترین کالاها را بگو تا سفارش بدهم',
  'روند قیمت شیر کاله در چند ماه اخیر چه بوده؟',
  'پرفروش‌ترین کالاهای آبان کدام‌ها بودند؟',
  'تحلیل کن: سود فروشگاه در مقایسه با ماه قبل بهتر شده؟',
]

export default function AiView() {
  const { user } = useShell()
  const allowed = !!user && ['OWNER', 'ADMIN', 'GM'].includes(String(user.role))

  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfgForm, setCfgForm] = useState({ apiKey: '', baseUrl: '', model: '' })
  const [testing, setTesting] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const loadSettings = () => {
    api('/api/ai/settings').then((r: any) => {
      if (r.ok) setSettings(r.data)
      else setSettings({ configured: false, baseUrl: '', model: '', apiKeyMasked: null })
    })
  }
  useEffect(() => { if (allowed) loadSettings() }, [allowed])
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [messages, sending])

  if (!allowed) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <I.lock size={28} className="mx-auto text-stone-300" />
          <p className="mt-3 text-sm font-bold text-stone-600">دستیار هوشمند فعلاً برای مالک/ادمین فعال است</p>
        </CardContent>
      </Card>
    )
  }

  async function send(text?: string) {
    const q = (text ?? input).trim()
    if (!q || sending) return
    setInput('')
    const next: Msg[] = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setSending(true)
    try {
      const r = await api('/api/ai/chat', {
        method: 'POST',
        body: { messages: next.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content })) },
      })
      if (r.ok) setMessages([...next, { role: 'assistant', content: r.data.answer, tools: r.data.tools, at: r.data.model }])
      else {
        toast.error(r.error || 'پاسخ دریافت نشد')
        setMessages([...next, { role: 'assistant', content: `⚠ ${r.error || 'پاسخ دریافت نشد'}` }])
      }
    } catch {
      toast.error('ارتباط با دستیار برقرار نشد')
    } finally {
      setSending(false)
    }
  }

  async function saveCfg() {
    setTesting(true)
    const r = await api('/api/ai/settings', { method: 'PUT', body: cfgForm })
    setTesting(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره نشد')
    toast.success('تنظیمات دستیار ذخیره شد')
    setCfgOpen(false)
    loadSettings()
  }

  async function testConn() {
    setTesting(true)
    const r = await api('/api/ai/settings', { method: 'POST' })
    setTesting(false)
    if (r.ok) toast.success(`اتصال برقرار است (${r.data.model} · ${fa(r.data.tookMs)}ms): «${r.data.reply}»`)
    else toast.error(r.error || 'اتصال برقرار نشد')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <I.sparkles size={18} className="text-violet-600" /> دستیار هوشمند سر رسید
            <Badge variant="outline" className={cn('border-transparent text-[10px]', settings?.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
              {settings?.configured ? `متصل — ${settings.model}` : 'تنظیم نشده'}
            </Badge>
            <span className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => { setCfgForm({ apiKey: '', baseUrl: settings?.baseUrl ?? '', model: settings?.model ?? '' }); setCfgOpen(true) }}>
              <I.settings size={14} /> تنظیمات
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-6 text-stone-500">
            از دستیار بپرسید: وضعیت فروش، سود، کم‌موجودها، روند قیمت هر کالا، یا هر سؤالی دربارهٔ کار پلتفرم.
            دستیار با ابزارهای فقط-خواندنی به دادهٔ واقعی فروشگاه (فروش/خرید هلو از تیر ۱۴۰۵، موجودی، قیمت‌ها) نگاه می‌کند و بعد تحلیل می‌دهد — عدد از خودش نمی‌سازد.
          </p>
          {!settings?.configured ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
              کلید API سرویس z.ai (GLM) ذخیره نشده است. دکمهٔ «تنظیمات» را بزنید، کلید را وارد و ذخیره کنید — کلید فقط روی سرور می‌ماند و به مرورگر نمی‌رسد.
            </div>
          ) : null}

          {/* گفت‌وگو */}
          <div ref={listRef} className="max-h-[58vh] min-h-48 space-y-3 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/50 p-3">
            {messages.length === 0 ? (
              <div className="py-6 text-center">
                <I.sparkles size={26} className="mx-auto text-violet-300" />
                <p className="mt-2 text-sm font-bold text-stone-600">سلام! چه کاری برایتان انجام دهم؟</p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {SUGGESTIONS.map((sg) => (
                    <button
                      key={sg}
                      type="button"
                      onClick={() => void send(sg)}
                      className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-medium text-violet-800 transition-colors hover:bg-violet-50"
                    >
                      {sg}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
                  <div className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-6',
                    m.role === 'user' ? 'bg-teal-600 text-white' : 'border border-stone-200 bg-white text-stone-800',
                  )}>
                    {m.content}
                    {m.tools?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.tools.map((t, j) => (
                          <span key={j} className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700" title={`ابزار استفاده‌شده: ${t}`}>
                            ⚙ {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {sending ? (
              <div className="flex justify-end">
                <div className="flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 text-[13px] text-stone-400">
                  <I.loader size={14} className="animate-spin" /> دستیار در حال بررسی داده‌ها…
                </div>
              </div>
            ) : null}
          </div>

          {/* ورودی */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e: any) => setInput(e.target.value)}
              onKeyDown={(e: any) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder="سؤالت را بنویس… (Enter = ارسال)"
              disabled={sending || !settings?.configured}
              className="h-11"
            />
            <Button onClick={() => void send()} disabled={sending || !input.trim() || !settings?.configured} className="gap-1">
              {sending ? <I.loader size={15} className="animate-spin" /> : <I.send size={15} />} ارسال
            </Button>
          </div>
          {messages.length ? (
            <button type="button" onClick={() => setMessages([])} className="text-[11px] text-stone-400 underline-offset-2 hover:underline">
              پاک‌کردن گفت‌وگو
            </button>
          ) : null}
        </CardContent>
      </Card>

      {/* دیالوگ تنظیمات */}
      <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.settings size={16} /> تنظیمات دستیار (z.ai / GLM)</DialogTitle>
            <DialogDescription className="text-[12px] leading-6">
              کلید API حساب z.ai خود را اینجا ذخیره کنید — فقط روی سرور نگه‌داری می‌شود.
              {settings?.apiKeyMasked ? ` (کلید فعلی: ${settings.apiKeyMasked})` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-stone-600">کلید API (ZAI-…)</label>
              <Input value={cfgForm.apiKey} onChange={(e: any) => setCfgForm((c) => ({ ...c, apiKey: e.target.value }))} placeholder="ZAI-…" dir="ltr" className="font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-stone-600">مدل</label>
                <Input value={cfgForm.model} onChange={(e: any) => setCfgForm((c) => ({ ...c, model: e.target.value }))} placeholder="glm-4.6" dir="ltr" className="font-mono" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-stone-600">آدرس سرویس</label>
                <Input value={cfgForm.baseUrl} onChange={(e: any) => setCfgForm((c) => ({ ...c, baseUrl: e.target.value }))} placeholder="https://api.z.ai/api/paas/v4" dir="ltr" className="font-mono" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={testing} onClick={() => void testConn()} className="gap-1">
              {testing ? <I.loader size={14} className="animate-spin" /> : <I.zap size={14} />} تست اتصال
            </Button>
            <span className="flex-1" />
            <Button variant="outline" onClick={() => setCfgOpen(false)}>بستن</Button>
            <Button disabled={testing} onClick={() => void saveCfg()}>ذخیره</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
