'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, formatJalaliDateTime } from '@/lib/jalali'
import { SectionCard, EmptyState, Labeled, Avatar } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import type { AppCtx } from '@/components/app/ui-bits'
import { Plus, Trash2, Megaphone } from 'lucide-react'

type WallPost = { id: string; authorId: string; authorName: string; title: string; content: string; pinned: boolean; createdAt: string }

const NOTE_TONES = ['#fffdf6', '#fdf6dd', '#f0f7ee']
const AVATAR_COLORS = ['#0e7a4a', '#c96f4a', '#c9a227', '#77934a', '#b3372f', '#8a6d10']

function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'همین حالا'
  if (m < 60) return `${faNum(m)} دقیقه پیش`
  const h = Math.floor(m / 60)
  if (h < 24) return `${faNum(h)} ساعت پیش`
  const d = Math.floor(h / 24)
  if (d < 7) return `${faNum(d)} روز پیش`
  return formatJalaliDateTime(iso)
}

export default function WallView({ ctx }: { ctx: AppCtx }) {
  const [posts, setPosts] = useState<WallPost[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const canPin = ['GM', 'OM', 'OWNER'].includes(ctx.user!.role)

  const load = () => {
    api<{ posts: WallPost[] }>('/api/wall')
      .then((d) => setPosts([...d.posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const remove = async (p: WallPost) => {
    if (!window.confirm(`یادداشت «${p.title}» از دیوار برداشته شود؟`)) return
    try {
      await api(`/api/wall?id=${p.id}`, { method: 'DELETE' })
      toast.success('یادداشت از دیوار برداشته شد')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      {/* decorative header */}
      <div className="fade-in-up rounded-2xl border border-[#c9a227]/30 bg-gradient-to-l from-[#eaf3e4] via-[#fdf6dd] to-[#f7ede4] p-4 text-center sm:p-5">
        <p className="text-base font-black text-[#0e7a4a] sm:text-lg">حیاط تیم هایپر زیتون 🌿</p>
        <p className="mt-1 text-[11px] font-bold text-muted-foreground">تابلوی اعلانات دیجیتال — خبرها، یادداشت‌ها و اعلان‌های تیمی اینجا می‌چسبد</p>
      </div>

      <SectionCard
        title="دیجیتال‌وال"
        subtitle="هر چه برای تیم مهم است، روی دیوار بچسبان"
        icon={<Megaphone size={18} />}
        actions={
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white transition hover:-translate-y-0.5">
            <Plus size={15} /> یادداشت جدید
          </button>
        }
      >
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted/60" />)}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState emoji="🌿" title="دیوار هنوز خالی است" hint="اولین یادداشت را تو بچسبان و شور تیمی را شروع کن ✨" />
        ) : (
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              <div
                key={p.id}
                className={`glow-card relative rounded-2xl border border-black/5 p-4 shadow-sm ${i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.35deg]'} transition hover:rotate-0`}
                style={{ background: NOTE_TONES[i % NOTE_TONES.length] }}
              >
                {p.pinned && (
                  <span className="absolute -top-2 right-4 rounded-full bg-[#b3372f] px-2.5 py-0.5 text-[10px] font-black text-white shadow">
                    📌 سنجاق شده
                  </span>
                )}
                <div className="flex items-start justify-between gap-2">
                  <p className="pt-1 text-sm font-black leading-6">{p.pinned ? '📌 ' : ''}{p.title}</p>
                  {(p.authorId === ctx.user!.id || canPin) && (
                    <button onClick={() => remove(p)} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-[#fee2e2] hover:text-[#b3372f]" title="برداشتن از دیوار">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-7 text-foreground/80">{p.content}</p>
                <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3" title={formatJalaliDateTime(p.createdAt)}>
                  <Avatar name={p.authorName} color={avatarColor(p.authorId)} size={28} />
                  <div>
                    <p className="text-[11px] font-extrabold text-foreground/85">{p.authorName}</p>
                    <p className="text-[10px] text-muted-foreground">{relTime(p.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {addOpen && (
        <WallForm
          canPin={canPin}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load() }}
        />
      )}
    </div>
  )
}

/* ─────────────── new wall post modal ─────────────── */

function WallForm({ canPin, onClose, onSaved }: { canPin: boolean; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) return toast.error('عنوان یادداشت الزامی است')
    if (!content.trim()) return toast.error('متن یادداشت الزامی است')
    setSaving(true)
    try {
      await api('/api/wall', { method: 'POST', body: { title: title.trim(), content: content.trim(), pinned } })
      toast.success('روی دیوار چسبانده شد 🌿')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="یادداشت جدید روی دیوار" onClose={onClose}>
      <Labeled label="عنوان *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: جلسه صبح فردا" className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </Labeled>
      <Labeled label="متن یادداشت *">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="هر چه می‌خواهی به تیم بگویی…" className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </Labeled>
      {canPin && (
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-[#b3372f]" />
          <span className="text-xs font-bold">📌 سنجاق در بالای دیوار (برای اعلان‌های مهم)</span>
        </label>
      )}
      <button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60">
        {saving ? 'در حال چسباندن…' : 'چسباندن روی دیوار 🌿'}
      </button>
    </Modal>
  )
}
