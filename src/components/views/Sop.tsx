'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, Labeled, SearchInput } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import type { AppCtx } from '@/components/app/ui-bits'
import { Plus, Pencil, Trash2, ChevronDown, BookOpen } from 'lucide-react'

type SopStep = { title: string; detail: string }
type Sop = { id: string; title: string; category: string; steps: SopStep[]; updatedBy: string; updatedAt: string }

export default function SopView({ ctx }: { ctx: AppCtx }) {
  const [sops, setSops] = useState<Sop[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editFor, setEditFor] = useState<Sop | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const canEdit = ['GM', 'OM', 'PM'].includes(ctx.user!.role)
  const canDelete = ['GM', 'OM'].includes(ctx.user!.role)

  const load = () => {
    api<{ sops: Sop[] }>('/api/sops')
      .then((d) => setSops(d.sops))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    sops.forEach((s) => set.add(s.category || 'عمومی'))
    return Array.from(set)
  }, [sops])

  const filtered = sops.filter(
    (s) => (!cat || (s.category || 'عمومی') === cat) && (!q.trim() || s.title.includes(q.trim()) || (s.steps || []).some((st) => st.title.includes(q.trim())))
  )

  const remove = async (s: Sop) => {
    if (!window.confirm(`روال «${s.title}» برای همیشه حذف شود؟`)) return
    try {
      await api(`/api/sops?id=${s.id}`, { method: 'DELETE' })
      toast.success('روال حذف شد')
      if (expanded === s.id) setExpanded(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="روال‌های استاندارد (SOP)"
        subtitle="راهنمای گام‌به‌گام کارها — وسط شیفت با خیال راحت باز کن و دنبال کن"
        icon={<BookOpen size={18} />}
        actions={canEdit && (
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white transition hover:-translate-y-0.5">
            <Plus size={15} /> روال جدید
          </button>
        )}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="جستجوی عنوان یا مرحله…" className="sm:w-72" />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCat('')}
              className={cat === '' ? 'rounded-full bg-[#0e7a4a] px-3.5 py-1.5 text-[11px] font-bold text-white' : 'rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:border-primary/60'}
            >
              همه ({faNum(sops.length)})
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cat === c ? 'rounded-full bg-[#0e7a4a] px-3.5 py-1.5 text-[11px] font-bold text-white' : 'rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:border-primary/60'}
              >
                {c} ({faNum(sops.filter((s) => (s.category || 'عمومی') === c).length)})
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState emoji="📖" title="روالی پیدا نشد" hint="می‌توانی با «روال جدید» اولین راهنمای این بخش را بنویسی" />
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => {
              const open = expanded === s.id
              return (
                <div key={s.id} className={`glow-card overflow-hidden rounded-2xl bg-white/85 transition ${open ? 'ring-1 ring-[#c9a227]/50' : ''}`}>
                  <button
                    onClick={() => setExpanded(open ? null : s.id)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-right"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg">📗</span>
                      <div>
                        <p className="text-sm font-black">{s.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{faNum((s.steps || []).length)} مرحله</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill label={s.category || 'عمومی'} color="#77934a" />
                      <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {open && (
                    <div className="fade-in-up border-t border-border/60 p-4">
                      <div className="space-y-3">
                        {(s.steps || []).map((st, i) => (
                          <div key={i} className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c9a227] text-sm font-black text-white shadow-md">
                              {faNum(i + 1)}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold leading-6">{st.title}</p>
                              {st.detail && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-foreground/75">{st.detail}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">آخرین ویرایش: {s.updatedBy || '—'}</span>
                        <div className="flex gap-1">
                          {canEdit && (
                            <button onClick={() => setEditFor(s)} className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground transition hover:border-primary/60 hover:text-foreground">
                              <Pencil size={12} /> ویرایش
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => remove(s)} className="rounded-xl border border-[#b3372f]/40 px-3 py-2 text-[11px] font-bold text-[#b3372f] transition hover:bg-[#fee2e2]">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {(addOpen || editFor) && (
        <SopForm
          sop={editFor}
          categories={categories}
          onClose={() => { setAddOpen(false); setEditFor(null) }}
          onSaved={() => { setAddOpen(false); setEditFor(null); load() }}
        />
      )}
    </div>
  )
}

/* ─────────────── SOP create/edit modal ─────────────── */

function SopForm({ sop, categories, onClose, onSaved }: { sop: Sop | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(sop?.title || '')
  const [category, setCategory] = useState(sop?.category || '')
  const [steps, setSteps] = useState<SopStep[]>(
    sop?.steps?.length ? sop.steps.map((s) => ({ title: s.title || '', detail: s.detail || '' })) : [{ title: '', detail: '' }]
  )
  const [saving, setSaving] = useState(false)

  const setStep = (i: number, k: keyof SopStep, v: string) =>
    setSteps((arr) => arr.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)))

  const save = async () => {
    const cleanSteps = steps.filter((s) => s.title.trim())
    if (!title.trim()) return toast.error('عنوان روال الزامی است')
    if (!cleanSteps.length) return toast.error('حداقل یک مرحله با عنوان لازم است')
    setSaving(true)
    try {
      if (sop) await api('/api/sops', { method: 'PATCH', body: { id: sop.id, title: title.trim(), category: category.trim() || 'عمومی', steps: cleanSteps } })
      else await api('/api/sops', { method: 'POST', body: { title: title.trim(), category: category.trim() || 'عمومی', steps: cleanSteps } })
      toast.success('روال ذخیره شد ✅')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={sop ? 'ویرایش روال' : 'روال جدید'} onClose={onClose} wide>
      <Labeled label="عنوان روال *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: دریافت مرسوله از پخش" className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </Labeled>

      <Labeled label="دسته‌بندی" hint="می‌توانی از دسته‌های موجود انتخاب کنی یا بنویسی">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثلاً: انبار، صندوق، چیدمان" className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </Labeled>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${category === c ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground hover:border-primary/60'}`}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-foreground/80">مراحل روال *</span>
          <button
            onClick={() => setSteps((s) => [...s, { title: '', detail: '' }])}
            className="flex items-center gap-1 rounded-xl bg-secondary px-3 py-2 text-[11px] font-extrabold text-secondary-foreground transition hover:bg-[#dcead4]"
          >
            <Plus size={13} /> افزودن مرحله
          </button>
        </div>
        <div className="scroll-gold max-h-72 space-y-3 overflow-y-auto pl-1">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2 rounded-2xl border border-border bg-white p-3">
              <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c9a227] text-[11px] font-black text-white">
                {faNum(i + 1)}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  value={s.title}
                  onChange={(e) => setStep(i, 'title', e.target.value)}
                  placeholder="عنوان مرحله"
                  className="w-full rounded-xl border border-input bg-white/90 p-2.5 text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={s.detail}
                  onChange={(e) => setStep(i, 'detail', e.target.value)}
                  placeholder="توضیح"
                  className="w-full rounded-xl border border-input bg-white/90 p-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {steps.length > 1 && (
                <button
                  onClick={() => setSteps((arr) => arr.filter((_, idx) => idx !== i))}
                  className="mt-1.5 rounded-lg p-1.5 text-muted-foreground transition hover:bg-[#fee2e2] hover:text-[#b3372f]"
                  title="حذف مرحله"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60">
        {saving ? 'در حال ذخیره…' : 'ذخیره روال ✅'}
      </button>
    </Modal>
  )
}
