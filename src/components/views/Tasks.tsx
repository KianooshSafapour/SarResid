'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, formatJalaliFull, todayIso } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, Labeled, StatCard } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { JalaliDatePicker, useHolidays } from '@/components/app/jalali-widgets'
import { PRIORITIES, TASK_STATUSES, ROLE_LABELS } from '@/lib/constants'
import type { AppCtx } from '@/components/app/ui-bits'
import { Plus, Trash2, ClipboardList, Users, Sparkles } from 'lucide-react'

type Task = {
  id: string
  title: string
  description: string
  type: string
  status: string
  priority: string
  assignedToId: string
  assignedToName: string
  createdByName: string
  dueDate: string
  pauseNote: string
  points: number
  dueToday?: boolean
  overdue?: boolean
  completedAt?: string | null
}

type UserLite = { id: string; name: string; role: string; active: boolean }

const TYPE_ICON: Record<string, string> = { TASK: '📋', CHECKLIST: '✅', CLEANING: '🧹', OTHER: '📌' }
const TYPE_LABEL: Record<string, string> = { TASK: 'وظیفه', CHECKLIST: 'چک‌لیست', CLEANING: 'نظافت', OTHER: 'سایر' }

const STATUS_FILTERS: [string, string][] = [
  ['', 'همه'],
  ['OPEN', 'باز'],
  ['IN_PROGRESS', 'در جریان'],
  ['PAUSED', 'متوقف'],
  ['DONE', 'انجام شد'],
]

const CELEBRATE = ['🎉', '✨', '🎊', '🥳', '🌟', '👏']

