'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, formatJalaliDateTime } from '@/lib/jalali'
import { SectionCard, EmptyState, Pill, Labeled } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { BookOpen, Search, Plus, Pencil, Trash2, GraduationCap, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Article = {
  id: string; slug: string; title: string; category: string; body: string
  tags: string[]; sortOrder: number; updatedByName: string; updatedAt: string; createdAt: string
}

/** نرمال‌سازی بخشندهٔ فارسی — ك/ي عربی، نیم‌فاصله، فاصلهٔ اضافی */
function normFa(s: string): string {
  return String(s || '')
    .replace(/ك/g, 'ک')
    .replace(/ي/g, 'ی')
    .replace(/\u200c/g, ' ')
    .toLowerCase()
    .trim()
}

/* ── رندر امن متن مقاله — React nodes، بدون innerHTML ── */
function bold(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((p, i) =>
    i % 2 === 1 ? <b key={`${keyPrefix}-${i}`} className="text-[#0e7a4a]">{p}</b> : <span key={`${keyPrefix}-${i}`}>{p}</span>
  )
}

function renderBody(body: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let list: { type: 'ol' | 'ul'; items: string[] } | null = null
  const flush = (key: string) => {
    if (!list) return
    const items = list.items.map((it, i) => (
      <li key={`${key}-${i}`} className="leading-7">{bold(it, `${key}-b${i}`)}</li>
    ))
    nodes.push(
      list.type === 'ol' ? (
        <ol key={key} className="list-decimal space-y-1 pr-5 text-sm text-foreground/85">{items}</ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pr-5 text-sm text-foreground/85">{items}</ul>
      )
    )
    list = null
  }
  body.split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(`f${idx}`); return }
    if (line.startsWith('## ')) {
      flush(`f${idx}`)
      nodes.push(
        <h3 key={idx} className="mt-4 flex items-center gap-2 border-b border-[#c9a227]/30 pb-1.5 text-sm font-black text-[#0e7a4a]">
          <span className="h-2 w-2 rounded-full bg-[#c9a227]" />{line.slice(3)}
        </h3>
      )
      return
    }
    const num = line.match(/^(\d+)[.)]\s+(.*)/)
    if (num) {
      if (!list || list.type !== 'ol') { flush(`f${idx}`); list = { type: 'ol', items: [] } }
      list.items.push(num[2])
      return
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      if (!list || list.type !== 'ul') { flush(`f${idx}`); list = { type: 'ul', items: [] } }
      list.items.push(line.slice(2))
      return
    }
    flush(`f${idx}`)
    nodes.push(<p key={idx} className="text-sm leading-7 text-foreground/85">{bold(line, `p${idx}`)}</p>)
  })
  flush('f-end')
  return nodes
}

const CAT_EMOJI: Record<string, string> = {
  'شروع': '🚀', 'عملیات': '📦', 'مالی': '🧾', 'انبار': '🏬', 'فروش': '🛒', 'مدیریت': '🧭', 'عمومی': '🌿',
}

