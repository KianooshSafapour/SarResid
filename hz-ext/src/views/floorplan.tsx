import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, fa, toFaDigits, toEnDigits, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   store/floorplan — «نقشه فروشگاه» (ویرایشگر بلوپرینت SVG)
   کانتور واقعی هایپر زیتون (ذوزنقهٔ نامنظم ~۱۵٫۳۲ × ۲۰٫۱۰ متر)
   + ویرایش کانتور (رأس‌ها) + بلوک‌ها (درگ/افزودن/حذف)
   + ستون‌های چیدمان هر بخش (چرخش کنترل تاریخ انقضا)
   ───────────────────────────────────────────────────────────── */

type Pt = [number, number]

const KIND_META: Record<string, { color: string; label: string }> = {
  GONDOLA: { color: '#be185d', label: 'گوندولا' },
  SHELF: { color: '#a16207', label: 'قفسه' },
  FREEZER_ICECREAM: { color: '#0891b2', label: 'فریزر بستنی' },
  FRIDGE_CLOSED: { color: '#0f766e', label: 'یخچال بسته' },
  FRIDGE_OPEN: { color: '#14b8a6', label: 'یخچال باز' },
  FRIDGE_SHOWCASE: { color: '#2dd4bf', label: 'ویترین سرد' },
  CASHIER_U: { color: '#e11d48', label: 'صندوق' },
  CHECKOUT: { color: '#fb7185', label: 'مسیر پرداخت' },
  ENTRANCE: { color: '#16a34a', label: 'ورودی / خروجی' },
  BAKERY: { color: '#ea580c', label: 'نان و شیرینی' },
  CUSTOM: { color: '#57534e', label: 'سایر' },
  AISLE: { color: '#b45309', label: 'ردیف قفسه' },
  STORAGE: { color: '#78716c', label: 'انبار' },
  PRODUCE: { color: '#65a30d', label: 'میوه و تره‌بار' },
  DELI: { color: '#b91c1c', label: 'پروتئین' },
  EXIT: { color: '#78716c', label: 'خروجی' },
}
function kindOf(k: string) { return KIND_META[k] || KIND_META.CUSTOM }

const ZONE_COLORS: Record<string, string> = {
  'انبار': '#78716c',
  'خشک': '#d97706',
  'دی‌کمپرشن': '#0d9488',
  'صندوق': '#e11d48',
  'فسادپذیر': '#059669',
  'پرفروش': '#0891b2',
}
function zoneColor(z?: string | null) { return (z && ZONE_COLORS[z]) || '#a8a29e' }

/** کانتور واقعی هایپر زیتون — متر، ساعت‌گرد از گوشهٔ شمال‌غربی:
 *  دیوار شمالی ۱۵٫۳۲ (y=0) · دیوار شرقی قائم ۲۰٫۱۰ · دیوار جنوبی (y=20٫۱۰) با دو چفدور فرورفتهٔ
 *  ۴م×۱٫۳۷م (ورودی شرق ۹٫۹۵–۱۳٫۹۵ · خروجی غرب ۰٫۶–۴٫۶) · پخ مورب گوشهٔ جنوب‌غربی تا دیوار غربی (y=۱۷٫۸۲).
 *  نکته: رأس «۲٫۰۹» نقشهٔ دست‌کشیده با لبهٔ بیرونی چفدور خروجی تداخل می‌کرد (چندضلعی گره می‌خورد) —
 *  مطابق «شکل باید درست دیده شود»، مورب از لبهٔ بیرونی چفدور خروجی (۰٫۶) تا (۰،۱۷٫۸۲) رسم شده است. */
const REAL_M: Pt[] = [
  [0, 0], [15.32, 0], [15.32, 20.1],
  [13.95, 20.1], [13.95, 18.73], [9.95, 18.73], [9.95, 20.1],
  [4.6, 20.1], [4.6, 18.73], [0.6, 18.73], [0.6, 20.1],
  [0, 17.82],
]
const REAL_W = 1532 // cm — 15.32m
const REAL_H = 2010 // cm — 20.10m

const snap10 = (v: number) => Math.round(v / 10) * 10
/** عدد فارسی با ممیز فارسی */
const fa2 = (n: number) => fa(Number(n).toFixed(2)).replace('.', '٫')

function polyArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}
/** مساحت واقعی (م²) — با تصحیح کششِ افین به فضای واقعی ۱۵٫۳۲×۲۰٫۱۰ */
function realAreaM2(pts: Pt[] | null, W: number, H: number): number | null {
  if (!pts || pts.length < 4) return null
  return (polyArea(pts) * 15.32 * 20.1) / (W * H)
}
/** طول واقعی یک ضلع (متر) */
function edgeLenM(p: Pt, q: Pt, W: number, H: number): number {
  const dx = (q[0] - p[0]) * (15.32 / W)
  const dy = (q[1] - p[1]) * (20.1 / H)
  return Math.hypot(dx, dy)
}

interface DoorEdge { x1: number; y: number; x2: number; cx: number; lenP: number; label: string; color: string; hingeW: boolean }
/** دهانهٔ درها = یال‌های افقیِ «داخل» کانتور (لبهٔ داخلی چفدورها) با طول واقعی ۱٫۲ تا ۶ متر */
function findDoors(pts: Pt[] | null, W: number, H: number): DoorEdge[] {
  if (!pts || pts.length < 4) return []
  const epsH = 0.15 * (H / 20.1)          // تلورانس افقی‌بودن (~۱۵سانتی‌متر واقعی)
  const epsIn = 0.55 * (H / 20.1)         // حاشیهٔ «داخلی» (~۵۵سانتی‌متر واقعی) — عمق چفدور ۱٫۳۷م است
  const ys = pts.map((p) => p[1])
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const raw: { x1: number; y: number; x2: number; cx: number; lenP: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    if (Math.abs(p[1] - q[1]) > epsH) continue // افقی نیست
    const y = (p[1] + q[1]) / 2
    if (y < minY + epsIn || y > maxY - epsIn) continue // روی مرز بیرونی است
    const x1 = Math.min(p[0], q[0])
    const x2 = Math.max(p[0], q[0])
    const lenM = (x2 - x1) * (15.32 / W)
    if (lenM < 1.2 || lenM > 6) continue
    raw.push({ x1, y, x2, cx: (x1 + x2) / 2, lenP: x2 - x1 })
  }
  raw.sort((a, b) => b.cx - a.cx) // شرقی اول
  return raw.map((d, i) => {
    const isEntr = raw.length === 1 ? d.cx > W / 2 : i === 0
    const label = raw.length <= 2 ? (isEntr ? 'ورودی' : 'خروجی') : i === 0 ? 'ورودی' : i === raw.length - 1 ? 'خروجی' : 'در'
    const color = isEntr ? '#059669' : i === raw.length - 1 && raw.length > 2 ? '#b45309' : '#be123c'
    return { ...d, label, color, hingeW: isEntr }
  })
}

