'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { formatJalaliDateTime } from '@/lib/jalali'
import { SectionCard, EmptyState } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Pin, PinOff, Trash2, StickyNote } from 'lucide-react'

type Note = { id: string; content: string; color: string; pinned: boolean; createdAt: string; updatedAt: string }

const NOTE_COLORS = ['#f6e7c1', '#d8ecd0', '#f9d8d0', '#eadcf4', '#f4e0cf', '#e4e8d4']

export default function NotesView({ ctx }: { ctx: AppCtx }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [newContent, setNewContent] = useState('')
  const [newColor, setNewColor] = useState(NOTE_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editColor, setEditColor] = useState('')

  const load = () => {
    setLoading(true)
    api<{ notes: Note[] }>('/api/notes')
      .then((d) => setNotes(d.notes))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!newContent.trim()) return toast.error('متن یادداشت را بنویس')
    setSaving(true)
    try {
      await api('/api/notes', { method: 'POST', body: { content: newContent.trim(), color: newColor } })
      toast.success('یادداشت چسبانده شد 📌')
      setNewContent('')
      setNewColor(NOTE_COLORS[0])
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const togglePin = async (n: Note) => {
    try {
      await api('/api/notes', { method: 'PATCH', body: { id: n.id, pinned: !n.pinned } })
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const startEdit = (n: Note) => {
    setEditingId(n.id)
    setEditText(n.content)
    setEditColor(n.color)
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!editText.trim()) return toast.error('متن یادداشت خالی است')
    try {
      await api('/api/notes', { method: 'PATCH', body: { id: editingId, content: editText.trim(), color: editColor } })
      toast.success('ذخیره شد ✅')
      setEditingId(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const remove = async (n: Note) => {
    if (!window.confirm('این یادداشت برداشته شود؟')) return
    try {
      await api(`/api/notes?id=${n.id}`, { method: 'DELETE' })
      toast.success('یادداشت برداشته شد')
      if (editingId === n.id) setEditingId(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="یادداشت‌های من"
        subtitle="برگه‌های رنگی شخصی برای کارهای ریز و یادآوری‌ها"
        icon={<StickyNote size={18} />}
      >
        {/* privacy banner */}
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#e9b90c]/40 bg-[#fdf6dd] px-4 py-3 text-[11px] font-bold leading-5 text-[#8a6d10] sm:text-xs">
          <span className="text-base leading-none">🔒</span>
          <span>این یادداشت‌ها فقط برای خودتان دیده می‌شود — حتی مدیران هم به آن دسترسی ندارند.</span>
        </div>

        {/* composer */}
        <div className="glow-card rounded-2xl bg-white/85 p-4">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            placeholder="یادداشت جدید… هر چه در ذهن داری بنویس و رنگش را انتخاب کن 🎨"
            className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm leading-7 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`h-8 w-8 rounded-full border border-black/10 shadow-sm transition hover:scale-110 ${newColor === c ? 'ring-2 ring-[#c9a227] ring-offset-2' : ''}`}
                  style={{ background: c }}
                  title="انتخاب رنگ"
                />
              ))}
            </div>
            <button onClick={add} disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-white transition hover:brightness-110 disabled:opacity-60">
              {saving ? 'در حال چسباندن…' : 'چسباندن یادداشت 📌'}
            </button>
          </div>
        </div>

        {/* masonry grid */}
        <div className="mt-4">
          {loading ? (
            <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
              {[1, 2, 3].map((i) => <div key={i} className="mb-3 h-32 animate-pulse break-inside-avoid rounded-2xl bg-muted/60" />)}
            </div>
          ) : notes.length === 0 ? (
            <EmptyState emoji="📝" title="هنوز یادداشتی ننوشته‌ای" hint="اولین برگه رنگی‌ات را بچسبان — فقط خودت آن را می‌بینی" />
          ) : (
            <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="glow-card mb-3 break-inside-avoid rounded-2xl border border-black/5 p-4 shadow-sm transition hover:-translate-y-0.5"
                  style={{ background: n.color || NOTE_COLORS[0] }}
                >
                  {n.pinned && (
                    <span className="mb-2 inline-block rounded-full bg-white/70 px-2.5 py-0.5 text-[10px] font-black text-[#8a6d10]">
                      📌 سنجاق شده
                    </span>
                  )}

                  {editingId === n.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={5}
                        autoFocus
                        className="w-full rounded-xl border border-black/15 bg-white/80 p-3 text-sm leading-7 outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/30"
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        {NOTE_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className={`h-6 w-6 rounded-full border border-black/10 transition hover:scale-110 ${editColor === c ? 'ring-2 ring-[#c9a227] ring-offset-1' : ''}`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={saveEdit} className="flex-1 rounded-xl bg-[#0e7a4a] py-2.5 text-[11px] font-extrabold text-white">
                          ذخیره ✅
                        </button>
                        <button onClick={() => setEditingId(null)} className="flex-1 rounded-xl border border-black/10 bg-white/70 py-2.5 text-[11px] font-extrabold text-muted-foreground">
                          انصراف
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => startEdit(n)} className="block w-full text-right" title="برای ویرایش کلیک کن">
                        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">{n.content}</p>
                      </button>
                      <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2.5">
                        <span className="text-[10px] text-muted-foreground">✎ {formatJalaliDateTime(n.updatedAt)}</span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => togglePin(n)} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/70 hover:text-[#8a6d10]" title={n.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}>
                            {n.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                          </button>
                          <button onClick={() => startEdit(n)} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/70 hover:text-[#8a6d10]" title="ویرایش">
                            <span className="text-xs">✏️</span>
                          </button>
                          <button onClick={() => remove(n)} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-[#fee2e2] hover:text-[#b3372f]" title="حذف">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
