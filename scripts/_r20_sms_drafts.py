# -*- coding: utf-8-escape
"""R20 — پیش‌نویس‌های پیامک در مرکز پیامک (ذخیره/بارگذاری/حذف)"""
import io

p = 'hz-ext/src/views/smscenter.tsx'
s = io.open(p, encoding='utf-8').read()

# state پیش‌نویس‌ها کنار msgText
s = s.replace("const [msgText, setMsgText] = useState('')",
"""const [msgText, setMsgText] = useState('')
  const [drafts, setDrafts] = useState<{ id: string; title: string; body: string; updatedAt: string }[]>([])""")

# بارگذاری اولیه
s = s.replace("async function doSend() {",
"""const loadDrafts = () => { api('/api/sms/drafts').then((r: any) => { if (r.ok) setDrafts(r.data.drafts || []) }).catch(() => {}) }
  useEffect(() => { loadDrafts() }, [])
  async function saveDraft() {
    const t = msgText.trim()
    if (!t) return toast.error('متنی برای ذخیره نیست')
    const title = prompt('عنوان پیش‌نویس؟', t.slice(0, 25)) ?? ''
    if (title === null) return
    const r = await api('/api/sms/drafts', { method: 'POST', body: { title, body: t } })
    if (r.ok) { toast.success('پیش‌نویس ذخیره شد'); loadDrafts() } else toast.error(r.error || 'ذخیره نشد')
  }
  async function delDraft(id: string) {
    const r = await api(`/api/sms/drafts?id=${id}`, { method: 'DELETE' })
    if (r.ok) loadDrafts()
  }

  async function doSend() {""")

# دکمهٔ ذخیرهٔ پیش‌نویس + فهرست پیش‌نویس‌ها، کنار فیلد متن ارسال
old = '<Textarea value={msgText}'
idx = s.find(old)
assert idx > -1, 'textarea not found'
# یافتن انتهای همان JSX textarea (تقریبی: بستن پرانتز تگ)
end = s.find('/>', idx)
insert_at = end + 2
drafts_ui = """
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={saveDraft}>💾 ذخیره به‌عنوان پیش‌نویس</Button>
          {drafts.map((d) => (
            <span key={d.id} className="group inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px]">
              <button className="font-medium hover:text-emerald-700" title={d.body} onClick={() => setMsgText(d.body)}>{d.title || 'بی‌عنوان'}</button>
              <button className="text-red-400 opacity-0 group-hover:opacity-100" onClick={() => delDraft(d.id)}>✕</button>
            </span>
          ))}
        </div>"""
s = s[:insert_at] + drafts_ui + s[insert_at:]

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('smscenter drafts UI added')