function serializeBlock(b: any) {
  return {
    kind: b.kind || 'CUSTOM',
    x: Math.round(Number(b.x) || 0),
    y: Math.round(Number(b.y) || 0),
    w: Math.round(Number(b.w) || 0),
    h: Math.round(Number(b.h) || 0),
    rotation: Math.round(Number(b.rotation) || 0),
    label: (b.label || '').trim() || null,
    zoneName: (b.zoneName || '').trim() || null,
    meta: b.meta && typeof b.meta === 'object' ? b.meta : {},
  }
}

const MGR = ['OWNER', 'GM', 'ADMIN', 'EXEC']

export default function FloorplanView() {
  const { user, go } = useShell()
  const isMgr = MGR.includes(String(user?.role || ''))

  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<{ id: string; name: string; width: number; height: number } | null>(null)
  const [blocks, setBlocks] = useState<any[]>([])
  const [outline, setOutline] = useState<Pt[] | null>(null)
  const [zones, setZones] = useState<any[]>([])
  const [planograms, setPlanograms] = useState<any[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // ستون‌های چیدمان (چرخش کنترل تاریخ)
  const [cols, setCols] = useState<{ state: 'loading' | 'ready' | 'denied'; sections: any[] }>({ state: 'loading', sections: [] })
  const [colName, setColName] = useState('')
  const [colEdit, setColEdit] = useState<{ id: string; name: string } | null>(null)
  const [colConfirm, setColConfirm] = useState<string | null>(null)

  // انتخاب / افزودن / ویرایش کانتور / فیلتر زون
  const [selIdx, setSelIdx] = useState<number | null>(null)
  const [addKind, setAddKind] = useState<string | null>(null)
  const [editOutline, setEditOutline] = useState(false)
  const [zoneFilter, setZoneFilter] = useState<string | null>(null)
  const [delConfirm, setDelConfirm] = useState(false)

  // گفتگوی «نقشهٔ واقعی»
  const [realOpen, setRealOpen] = useState(false)
  const [realChoice, setRealChoice] = useState<'real' | 'contour'>('real')
  const [realBusy, setRealBusy] = useState(false)

  // نما (زوم/پن)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 900, h: 520 })
  const [view, setView] = useState({ z: 0.4, tx: 40, ty: 20 })
  const dragRef = useRef<any>(null)
  const movedRef = useRef(false)

  useEffect(() => { void load() }, [])

  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 900, h: el.clientHeight || 520 }))
    ro.observe(el)
    setSize({ w: el.clientWidth || 900, h: el.clientHeight || 520 })
    return () => ro.disconnect()
  }, [loading])

  useEffect(() => { if (plan) fit() }, [plan?.id, plan?.width, plan?.height, size.w, size.h])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAddKind(null); setSelIdx(null); setDelConfirm(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function load() {
    setLoading(true)
    const [fp, zn, pg] = await Promise.all([
      api('/api/store/floorplans'),
      api('/api/store/zones'),
      api('/api/store/planograms'),
    ])
    if (!fp.ok) { setLoading(false); return toast.error(fp.error || 'خطا در دریافت نقشه فروشگاه') }
    const p = fp.data.plans?.[0] || null
    if (!p) { setLoading(false); return toast.error('نقشه‌ای ثبت نشده است') }
    absorb(p)
    if (zn.ok) setZones(zn.data.zones || [])
    if (pg.ok) setPlanograms(pg.data.planograms || [])
    setLoading(false)
    void refreshColumns(p.id)
  }

  function absorb(p: any) {
    setPlan({ id: p.id, name: p.name, width: Number(p.width) || 2840, height: Number(p.height) || 1540 })
    setBlocks((p.blocks || []).map((b: any) => ({ ...b, meta: b.meta && typeof b.meta === 'object' ? b.meta : {} })))
    const o = Array.isArray(p.outlineJson) ? (p.outlineJson as any[]) : null
    setOutline(o && o.length >= 4 ? o.map((q) => [Number(q[0]), Number(q[1])] as Pt) : null)
    setSelIdx(null); setAddKind(null); setDelConfirm(false); setDirty(false)
  }

  async function refreshColumns(planId?: string) {
    const r = await api('/api/store/section-columns' + qs({ planId: planId || plan?.id || '' }))
    if (!r.ok) { setCols({ state: 'denied', sections: [] }); return }
    setCols({ state: 'ready', sections: r.data.sections || [] })
  }

  /* ───────── ویرایش کانتور ───────── */
  function moveVertex(i: number, x: number, y: number) {
    setOutline((o) => {
      if (!o) return o
      const W = plan?.width || 2840, H = plan?.height || 1540
      const n = [...o]
      n[i] = [Math.max(0, Math.min(W, snap10(x))), Math.max(0, Math.min(H, snap10(y)))]
      return n
    })
    setDirty(true)
  }
  function insertVertex(i: number, x: number, y: number) {
    setOutline((o) => {
      if (!o) return o
      const W = plan?.width || 2840, H = plan?.height || 1540
      const n = [...o]
      n.splice(i + 1, 0, [Math.max(0, Math.min(W, snap10(x))), Math.max(0, Math.min(H, snap10(y)))])
      return n
    })
    setDirty(true)
  }
  function removeVertex(i: number) {
    if (!outline || outline.length <= 4) { toast.warning('کانتور باید حداقل ۴ رأس داشته باشد'); return }
    setOutline((o) => (o ? o.filter((_, j) => j !== i) : o))
    setDirty(true)
  }

  /* ───────── بلوک‌ها ───────── */
  function patchSel(patch: Record<string, unknown>) {
    if (selIdx === null) return
    setBlocks((bs) => bs.map((b, i) => (i === selIdx ? { ...b, ...patch } : b)))
    setDirty(true)
  }
  function moveBlock(i: number, x: number, y: number) {
    setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, x, y } : b)))
  }
  function deleteSel() {
    if (selIdx === null) return
    setBlocks((bs) => bs.filter((_, j) => j !== selIdx))
    setSelIdx(null); setDelConfirm(false); setDirty(true)
    toast.info('بلوک حذف شد — برای اعمال نهایی «ذخیرهٔ نقشه» را بزنید')
  }
  function addBlockAt(x: number, y: number) {
    if (!addKind || !plan) return
    const bw = Math.round(plan.width * 0.08), bh = Math.round(plan.height * 0.045)
    const n = blocks.filter((b) => b.kind === addKind).length
    const label = `${kindOf(addKind).label} ${toFaDigits(n + 1)}`
    const nb = {
      kind: addKind, label, zoneName: '',
      x: Math.max(0, Math.min(plan.width - bw, snap10(x - bw / 2))),
      y: Math.max(0, Math.min(plan.height - bh, snap10(y - bh / 2))),
      w: bw, h: bh, rotation: 0, meta: {},
    }
    setBlocks((bs) => [...bs, nb])
    setSelIdx(blocks.length); setAddKind(null); setDirty(true)
    toast.success(`بلوک «${label}» اضافه شد — آن را بکشید و از پنل تنظیم کنید`)
  }

  /* ───────── ذخیره ───────── */
  async function save() {
    if (!plan) return
    if (blocks.some((b) => !(b.label || '').trim())) return toast.error('برچسب همهٔ بلوک‌ها باید پر باشد')
    setSaving(true)
    const body: Record<string, unknown> = { blocks: blocks.map(serializeBlock) }
    if (outline) body.outlineJson = outline
    const r = await api(`/api/store/floorplans/${plan.id}`, { method: 'PATCH', body })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ذخیرهٔ نقشه ممکن نشد')
    absorb(r.data.plan)
    toast.success(`نقشهٔ «${plan.name}» با ${fa(blocks.length)} بلوک ذخیره شد`)
  }

  /* ───────── بازگردانی کانتور واقعی ───────── */
  async function applyReal() {
    if (!plan || !blocks.length) return
    setRealBusy(true)
    try {
      if (realChoice === 'real') {
        const cm = REAL_M.map(([x, y]) => [Math.round(x * 100), Math.round(y * 100)] as Pt)
        const sx = REAL_W / plan.width, sy = REAL_H / plan.height
        const r1 = await api(`/api/store/floorplans/${plan.id}`, {
          method: 'PATCH', body: { width: REAL_W, height: REAL_H, outlineJson: cm },
        })
        if (!r1.ok) { toast.error(r1.error || 'اعمال کانتور ممکن نشد'); return }
        const rescaled = blocks.map((b) => ({
          ...b,
          x: Math.round(b.x * sx), y: Math.round(b.y * sy),
          w: Math.max(10, Math.round(b.w * sx)), h: Math.max(10, Math.round(b.h * sy)),
        }))
        const r2 = await api(`/api/store/floorplans/${plan.id}`, {
          method: 'PATCH', body: { blocks: rescaled.map(serializeBlock) },
        })
        if (!r2.ok) { toast.error(r2.error || 'جابه‌جایی بلوک‌ها ممکن نشد — «اعمال» را دوباره بزنید'); return }
        absorb(r2.data.plan)
        toast.success('کانتور واقعی هایپر زیتون اعمال شد — ابعاد طرح به ۱۵٫۳۲×۲۰٫۱۰ متر اصلاح و بلوک‌ها متناسب جابه‌جا شدند')
      } else {
        const st = REAL_M.map(([x, y]) => [
          Math.round((x * plan.width) / 15.32),
          Math.round((y * plan.height) / 20.1),
        ] as Pt)
        const r = await api(`/api/store/floorplans/${plan.id}`, { method: 'PATCH', body: { outlineJson: st } })
        if (!r.ok) { toast.error(r.error || 'اعمال کانتور ممکن نشد'); return }
        absorb(r.data.plan)
        toast.success('کانتور واقعی روی ابعاد فعلی طرح کشیده شد — بلوک‌ها دست نخوردند')
      }
      setRealOpen(false)
    } finally { setRealBusy(false) }
  }

  /* ───────── نما ───────── */
  function fit() {
    if (!plan) return
    const z = Math.min((size.w * 0.96) / plan.width, (size.h * 0.94) / plan.height)
    setView({ z, tx: (size.w - plan.width * z) / 2, ty: (size.h - plan.height * z) / 2 })
  }
  function zoomBy(f: number) {
    setView((v) => {
      const nz = Math.max(0.06, Math.min(5, v.z * f))
      const cx = size.w / 2, cy = size.h / 2
      return { z: nz, tx: cx - ((cx - v.tx) * nz) / v.z, ty: cy - ((cy - v.ty) * nz) / v.z }
    })
  }
  function toPlan(e: { clientX: number; clientY: number }): Pt {
    const r = mapRef.current?.getBoundingClientRect()
    const px = r ? e.clientX - r.left : 0
    const py = r ? e.clientY - r.top : 0
    return [(px - view.tx) / view.z, (py - view.ty) / view.z]
  }

  function onMapDown(e: any) {
    /* پن فقط از زمینهٔ نقشه — بلوک‌ها/رأس‌ها خودشان stopPropagation می‌کنند؛
       دیوارهای شفاف (نمایش طول) هم مثل زمینه عمل می‌کنند تا درگ از کنار دیوارها کار کند */
    const t = e.target as Element
    const isBg = t?.getAttribute?.('data-bg') === '1'
    const isSvgRoot = t === e.currentTarget
    if (!isBg && !isSvgRoot) {
      /* روی عنصر تعاملی دیگری (بلوک، رأس و …) هستیم که خودش رویداد را مدیریت می‌کند */
      const tag = String((t && (t as any).tagName) || '').toLowerCase()
      if (tag !== 'line' && tag !== 'svg') return
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty }
    movedRef.current = false
  }
  function onMapMove(e: any) {
    const d = dragRef.current
    if (!d) return
    if (d.mode === 'pan') {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy
      if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true
      setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }))
    } else if (d.mode === 'block') {
      const [px, py] = toPlan(e)
      const [bx, by] = toPlan({ clientX: d.sx, clientY: d.sy })
      const ddx = px - bx, ddy = py - by
      if (Math.hypot(ddx, ddy) * view.z > 5) movedRef.current = true
      if (ddx || ddy) moveBlock(d.i, snap10(d.bx + ddx), snap10(d.by + ddy))
    } else if (d.mode === 'vertex') {
      const [px, py] = toPlan(e)
      movedRef.current = true
      moveVertex(d.i, px, py)
    }
  }
  function onMapUp() { dragRef.current = null }
  function onMapClick(e: any) {
    /* حالت افزودن: هر کلیکی که به سطح svg می‌رسد (و توسط بلوک مدیریت نشده)
       یعنی کلیک روی زمینهٔ نقشه — بلوک همان‌جا ساخته می‌شود.
       توجه: setPointerCapture باعث می‌شود click روی خودِ svg بیفتد نه روی rect زمینه؛
       پس svg-root و rect زمینه هر دو «کلیک زمینه» حساب می‌شوند. */
    if (addKind) {
      if (movedRef.current) { movedRef.current = false; return }
      const [x, y] = toPlan(e)
      addBlockAt(x, y)
      return
    }
    const t = e.target as Element
    const isBg = t?.getAttribute?.('data-bg') === '1'
    const isSvgRoot = t === e.currentTarget
    if (!isBg && !isSvgRoot) return // کلیک روی بلوک/رأس — خودش مدیریت شده
    if (movedRef.current) { movedRef.current = false; return }
    setSelIdx(null)
  }

  /* ───────── مشتقات ───────── */
  const sel = selIdx !== null ? blocks[selIdx] || null : null
  const colsMap = useMemo(() => {
    const m = new Map<string, any>()
    if (cols.state === 'ready') for (const s of cols.sections) m.set(s.blockLabel, s)
    return m
  }, [cols])
  const selSection = sel?.label ? colsMap.get(sel.label) || null : null
  const pgByLabel = useMemo(() => {
    const m = new Map<string, any>()
    for (const p of planograms) if (p.blockLabel) m.set(p.blockLabel, p)
    return m
  }, [planograms])
  const zoneChips = useMemo(() => zones.map((z) => ({
    name: z.name, color: zoneColor(z.name),
    n: blocks.filter((b) => b.zoneName === z.name).length,
  })), [zones, blocks])
  const W = plan?.width || 2840
  const H = plan?.height || 1540
  const doors = useMemo(() => findDoors(outline, W, H), [outline, W, H])
  const areaM2 = useMemo(() => realAreaM2(outline, W, H), [outline, W, H])
  const centroid = useMemo(() => {
    if (!outline) return null
    const n = outline.length
    return [outline.reduce((s, p) => s + p[0], 0) / n, outline.reduce((s, p) => s + p[1], 0) / n] as Pt
  }, [outline])
  const kindCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of blocks) m.set(b.kind, (m.get(b.kind) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [blocks])

  /* ───────── رندر ───────── */
  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت نقشه فروشگاه…
      </CardContent></Card>
    )
  }
  if (!plan) {
    return <Card><CardContent className="p-10 text-center text-sm text-stone-400">نقشه‌ای ثبت نشده است</CardContent></Card>
  }

  const g1 = W / 15.32 // ۱ متر در فضای طرح
  const polyPts = outline ? outline.map((p) => p.join(',')).join(' ') : ''

  /* ═══ سرآیند + نوار ابزار ═══ */
  return (
    <div className="space-y-4">
      <Card data-tour="page">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="store" size={18} /> نقشه فروشگاه
              <span className="text-xs font-normal text-stone-400">{plan.name} · {fa(W)}×{fa(H)} سانتی‌متر {outline ? '· دارای کانتور' : '· بدون کانتور'}</span>
              {dirty && <Badge variant="destructive" className="text-[10px]">ذخیره نشده</Badge>}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center rounded-lg border border-stone-200">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomBy(1 / 1.25)} title="کوچک‌نمایی"><I.minus size={15} /></Button>
                <span className="w-12 text-center text-[11px] font-bold text-stone-600">{fa(Math.round(view.z * 100))}٪</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomBy(1.25)} title="بزرگ‌نمایی"><I.plus size={15} /></Button>
              </div>
              <Button variant="outline" size="sm" onClick={fit} className="gap-1.5"><I.refresh size={14} /> متناسب</Button>
              <Button variant={editOutline ? 'default' : 'outline'} size="sm" onClick={() => { setEditOutline((v) => !v); setSelIdx(null) }} className="gap-1.5" disabled={!outline}>
                <I.penLine size={14} /> {editOutline ? 'پایان ویرایش کانتور' : 'ویرایش کانتور'}
              </Button>
              {!outline && (
                <Button variant="outline" size="sm" onClick={() => { setRealOpen(true); setRealChoice('real') }} className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  <I.layers size={14} /> بازگردانی نقشهٔ واقعی هایپر زیتون
                </Button>
              )}
              <Button size="sm" disabled={!dirty || saving} onClick={() => void save()} className="gap-1.5">
                {saving ? <I.loader size={14} className="animate-spin" /> : <I.save size={14} />} {saving ? 'در حال ذخیره…' : 'ذخیرهٔ نقشه'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">{fa(blocks.length)} بلوک</span>
            <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">{fa(zones.length)} زون</span>
            <span className="rounded-md bg-teal-50 px-2 py-1 text-teal-700">مساحت کانتور: {areaM2 ? `~${fa(Math.round(areaM2))} متر²` : 'ثبت نشده'}</span>
            {doors.length > 0 && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">{fa(doors.length)} در ({doors.map((d) => d.label).join(' / ')})</span>}
            {kindCounts.slice(0, 7).map(([k, n]) => (
              <span key={k} className="flex items-center gap-1 rounded-md bg-stone-50 px-2 py-1 text-stone-500">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: kindOf(k).color }} />
                {kindOf(k).label} {fa(n)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-stone-400">زون‌ها (برای برجسته‌سازی کلیک کنید):</span>
            {zoneChips.map((z) => (
              <button
                key={z.name}
                onClick={() => setZoneFilter((f) => (f === z.name ? null : z.name))}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] transition',
                  zoneFilter === z.name ? 'border-transparent text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300',
                )}
                style={zoneFilter === z.name ? { background: z.color } : undefined}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: zoneFilter === z.name ? '#fff' : z.color }} />
                {z.name} · {fa(z.n)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_370px]">
        {/* ═══ نقشه SVG ═══ */}
        <Card>
          <CardContent className="p-3">
            <div
              ref={mapRef}
              className="relative h-[420px] touch-none overflow-hidden rounded-xl border border-stone-300 bg-stone-100 sm:h-[500px] lg:h-[560px]"
            >
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${size.w} ${size.h}`}
                onPointerDown={onMapDown}
                onPointerMove={onMapMove}
                onPointerUp={onMapUp}
                onPointerCancel={onMapUp}
                onClick={onMapClick}
                style={{ fontFamily: 'Vazirmatn, system-ui, sans-serif' }}
              >
                <defs>
                  <pattern id="hz-grid-1m" width={g1} height={g1} patternUnits="userSpaceOnUse">
                    <path d={`M ${g1} 0 L 0 0 0 ${g1}`} fill="none" stroke="#e7e5e4" strokeWidth={0.7} />
                  </pattern>
                  <pattern id="hz-grid-5m" width={g1 * 5} height={g1 * 5} patternUnits="userSpaceOnUse">
                    <path d={`M ${g1 * 5} 0 L 0 0 0 ${g1 * 5}`} fill="none" stroke="#d6d3d1" strokeWidth={1.1} />
                  </pattern>
                  {outline && <clipPath id="hz-outline-clip"><polygon points={polyPts} /></clipPath>}
                </defs>

                <g transform={`translate(${view.tx},${view.ty}) scale(${view.z})`}>
                  {/* زمینهٔ دریافت رویداد پن/کلیک (زیر همه) */}
                  <rect data-bg="1" x={-W} y={-H} width={W * 3} height={H * 3} fill="transparent" />

                  {/* ۱) کانتور + شبکهٔ ۱متری (داخل کانتور) */}
                  <g pointerEvents="none">
                    {outline ? (
                      <>
                        <polygon points={polyPts} fill="#fafaf9" stroke="#a8a29e" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                        <rect x={0} y={0} width={W} height={H} fill="url(#hz-grid-1m)" clipPath="url(#hz-outline-clip)" />
                        <rect x={0} y={0} width={W} height={H} fill="url(#hz-grid-5m)" clipPath="url(#hz-outline-clip)" />
                      </>
                    ) : (
                      <>
                        <rect x={0} y={0} width={W} height={H} fill="#fafaf9" stroke="#d6d3d1" strokeWidth={2} strokeDasharray="10 8" vectorEffect="non-scaling-stroke" />
                        <rect x={0} y={0} width={W} height={H} fill="url(#hz-grid-1m)" />
                        <rect x={0} y={0} width={W} height={H} fill="url(#hz-grid-5m)" />
                      </>
                    )}

                    {/* ۲) دهانهٔ درها: بازشوی خط‌چین + بازوی در + کمان + برچسب */}
                    {doors.map((d, di) => {
                      const L = d.lenP
                      const hx = d.hingeW ? d.x1 : d.x2
                      const ox = d.hingeW ? d.x2 : d.x1
                      const sweep = d.hingeW ? 1 : 0
                      const fs = Math.min(L * 0.16, W / 38, H / 22)
                      return (
                        <g key={`door-${di}`}>
                          <line x1={d.x1} y1={d.y} x2={d.x2} y2={d.y} stroke={d.color} strokeWidth={2} strokeDasharray="7 6" vectorEffect="non-scaling-stroke" opacity={0.9} />
                          <path d={`M ${hx} ${d.y} L ${hx} ${d.y - L}`} stroke={d.color} strokeWidth={1.6} fill="none" vectorEffect="non-scaling-stroke" />
                          <path d={`M ${hx} ${d.y - L} A ${L} ${L} 0 0 ${sweep} ${ox} ${d.y}`} stroke={d.color} strokeWidth={1} strokeDasharray="5 5" fill="none" opacity={0.75} vectorEffect="non-scaling-stroke" />
                          <text x={d.cx} y={d.y - L * 0.35} textAnchor="middle" fontSize={fs} fontWeight={800} fill={d.color}
                            stroke="#fafaf9" strokeWidth={fs / 7} paintOrder="stroke">{d.label}</text>
                        </g>
                      )
                    })}
                  </g>

                  {/* ۲ب) نمایش طول دیوارها با نگه‌داشتن ماوس (حالت عادی) */}
                  {!editOutline && outline && (
                    <g>
                      {outline.map((p, i) => {
                        const q = outline[(i + 1) % outline.length]
                        return (
                          <line key={`et-${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="transparent" strokeWidth={12 / view.z}>
                            <title>{`دیوار — طول: ${fa2(edgeLenM(p, q, W, H))} متر`}</title>
                          </line>
                        )
                      })}
                    </g>
                  )}

                  {/* ۳) بلوک‌ها */}
                  <g style={{ pointerEvents: editOutline ? 'none' : 'auto' }} opacity={editOutline ? 0.4 : 1}>
                    {blocks.map((b, i) => {
                      const meta = kindOf(b.kind)
                      const zc = zoneColor(b.zoneName)
                      const isSel = i === selIdx
                      const dimmed = !!zoneFilter && b.zoneName !== zoneFilter
                      const pg = b.label ? pgByLabel.get(b.label) : null
                      const labelFS = Math.max(10, Math.min(b.w / 6.2, b.h / 3.4, 26))
                      const showLabel = b.w * view.z > 46
                      const resp = typeof b.meta?.responsible === 'string' ? b.meta.responsible : ''
                      return (
                        <g
                          key={i}
                          transform={`rotate(${b.rotation || 0} ${b.x + b.w / 2} ${b.y + b.h / 2})`}
                          opacity={dimmed ? 0.28 : 1}
                          style={{ cursor: 'grab' }}
                          onPointerDown={(e: any) => {
                            if (addKind || editOutline) return
                            e.stopPropagation()
                            ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                            const [px, py] = toPlan(e)
                            dragRef.current = { mode: 'block', i, ox: px - b.x, oy: py - b.y, bx: b.x, by: b.y, sx: e.clientX, sy: e.clientY }
                            movedRef.current = false
                          }}
                          onPointerMove={onMapMove}
                          onPointerUp={onMapUp}
                          onClick={() => {
                            if (addKind) return
                            if (movedRef.current) { movedRef.current = false; setDirty(true); return }
                            setSelIdx(i); setDelConfirm(false); setColConfirm(null); setColEdit(null)
                          }}
                        >
                          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill={meta.color} stroke="#ffffff" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeOpacity={0.6}>
                            <title>{`${b.label || meta.label}${b.zoneName ? ` — زون ${b.zoneName}` : ''}${resp ? ` — مسؤول: ${resp}` : ''}${pg ? ' — دارای پلانوگرام' : ''}`}</title>
                          </rect>
                          {b.zoneName && b.h > 22 && <rect x={b.x} y={b.y} width={b.w} height={5} fill={zc} opacity={0.95} />}
                          {isSel && <rect x={b.x - 5} y={b.y - 5} width={b.w + 10} height={b.h + 10} rx={6} fill="none" stroke="#0d9488" strokeWidth={9 / view.z} opacity={0.25} />}
                          {isSel && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="none" stroke="#0d9488" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
                          {pg && <circle cx={b.x + 9} cy={b.y + b.h - 9} r={5} fill="#fff" stroke="#0d9488" strokeWidth={2} vectorEffect="non-scaling-stroke"><title>{`پلانوگرام: ${pg.name} (${pg.status})`}</title></circle>}
                          {showLabel && (
                            <>
                              <text x={b.x + b.w / 2} y={b.y + b.h / 2 - (b.zoneName ? labelFS * 0.35 : 0) + 1} textAnchor="middle" fontSize={labelFS} fontWeight={700} fill="#fff"
                                stroke="rgba(0,0,0,.35)" strokeWidth={labelFS / 12} paintOrder="stroke">{b.label || meta.label}</text>
                              {b.zoneName && b.h * view.z > 34 && (
                                <text x={b.x + b.w / 2} y={b.y + b.h / 2 + labelFS * 0.9} textAnchor="middle" fontSize={labelFS * 0.72} fill="rgba(255,255,255,.92)">{b.zoneName}</text>
                              )}
                            </>
                          )}
                        </g>
                      )
                    })}
                  </g>

                  {/* ۴) ویرایش کانتور: یال‌ها + رأس‌ها */}
                  {editOutline && outline && (
                    <g>
                      {outline.map((p, i) => {
                        const q = outline[(i + 1) % outline.length]
                        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2
                        const lenM = edgeLenM(p, q, W, H)
                        return (
                          <g key={`edge-${i}`}>
                            <line
                              x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="transparent" strokeWidth={16 / view.z}
                              style={{ cursor: 'copy' }}
                              onClick={(e: any) => { e.stopPropagation(); const [x, y] = toPlan(e); insertVertex(i, x, y) }}
                              onDoubleClick={(e: any) => e.stopPropagation()}
                            >
                              <title>{`افزودن رأس در این ضلع — طول فعلی: ${fa2(lenM)} متر`}</title>
                            </line>
                            {lenM > 0.4 && centroid && (
                              <text
                                x={mx + (centroid[0] - mx) * 0.05}
                                y={my + (centroid[1] - my) * 0.05 - 7 / view.z}
                                textAnchor="middle" fontSize={Math.max(11, W / 110)} fontWeight={700} fill="#57534e"
                                stroke="#fafaf9" strokeWidth={Math.max(11, W / 110) / 8} paintOrder="stroke"
                              >
                                {fa2(lenM)} م
                              </text>
                            )}
                          </g>
                        )
                      })}
                      {outline.map((p, i) => (
                        <circle
                          key={`v-${i}`}
                          cx={p[0]} cy={p[1]} r={8 / view.z} fill="#fff" stroke="#0d9488" strokeWidth={2.5 / view.z}
                          style={{ cursor: 'move' }}
                          onPointerDown={(e: any) => {
                            e.stopPropagation()
                            ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                            dragRef.current = { mode: 'vertex', i }
                            movedRef.current = false
                          }}
                          onPointerMove={onMapMove}
                          onPointerUp={onMapUp}
                          onDoubleClick={(e: any) => { e.stopPropagation(); removeVertex(i) }}
                        >
                          <title>{`رأس ${fa(i + 1)} — جابه‌جایی با درگ · دابل‌کلیک = حذف (حداقل ۴ رأس)`}</title>
                        </circle>
                      ))}
                    </g>
                  )}
                </g>

                {/* قطب‌نامه و راهنمای حالت (فضای صفحه) */}
                <g fill="#a8a29e" fontSize={11} pointerEvents="none">
                  <path d="M 16 21 l 5 -8 l 5 8 z" />
                  <text x={30} y={23}>شمال</text>
                </g>
                {addKind && (
                  <text x={size.w / 2} y={24} textAnchor="middle" fill="#0d9488" fontSize={12} fontWeight={700} pointerEvents="none">
                    {`حالت افزودن «${kindOf(addKind).label}» — روی نقشه کلیک کنید (Esc = لغو)`}
                  </text>
                )}
                {editOutline && (
                  <text x={size.w / 2} y={24} textAnchor="middle" fill="#0f766e" fontSize={12} fontWeight={700} pointerEvents="none">
                    ویرایش کانتور — رأس‌ها را بکشید · کلیک روی دیوار = افزودن رأس · دابل‌کلیک روی رأس = حذف
                  </text>
                )}
              </svg>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-400">
              <span>درگ روی زمینه = جابه‌جایی نما · درگ روی بلوک = حرکت بلوک (چیدمان ۱۰ سانتی‌متری) · Esc = لغو انتخاب</span>
              <span>نقطهٔ سفید-فیروزه‌ای = دارای پلانوگرام · نوار رنگی بالای بلوک = زون</span>
            </div>
          </CardContent>
        </Card>

        {/* ═══ پنل کناری ═══ */}
        <div className="space-y-4">
          {!sel ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><I.layers size={17} /> افزودن بلوک</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {['GONDOLA', 'SHELF', 'FRIDGE_CLOSED', 'FRIDGE_OPEN', 'FRIDGE_SHOWCASE', 'FREEZER_ICECREAM', 'BAKERY', 'CUSTOM', 'CASHIER_U', 'CHECKOUT', 'ENTRANCE', 'STORAGE', 'PRODUCE', 'DELI', 'AISLE'].map((k) => (
                    <button
                      key={k}
                      onClick={() => { setAddKind((v) => (v === k ? null : k)); setEditOutline(false) }}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition',
                        addKind === k ? 'border-transparent text-white shadow' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400',
                      )}
                      style={addKind === k ? { background: kindOf(k).color } : undefined}
                    >
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: addKind === k ? '#fff' : kindOf(k).color }} />
                      {kindOf(k).label}
                    </button>
                  ))}
                </div>
                <p className="rounded-lg bg-stone-50 p-2 text-[11px] leading-5 text-stone-400">
                  یک نوع را انتخاب کنید و روی نقشه کلیک کنید؛ بلوک همان‌جا ساخته می‌شود. برای ویرایش هر بلوک روی خود آن کلیک کنید.
                  {!outline && ' کانتور واقعی هنوز ثبت نشده — «بازگردانی نقشهٔ واقعی» را بزنید.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: kindOf(sel.kind).color }} />
                  <span className="truncate">ویرایش «{sel.label || kindOf(sel.kind).label}»</span>
                  <Button variant="ghost" size="icon" className="mr-auto h-7 w-7" onClick={() => { setSelIdx(null); setDelConfirm(false) }}><I.x size={15} /></Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-stone-500">برچسب بلوک</span>
                  <Input value={sel.label || ''} onChange={(e: any) => patchSel({ label: e.target.value })} className="h-9 text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-stone-500">زون</span>
                  <Select value={sel.zoneName || '__none'} onValueChange={(v: string) => patchSel({ zoneName: v === '__none' ? '' : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">بدون زون</SelectItem>
                      {zones.map((z) => <SelectItem key={z.id} value={z.name}>{z.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-stone-500">مسؤول بخش (نام)</span>
                  <Input
                    value={typeof sel.meta?.responsible === 'string' ? sel.meta.responsible : ''}
                    onChange={(e: any) => patchSel({ meta: { ...(sel.meta || {}), responsible: e.target.value } })}
                    placeholder="مثلاً رضا رضایی" className="h-9 text-sm"
                  />
                </label>
                <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-[11px] text-stone-500">
                  <span>موقعیت (سانتی‌متر)</span>
                  <span className="font-bold" dir="ltr">X={fa(sel.x)} · Y={fa(sel.y)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold text-stone-500">عرض — W (سانتی‌متر)</span>
                    <Input
                      value={fa(sel.w)} dir="ltr" className="h-9 text-sm"
                      onChange={(e: any) => patchSel({ w: Math.max(10, Math.round(Number(toEnDigits(String(e.target.value).replace(/[^۰-۹0-9]/g, '')) || 0)) || 10) })}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold text-stone-500">عمق — H (سانتی‌متر)</span>
                    <Input
                      value={fa(sel.h)} dir="ltr" className="h-9 text-sm"
                      onChange={(e: any) => patchSel({ h: Math.max(10, Math.round(Number(toEnDigits(String(e.target.value).replace(/[^۰-۹0-9]/g, '')) || 0)) || 10) })}
                    />
                  </label>
                </div>
                {(() => {
                  const pg = sel.label ? pgByLabel.get(sel.label) : null
                  if (!pg) return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between rounded-lg border border-stone-200 px-2.5 py-2 text-[11px] text-stone-400">
                        پلانوگرامی برای این بخش ثبت نشده
                      </div>
                      {/* R7: ساخت پلانوگرام برای همین بخش — مستقیم از نقشه */}
                      <Button size="sm" className="w-full gap-1.5 bg-teal-600 hover:bg-teal-700" onClick={() => go(`store/planograms?section=${encodeURIComponent(sel.label)}`)}>
                        <I.package size={14} /> پلانوگرام برای این بخش
                      </Button>
                    </div>
                  )
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-2 text-[11px] text-teal-700">
                      <I.package size={13} /> پلانوگرام: {pg.name}
                      <Badge variant="secondary" className="text-[10px]">{pg.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'}</Badge>
                      <span className="text-teal-600">پرشدگی {fa(pg.fillHealth ?? 0)}٪</span>
                      <Button variant="outline" size="sm" className="mr-auto h-7 gap-1" onClick={() => go(`store/planograms?section=${encodeURIComponent(sel.label)}`)}>مدیریت پلانوگرام این بخش</Button>
                    </div>
                  )
                })()}

                <div className="flex gap-1.5 border-t border-stone-200 pt-3">
                  {delConfirm ? (
                    <>
                      <Button variant="destructive" size="sm" onClick={deleteSel} className="gap-1.5"><I.trash size={14} /> بله، حذف کن</Button>
                      <Button variant="outline" size="sm" onClick={() => setDelConfirm(false)}>انصراف</Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setDelConfirm(true)} className="gap-1.5 text-rose-700 hover:bg-rose-50">
                      <I.trash size={14} /> حذف این بلوک
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══ ستون‌های چیدمان بخش انتخاب‌شده ═══ */}
          {sel && selSection && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><I.columns size={17} /> ستون‌ها و نوبت کنترل تاریخ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <Badge variant="secondary">{fa(selSection.columns.filter((c: any) => c.active).length)} ستون فعال</Badge>
                  <span className="rounded-md bg-teal-50 px-2 py-1 font-bold text-teal-700">پوشش چرخه: {fa(selSection.coverage ?? 0)}٪</span>
                  <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">
                    آخرین کنترل: {selSection.lastCheckedAt ? longFa(selSection.lastCheckedAt) : '—'}
                  </span>
                </div>
                {selSection.nextStart && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-bold text-teal-700">
                    شروع چرخش بعدی: «{selSection.nextStart}»
                  </div>
                )}

                <div className="space-y-1.5">
                  {selSection.columns.length === 0 ? (
                    <p className="rounded-lg bg-stone-50 p-2.5 text-center text-[11px] leading-5 text-stone-400">
                      هنوز ستونی برای این بخش تعریف نشده — ستون‌ها مبنای نوبت‌گردانیِ «کنترل تاریخ انقضا» هستند.
                    </p>
                  ) : selSection.columns.map((c: any) => {
                    const isNext = selSection.nextStart === c.name
                    const editing = colEdit?.id === c.id
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border px-2 py-1.5',
                          isNext ? 'border-teal-300 bg-teal-50' : c.active ? 'border-stone-200 bg-white' : 'border-stone-200 bg-stone-50 opacity-60',
                        )}
                      >
                        {editing ? (
                          <>
                            <Input
                              autoFocus value={colEdit.name}
                              onChange={(e: any) => setColEdit({ id: c.id, name: e.target.value })}
                              onKeyDown={(e: any) => { if (e.key === 'Enter') void renameColumn(c) }}
                              className="h-7 flex-1 text-xs"
                            />
                            <Button size="sm" className="h-7 px-2" onClick={() => void renameColumn(c)}>ذخیره</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setColEdit(null)}><I.x size={13} /></Button>
                          </>
                        ) : (
                          <>
                            <span className={cn('flex-1 truncate text-xs font-bold', isNext ? 'text-teal-700' : 'text-stone-700')}>
                              {c.name}
                              {isNext && <Badge className="mr-1.5 bg-teal-600 text-[9px] text-white hover:bg-teal-600">شروع بعدی</Badge>}
                              {!c.active && <Badge variant="outline" className="mr-1.5 text-[9px]">غیرفعال</Badge>}
                            </span>
                            {isMgr && (
                              <span className="flex shrink-0 gap-0.5">
                                <Button variant="ghost" size="icon" className="h-6 w-6" title="تغییر نام" onClick={() => setColEdit({ id: c.id, name: c.name })}><I.pencil size={12} /></Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" title={c.active ? 'غیرفعال‌کردن' : 'فعال‌سازی'} onClick={() => void toggleColumn(c)}><I.circleDot size={12} /></Button>
                                {colConfirm === c.id ? (
                                  <>
                                    <Button variant="destructive" size="sm" className="h-6 px-2 text-[10px]" onClick={() => void deleteColumn(c)}>حذف؟</Button>
                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setColConfirm(null)}>نه</Button>
                                  </>
                                ) : (
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-600" title="حذف ستون" onClick={() => setColConfirm(c.id)}><I.trash size={12} /></Button>
                                )}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {isMgr && (
                  <div className="flex gap-1.5 border-t border-stone-200 pt-2.5">
                    <Input
                      value={colName}
                      onChange={(e: any) => setColName(e.target.value)}
                      onKeyDown={(e: any) => { if (e.key === 'Enter') void addColumn() }}
                      placeholder="نام ستون جدید (مثل: ستون ۱)" className="h-9 flex-1 text-sm"
                    />
                    <Button size="sm" onClick={() => void addColumn()} className="gap-1.5"><I.plus size={14} /> افزودن</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ═══ گفتگوی بازگردانی نقشهٔ واقعی ═══ */}
      <Dialog open={realOpen} onOpenChange={(o: boolean) => !realBusy && setRealOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.layers size={18} /> بازگردانی نقشهٔ واقعی هایپر زیتون</DialogTitle>
            <DialogDescription>
              کانتور واقعی فروشگاه (طبقهٔ همکف، نقشهٔ دستی مالک): ذوزنقهٔ نامنظم ~۱۵٫۳۲ متر دیوار شمالی × ~۲۰٫۱۰ متر عمق، با دو چفدور فرورفتهٔ درِ ۴ متری و عمق ۱٫۳۷ متری در دیوار جنوبی (ورودی سمت شرق، خروجی سمت غرب) و پخ مورب گوشهٔ جنوب‌غربی.
            </DialogDescription>
          </DialogHeader>

          <div className="my-1 flex justify-center">
            <svg viewBox="-1.6 -1.4 18.6 23.2" className="h-56 w-48" style={{ fontFamily: 'Vazirmatn, system-ui, sans-serif' }}>
              <polygon points={REAL_M.map((p) => p.join(',')).join(' ')} fill="#fafaf9" stroke="#a8a29e" strokeWidth={0.18} strokeLinejoin="round" />
              {findDoors(REAL_M, 15.32, 20.1).map((d, i) => {
                const hx = d.hingeW ? d.x1 : d.x2, ox = d.hingeW ? d.x2 : d.x1, sw = d.hingeW ? 1 : 0
                return (
                  <g key={i}>
                    <line x1={d.x1} y1={d.y} x2={d.x2} y2={d.y} stroke={d.color} strokeWidth={0.14} strokeDasharray="0.5 0.4" />
                    <path d={`M ${hx} ${d.y} L ${hx} ${d.y - d.lenP}`} stroke={d.color} strokeWidth={0.13} fill="none" />
                    <path d={`M ${hx} ${d.y - d.lenP} A ${d.lenP} ${d.lenP} 0 0 ${sw} ${ox} ${d.y}`} stroke={d.color} strokeWidth={0.1} strokeDasharray="0.3 0.25" fill="none" opacity={0.75} />
                    <text x={d.cx} y={d.y - d.lenP * 0.35} textAnchor="middle" fontSize={0.95} fontWeight={800} fill={d.color}>{d.label}</text>
                  </g>
                )
              })}
              <text x={7.66} y={-0.45} textAnchor="middle" fontSize={0.8} fill="#a8a29e">دیوار شمالی ۱۵٫۳۲ متر</text>
              <text x={16.15} y={10.5} textAnchor="middle" fontSize={0.8} fill="#a8a29e" transform="rotate(90 16.15 10.5)">عمق ۲۰٫۱۰ متر</text>
              <text x={0.15} y={9} textAnchor="middle" fontSize={0.75} fill="#a8a29e" transform="rotate(-90 0.15 9)">دیوار غربی</text>
            </svg>
          </div>

          <div className="space-y-2">
            {[
              { id: 'real' as const, title: 'ابعاد واقعی + جابه‌جایی بلوک‌ها (پیشنهادی)', desc: 'ابعاد طرح به ۱۵۳۲×۲۰۱۰ سانتی‌متر (۱۵٫۳۲×۲۰٫۱۰ متر واقعی) اصلاح می‌شود و همهٔ بلوک‌ها به‌تناسب جابه‌جا و مقیاس می‌یابند — کانتور با مقیاس یک‌به‌یک رسم می‌شود.' },
              { id: 'contour' as const, title: 'فقط کانتور روی ابعاد فعلی طرح', desc: `کانتور واقعی روی جعبهٔ فعلی طرح (${fa(W)}×${fa(H)}) کشیده می‌شود و بلوک‌ها دست نمی‌خورند — شکل فروشگاه روی صفحه فشرده می‌شود.` },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setRealChoice(opt.id)}
                className={cn(
                  'block w-full rounded-xl border p-3 text-right transition',
                  realChoice === opt.id ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-200' : 'border-stone-200 bg-white hover:border-stone-300',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border-2', realChoice === opt.id ? 'border-teal-600' : 'border-stone-300')}>
                    {realChoice === opt.id && <span className="h-2 w-2 rounded-full bg-teal-600" />}
                  </span>
                  <span className="text-sm font-bold text-stone-700">{opt.title}</span>
                  {opt.id === 'real' && <Badge className="bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">پیشنهادی</Badge>}
                </div>
                <p className="mt-1 pr-6 text-[11px] leading-5 text-stone-500">{opt.desc}</p>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRealOpen(false)} disabled={realBusy}>انصراف</Button>
            <Button onClick={() => void applyReal()} disabled={realBusy} className="gap-1.5">
              {realBusy ? <I.loader size={15} className="animate-spin" /> : <I.layers size={15} />} اعمال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  /* ───────── عملیات ستون‌ها ───────── */
  async function addColumn() {
    const name = colName.trim()
    if (!name || !sel) return toast.error('نام ستون را وارد کنید')
    const r = await api('/api/store/section-columns', { method: 'POST', body: { blockLabel: sel.label, name, planId: plan?.id } })
    if (!r.ok) return toast.error(r.error || 'ثبت ستون ممکن نشد')
    toast.success(`ستون «${name}» به «${sel.label}» افزوده شد`)
    setColName(''); void refreshColumns()
  }
  async function renameColumn(c: any) {
    const name = (colEdit?.name || '').trim()
    if (!name) return toast.error('نام ستون را وارد کنید')
    const r = await api(`/api/store/section-columns/${c.id}`, { method: 'PATCH', body: { name } })
    if (!r.ok) return toast.error(r.error || 'تغییر نام ممکن نشد')
    toast.success('نام ستون تغییر کرد'); setColEdit(null); void refreshColumns()
  }
  async function toggleColumn(c: any) {
    const r = await api(`/api/store/section-columns/${c.id}`, { method: 'PATCH', body: { active: !c.active } })
    if (!r.ok) return toast.error(r.error || 'تغییر وضعیت ممکن نشد')
    toast.success(`ستون «${c.name}» ${c.active ? 'غیرفعال' : 'فعال'} شد`); void refreshColumns()
  }
  async function deleteColumn(c: any) {
    const r = await api(`/api/store/section-columns/${c.id}`, { method: 'PATCH', body: { action: 'delete' } })
    if (!r.ok) return toast.error(r.error || 'حذف ممکن نشد')
    toast.info(`ستون «${c.name}» حذف شد`); setColConfirm(null); void refreshColumns()
  }
}

/** تاریخ جلالی → «۲۷ مهر ۱۴۰۵» */
function longFa(dash: string): string {
  const m = String(dash || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return String(dash || '—')
  const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
  return `${toFaDigits(Number(m[3]))} ${months[Number(m[2]) - 1] || ''} ${toFaDigits(Number(m[1]))}`
}