export default function TasksView({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = useState<'mine' | 'all'>('mine')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [pauseFor, setPauseFor] = useState<Task | null>(null)
  const [pauseNote, setPauseNote] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [celebrate, setCelebrate] = useState<number | null>(null)

  const isManager = ['GM', 'OM', 'PM'].includes(ctx.user!.role)
  const holidays = useHolidays()

  const load = () => {
    api<{ tasks: Task[] }>(`/api/tasks?scope=${tab}`)
      .then((d) => setTasks(d.tasks))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [tab])

  const act = async (t: Task, action: 'start' | 'done' | 'reopen') => {
    try {
      const res = await api<{ task: Task; awarded: number }>(`/api/tasks/${t.id}`, { method: 'PATCH', body: { action } })
      if (action === 'done') {
        const awarded = res.awarded || 0
        if (awarded > 0) {
          toast.success(`آفرین! ${faNum(awarded)} امتیاز گرفتی 🎉`)
          setCelebrate(awarded)
          setTimeout(() => setCelebrate(null), 2600)
        } else {
          toast.success('انجام شد! ✅')
        }
        ctx.refreshNotifications()
      } else if (action === 'start') {
        toast.success('شروع شد — موفق باشی 💪')
      } else if (action === 'reopen') {
        toast.success('وظیفه دوباره باز شد')
      }
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const doPause = async () => {
    if (!pauseFor) return
    if (!pauseNote.trim()) return toast.error('نوشتن دلیل توقف الزامی است تا مدیر مطلع شود')
    try {
      await api(`/api/tasks/${pauseFor.id}`, { method: 'PATCH', body: { action: 'pause', pauseNote: pauseNote.trim() } })
      toast.success('متوقف شد — مشکل برای مدیر ثبت شد')
      setPauseFor(null)
      setPauseNote('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const removeTask = async (t: Task) => {
    if (!window.confirm(`وظیفه «${t.title}» حذف شود؟`)) return
    try {
      await api(`/api/tasks/${t.id}`, { method: 'DELETE' })
      toast.success('وظیفه حذف شد')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const filtered = tasks.filter((t) => !statusFilter || t.status === statusFilter)
  const counts = {
    open: tasks.filter((t) => t.status === 'OPEN').length,
    wip: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    done: tasks.filter((t) => t.status === 'DONE').length,
    overdue: tasks.filter((t) => !!t.dueDate && t.status !== 'DONE' && t.dueDate < todayIso()).length,
  }

  return (
    <div className="space-y-4">
      {/* tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-2xl border border-border bg-card p-1 shadow-sm">
          <button
            onClick={() => { setTab('mine'); setLoading(true) }}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${tab === 'mine' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <ClipboardList size={14} /> وظایف من
          </button>
          {isManager && (
            <button
              onClick={() => { setTab('all'); setLoading(true) }}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${tab === 'all' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Users size={14} /> همه وظایف تیم
            </button>
          )}
        </div>
        {isManager && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white shadow transition hover:-translate-y-0.5"
          >
            <Plus size={15} /> تعریف وظیفه جدید
          </button>
        )}
      </div>

      {/* quick stats (mine tab) */}
      {tab === 'mine' && tasks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="باز" value={counts.open} tone="gold" icon={<Sparkles size={16} />} onClick={() => setStatusFilter(counts.open === filtered.length && statusFilter === 'OPEN' ? '' : 'OPEN')} />
          <StatCard label="در حال انجام" value={counts.wip} tone="olive" icon={<span>⏳</span>} />
          <StatCard label="انجام شده" value={counts.done} tone="emerald" icon={<span>✅</span>} />
          <StatCard label="دیرکرد" value={counts.overdue} tone="rose" icon={<span>⏰</span>} />
        </div>
      )}

      {/* status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setStatusFilter(v)}
            className={statusFilter === v ? 'rounded-full bg-[#0e7a4a] px-3.5 py-1.5 text-[11px] font-bold text-white' : 'rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:border-primary/60'}
          >
            {l}
          </button>
        ))}
      </div>

      {/* task cards */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted/60" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji={tasks.length === 0 ? '✨' : '🔍'}
          title={tasks.length === 0 && tab === 'mine' ? 'وظیفه‌ای نداری — وقت آزاد برای ایده‌های تازه ✨' : 'وظیفه‌ای با این فیلتر پیدا نشد'}
          hint={tasks.length === 0 && tab === 'mine' ? 'می‌توانی در بخش «بازخورد و ایده‌ها» ایده‌هایت را با تیم در میان بگذاری 💡' : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <TaskCard
              key={t.id}
              t={t}
              isOwner={t.assignedToId === ctx.user!.id}
              showAssignee={tab === 'all'}
              isManager={isManager}
              onAct={act}
              onPause={(task) => { setPauseFor(task); setPauseNote(task.pauseNote || '') }}
              onDelete={removeTask}
            />
          ))}
        </div>
      )}

      {/* pause modal */}
      {pauseFor && (
        <Modal title={`توقف وظیفه: ${pauseFor.title}`} onClose={() => { setPauseFor(null); setPauseNote('') }}>
          <div className="rounded-xl border border-[#e9b90c]/50 bg-[#fdf6dd] px-3 py-2 text-[11px] font-bold text-[#8a6d10]">
            ✋ نگران نباش — توقف اشکالی ندارد؛ فقط بگو چه مشکلی پیش آمد تا مدیر بداند و کمک کند.
          </div>
          <Labeled label="چه مشکلی پیش آمد؟ *">
            <textarea
              value={pauseNote}
              onChange={(e) => setPauseNote(e.target.value)}
              rows={3}
              placeholder="مثلاً: کالا در انبار نبود / منتظر شماره فاکتور هستم…"
              className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Labeled>
          <button onClick={doPause} className="w-full rounded-xl bg-[#c96f4a] py-3 text-sm font-extrabold text-white transition hover:brightness-105">
            ثبت توقف
          </button>
        </Modal>
      )}

      {/* new task modal */}
      {addOpen && (
        <TaskFormModal
          holidays={holidays}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load() }}
        />
      )}

      {/* celebration overlay */}
      {celebrate !== null && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fade-in-up rounded-3xl bg-white/95 px-10 py-7 text-center shadow-2xl ring-2 ring-[#c9a227]/50">
            <div className="animate-bounce text-5xl tracking-widest">{CELEBRATE.join('')}</div>
            <p className="mt-3 text-xl font-black text-[#8a6d10]">+{faNum(celebrate)} امتیاز</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">آفرین به خودت که می‌بالی 🌟</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────── task card ─────────────── */

function TaskCard({
  t,
  isOwner,
  showAssignee,
  isManager,
  onAct,
  onPause,
  onDelete,
}: {
  t: Task
  isOwner: boolean
  showAssignee: boolean
  isManager: boolean
  onAct: (t: Task, action: 'start' | 'done' | 'reopen') => void
  onPause: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const overdue = !!t.dueDate && t.status !== 'DONE' && t.dueDate < todayIso()
  const st = TASK_STATUSES[t.status] || TASK_STATUSES.OPEN
  const pr = PRIORITIES[t.priority] || PRIORITIES.NORMAL

  return (
    <div className={`glow-card flex flex-col rounded-2xl bg-white/85 p-4 ${t.status === 'DONE' ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none">{TYPE_ICON[t.type] || '📌'}</span>
          <div>
            <p className={`text-sm font-black leading-5 ${t.status === 'DONE' ? 'line-through decoration-[#0e7a4a]/50' : ''}`}>{t.title}</p>
            <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{TYPE_LABEL[t.type] || 'وظیفه'} • از {t.createdByName || 'سامانه'}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Pill label={pr.label} color={pr.color} />
          {isManager && showAssignee && (
            <button onClick={() => onDelete(t)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-[#fee2e2] hover:text-[#b3372f]" title="حذف وظیفه">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {t.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-foreground/75">{t.description}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        {t.dueDate && (
          <span className={`flex items-center gap-1 rounded-lg px-2 py-1 ${overdue ? 'bg-[#fee2e2] text-[#b3372f]' : t.dueToday ? 'bg-[#fdf6dd] text-[#8a6d10]' : 'bg-muted text-muted-foreground'}`}>
            📅 {formatJalaliFull(t.dueDate)}
            {t.dueToday && !overdue && ' — امروز!'}
            {overdue && ' — دیرکرد!'}
          </span>
        )}
        <span className="rounded-lg bg-[#fdf6dd] px-2 py-1 text-[#8a6d10]">+{faNum(t.points)} امتیاز</span>
        {showAssignee && <span className="rounded-lg bg-secondary px-2 py-1 text-secondary-foreground">👤 {t.assignedToName}</span>}
      </div>

      {t.status === 'PAUSED' && t.pauseNote && (
        <div className="mt-2 rounded-xl border border-[#c96f4a]/40 bg-[#fdf0ea] px-3 py-2 text-[11px] font-bold leading-5 text-[#a04c2a]">
          ⏸ توقف: {t.pauseNote}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
        <Pill label={st.label} color={st.color} />
        {t.completedAt && <span className="text-[10px] text-muted-foreground">✅ انجام شد</span>}
      </div>

      {isOwner && t.status !== 'DONE' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(t.status === 'OPEN' || t.status === 'PAUSED') && (
            <button onClick={() => onAct(t, 'start')} className="flex-1 rounded-xl bg-[#0e7a4a] py-2.5 text-xs font-extrabold text-white transition hover:brightness-110">
              ▶ شروع
            </button>
          )}
          {t.status === 'IN_PROGRESS' && (
            <button onClick={() => onPause(t)} className="flex-1 rounded-xl border border-[#c96f4a]/60 bg-white py-2.5 text-xs font-extrabold text-[#a04c2a] transition hover:bg-[#fdf0ea]">
              ⏸ توقف با ثبت مشکل
            </button>
          )}
          <button onClick={() => onAct(t, 'done')} className="flex-1 rounded-xl bg-[#c9a227] py-2.5 text-xs font-extrabold text-white transition hover:brightness-110">
            انجام شد! ✅
          </button>
        </div>
      )}
      {isOwner && t.status === 'DONE' && (
        <button onClick={() => onAct(t, 'reopen')} className="mt-3 w-full rounded-xl border border-border bg-white py-2.5 text-xs font-extrabold text-muted-foreground transition hover:border-primary/60 hover:text-foreground">
          ↩ دوباره بازکردن
        </button>
      )}
    </div>
  )
}

/* ─────────────── new task modal ─────────────── */

function TaskFormModal({ holidays, onClose, onSaved }: { holidays: Map<string, string>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', type: 'TASK', priority: 'NORMAL', assignedToId: '', dueDate: '', points: 10 })
  const [users, setUsers] = useState<UserLite[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ users: UserLite[] }>('/api/users')
      .then((d) => setUsers(d.users.filter((u) => u.active)))
      .catch(() => {})
  }, [])

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) return toast.error('عنوان وظیفه الزامی است')
    if (!form.assignedToId) return toast.error('انتخاب مسئول وظیفه الزامی است')
    setSaving(true)
    try {
      await api('/api/tasks', { method: 'POST', body: { ...form, points: Number(form.points) || 10 } })
      toast.success('وظیفه تعریف شد ✅')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="تعریف وظیفه جدید" onClose={onClose} wide>
      <Labeled label="عنوان وظیفه *">
        <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="مثلاً: چیدمان قفسه لبنیات طبقه دوم" className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </Labeled>

      <Labeled label="توضیح (اختیاری)">
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </Labeled>

      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نوع">
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(TYPE_ICON).map(([v, icon]) => (
              <button key={v} onClick={() => set('type', v)} className={form.type === v ? 'rounded-xl bg-primary px-1 py-2.5 text-[11px] font-extrabold text-white' : 'rounded-xl border px-1 py-2.5 text-[11px] font-bold hover:border-primary/60'}>
                <span className="block text-base leading-6">{icon}</span>
                {TYPE_LABEL[v]}
              </button>
            ))}
          </div>
        </Labeled>
        <Labeled label="اولویت">
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(PRIORITIES).map(([v, p]) => (
              <button
                key={v}
                onClick={() => set('priority', v)}
                className={form.priority === v ? 'rounded-xl px-1 py-2.5 text-[11px] font-extrabold text-white' : 'rounded-xl border px-1 py-2.5 text-[11px] font-bold hover:border-primary/60'}
                style={form.priority === v ? { background: p.color } : { color: p.color }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Labeled>
      </div>

      <Labeled label="مسئول وظیفه *" hint="فقط همکاران فعال در فهرست هستند">
        <select value={form.assignedToId} onChange={(e) => set('assignedToId', e.target.value)} className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
          <option value="">— انتخاب همکار —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] || u.role})</option>
          ))}
        </select>
      </Labeled>

      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="مهلت انجام" hint="اگر روی جمعه یا تعطیل رسمی بیفتد، سامانه هشدار می‌دهد">
          <JalaliDatePicker value={form.dueDate} onChange={(iso) => set('dueDate', iso)} holidays={holidays} minDate={todayIso()} />
        </Labeled>
        <Labeled label="امتیاز انجام" hint="با اتمام وظیفه، خودکار به همکار داده می‌شود">
          <input
            type="number"
            min={0}
            value={form.points}
            onChange={(e) => set('points', Number(e.target.value))}
            className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Labeled>
      </div>

      <button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60">
        {saving ? 'در حال ثبت…' : 'ثبت وظیفه ✅'}
      </button>
    </Modal>
  )
}
