'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliFull } from '@/lib/jalali'
import {
  SectionCard, Pill, EmptyState, Labeled, SearchInput, stockStatus, CATEGORY_EMOJI,
} from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { cn } from '@/lib/utils'
import {
  ArrowRight, Info, LayoutGrid, Minus, Monitor, Move, Plus, Save, Send, Trash2, Truck, X, ZoomIn, ZoomOut,
} from 'lucide-react'

type PmProduct = {
  id: string; name: string; stock: number; reorderLevel: number; imageUrl: string
  category: string; sellPrice?: number; sales30?: number
}
/** سلول ذخیره‌شده: رشتهٔ productId (قرارداد قدیمی) | null | { id, qty } */
type CellVal = string | null | { id: string; qty?: number }
/** فیسینگ نرمال‌شدهٔ ادیتور */
type Facing = { id: string; qty: number } | null
type Planogram = {
  id: string; name: string; section: string; rows: number; cols: number
  layout: CellVal[][]; layoutFull?: CellVal[][]; status: string; cells: number
}

const PL_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'پیش‌نویس', color: '#6b7280' },
  PUBLISHED: { label: 'منتشرشده', color: '#0e7a4a' },
  ARCHIVE: { label: 'آرشیو', color: '#8a5a2b' },
}
const MANAGERS = ['GM', 'PM', 'OM']

/* ── هندسهٔ بوم قفسه (px) — مختصات صریح LTR، مستقل از جهت سند ── */
const FACING_W = 44
const FACING_H = 84
const BOARD_H = 12
const ROW_GAP = 18
const ROW_PITCH = FACING_H + BOARD_H + ROW_GAP
const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.6
const ZOOM_STEP = 0.2
const WOOD_BG = 'linear-gradient(180deg,#ead9b4 0%,#dcc79a 55%,#c9b17e 100%)'
const GOLD_RAIL = 'linear-gradient(90deg,#b8901f,#e2c25c,#c9a227,#e2c25c,#b8901f)'
const PRICE_RAIL = 'linear-gradient(90deg,#c9a22726,#e2c25c4d,#c9a22726)'

/** رنگ پایدار برای هر دستهٔ کالا (پالت برند — بدون آبی) */
const CAT_PALETTE = ['#0e7a4a', '#77934a', '#c9a227', '#c96f4a', '#b3372f', '#8a5a2b', '#5c7236', '#a16207']
function catColor(cat: string): string {
  let h = 0
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0
  return CAT_PALETTE[h % CAT_PALETTE.length]
}

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10))

function toFacing(cell: CellVal): Facing {
  if (typeof cell === 'string' && cell) return { id: cell, qty: 1 }
  if (cell && typeof cell === 'object' && typeof cell.id === 'string' && cell.id)
    return { id: cell.id, qty: Math.min(99, Math.max(1, Math.round(Number(cell.qty) || 1))) }
  return null
}

/** normalize layout matrix to exact rows×cols facings (API may return ragged/empty) */
function normalizeFacing(layout: CellVal[][] | undefined, rows: number, cols: number): Facing[][] {
  const out: Facing[][] = []
  for (let r = 0; r < rows; r++) {
    const row: Facing[] = []
    for (let c = 0; c < cols; c++) row.push(toFacing(layout?.[r]?.[c] ?? null))
    out.push(row)
  }
  return out
}

/** ذخیره: qty=1 → رشتهٔ ساده (سازگار با FloorPlan)، غیر از آن → شیء */
function serializeFacing(f: Facing): CellVal {
  if (!f) return null
  return f.qty === 1 ? f.id : { id: f.id, qty: f.qty }
}

/** ماتریس رشته‌ای قدیمی برای پیش‌نمایش فهرست */
function normalize(layout: CellVal[][] | undefined, rows: number, cols: number): (string | null)[][] {
  const out: (string | null)[][] = []
  for (let r = 0; r < rows; r++) {
    const row: (string | null)[] = []
    for (let c = 0; c < cols; c++) {
      const cell = layout?.[r]?.[c]
      row.push(typeof cell === 'string' ? cell || null : cell && typeof cell === 'object' ? cell.id || null : null)
    }
    out.push(row)
  }
  return out
}