export default function KbView({ ctx }: { ctx: AppCtx }) {
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [canManage, setCanManage] = useState(false)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [reading, setReading] = useState<Article | null>(null)
  // editor
  const [editing, setEditing] = useState<Article | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [delArm, setDelArm] = useState(false)

  const load = () => {
    api<{ articles: Article[]; categories: string[]; canManage: boolean }>('/api/kb')
      .then((d) => {
        setArticles(d.articles)
        setCategories(d.categories)
        setCanManage(d.canManage)
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    const nq = normFa(q)
    return articles.filter((a) => {
      if (cat && a.category !== cat) return false
      if (!nq) return true
      return normFa(`${a.title} ${a.body} ${a.tags.join(' ')} ${a.category}`).includes(nq)
    })
  }, [articles, q, cat])

  const startNew = () => {
    setEditing({ id: '', slug: '', title: '', category: cat || 'عمومی', body: '', tags: [], sortOrder: articles.length + 1, updatedByName: '', updatedAt: '', createdAt: '' })
    setDelArm(false)
    setEditorOpen(true)
  }
  const startEdit = (a: Article) => {
    setEditing({ ...a })
    setDelArm(false)
    setEditorOpen(true)
  }

  const saveEditor = async () => {
    if (!editing) return
    if (!editing.title.trim() || !editing.body.trim()) return toast.error('عنوان و متن مقاله الزامی است')
    try {
      if (editing.id) {
        await api('/api/kb', {
          method: 'PATCH',
          body: { id: editing.id, title: editing.title, category: editing.category, body: editing.body, tags: editing.tags.join('، '), sortOrder: editing.sortOrder },
        })
        toast.success('مقاله به‌روزرسانی شد ✅')
      } else {
        await api('/api/kb', {
          method: 'POST',
          body: { title: editing.title, category: editing.category, body: editing.body, tags: editing.tags.join('، '), sortOrder: editing.sortOrder },
        })
        toast.success('مقاله ثبت شد 🌿')
      }
      setEditorOpen(false)
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const deleteArticle = async () => {
    if (!editing?.id) return
    if (!delArm) {
      setDelArm(true)
      setTimeout(() => setDelArm(false), 5000)
      return
    }
    try {
      await api(`/api/kb?id=${editing.id}`, { method: 'DELETE' })
      toast.success('مقاله حذف شد')
      setEditorOpen(false)
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const replayTour = () => {
    // رویداد دقیق SandboxTourButton — تور آشنایی از نو اجرا می‌شود
    window.dispatchEvent(new Event('hz-start-tour'))
  }

  return (
    <div className="space-y-4">
      {/* hero */}
      <div className="hero-emerald glow-card fade-in-up relative overflow-hidden rounded-2xl p-6 text-white">
        <span className="pointer-events-none absolute -left-4 -top-6 text-[120px] opacity-10">📚</span>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-black">دانشنامه و آموزش</p>
            <p className="mt-1 max-w-xl text-xs font-bold leading-6 opacity-85">
              هر آنچه برای کار با سامانهٔ هایپر زیتون لازم است — قدم‌به‌قدم، به زبان آدم‌ها. جست‌وجو کنید یا دسته‌بندی را انتخاب کنید.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <button onClick={startNew} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-[#0e7a4a] shadow transition hover:shadow-lg">
                <Plus size={15} /> مقالهٔ جدید
              </button>
            )}
            <button onClick={replayTour} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[#c9a227]/60 bg-[#c9a227]/15 px-4 py-2.5 text-xs font-black text-[#f3e3ae] transition hover:bg-[#c9a227]/30">
              <GraduationCap size={15} /> تور آموزشی را دوباره ببینید 🎓
            </button>
          </div>
        </div>
      </div>

      {/* search + chips */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جست‌وجو در دانشنامه… (مثلاً: چک، سفارش، آرشیو)"
            className="w-full rounded-2xl border border-input bg-white py-3.5 pr-10 pl-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary" title="پاک کردن">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="scroll-gold flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCat('')}
            className={cn('shrink-0 rounded-xl border px-4 py-2 text-[11px] font-black transition', !cat ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white shadow-lg shadow-[#0e7a4a]/20' : 'border-border bg-card text-foreground hover:border-[#c9a227]/60 hover:bg-secondary')}
          >
            همه ({faNum(articles.length)})
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(cat === c ? '' : c)}
              className={cn('shrink-0 rounded-xl border px-4 py-2 text-[11px] font-black transition', cat === c ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white shadow-lg shadow-[#0e7a4a]/20' : 'border-border bg-card text-foreground hover:border-[#c9a227]/60 hover:bg-secondary')}
            >
              {CAT_EMOJI[c] || '📄'} {c}
            </button>
          ))}
        </div>
      </div>

      {/* articles */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : articles.length === 0 ? (
        <SectionCard title="دانشنامه" icon={<BookOpen size={18} />}>
          <EmptyState emoji="🌱" title="هنوز مقاله‌ای ثبت نشده" hint="اولین مقاله را ثبت کنید تا دانشنامه جان بگیرد" />
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard title="نتیجه‌ای پیدا نشد" icon={<Search size={18} />}>
          <EmptyState emoji="🔍" title="چیزی پیدا نشد — عبارت دیگری امتحان کنید" hint="کلمهٔ کوتاه‌تر یا کلی‌تر بنویسید؛ مثلاً «چک» به‌جای «چک برگشتی»" />
        </SectionCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => setReading(a)}
              className="glow-card gold-glow-border group flex flex-col rounded-2xl bg-card p-4 text-right transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[9px] font-black text-primary">{CAT_EMOJI[a.category] || '📄'} {a.category}</span>
                {canManage && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); startEdit(a) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); startEdit(a) } }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-secondary hover:text-primary"
                    title="ویرایش مقاله"
                  >
                    <Pencil size={13} />
                  </span>
                )}
              </span>
              <b className="text-sm leading-6">{a.title}</b>
              <span className="mt-1.5 line-clamp-3 text-[11px] leading-5 text-muted-foreground">
                {a.body.replace(/^##\s*/gm, '').replace(/\*\*/g, '').replace(/^[-•]\s*/gm, '').replace(/^\d+[.)]\s*/gm, '').slice(0, 130)}
              </span>
              <span className="mt-auto flex items-center justify-between gap-2 pt-3">
                <span className="flex flex-wrap gap-1">
                  {a.tags.slice(0, 3).map((t) => <Pill key={t} label={`#${t}`} color="#77934a" />)}
                </span>
                <span className="text-[9px] font-bold text-muted-foreground">{a.updatedByName}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* reader modal */}
      {reading && (
        <Modal title={reading.title} onClose={() => setReading(null)} wide>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Pill label={`${CAT_EMOJI[reading.category] || '📄'} ${reading.category}`} bg="#e9f0e4" color="#0e7a4a" />
            {reading.tags.map((t) => <Pill key={t} label={`#${t}`} color="#77934a" />)}
          </div>
          <div className="scroll-gold max-h-[62vh] space-y-2 overflow-y-auto pl-1">{renderBody(reading.body)}</div>
          <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-[10px] font-bold text-secondary-foreground">
            🕒 آخرین به‌روزرسانی: {reading.updatedByName || '—'} • {formatJalaliDateTime(reading.updatedAt)}
          </p>
          {canManage && (
            <div className="mt-3 flex justify-start">
              <button onClick={() => { setReading(null); startEdit(reading) }} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-white px-4 py-2.5 text-xs font-black text-foreground transition hover:border-[#c9a227] hover:bg-[#fdf6dd]">
                <Pencil size={14} /> ویرایش این مقاله
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* editor modal */}
      {editorOpen && editing && (
        <Modal title={editing.id ? 'ویرایش مقاله' : 'مقالهٔ جدید'} onClose={() => setEditorOpen(false)} wide>
          <div className="space-y-3">
            <Labeled label="عنوان مقاله *">
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="مثلاً: چگونه مرسولهٔ تأمین‌کننده را دریافت کنم؟" className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
            </Labeled>
            <div className="grid gap-3 sm:grid-cols-3">
              <Labeled label="دسته‌بندی">
                <input list="kb-cats" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                <datalist id="kb-cats">
                  {categories.map((c) => <option key={c} value={c} />)}
                  {['شروع', 'عملیات', 'مالی', 'انبار', 'فروش', 'مدیریت', 'عمومی'].filter((c) => !categories.includes(c)).map((c) => <option key={c} value={c} />)}
                </datalist>
              </Labeled>
              <Labeled label="برچسب‌ها (با ویرگول جدا کنید)">
                <input value={editing.tags.join('، ')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(/[،,]/).map((t) => t.trim()).filter(Boolean) })} placeholder="چک، مالی" className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
              </Labeled>
              <Labeled label="ترتیب نمایش">
                <input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) || 0 })} className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
              </Labeled>
            </div>
            <Labeled label="متن مقاله *">
              <textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                rows={10}
                placeholder={'نکته‌ها را این‌جا بنویسید…\n## تیتر بخش\n- نکتهٔ فهرستی\n۱. گام شماره‌دار\n**متن پررنگ**'}
                className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm leading-7 outline-none focus:border-primary"
              />
            </Labeled>
            <p className="rounded-xl bg-secondary/60 p-3 text-[10px] font-bold leading-5 text-secondary-foreground">
              ✍️ قالب ساده: خط با <code>## </code> تیتر می‌شود، خط با <code>- </code> فهرست، خط شماره‌دار <code>۱. </code> گام‌ها، و <code>**متن**</code> پررنگ.
            </p>
            {editing.body.trim() && (
              <details className="rounded-xl border border-border bg-white p-3">
                <summary className="cursor-pointer text-[11px] font-black text-primary">پیش‌نمایش متن</summary>
                <div className="mt-2 space-y-2">{renderBody(editing.body)}</div>
              </details>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              {editing.id ? (
                <button
                  onClick={deleteArticle}
                  className={cn('flex min-h-11 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-black transition', delArm ? 'border-[#b3372f] bg-[#b3372f] text-white' : 'border-[#b3372f]/40 text-[#b3372f] hover:bg-[#b3372f]/10')}
                >
                  <Trash2 size={14} /> {delArm ? 'مطمئنید؟ دوباره بزنید' : 'حذف مقاله'}
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setEditorOpen(false)} className="min-h-11 rounded-xl px-4 py-2.5 text-xs font-black text-muted-foreground transition hover:bg-secondary">انصراف</button>
                <button onClick={saveEditor} className="min-h-11 rounded-xl bg-primary px-6 py-2.5 text-xs font-black text-white shadow transition hover:bg-[#12905a]">ذخیره</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