export default function PlanogramView({ ctx }: { ctx: AppCtx }) {
  const isManager = MANAGERS.includes(ctx.user!.role)

  const [plans, setPlans] = useState<Planogram[]>([])
  const [pmap, setPmap] = useState<Record<string, PmProduct>>({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Facing[][]>([])
  const [busy, setBusy] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [pickerCell, setPickerCell] = useState<{ r: number; c: number } | null>(null)
  const [clearCell, setClearCell] = useState<{ r: number; c: number } | null>(null)
  const [detailCell, setDetailCell] = useState<{ r: number; c: number } | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [skId, setSkId] = useState<string | null>(null)
  // انتخاب برای جابه‌جایی (لمسی) + درگ (دسکتاپ) + بزرگ‌نمایی
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null)
  const [moveSrc, setMoveSrc] = useState<{ r: number; c: number } | null>(null)
  const [dragSrc, setDragSrc] = useState<{ r: number; c: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ r: number; c: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const canvasOuterRef = useRef<HTMLDivElement>(null)
  // نمای مانیتورینگ تمام‌صفحه (راند ۱۹)
  const [monitorId, setMonitorId] = useState<string | null>(null)
  const [chooserOpen, setChooserOpen] = useState(false)

  const editing = plans.find((p) => p.id === editingId) || null
  const editCols = editing?.cols ?? 0
  const monitorPlan = plans.find((p) => p.id === monitorId) || null
  const monitorOverlay = monitorPlan ? (
    <MonitorOverlay plan={monitorPlan} pmap={pmap} onClose={() => setMonitorId(null)} />
  ) : null

  const load = async () => {
    try {
      const d = await api<{ planograms: Planogram[]; productMap: Record<string, PmProduct> }>('/api/planograms')
      setPlans(d.planograms || [])
      setPmap(d.productMap || {})
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // enter editor → fresh draft copy
  useEffect(() => {
    if (editing) setDraft(normalizeFacing(editing.layoutFull ?? editing.layout, editing.rows, editing.cols))
    setSel(null); setMoveSrc(null); setDragSrc(null); setDragOver(null); setDetailCell(null); setPickerCell(null); setClearCell(null)
  }, [editingId])

  // بزرگ‌نمایی اولیه: اگر بوم در عرض صفحه جا شود ۱۰۰٪، وگرنه کوچک تا بدون اسکرول افقی بیفتد
  useEffect(() => {
    if (!editingId) return
    const el = canvasOuterRef.current
    const need = editCols * FACING_W
    if (!el || need <= 0) { setZoom(1); return }
    const avail = el.clientWidth - 26
    const fit = avail > 0 ? Math.floor((avail / need) * 10) / 10 : 1
    setZoom(Math.max(ZOOM_MIN, Math.min(1, fit)))
  }, [editingId, editCols])

  const dirty = useMemo(
    () =>
      !!editing &&
      JSON.stringify(draft) !==
        JSON.stringify(normalizeFacing(editing.layoutFull ?? editing.layout, editing.rows, editing.cols)),
    [editing, draft]
  )

  const filledCount = useMemo(() => draft.flat().filter(Boolean).length, [draft])
  const unitCount = useMemo(() => draft.flat().reduce((s, f) => s + (f?.qty || 0), 0), [draft])

  /** red / yellow / green product counts for the open planogram */
  const tally = useMemo(() => {
    const t: Record<'red' | 'yellow' | 'green', number> = { red: 0, yellow: 0, green: 0 }
    for (const row of draft) {
      for (const f of row) {
        if (!f) continue
        const p = pmap[f.id]
        if (!p) continue
        t[stockStatus(p.stock, p.reorderLevel).key]++
      }
    }
    return t
  }, [draft, pmap])

  const saveLayout = async () => {
    if (!editing || busy) return
    setBusy(true)
    try {
      await api(`/api/planograms/${editing.id}`, {
        method: 'PATCH',
        body: { layout: draft.map((row) => row.map(serializeFacing)) },
      })
      toast.success('چیدمان ذخیره شد ✅')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!editing || busy) return
    setBusy(true)
    try {
      await api(`/api/planograms/${editing.id}`, { method: 'PATCH', body: { status: 'PUBLISHED' } })
      toast.success('پلانوگرام برای چیدمان‌دارها منتشر شد 📣')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const removePlan = async () => {
    if (!editing || busy) return
    setBusy(true)
    try {
      await api(`/api/planograms/${editing.id}`, { method: 'DELETE' })
      toast.success('پلانوگرام حذف شد 🗑️')
      setConfirmDel(false)
      setEditingId(null)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  /** merchandiser → storekeeper refill request */
  const requestRefill = async (product: PmProduct, planName: string) => {
    let sk = skId
    if (!sk) {
      try {
        const d = await api<{ users: { id: string; role: string; active: boolean }[] }>('/api/users')
        sk = d.users.find((u) => u.role === 'SK' && u.active)?.id || null
        if (sk) setSkId(sk)
      } catch (e: any) {
        toast.error(e.message)
        return
      }
    }
    if (!sk) {
      toast.error('کاربر «سرپرست انبار» در سامانه یافت نشد')
      return
    }
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: {
          title: `تأمین ${product.name} برای قفسه ${planName}`,
          assignedToId: sk,
          type: 'TASK',
          priority: 'HIGH',
          description: 'درخواست از پلانوگرام',
        },
      })
      toast.success('درخواست برای انبار ارسال شد 📦')
      ctx.refreshNotifications()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const setFacing = (r: number, c: number, f: Facing) =>
    setDraft((d) => d.map((row, ri) => (ri !== r ? row : row.map((x, ci) => (ci === c ? f : x)))))

  /** جابه‌جایی/تعویض دو فیسینگ (مقصد خالی = انتقال، پر = تعویض) */
  const moveCells = (src: { r: number; c: number }, dst: { r: number; c: number }) => {
    if (src.r === dst.r && src.c === dst.c) return false
    setDraft((d) => {
      const next = d.map((row) => [...row])
      const a = next[src.r]?.[src.c] ?? null
      const b = next[dst.r]?.[dst.c] ?? null
      if (!a) return d
      next[dst.r][dst.c] = a
      next[src.r][src.c] = b
      return next
    })
    return true
  }

  const handleFacingTap = (r: number, c: number) => {
    const f = draft[r]?.[c] || null
    if (!isManager) {
      if (f) setDetailCell({ r, c })
      return
    }
    if (moveSrc) {
      const moved = moveCells(moveSrc, { r, c })
      if (moved) toast.success('کالا جابه‌جا شد — برای ثبت «ذخیره چیدمان» را بزنید')
      setMoveSrc(null)
      setSel(null)
      return
    }
    if (f) setSel(sel && sel.r === r && sel.c === c ? null : { r, c })
    else setPickerCell({ r, c })
  }

  /* ── HTML5 drag & drop (دسکتاپ) — hit-area با transform مقیاس می‌شود ── */
  const onDragStartCell = (e: DragEvent, r: number, c: number) => {
    if (!isManager || !draft[r]?.[c]) { e.preventDefault(); return }
    e.dataTransfer.setData('text/plain', `${r}:${c}`)
    e.dataTransfer.effectAllowed = 'move'
    setDragSrc({ r, c })
    setSel(null)
  }
  const onDragOverCell = (e: DragEvent, r: number, c: number) => {
    if (!isManager || !dragSrc) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver({ r, c })
  }
  const onDropCell = (e: DragEvent, r: number, c: number) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('text/plain') || ''
    const [sr, sc] = raw.split(':').map(Number)
    const src = dragSrc || (Number.isFinite(sr) && Number.isFinite(sc) ? { r: sr, c: sc } : null)
    if (src && draft[src.r]?.[src.c]) {
      const moved = moveCells(src, { r, c })
      if (moved) toast.success('کالا جابه‌جا شد — برای ثبت «ذخیره چیدمان» را بزنید')
    }
    setDragSrc(null)
    setDragOver(null)
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">در حال بارگذاری پلانوگرام‌ها…</div>
  }

  /* ─────────────────────────── EDITOR ─────────────────────────── */
  if (editing) {
    const st = PL_STATUS[editing.status] || PL_STATUS.DRAFT
    const canvasW = Math.max(1, editing.cols) * FACING_W
    const canvasH = Math.max(1, editing.rows) * ROW_PITCH
    const selProduct = sel ? pmap[draft[sel.r]?.[sel.c]?.id || ''] : undefined
    const detailFacing = detailCell ? draft[detailCell.r]?.[detailCell.c] || null : null
    const detailProduct = detailFacing ? pmap[detailFacing.id] : undefined
    const clearProduct = clearCell ? pmap[draft[clearCell.r]?.[clearCell.c]?.id || ''] : undefined

    return (
      <div className="space-y-4">
        <style dangerouslySetInnerHTML={{
          __html: `@media print{.plano-noprint{display:none!important}.plano-print-card{box-shadow:none!important;background:#fff!important}.plano-canvas-outer{overflow:visible!important;max-height:none!important;background:#fff!important;border-color:#d4c9a8!important}}`,
        }} />

        {/* editor header */}
        <div className="glow-card fade-in-up flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingId(null)}
              className="plano-noprint flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white/80 text-foreground/70 hover:border-primary/50"
              title="بازگشت به فهرست"
              aria-label="بازگشت به فهرست"
            >
              <ArrowRight size={16} />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-black text-foreground sm:text-lg">{editing.name}</h1>
                <Pill label={st.label} color={st.color} />
                {dirty && <Pill label="تغییرات ذخیره‌نشده" color="#a16207" />}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {editing.section && <>قسمت: {editing.section} • </>}
                {faNum(editing.rows)} قفسه × {faNum(editing.cols)} فیسینگ • {faNum(filledCount)} فیسینگ پر • {faNum(unitCount)} عدد کالا
              </p>
            </div>
          </div>
          <div className="plano-noprint flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMonitorId(editing.id)}
              className="flex items-center gap-1.5 rounded-xl border border-[#c9a227]/50 bg-[#c9a227]/10 px-4 py-2.5 text-xs font-extrabold text-[#8a6d10]"
              title="نمایش بزرگ و رنگی قفسه روی مانیتور سالن — برای چیدمان‌دارها"
            >
              <Monitor size={14} /> نمای مانیتورینگ 🖥️
            </button>
            {isManager && (
              <>
                <button
                  onClick={saveLayout}
                  disabled={!dirty || busy}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-40"
                >
                  <Save size={14} /> ذخیره چیدمان
                </button>
                {editing.status !== 'PUBLISHED' && (
                  <button
                    onClick={publish}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-xl bg-[#77934a] px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-40"
                  >
                    <Send size={14} /> انتشار برای چیدمان‌دارها
                  </button>
                )}
                <button
                  onClick={() => setConfirmDel(true)}
                  disabled={busy}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b3372f]/10 text-[#b3372f] hover:bg-[#b3372f]/20"
                  title="حذف پلانوگرام"
                  aria-label="حذف پلانوگرام"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* grid */}
        <SectionCard
          title="شبکهٔ قفسه"
          subtitle={
            isManager
              ? 'کالا را بکشید و رها کنید یا لمس کنید و مقصد را بزنید • «+» = افزودن کالا • تعداد و حذف از دکمهٔ «جزئیات»'
              : 'روی هر کالا بزنید تا جزئیات و دکمهٔ «درخواست از انبار» را ببینید'
          }
          icon={<LayoutGrid size={18} />}
        >
          {/* summary strip */}
          <div className="plano-noprint mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-[#b3372f]/10 px-3 py-1.5 text-[#b3372f]">
              ● کمبود جدی: {faNum(tally.red)}
            </span>
            <span className="rounded-full bg-[#b8860b]/10 px-3 py-1.5 text-[#8a6d10]">
              ● رو به اتمام: {faNum(tally.yellow)}
            </span>
            <span className="rounded-full bg-[#0e7a4a]/10 px-3 py-1.5 text-[#0e7a4a]">
              ● موجودی مناسب: {faNum(tally.green)}
            </span>
            <span className="rounded-full bg-[#c96f4a]/10 px-3 py-1.5 text-[#c96f4a]" title="کالاهای قفسه با ۸ فروش یا بیشتر در ۳۰ روز اخیر">
              🔥 پرفروش: {faNum(draft.flat().filter((f) => f && pmap[f.id] && (pmap[f.id].sales30 || 0) >= 8).length)}
            </span>
            <span className="mr-auto text-[9px] font-bold text-muted-foreground">
              نوار رنگی = موجودی • نقطهٔ رنگی = دسته • نوار طلایی = قیمت • ×۲ = تعداد فیسینگ
            </span>
          </div>

          {/* zoom toolbar */}
          {isManager && (
            <div className="plano-noprint mb-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-border bg-white/80 p-1">
                <button
                  onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
                  disabled={zoom <= ZOOM_MIN + 0.001}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-muted disabled:opacity-30"
                  title="کوچک‌نمایی"
                  aria-label="کوچک‌نمایی"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="min-w-12 rounded-lg px-1 text-center text-[10px] font-black text-foreground/80 hover:bg-muted"
                  title="بازنشانی بزرگ‌نمایی به ۱۰۰٪"
                >
                  {faNum(Math.round(zoom * 100))}٪
                </button>
                <button
                  onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                  disabled={zoom >= ZOOM_MAX - 0.001}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-muted disabled:opacity-30"
                  title="بزرگ‌نمایی"
                  aria-label="بزرگ‌نمایی"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
              <span className="text-[9px] font-bold text-muted-foreground">بزرگ‌نمایی ۶۰٪ تا ۱۶۰٪ — برای بازگشت روی درصد بزنید</span>
            </div>
          )}

          {/* empty planogram (no shelf rows) */}
          {editing.rows < 1 || editing.cols < 1 ? (
            <EmptyState
              emoji="🧱"
              title="قفسه‌ای بسازید تا کالاها را بچینید"
              hint="این پلانوگرام ردیف یا فیسینگی ندارد — از دکمهٔ «پلانوگرام جدید» یک قفسه با ردیف و فیسینگ بسازید"
            />
          ) : (
            <div
              ref={canvasOuterRef}
              className="plano-canvas-outer scroll-gold overflow-x-auto rounded-2xl border border-border/70 p-3 shadow-inner"
              style={{ background: 'linear-gradient(180deg,#f7f2e3,#efe7d2)' }}
            >
              {/* جعبهٔ مقیاس‌شده: ابعاد بیرونی = بوم × بزرگ‌نمایی تا hit-area درست بماند */}
              <div className="relative" style={{ width: Math.round(canvasW * zoom), height: Math.round(canvasH * zoom) }}>
                {/* بوم LTR با مختصات صریح left/top — مستقل از RTL سند؛ متن‌ها داخل فیسینگ RTL هستند */}
                <div
                  dir="ltr"
                  className="absolute left-0 top-0 origin-top-left"
                  style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})` }}
                >
                  {draft.map((row, ri) => {
                    const rowFilled = row.filter(Boolean).length
                    return (
                      <div
                        key={ri}
                        className="fade-in-up absolute left-0"
                        style={{ top: ri * ROW_PITCH, width: canvasW, height: FACING_H + BOARD_H, animationDelay: `${ri * 45}ms` }}
                      >
                        {/* لایهٔ فیسینگ‌ها — position صریح */}
                        <div className="relative" style={{ height: FACING_H, width: canvasW }}>
                          {row.map((f, ci) => {
                            const p = f ? pmap[f.id] : undefined
                            const ss = p ? stockStatus(p.stock, p.reorderLevel) : null
                            const isSelected = !!sel && sel.r === ri && sel.c === ci
                            const isMoveSrc = !!moveSrc && moveSrc.r === ri && moveSrc.c === ci
                            const isDragOver = !!dragOver && dragOver.r === ri && dragOver.c === ci
                            const isDragSrc = !!dragSrc && dragSrc.r === ri && dragSrc.c === ci
                            return (
                              <div
                                key={ci}
                                dir="rtl"
                                title={p ? `${p.name} — موجودی ${faNum(p.stock)} (${ss?.label})${(p.sales30 || 0) >= 3 ? ` • فروش ماه: ${faNum(p.sales30 || 0)}` : ''}${f && f.qty > 1 ? ` • ${faNum(f.qty)} عدد روی قفسه` : ''}` : 'خانهٔ خالی'}
                                draggable={isManager && !!p}
                                onDragStart={(e) => onDragStartCell(e, ri, ci)}
                                onDragOver={(e) => onDragOverCell(e, ri, ci)}
                                onDragEnd={() => { setDragSrc(null); setDragOver(null) }}
                                onDrop={(e) => onDropCell(e, ri, ci)}
                                onClick={() => handleFacingTap(ri, ci)}
                                className={cn(
                                  'absolute flex select-none flex-col items-center overflow-hidden rounded-lg border transition',
                                  isManager && (p ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'),
                                  p
                                    ? 'border-border bg-white/90 shadow-sm hover:border-primary/60 hover:shadow-md'
                                    : cn(
                                        'border-dashed bg-white/40',
                                        isManager ? 'border-border/80' : 'border-border/60',
                                        moveSrc && isManager && 'border-solid border-primary/50 bg-primary/5'
                                      ),
                                  isSelected && 'ring-2 ring-[#c9a227] ring-offset-1',
                                  isMoveSrc && 'border-2 border-dashed border-[#0e7a4a] opacity-70',
                                  isDragOver && 'ring-2 ring-[#c96f4a] bg-[#c96f4a]/10',
                                  isDragSrc && 'opacity-40',
                                  p && (p.sales30 || 0) >= 8 && 'ring-1 ring-[#c96f4a]/60'
                                )}
                                style={{ left: ci * FACING_W + 1, top: 1, width: FACING_W - 2, height: FACING_H - 2 }}
                              >
                                {p ? (
                                  <>
                                    {(p.sales30 || 0) >= 8 && (
                                      <span className="fire-pulse absolute left-0.5 top-0.5 rounded-full bg-[#c96f4a]/90 px-1 text-[7px] shadow-sm" title="پرفروش — ۸ عدد یا بیشتر در ماه">🔥</span>
                                    )}
                                    {f && f.qty > 1 && (
                                      <span className="absolute right-0.5 top-0.5 rounded bg-[#77934a] px-1 py-px text-[7px] font-black leading-3 text-white" title={`${faNum(f.qty)} عدد در این فیسینگ`}>×{faNum(f.qty)}</span>
                                    )}
                                    <span className="mt-1.5 text-[15px] leading-none">{CATEGORY_EMOJI[p.category] || '📦'}</span>
                                    <span className="w-full truncate px-0.5 text-center text-[8px] font-bold leading-[10px] text-foreground/90">{p.name}</span>
                                    <span className="text-[7.5px] font-black leading-3" style={{ color: ss?.color }}>
                                      {faNum(p.stock)} عدد
                                    </span>
                                    <span
                                      className="h-1.5 w-1.5 rounded-full ring-1 ring-black/10"
                                      style={{ background: catColor(p.category) }}
                                      title={`دسته: ${p.category}`}
                                    />
                                    {/* نوار وضعیت موجودی + ریل طلایی قیمت (لبهٔ قفسه) */}
                                    <span className="absolute inset-x-0 bottom-[12px] h-[3px]" style={{ background: ss?.color || '#6b7280' }} />
                                    <span
                                      className="absolute inset-x-0 bottom-0 flex h-[12px] items-center justify-center border-t border-[#c9a227]/40 text-[7px] font-black text-[#8a6d10]"
                                      style={{ background: PRICE_RAIL }}
                                      title={(p.sellPrice || 0) > 0 ? `قیمت: ${faMoney(p.sellPrice)} تومان` : 'بدون قیمت'}
                                    >
                                      {(p.sellPrice || 0) > 0 ? faMoney(p.sellPrice) : '—'}
                                    </span>
                                  </>
                                ) : isManager ? (
                                  <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-muted-foreground/60">
                                    <Plus size={13} />
                                    <span className="text-[8px] font-bold">افزودن</span>
                                  </span>
                                ) : (
                                  <span className="flex h-full w-full flex-col items-center justify-center text-muted-foreground/40">
                                    <span className="text-[8px] font-bold">خالی</span>
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {/* تختهٔ چوبی قفسه + ریل طلایی لیبل */}
                        <div
                          className="relative rounded-[4px] border border-[#b99e69]"
                          style={{ height: BOARD_H, width: canvasW + 12, marginInline: -6, background: WOOD_BG }}
                        >
                          <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-[4px]" style={{ background: GOLD_RAIL }} />
                          <span dir="rtl" className="absolute right-1.5 top-[2px] text-[7.5px] font-black leading-[8px] text-[#7a5a28]">
                            قفسهٔ {faNum(ri + 1)}
                          </span>
                          {canvasW >= 190 && (
                            <span dir="rtl" className="absolute left-1.5 top-[2px] text-[7.5px] font-black leading-[8px] text-[#8a6d10]/80">
                              {faNum(rowFilled)} کالا
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* hint: empty planogram with rows but zero products */}
          {editing.rows >= 1 && editing.cols >= 1 && filledCount === 0 && isManager && (
            <p className="plano-noprint mt-3 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-center text-[11px] font-bold text-muted-foreground">
              همهٔ فیسینگ‌ها خالی است — روی «+ افزودن» هر خانه بزنید و کالا بگذارید 🧺
            </p>
          )}

          {/* move-mode hint bar */}
          {moveSrc && (
            <div className="plano-noprint mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#0e7a4a]/40 bg-[#0e7a4a]/10 p-2.5">
              <p className="text-[11px] font-black text-[#0e7a4a]">
                حالا خانهٔ مقصد را لمس کنید (خانهٔ پر = تعویض جای دو کالا) — لمس همان خانه = لغو
              </p>
              <button onClick={() => setMoveSrc(null)} className="rounded-lg border border-border bg-white/80 px-3 py-1.5 text-[10px] font-bold">
                لغو جابه‌جایی
              </button>
            </div>
          )}

          {/* selected-facing action bar */}
          {!moveSrc && sel && isManager && (
            <div className="plano-noprint mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#c9a227]/50 bg-[#c9a227]/10 p-2.5">
              <span className="text-xl leading-none">{selProduct ? CATEGORY_EMOJI[selProduct.category] || '📦' : '📦'}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-black text-foreground">
                {selProduct ? selProduct.name : 'کالای ناشناس'}
              </span>
              <button
                onClick={() => { setMoveSrc(sel); setSel(null) }}
                className="flex items-center gap-1 rounded-lg bg-[#77934a] px-3 py-1.5 text-[10px] font-black text-white hover:opacity-90"
              >
                <Move size={12} /> جابه‌جایی
              </button>
              <button
                onClick={() => { setDetailCell(sel); setSel(null) }}
                className="flex items-center gap-1 rounded-lg border border-border bg-white/80 px-3 py-1.5 text-[10px] font-black text-foreground/80 hover:border-primary/50"
              >
                <Info size={12} /> جزئیات
              </button>
              <button
                onClick={() => { setClearCell(sel); setSel(null) }}
                className="flex items-center gap-1 rounded-lg bg-[#b3372f]/10 px-3 py-1.5 text-[10px] font-black text-[#b3372f] hover:bg-[#b3372f]/20"
              >
                <Trash2 size={12} /> خالی‌کردن
              </button>
              <button
                onClick={() => setSel(null)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                title="بستن"
                aria-label="بستن نوار انتخاب"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </SectionCard>

        {/* facing detail modal */}
        {detailCell && (
          <Modal title="فیسینگ قفسه" onClose={() => setDetailCell(null)}>
            {detailFacing ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                  <span className="text-2xl">{detailProduct ? CATEGORY_EMOJI[detailProduct.category] || '📦' : '📦'}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{detailProduct ? detailProduct.name : 'کالای ناشناس'}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      {detailProduct && (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ background: catColor(detailProduct.category) }} />
                            {detailProduct.category}
                          </span>
                          {' • '}
                          <span style={{ color: stockStatus(detailProduct.stock, detailProduct.reorderLevel).color }}>
                            {faNum(detailProduct.stock)} عدد — {stockStatus(detailProduct.stock, detailProduct.reorderLevel).label}
                          </span>
                          {(detailProduct.sellPrice || 0) > 0 && <> • {faMoney(detailProduct.sellPrice)} تومان</>}
                          {(detailProduct.sales30 || 0) >= 3 && <> • فروش ماه: {faNum(detailProduct.sales30 || 0)}</>}
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {isManager && (
                  <div className="flex items-center justify-between rounded-xl border border-border bg-white/80 p-2">
                    <span className="text-[11px] font-bold text-foreground/80">تعداد در این فیسینگ</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => detailFacing && setFacing(detailCell.r, detailCell.c, { id: detailFacing.id, qty: Math.max(1, detailFacing.qty - 1) })}
                        disabled={!detailFacing || detailFacing.qty <= 1}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground/80 hover:bg-border disabled:opacity-30"
                        title="کم کردن"
                        aria-label="کم کردن تعداد"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="min-w-10 text-center text-sm font-black">{faNum(detailFacing?.qty || 1)}</span>
                      <button
                        onClick={() => detailFacing && setFacing(detailCell.r, detailCell.c, { id: detailFacing.id, qty: Math.min(99, detailFacing.qty + 1) })}
                        disabled={!detailFacing || detailFacing.qty >= 99}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground/80 hover:bg-border disabled:opacity-30"
                        title="اضافه کردن"
                        aria-label="اضافه کردن تعداد"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {isManager ? (
                    <>
                      <button
                        onClick={() => { setPickerCell({ r: detailCell.r, c: detailCell.c }); setDetailCell(null) }}
                        className="flex-1 rounded-xl bg-[#77934a] py-2.5 text-xs font-extrabold text-white"
                      >
                        تغییر کالا
                      </button>
                      <button
                        onClick={() => { setClearCell({ r: detailCell.r, c: detailCell.c }); setDetailCell(null) }}
                        className="flex-1 rounded-xl bg-[#b3372f] py-2.5 text-xs font-extrabold text-white"
                      >
                        خالی‌کردن خانه
                      </button>
                    </>
                  ) : (
                    detailProduct && (
                      <button
                        onClick={() => { requestRefill(detailProduct, editing.name); setDetailCell(null) }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#77934a] py-2.5 text-xs font-extrabold text-white"
                      >
                        <Truck size={14} /> درخواست از انبار
                      </button>
                    )
                  )}
                </div>
                {isManager && <p className="text-center text-[11px] text-muted-foreground">تغییرات پس از «ذخیره چیدمان» ثبت می‌شود</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">این خانه خالی است.</p>
            )}
          </Modal>
        )}

        {/* clear cell modal (managers) */}
        {clearCell && (
          <Modal title="خانهٔ قفسه" onClose={() => setClearCell(null)}>
            {clearProduct ? (
              <>
                <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                  <span className="text-2xl">{CATEGORY_EMOJI[clearProduct.category] || '📦'}</span>
                  <div>
                    <p className="text-sm font-black">{clearProduct.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      موجودی {faNum(clearProduct.stock)} — {stockStatus(clearProduct.stock, clearProduct.reorderLevel).label}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setFacing(clearCell.r, clearCell.c, null); setClearCell(null); setSel(null) }}
                  className="w-full rounded-xl bg-[#b3372f] py-2.5 text-xs font-extrabold text-white"
                >
                  خالی‌کردن خانه
                </button>
                <p className="text-center text-[11px] text-muted-foreground">تغییر پس از «ذخیره چیدمان» ثبت می‌شود</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">این خانه خالی است.</p>
            )}
          </Modal>
        )}

        {/* product picker modal (managers) */}
        {pickerCell && (
          <ProductPicker
            pmap={pmap}
            onPick={(pid) => {
              setFacing(pickerCell.r, pickerCell.c, { id: pid, qty: 1 })
              setPickerCell(null)
              setSel(null)
            }}
            onClose={() => setPickerCell(null)}
          />
        )}

        {/* delete confirm */}
        {confirmDel && (
          <Modal title="حذف پلانوگرام" onClose={() => setConfirmDel(false)}>
            <p className="text-sm text-foreground/80">
              «{editing.name}» و کل چیدمان آن برای همیشه حذف می‌شود. مطمئن هستید؟
            </p>
            <div className="flex gap-2">
              <button
                onClick={removePlan}
                disabled={busy}
                className="flex-1 rounded-xl bg-[#b3372f] py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
              >
                حذف قطعی
              </button>
              <button onClick={() => setConfirmDel(false)} className="flex-1 rounded-xl border py-2.5 text-xs font-bold">
                انصراف
              </button>
            </div>
          </Modal>
        )}

        {monitorOverlay}
      </div>
    )
  }

  /* ─────────────────────────── LIST ─────────────────────────── */
  return (
    <div className="space-y-4">
      <SectionCard
        title="پلانوگرام قفسه‌ها"
        subtitle={
          isManager
            ? 'طراحی چیدمان قفسه‌ها (ردیف × فیسینگ)، انتشار برای چیدمان‌دارها و پایش موجودی هر خانه'
            : 'چیدمان قفسه‌ها را ببینید و برای تأمین هر کالا از انبار درخواست بفرستید'
        }
        icon={<LayoutGrid size={18} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (plans.length === 1) setMonitorId(plans[0].id)
                else if (plans.length > 1) setChooserOpen(true)
              }}
              disabled={plans.length === 0}
              className="plano-noprint flex items-center gap-1.5 rounded-xl border border-[#c9a227]/50 bg-[#c9a227]/10 px-4 py-2.5 text-xs font-extrabold text-[#8a6d10] disabled:opacity-40"
              title="نمایش بزرگ و رنگی قفسه‌ها روی مانیتور سالن — برای چیدمان‌دارها"
            >
              <Monitor size={14} /> نمای مانیتورینگ 🖥️
            </button>
            {isManager && (
              <button
                onClick={() => setNewOpen(true)}
                className="plano-noprint flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white"
              >
                <Plus size={14} /> پلانوگرام جدید
              </button>
            )}
          </div>
        }
      >
        {plans.length === 0 ? (
          <EmptyState
            emoji="🧱"
            title="پلانوگرامی ثبت نشده"
            hint={isManager ? 'با دکمهٔ «پلانوگرام جدید» اولین چیدمان قفسه را بسازید' : 'هنوز مدیریتی پلانوگرامی منتشر نکرده است'}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((pl, idx) => {
              const st = PL_STATUS[pl.status] || PL_STATUS.DRAFT
              const norm = normalize(pl.layout, pl.rows, pl.cols)
              const red = norm.flat().filter((id) => id && pmap[id] && stockStatus(pmap[id].stock, pmap[id].reorderLevel).key === 'red').length
              const green = norm.flat().filter((id) => id && pmap[id] && stockStatus(pmap[id].stock, pmap[id].reorderLevel).key === 'green').length
              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setEditingId(pl.id)}
                  className="glow-card fade-in-up rounded-2xl bg-card p-4 text-right transition-all hover:-translate-y-0.5"
                  style={{ animationDelay: `${Math.min(idx * 45, 360)}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-foreground">{pl.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {pl.section ? `قسمت: ${pl.section} • ` : ''}
                        {faNum(pl.rows)} قفسه × {faNum(pl.cols)} فیسینگ • {faNum(pl.cells)} کالا
                      </p>
                    </div>
                    <Pill label={st.label} color={st.color} />
                  </div>
                  {/* mini preview */}
                  <div className="mt-3 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${pl.cols}, 1fr)`, maxWidth: 150 }}>
                    {norm.flat().map((id, i) => {
                      const p = id ? pmap[id] : undefined
                      return (
                        <span
                          key={i}
                          className="h-1.5 rounded-sm"
                          style={{ background: p ? stockStatus(p.stock, p.reorderLevel).color : '#e7e1cf' }}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                    <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[#b3372f]">قرمز {faNum(red)}</span>
                    <span className="rounded-full bg-[#0e7a4a]/10 px-2 py-0.5 text-[#0e7a4a]">سبز {faNum(green)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>

      {newOpen && (
        <NewPlanogramModal
          onClose={() => setNewOpen(false)}
          onCreated={async (id) => { setNewOpen(false); await load(); setEditingId(id) }}
        />
      )}

      {/* انتخاب پلانوگرام برای نمای مانیتورینگ */}
      {chooserOpen && (
        <Modal title="نمای مانیتورینگ — انتخاب پلانوگرام" onClose={() => setChooserOpen(false)}>
          <div className="scroll-gold max-h-[50vh] space-y-1.5 overflow-y-auto pl-1">
            {plans.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => {
                  setChooserOpen(false)
                  setMonitorId(pl.id)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-white/80 p-3 text-right transition hover:border-primary/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-foreground">{pl.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {pl.section ? `${pl.section} • ` : ''}{faNum(pl.rows)} قفسه × {faNum(pl.cols)} فیسینگ
                  </span>
                </span>
                <Monitor size={16} className="shrink-0 text-[#8a6d10]" />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {monitorOverlay}
    </div>
  )
}

/* ─────────────────────────── new planogram modal ─────────────────────────── */
function NewPlanogramModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: '', section: '', rows: '3', cols: '6' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return toast.error('نام پلانوگرام الزامی است')
    const rows = Math.min(12, Math.max(1, Number(form.rows) || 3))
    const cols = Math.min(40, Math.max(1, Number(form.cols) || 6))
    setBusy(true)
    try {
      const res = await api<{ planogram: Planogram }>('/api/planograms', {
        method: 'POST',
        body: { name: form.name.trim(), section: form.section.trim(), rows, cols },
      })
      toast.success('پلانوگرام ساخته شد — حالا فیسینگ‌ها را پر کنید 🧱')
      onCreated(res.planogram.id)
    } catch (e: any) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="پلانوگرام جدید" onClose={onClose}>
      <Labeled label="نام پلانوگرام *">
        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="مثلاً: قفسه لبنیات — ردیف شرقی"
          className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm"
        />
      </Labeled>
      <Labeled label="قسمت فروشگاه">
        <input
          value={form.section}
          onChange={(e) => set('section', e.target.value)}
          placeholder="مثلاً: لبنیات"
          className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm"
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="تعداد قفسه / ردیف (۱ تا ۱۲)">
          <input
            type="number" dir="ltr" min={1} max={12}
            value={form.rows}
            onChange={(e) => set('rows', e.target.value)}
            className="w-full rounded-xl border border-input bg-white/90 p-3 text-center text-sm font-black"
          />
        </Labeled>
        <Labeled label="فیسینگ در هر قفسه (۱ تا ۴۰)">
          <input
            type="number" dir="ltr" min={1} max={40}
            value={form.cols}
            onChange={(e) => set('cols', e.target.value)}
            className="w-full rounded-xl border border-input bg-white/90 p-3 text-center text-sm font-black"
          />
        </Labeled>
      </div>
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ساخت پلانوگرام 🧱'}
      </button>
    </Modal>
  )
}

/* ─────────────────────────── product picker (lazy list) ─────────────────────────── */
function ProductPicker({
  pmap, onPick, onClose,
}: { pmap: Record<string, PmProduct>; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [visible, setVisible] = useState(24)

  const all = useMemo(() => {
    const list = Object.values(pmap)
    if (!q.trim()) return list
    const needle = q.trim()
    return list.filter((p) => p.name.includes(needle) || p.category.includes(needle))
  }, [pmap, q])

  const shown = all.slice(0, visible)

  return (
    <Modal title="انتخاب کالا برای فیسینگ قفسه" onClose={onClose}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setVisible(24) }} placeholder="جستجوی نام کالا یا دسته…" />
      <div className="scroll-gold max-h-[46vh] space-y-1.5 overflow-y-auto pl-1">
        {shown.length === 0 && <EmptyState emoji="🔍" title="کالایی پیدا نشد" hint="عبارت دیگری را امتحان کنید" />}
        {shown.map((p) => {
          const ss = stockStatus(p.stock, p.reorderLevel)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-white/80 p-2.5 text-right transition hover:border-primary/60"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-lg">{CATEGORY_EMOJI[p.category] || '📦'}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-foreground">{p.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: catColor(p.category) }} />
                    {p.category}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-left">
                <span className="block text-[10px] font-bold" style={{ color: ss.color }}>{ss.label}</span>
                <span className="block text-[10px] text-muted-foreground">{faNum(p.stock)} عدد</span>
              </span>
            </button>
          )
        })}
      </div>
      {visible < all.length && (
        <button
          onClick={() => setVisible((v) => v + 24)}
          className="w-full rounded-xl border py-2.5 text-xs font-extrabold text-foreground/70 hover:border-primary/50"
        >
          نمایش بیشتر ({faNum(all.length - visible)} کالای دیگر)
        </button>
      )}
    </Modal>
  )
}

/* ═══════════════════════════ نمای مانیتورینگ (راند ۱۹) ═══════════════════════════ */
/* لایهٔ فقط-خواندنی تمام‌صفحه برای مانیتور سالن: چیدمان‌دار از آن‌سوی راهرو پرشدگی هر
   فیسینگ را می‌بیند. مبنا: «قفسهٔ پُر» = دو برابر نقطهٔ سفارش یا تعداد فیسینگ (هرکدام بیشتر)؛
   ≥۸۰٪ زمردی، ۴۰–۷۹٪ کهربایی، <۴۰٪ قرمز — اعداد درشت فارسی، بدون هیچ تعامل به‌جز بستن. */
const MON_TONE = {
  emerald: { color: '#34d399', bg: 'rgba(52,211,153,0.10)', label: 'پُر — نیازی به شارژ نیست' },
  amber: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: 'نیمه‌پُر — شارژ متوسط' },
  red: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'کم‌پُر — شارژ فوری' },
} as const

function slotFill(p: PmProduct | undefined, qty: number) {
  if (!p) return null
  const ideal = Math.max((p.reorderLevel || 0) * 2, qty, 1)
  const pct = p.stock <= 0 ? 0 : Math.min(100, Math.round((p.stock / ideal) * 100))
  const tone = pct >= 80 ? MON_TONE.emerald : pct >= 40 ? MON_TONE.amber : MON_TONE.red
  return { pct, color: tone.color, bg: tone.bg, label: tone.label }
}

function MonitorOverlay({
  plan,
  pmap,
  onClose,
}: {
  plan: Planogram
  pmap: Record<string, PmProduct>
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  // Escape = بستن + تلاش برای تمام‌صفحهٔ واقعی مرورگر (در محیط‌های محدود بی‌صدا رد می‌شود)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    rootRef.current?.requestFullscreen?.().catch(() => {})
    return () => {
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [onClose])

  // همان دادهٔ چیدمان — normalizeFacing موجود
  const grid = useMemo(
    () => normalizeFacing(plan.layoutFull ?? plan.layout, plan.rows, plan.cols),
    [plan]
  )
  const stats = useMemo(() => {
    let sum = 0
    let n = 0
    for (const row of grid) {
      for (const f of row) {
        const info = slotFill(f ? pmap[f.id] : undefined, f?.qty || 1)
        if (!info) continue
        sum += info.pct
        n++
      }
    }
    return { overall: n ? Math.round(sum / n) : 0 }
  }, [grid, pmap])

  return (
    <div ref={rootRef} dir="rtl" className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#0d1a14' }}>
      <style dangerouslySetInnerHTML={{ __html: '@media print{.mon-noprint{display:none!important}}' }} />

      {/* هدر — بدون چاپ */}
      <div
        className="mon-noprint sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6"
        style={{ background: '#0d1a14' }}
      >
        <div className="min-w-0">
          <h2 className="truncate text-3xl font-black text-[#e8d9bd] sm:text-4xl">🖥️ {plan.name}</h2>
          <p className="mt-1 text-sm font-bold text-white/60 sm:text-lg">
            {plan.section ? `${plan.section} • ` : ''}
            {formatJalaliFull(new Date())} • میانگین پرشدگی: {faNum(stats.overall)}٪
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="بستن نمای مانیتورینگ"
          title="بستن (Esc)"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/25 text-white transition hover:bg-white/10"
        >
          <X size={26} />
        </button>
      </div>

      {/* لژاند رنگ‌ها — بدون چاپ */}
      <div className="mon-noprint flex flex-wrap items-center gap-2 px-4 pt-3 text-[11px] font-black sm:px-6 sm:text-sm">
        <span className="rounded-full px-3 py-1.5" style={{ background: MON_TONE.emerald.bg, color: MON_TONE.emerald.color }}>
          ≥ ۸۰٪ پُر
        </span>
        <span className="rounded-full px-3 py-1.5" style={{ background: MON_TONE.amber.bg, color: MON_TONE.amber.color }}>
          ۴۰ تا ۷۹٪ نیمه‌پُر
        </span>
        <span className="rounded-full px-3 py-1.5" style={{ background: MON_TONE.red.bg, color: MON_TONE.red.color }}>
          {'< ۴۰٪ شارژ فوری'}
        </span>
      </div>

      {/* قفسه‌ها — درشت و پرکنتراست */}
      <div className="px-3 pb-10 pt-3 sm:px-6">
        {grid.length === 0 && (
          <p className="py-16 text-center text-2xl font-black text-white/50">این پلانوگرام قفسه‌ای ندارد</p>
        )}
        {grid.map((row, ri) => {
          const fills = row.map((f) => slotFill(f ? pmap[f.id] : undefined, f?.qty || 1))
          const occ = fills.filter((x): x is NonNullable<(typeof fills)[number]> => !!x)
          const rowAvg = occ.length ? Math.round(occ.reduce((s, i) => s + i.pct, 0) / occ.length) : 0
          const rowTone = rowAvg >= 80 ? MON_TONE.emerald : rowAvg >= 40 ? MON_TONE.amber : MON_TONE.red
          return (
            <div key={ri} className="mb-6">
              <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-xl font-black text-[#e8d9bd] sm:text-2xl">قفسهٔ {faNum(ri + 1)}</span>
                <span className="text-base font-bold sm:text-xl" style={{ color: rowTone.color }}>
                  میانگین {faNum(rowAvg)}٪
                </span>
                <div className="h-2.5 min-w-24 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${rowAvg}%`, background: rowTone.color }} />
                </div>
              </div>
              <div
                className="grid gap-2 sm:gap-3"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, plan.cols)}, minmax(150px, 1fr))` }}
              >
                {row.map((f, ci) => {
                  const p = f ? pmap[f.id] : undefined
                  const info = slotFill(p, f?.qty || 1)
                  if (!p || !info) {
                    return (
                      <div
                        key={ci}
                        className="flex min-h-[96px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 p-3 sm:min-h-[120px]"
                      >
                        <span className="text-xl font-black text-white/30 sm:text-2xl">خالی</span>
                        <span className="mt-1 text-[11px] font-bold text-white/25">فیسینگ {faNum(ci + 1)}</span>
                      </div>
                    )
                  }
                  return (
                    <div key={ci} className="rounded-2xl border-2 p-3" style={{ borderColor: info.color, background: info.bg }}>
                      <p className="truncate text-lg font-black text-white sm:text-2xl" title={p.name}>
                        {p.name}
                      </p>
                      <div className="mt-1.5 flex items-end justify-between gap-2">
                        <span className="text-4xl font-black leading-none sm:text-5xl" style={{ color: info.color }}>
                          {faNum(info.pct)}٪
                        </span>
                        <span className="shrink-0 text-left text-[10px] font-bold leading-4 text-white/70 sm:text-xs">
                          {f && f.qty > 1 ? `${faNum(f.qty)} فیسینگ • ` : ''}
                          موجودی: {faNum(p.stock)} عدد
                        </span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${info.pct}%`, background: info.color }} />
                      </div>
                      <p className="mt-1.5 text-[11px] font-black sm:text-sm" style={{ color: info.color }}>
                        {info.label}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
