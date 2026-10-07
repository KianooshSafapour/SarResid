'use client'

/**
 * نقشهٔ فروشگاه (round-17 / task 17-C) — ویرایشگر کامل پلان دوبعدی فروشگاه + زمین چندضلعی
 *
 * امکانات:
 *  ۱) مدیریت طبقه‌ها: تب طبقه‌ها (مرتب بر اساس floorIndex)، «طبقهٔ جدید»، تغییر نام/ابعاد (PATCH)، حذف با تأیید
 *  ۲) زمین دو حالته: مستطیلی (w/h) یا چندضلعی رسم‌شده [{x,y}] سانتی‌متر — ابعاد دلخواه ۲۰۰ تا ۱۲٬۰۰۰ سانتی‌متر (۱۲۰ متر):
 *     «رسم زمین چندضلعی»: کلیک = رأس جدید، درگ رأس = جابه‌جایی، دوبارکلیک روی ضلع یا دکمهٔ ✚ = رأس در ضلع،
 *     حذف رأس، بستن خودکار، اعتبارسنجی زنده (چندضلعی ساده — تلاقی ممنوع، کوژ مجاز)، طول هر ضلع به متر،
 *     «تبدیل به مستطیل» (حفظ کادر محیطی)
 *  ۳) قالب هایپر زیتون (src/lib/floorplan-preset.ts — منبع واحد هندسه): زمین واقعی کادر ۲۵٫۶×۱۲ متر — ضلع خیابان ≈ ۲۲ متر
 *     (۲۷ کاشی ۸۰ سانتی‌متری) + ضلع مورب ۴ متری گوشهٔ خیابان + ورودی فرورفتهٔ ۶٫۴ متری با الکوی ۸۰ سانتی (تا عابران
 *     درب اتوماتیک را فعال نکنند) + بلوک‌های ورودی/صندوق و زون‌های نمونه (میوه‌فروشی، لبنیات، نان)
 *  ۳+) پنل «نقاط دقیق زمین»: فهرست همهٔ رأس‌های چندضلعی با ورودی X/Y سانتی‌متری (نمایش ارقام فارسی، پذیرش لاتین)،
 *     درج رأس بعد از هر ایندکس (میانِ ضلع بعدی)، حذف رأس (حداقل ۳)، نشان طلایی کادر محیطی (عرض×طول متر + تعداد رأس)،
 *     شماره‌گذاری رأس‌ها روی بوم برای مطابقت پنل ↔ بوم — همگام با درگ گرافیکی (یک state)
 *  ۴) کتابخانهٔ ۱۵ بلوک پیش‌ساخته + رندر اختصاصی هر نوع (گاندولای دوراهه، یخچال‌های یخی، صندوق طلایی، ورود سبز…) +
 *     حالت جای‌گذاری با کلیک روی نقشه (ESC لغو)
 *  ۵) بوم ویرایش: درگ جابه‌جایی (اسنپ ۱۰ سانتی‌متری با کلید آهن‌ربا)، تغییر اندازه از گوشه (حداقل ۴۰)،
 *     چرخش ۹۰ درجه‌ای، تکثیر، حذف، زوم ۴–۱۶۰٪ (چندضلعی تا ۱۲۰ متر دیده می‌شود) + Fit، پن با درگ پس‌زمینه،
 *     کیبورد (جهت‌نما = ۱۰ / Shift = ۱، Delete = حذف) — همه با Pointer Events (لمسی ≥۴۴px)
 *  ۶) ذخیره: dirty + «ذخیرهٔ نقشه» → POST save-blocks (جایگزینی کامل تراکنشی بلوک‌ها + shape زمین؛ سرور چندضلعی را اعتبارسنجی می‌کند)
 *  ۷) زون‌بندی: datalist زون‌ها، گروه‌بندی با Shift+کلیک، «مسئول زون» از فهرست پرسنل (meta.responsibleId) +
 *     ظرفیت + یادداشت — راهن (legend) چیپ‌های زون بالای بوم با انتخاب سریع اعضا
 *  ۸) پلانوگرام روی لمس: پاپ‌آپ بلوک‌های قفسه‌ای + «درخواست پُرکردن قفسه 📦» (تسک HIGH به انبار) + انتخاب پلانوگرام
 *  ۹) ریسپانسیو: کتابخانه چیپ افقی در موبایل، بازرس Bottom Sheet، برچسب‌ها/دسته‌ها مقیاس‌پذیر با زوم
 *
 * API: GET/POST/PATCH/DELETE /api/floorplans — GET /api/zones — GET /api/planograms — GET /api/personnel — POST /api/tasks
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppCtx, EmptyState, Labeled } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { api } from '@/lib/client'
import { toast } from 'sonner'
import { enDigits, faNum } from '@/lib/jalali'
import { defaultNewFloor, fmtM, hyperZeytoonPreset } from '@/lib/floorplan-preset'
import { cn } from '@/lib/utils'
import { Check, Copy, ListOrdered, Loader2, Magnet, MapPin, Maximize, Pencil, Plus, RotateCw, Ruler, Save, Search, Shapes, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'

/* ───────────────────────────── types ───────────────────────────── */

type Vertex = { x: number; y: number }
type BlockMeta = { planogramId?: string; responsibleId?: string; responsibleName?: string; capacity?: number; note?: string }
type Block = { id: string; kind: string; x: number; y: number; w: number; h: number; rotation: number; label: string; zoneName: string; meta: BlockMeta }
type ServerBlock = { id: string; kind: string; x: number; y: number; w: number; h: number; rotation: number; label: string; zoneName: string; meta: string }
type PlanRow = { id: string; name: string; floorIndex: number; width: number; height: number; shape?: string; unitLabel?: string; archived?: boolean; blocks: ServerBlock[] }
type Prefab = { kind: string; label: string; w: number; h: number; color: string; icon: string }
type ZoneLite = { name: string; color: string }
type PlanogramRow = { id: string; name: string; section: string; rows: number; cols: number; status: string; layout: (string | null)[][]; cells: number }
type ProductLite = { id: string; name: string; stock: number; reorderLevel: number }
type ProductMap = Record<string, ProductLite>
type PersonnelLite = { id: string; name: string }

/* ─────────────────────────── constants ─────────────────────────── */

const GOLD = '#c9a227'
const WALL = '#0b2e20'
const FLOOR_MIN = 200
const FLOOR_MAX = 12000
const MIN_BLOCK = 40
/** پالت زون — رنگ قطعی بر اساس hash نام زون (بدون آبی/بنفش) */
const ZONE_PALETTE = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#2e6f6a', '#8a6d10', '#6b5b3e', '#a5573a', '#4d9a90', '#5a8f3c', '#9c8b6a']
/** انواع قفسه‌ای که پاپ‌آپ پلانوگرام/تأمین دارند */
const SHELF_KINDS = new Set(['SHELF', 'GONDOLA', 'FRIDGE_CLOSED', 'FRIDGE_OPEN', 'FRIDGE_SHOWCASE', 'FREEZER_ICECREAM'])
/** رنگ جایگزین برای انواع خاص (ورود/خروج سبز زمردی نه سرخ) */
const KIND_COLOR_OVERRIDE: Record<string, string> = { ENTRANCE: '#0e7a4a' }
const ZOOM_MIN = 0.04
const ZOOM_MAX = 1.6
const GRID_BG =
  'linear-gradient(to left, rgba(11,46,32,0.10) 1.2px, transparent 1.2px), linear-gradient(to bottom, rgba(11,46,32,0.10) 1.2px, transparent 1.2px), linear-gradient(to left, rgba(11,46,32,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,46,32,0.045) 1px, transparent 1px)'
const GRID_SIZE = '100px 100px, 100px 100px, 10px 10px, 10px 10px'
const INPUT_CLS = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#0e7a4a] focus:ring-2 focus:ring-[#0e7a4a]/15'

/* ──────────────────────────── helpers ──────────────────────────── */

function snap10(v: number) {
  return Math.round(v / 10) * 10
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
function hashZoneColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return ZONE_PALETTE[h % ZONE_PALETTE.length]
}
function genId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
function parseMeta(m: unknown): BlockMeta {
  let o: unknown = m
  if (typeof m === 'string') {
    try {
      o = JSON.parse(m)
    } catch {
      o = {}
    }
  }
  return o && typeof o === 'object' && !Array.isArray(o) ? (o as BlockMeta) : {}
}
function toEditorBlock(b: ServerBlock): Block {
  return { id: b.id || genId(), kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, rotation: b.rotation, label: b.label, zoneName: b.zoneName, meta: parseMeta(b.meta) }
}
function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'خطای نامشخص'
}
function stockColor(stock: number, reorder: number) {
  if (stock <= 0) return '#b3372f'
  if (stock < Math.max(1, reorder)) return '#c9a227'
  return '#0e7a4a'
}
/* fmtM و polygonBBox از @/lib/floorplan-preset وارد می‌شوند (منبع واحد) */

/* ── هندسهٔ چندضلعی ── */

function cross(o: Vertex, a: Vertex, b: Vertex): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}
function onSeg(p: Vertex, q: Vertex, r: Vertex): boolean {
  return (
    Math.min(p.x, r.x) - 0.01 <= q.x && q.x <= Math.max(p.x, r.x) + 0.01 &&
    Math.min(p.y, r.y) - 0.01 <= q.y && q.y <= Math.max(p.y, r.y) + 0.01 &&
    Math.abs(cross(p, q, r)) < 0.01
  )
}
function segInt(p1: Vertex, p2: Vertex, p3: Vertex, p4: Vertex): boolean {
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  if (Math.abs(d1) < 0.01 && onSeg(p3, p1, p4)) return true
  if (Math.abs(d2) < 0.01 && onSeg(p3, p2, p4)) return true
  if (Math.abs(d3) < 0.01 && onSeg(p1, p3, p2)) return true
  if (Math.abs(d4) < 0.01 && onSeg(p1, p4, p2)) return true
  return false
}
/** چندضلعی ساده = خطوط بدون تلاقی (کوژ مجاز است) */
function polygonIsSimple(verts: Vertex[]): boolean {
  const n = verts.length
  if (n < 3) return true
  const pts: Vertex[] = []
  for (const v of verts) {
    const last = pts[pts.length - 1]
    if (last && Math.abs(last.x - v.x) < 0.5 && Math.abs(last.y - v.y) < 0.5) continue
    pts.push(v)
  }
  if (pts.length >= 2) {
    const f = pts[0]
    const l = pts[pts.length - 1]
    if (Math.abs(f.x - l.x) < 0.5 && Math.abs(f.y - l.y) < 0.5) pts.pop()
  }
  const m = pts.length
  if (m < 3) return false
  for (let i = 0; i < m; i++) {
    const a1 = pts[i]
    const a2 = pts[(i + 1) % m]
    for (let j = i + 1; j < m; j++) {
      if (j === i + 1) continue
      if (i === 0 && j === m - 1) continue
      if (segInt(a1, a2, pts[j], pts[(j + 1) % m])) return false
    }
  }
  return true
}
function polyBBox(verts: Vertex[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const v of verts) {
    if (v.x < minX) minX = v.x
    if (v.y < minY) minY = v.y
    if (v.x > maxX) maxX = v.x
    if (v.y > maxY) maxY = v.y
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}
function nearestOnSeg(p: Vertex, a: Vertex, b: Vertex): Vertex {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return { x: a.x, y: a.y }
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1)
  return { x: a.x + t * dx, y: a.y + t * dy }
}
function pointInPoly(p: Vertex, verts: Vertex[]): boolean {
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a = verts[i]
    const b = verts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
/** پارس shape از سرور — تحریف‌پذیر و بی‌خطر */
function parseShapeClient(raw: unknown): Vertex[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const out: Vertex[] = []
  for (const v of arr) {
    const x = Math.round(Number((v as Vertex)?.x))
    const y = Math.round(Number((v as Vertex)?.y))
    if (isFinite(x) && isFinite(y) && x >= 0 && y >= 0 && x <= FLOOR_MAX && y <= FLOOR_MAX) out.push({ x, y })
  }
  return out.length >= 3 ? out : []
}
function planDims(p: PlanRow): { w: number; h: number } {
  const sh = parseShapeClient(p.shape)
  if (sh.length >= 3) {
    const bb = polyBBox(sh)
    if (bb.w > 0 && bb.h > 0) return { w: bb.w, h: bb.h }
  }
  return { w: p.width, h: p.height }
}

/* پیش‌تنظیم هایپر زیتون به @/lib/floorplan-preset منتقل شد (قالب هایپر زیتون — هندسهٔ واقعی ۲۵۶۰×۱۲۰۰) */

/* ═══════════════════ sub-components (module-level — stable identity) ═══════════════════ */

/* ── رندر اختصاصی هر نوع بلوک (ترمیم «پیش‌ساخته‌ها درست نمایش داده نمی‌شدند») ── */
function BlockDeco({ kind, color, zoom }: { kind: string; color: string; zoom: number }) {
  const line = clamp(2.4 / zoom, 1.2, 6)
  switch (kind) {
    case 'GONDOLA':
      // دوطرفه: دو ریل نقطه‌چین موازی در دو لبهٔ طولی
      return (
        <>
          <div className="pointer-events-none absolute start-[10%] end-[10%] top-[22%]" style={{ borderTop: `${line}px dashed ${color}` }} />
          <div className="pointer-events-none absolute start-[10%] end-[10%] bottom-[22%]" style={{ borderTop: `${line}px dashed ${color}` }} />
        </>
      )
    case 'SHELF':
      return <div className="pointer-events-none absolute start-[6%] end-[6%] top-1/2" style={{ borderTop: `${line}px solid ${color}99` }} />
    case 'AISLE':
      return <div className="pointer-events-none absolute start-[15%] end-[15%] top-1/2" style={{ borderTop: `${line}px dotted ${color}77` }} />
    case 'FRIDGE_CLOSED':
    case 'FRIDGE_OPEN':
    case 'FRIDGE_SHOWCASE':
      // خانوادهٔ سرد: رگه‌های یخی نعنایی (نه آبی) + خط درب در لبهٔ طولی
      return (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: `repeating-linear-gradient(90deg, rgba(127,176,105,0.20) 0 3px, transparent 3px 16px)` }}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: '14%', background: color, opacity: 0.35 }} />
        </>
      )
    case 'FREEZER_ICECREAM':
      return (
        <>
          <div className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(45deg, rgba(127,179,174,0.22) 0 6px, transparent 6px 14px)' }} />
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[#5f938d]" style={{ fontSize: clamp(16 / zoom, 10, 44), opacity: 0.55 }}>
            🍨
          </span>
        </>
      )
    case 'CASHIER_U':
      // U سه‌طرفه: سه ضلع پر، دهانهٔ باز رو به مشتری
      return (
        <div
          className="pointer-events-none absolute rounded-[4px]"
          style={{ inset: Math.max(3, 8), borderTop: `${clamp(3 / zoom, 1.5, 7)}px solid ${color}`, borderLeft: `${clamp(3 / zoom, 1.5, 7)}px solid transparent`, borderRight: `${clamp(3 / zoom, 1.5, 7)}px solid ${color}`, borderBottom: `${clamp(3 / zoom, 1.5, 7)}px solid ${color}` }}
        />
      )
    case 'CHECKOUT':
      return <div className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(45deg, rgba(138,109,16,0.14) 0 5px, transparent 5px 12px)' }} />
    case 'ENTRANCE':
      // فلش‌های زمردی رو به داخل فروشگاه + برچسب ورود/خروج
      return (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center" style={{ color: '#0e7a4a' }}>
          <span style={{ fontSize: clamp(12 / zoom, 8, 34), lineHeight: 1 }}>▲ ▲ ▲</span>
        </div>
      )
    case 'STORAGE':
      return <div className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(45deg, rgba(107,91,62,0.12) 0 6px, transparent 6px 13px)' }} />
    case 'PRODUCE':
    case 'BAKERY':
    case 'DELI':
      return (
        <span className="pointer-events-none absolute inset-0 grid place-items-center" style={{ fontSize: clamp(18 / zoom, 12, 52), opacity: 0.4 }}>
          {kind === 'PRODUCE' ? '🍎' : kind === 'BAKERY' ? '🥖' : '🍗'}
        </span>
      )
    default:
      return null
  }
}

/* ── مینی‌گرید پلانوگرام + آمار سریع ── */
function PlanogramMini({ planogram, productMap }: { planogram: PlanogramRow; productMap: ProductMap }) {
  const rows = Array.isArray(planogram.layout) ? planogram.layout : []
  let filled = 0
  let oos = 0
  let low = 0
  for (const row of rows)
    for (const pid of row || []) {
      if (!pid) continue
      filled++
      const pr = productMap[pid]
      if (!pr) continue
      if (pr.stock <= 0) oos++
      else if (pr.stock < Math.max(1, pr.reorderLevel)) low++
    }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto scroll-gold rounded-lg border border-border bg-[#faf7ee] p-1.5">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${Math.max(1, planogram.cols)}, 13px)` }}>
          {rows.flatMap((row, ri) =>
            (row || []).map((pid, ci) => {
              const pr = pid ? productMap[pid] : undefined
              return (
                <div
                  key={`${ri}-${ci}`}
                  title={pr ? `${pr.name} — موجودی: ${faNum(pr.stock)}` : pid ? 'کالای ناشناس' : 'خالی'}
                  className="h-[13px] w-[13px] rounded-[2px] border border-black/5"
                  style={{ background: pr ? stockColor(pr.stock, pr.reorderLevel) : 'transparent' }}
                />
              )
            }),
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        <span className="rounded-full bg-muted px-2 py-0.5">📦 {faNum(filled)} خانهٔ پر</span>
        <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[#b3372f]">🔴 {faNum(oos)} تمام‌شده</span>
        <span className="rounded-full bg-[#c9a227]/15 px-2 py-0.5 text-[#8a6d10]">🟡 {faNum(low)} رو به اتمام</span>
      </div>
    </div>
  )
}

/* ── محتوای پاپ‌آپ پلانوگرام بلوک ── */
function BlockPopup({
  block,
  kindLabel,
  planogram,
  productMap,
  canManage,
  busy,
  onRestock,
  onPick,
  onUnlink,
  onClose,
}: {
  block: Block
  kindLabel: string
  planogram: PlanogramRow | null
  productMap: ProductMap
  canManage: boolean
  busy: boolean
  onRestock: () => void
  onPick: () => void
  onUnlink: () => void
  onClose: () => void
}) {
  return (
    <div className="w-72 space-y-2.5 rounded-2xl border border-border bg-white/97 p-3 shadow-2xl backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black">🏷️ {block.label || kindLabel}</p>
          <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">
            {kindLabel}
            {block.zoneName ? ` • زون ${block.zoneName}` : ''}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" title="بستن">
          <X size={14} />
        </button>
      </div>

      {planogram ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-black text-[#0e7a4a]">📋 {planogram.name}</p>
            {canManage && (
              <button onClick={onUnlink} disabled={busy} className="rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-[#b3372f] hover:bg-[#b3372f]/10 disabled:opacity-50">
                قطع اتصال
              </button>
            )}
          </div>
          <PlanogramMini planogram={planogram} productMap={productMap} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/40 p-2.5 text-center">
          <p className="text-[11px] font-bold text-muted-foreground">این بلوک به پلانوگرامی متصل نیست</p>
          {canManage && (
            <button onClick={onPick} className="mt-1.5 rounded-lg bg-[#0e7a4a] px-2.5 py-1 text-[10px] font-black text-white hover:opacity-90">
              انتخاب پلانوگرام
            </button>
          )}
        </div>
      )}

      <button
        onClick={onRestock}
        className="w-full rounded-xl bg-gradient-to-l from-[#c9a227] to-[#c96f4a] px-3 py-2 text-[11px] font-black text-white shadow transition hover:brightness-105 active:scale-[0.98]"
      >
        درخواست پُرکردن قفسه 📦
      </button>
    </div>
  )
}

/* ── بازرس بلوک (تک‌انتخاب) — با «مسئول زون» و ظرفیت ── */
function InspectorSingle({
  block,
  planWidth,
  planHeight,
  zoneOptions,
  kindLabel,
  kindIcon,
  kindColor,
  planogramName,
  responsibleOptions,
  personnelDenied,
  canManage,
  busy,
  onPatch,
  onRotate,
  onDuplicate,
  onDelete,
  onRestock,
  onPickPlanogram,
  onUnlinkPlanogram,
}: {
  block: Block
  planWidth: number
  planHeight: number
  zoneOptions: string[]
  kindLabel: string
  kindIcon: string
  kindColor: string
  planogramName: string | null
  responsibleOptions: PersonnelLite[]
  personnelDenied: boolean
  canManage: boolean
  busy: boolean
  onPatch: (patch: Partial<Block>) => void
  onRotate: () => void
  onDuplicate: () => void
  onDelete: () => void
  onRestock: () => void
  onPickPlanogram: () => void
  onUnlinkPlanogram: () => void
}) {
  const isShelf = SHELF_KINDS.has(block.kind) || !!block.meta.planogramId
  const cap = block.meta.capacity
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg text-sm" style={{ background: kindColor + '22', border: `1px solid ${kindColor}66` }}>
          {kindIcon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-black">{kindLabel}</p>
          <p className="text-[10px] text-muted-foreground" dir="ltr">
            {faNum(Math.round(block.w))}×{faNum(Math.round(block.h))} • {faNum(block.rotation)}°
          </p>
        </div>
      </div>

      <Labeled label="برچسب بلوک">
        <input className={INPUT_CLS} value={block.label} onChange={(e) => onPatch({ label: e.target.value.slice(0, 80) })} placeholder="مثلاً: قفسهٔ لبنیات ۳" />
      </Labeled>

      <Labeled label="زون (نام زون را بنویسید یا انتخاب کنید)" hint="بلوک‌های هم‌زون رنگ یکسان می‌گیرند">
        <input className={INPUT_CLS} list="fp-zone-options" value={block.zoneName} onChange={(e) => onPatch({ zoneName: e.target.value.slice(0, 80) })} placeholder="مثلاً: زون لبنیات" />
      </Labeled>
      {zoneOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {zoneOptions.slice(0, 10).map((z) => (
            <button
              key={z}
              onClick={() => onPatch({ zoneName: block.zoneName === z ? '' : z })}
              className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition', block.zoneName === z ? 'border-transparent text-white' : 'border-border bg-white hover:bg-muted')}
              style={block.zoneName === z ? { background: hashZoneColor(z) } : undefined}
            >
              <span className="size-2 rounded-full" style={{ background: hashZoneColor(z) }} />
              {z}
            </button>
          ))}
        </div>
      )}

      <Labeled label="مسئول زون" hint={responsibleOptions.length === 0 && personnelDenied ? 'فهرست پرسنل در دسترس نبود' : 'از فهرست پرسنل — در متای بلوک ذخیره می‌شود'}>
        <select
          className={INPUT_CLS}
          value={block.meta.responsibleId || ''}
          onChange={(e) => {
            const id = e.target.value
            const nm = responsibleOptions.find((p) => p.id === id)?.name
            onPatch({ meta: { ...block.meta, responsibleId: id || undefined, responsibleName: id ? nm || undefined : undefined } })
          }}
        >
          <option value="">— بدون مسئول —</option>
          {responsibleOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Labeled>

      <div className="grid grid-cols-2 gap-2">
        <Labeled label="ظرفیت (اختیاری)">
          <input
            type="number"
            dir="ltr"
            min={0}
            max={9999}
            className={cn(INPUT_CLS, 'text-center')}
            value={cap ?? ''}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value))
              onPatch({ meta: { ...block.meta, capacity: isFinite(n) && n > 0 ? n : undefined } })
            }}
            placeholder="—"
          />
        </Labeled>
        <Labeled label="یادداشت داخلی">
          <input className={INPUT_CLS} value={block.meta.note || ''} onChange={(e) => onPatch({ meta: { ...block.meta, note: e.target.value.slice(0, 200) } })} placeholder="اختیاری…" />
        </Labeled>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Labeled label="عرض">
          <input
            type="number"
            dir="ltr"
            min={MIN_BLOCK}
            max={FLOOR_MAX}
            step={10}
            className={cn(INPUT_CLS, 'text-center')}
            value={block.w}
            onChange={(e) => onPatch({ w: clamp(Math.round(Number(e.target.value) || block.w), MIN_BLOCK, FLOOR_MAX) })}
          />
        </Labeled>
        <Labeled label="ارتفاع">
          <input
            type="number"
            dir="ltr"
            min={MIN_BLOCK}
            max={FLOOR_MAX}
            step={10}
            className={cn(INPUT_CLS, 'text-center')}
            value={block.h}
            onChange={(e) => onPatch({ h: clamp(Math.round(Number(e.target.value) || block.h), MIN_BLOCK, FLOOR_MAX) })}
          />
        </Labeled>
        <Labeled label="چرخش">
          <button onClick={onRotate} className={cn(INPUT_CLS, 'flex items-center justify-center gap-1 hover:bg-muted')}>
            <RotateCw size={13} /> {faNum(block.rotation)}°
          </button>
        </Labeled>
      </div>

      {isShelf && (
        <div className="rounded-xl border border-[#c9a227]/40 bg-[#c9a227]/8 p-2">
          <p className="mb-1.5 text-[11px] font-black">پلانوگرام {planogramName ? `: ${planogramName}` : 'متصل نیست'}</p>
          <div className="flex flex-wrap gap-1.5">
            {!canManage && !planogramName && <p className="text-[10px] text-muted-foreground">برای اتصال پلانوگرام دسترسی مدیریت لازم است.</p>}
            {canManage && (
              <button onClick={onPickPlanogram} disabled={busy} className="rounded-lg bg-[#0e7a4a] px-2.5 py-1 text-[10px] font-black text-white hover:opacity-90 disabled:opacity-50">
                انتخاب پلانوگرام
              </button>
            )}
            {canManage && planogramName && (
              <button onClick={onUnlinkPlanogram} disabled={busy} className="rounded-lg border border-[#b3372f]/40 px-2.5 py-1 text-[10px] font-black text-[#b3372f] hover:bg-[#b3372f]/10 disabled:opacity-50">
                قطع اتصال
              </button>
            )}
            <button onClick={onRestock} className="rounded-lg bg-gradient-to-l from-[#c9a227] to-[#c96f4a] px-2.5 py-1 text-[10px] font-black text-white hover:brightness-105">
              درخواست پُرکردن قفسه 📦
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onDuplicate} className="flex-1 rounded-xl border border-border bg-white py-2 text-[11px] font-black hover:bg-muted">
          <Copy size={13} className="me-1 inline" /> تکثیر
        </button>
        <button onClick={onDelete} className="flex-1 rounded-xl bg-[#b3372f] py-2 text-[11px] font-black text-white hover:opacity-90">
          <Trash2 size={13} className="me-1 inline" /> حذف
        </button>
      </div>
      <p className="text-center text-[10px] text-muted-foreground">
        محدودهٔ نقشه: {faNum(planWidth)}×{faNum(planHeight)} سانتی‌متر — اسنپ ۱۰ سانتی‌متری
      </p>
    </div>
  )
}

/* ── بازرس گروه (چندانتخابی — گروه‌بندی زون + مسئول) ── */
function InspectorMulti({
  count,
  zoneOptions,
  responsibleOptions,
  personnelDenied,
  onAssignZone,
  onClearZone,
  onAssignResponsible,
  onDeleteAll,
}: {
  count: number
  zoneOptions: string[]
  responsibleOptions: PersonnelLite[]
  personnelDenied: boolean
  onAssignZone: (z: string) => void
  onClearZone: () => void
  onAssignResponsible: (id: string) => void
  onDeleteAll: () => void
}) {
  const [z, setZ] = useState('')
  const [resp, setResp] = useState('')
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-[#c9a227]/10 p-2 text-center">
        <p className="text-xs font-black">🔗 {faNum(count)} بلوک انتخاب شده</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Shift+کلیک برای افزودن/کم‌کردن اعضای گروه</p>
      </div>
      <Labeled label="گروه‌بندی زون — تخصیص گروهی">
        <input className={INPUT_CLS} list="fp-zone-options" value={z} onChange={(e) => setZ(e.target.value.slice(0, 80))} placeholder="نام زون برای کل گروه…" />
      </Labeled>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!z.trim()) return toast.error('نام زون را وارد کنید')
            onAssignZone(z.trim())
            setZ('')
          }}
          className="flex-1 rounded-xl bg-[#0e7a4a] py-2 text-[11px] font-black text-white hover:opacity-90"
        >
          <MapPin size={13} className="me-1 inline" /> تخصیص زون به گروه
        </button>
        <button onClick={onClearZone} className="rounded-xl border border-border bg-white px-3 py-2 text-[11px] font-black hover:bg-muted">
          بدون زون
        </button>
      </div>
      {zoneOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {zoneOptions.slice(0, 8).map((zn) => (
            <button key={zn} onClick={() => onAssignZone(zn)} className="flex items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-bold hover:bg-muted">
              <span className="size-2 rounded-full" style={{ background: hashZoneColor(zn) }} />
              {zn}
            </button>
          ))}
        </div>
      )}
      <Labeled label="مسئول زون (گروهی)" hint={responsibleOptions.length === 0 && personnelDenied ? 'فهرست پرسنل در دسترس نبود' : 'برای همهٔ بلوک‌های انتخابی ثبت می‌شود'}>
        <select className={INPUT_CLS} value={resp} onChange={(e) => setResp(e.target.value)}>
          <option value="">— انتخاب مسئول —</option>
          {responsibleOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Labeled>
      <button
        onClick={() => {
          if (!resp) return toast.error('ابتدا مسئول را انتخاب کنید')
          onAssignResponsible(resp)
        }}
        className="w-full rounded-xl border-2 border-[#0e7a4a]/40 bg-white py-2 text-[11px] font-black text-[#0e7a4a] hover:bg-[#0e7a4a]/8"
      >
        ثبت مسئول برای {faNum(count)} بلوک
      </button>
      <button onClick={onDeleteAll} className="w-full rounded-xl bg-[#b3372f] py-2 text-[11px] font-black text-white hover:opacity-90">
        <Trash2 size={13} className="me-1 inline" /> حذف کل گروه
      </button>
    </div>
  )
}

/* ── بازرس خالی: راهنما + راهنمای زون‌ها ── */
function InspectorEmpty({ plan, blockCount, zoneLegend, shapeLabel, dimsLabel }: { plan: PlanRow | null; blockCount: number; zoneLegend: Array<{ name: string; count: number }>; shapeLabel: string; dimsLabel: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-muted/40 p-2.5">
        <p className="mb-1 text-[11px] font-black">راهنمای سریع</p>
        <ul className="space-y-1 text-[10px] leading-relaxed text-muted-foreground">
          <li>• بلوکی از کتابخانه را انتخاب و با کلیک روی نقشه قرار دهید (ESC = لغو)</li>
          <li>• درگ = جابه‌جایی (اسنپ ۱۰) — گوشهٔ بلوک = تغییر اندازه</li>
          <li>• «رسم زمین چندضلعی»: کلیک = رأس، درگ = جابه‌جایی رأس، دوبارکلیک روی ضلع = رأس جدید</li>
          <li>• Shift+کلیک = انتخاب گروهی برای زون‌بندی</li>
          <li>• جهت‌نمای کیبورد = حرکت ۱۰ (با Shift = ۱) — Delete = حذف</li>
          <li>• درگ روی پس‌زمینه = جابه‌جایی نما (Pan)</li>
        </ul>
      </div>
      {plan && (
        <div className="rounded-xl border border-border bg-white p-2.5">
          <p className="mb-1.5 text-[11px] font-black">آمار طبقهٔ فعال</p>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold">
            <span className="rounded-lg bg-muted/60 px-2 py-1.5">بلوک‌ها: {faNum(blockCount)}</span>
            <span className="rounded-lg bg-muted/60 px-2 py-1.5">{shapeLabel}</span>
            <span className="rounded-lg bg-muted/60 px-2 py-1.5">ابعاد: {dimsLabel}</span>
            <span className="rounded-lg bg-muted/60 px-2 py-1.5">طبقه: {faNum(plan.floorIndex)}</span>
            <span className="col-span-2 rounded-lg bg-muted/60 px-2 py-1.5">زون‌ها: {faNum(zoneLegend.length)}</span>
          </div>
        </div>
      )}
      {zoneLegend.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-2.5">
          <p className="mb-1.5 text-[11px] font-black">راهنمای زون‌ها</p>
          <div className="space-y-1">
            {zoneLegend.map((zl) => (
              <div key={zl.name} className="flex items-center gap-2 text-[10px] font-bold">
                <span className="size-3 rounded" style={{ background: hashZoneColor(zl.name) }} />
                <span className="flex-1 truncate">{zl.name}</span>
                <span className="text-muted-foreground">{faNum(zl.count)} بلوک</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── مودال ساخت/ویرایش طبقه (ابعاد ۲۰۰ تا ۱۲٬۰۰۰ سانتی‌متر) ── */
function FloorFormModal({
  mode,
  plan,
  defaultIndex,
  busy,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  plan: PlanRow | null
  defaultIndex: number
  busy: boolean
  onClose: () => void
  onSubmit: (v: { name: string; floorIndex: number; width: number; height: number }) => void
}) {
  const [name, setName] = useState(plan?.name || '')
  const [fi, setFi] = useState(String(plan?.floorIndex ?? defaultIndex))
  const [w, setW] = useState(String(plan?.width ?? defaultNewFloor.width))
  const [h, setH] = useState(String(plan?.height ?? defaultNewFloor.height))
  const isPolyFloor = parseShapeClient(plan?.shape).length >= 3

  const submit = () => {
    const n = name.trim()
    if (!n) return toast.error('نام طبقه الزامی است')
    const floorIndex = Math.round(Number(fi))
    const width = Math.round(Number(w))
    const height = Math.round(Number(h))
    if (!isFinite(floorIndex) || floorIndex < 0 || floorIndex > 20) return toast.error('شمارهٔ طبقه بین ۰ تا ۲۰ باشد')
    if (!isFinite(width) || width < FLOOR_MIN || width > FLOOR_MAX) return toast.error(`عرض بین ${faNum(FLOOR_MIN)} تا ${faNum(FLOOR_MAX)} سانتی‌متر باشد`)
    if (!isFinite(height) || height < FLOOR_MIN || height > FLOOR_MAX) return toast.error(`ارتفاع بین ${faNum(FLOOR_MIN)} تا ${faNum(FLOOR_MAX)} سانتی‌متر باشد`)
    onSubmit({ name: n, floorIndex, width, height })
  }

  return (
    <Modal title={mode === 'create' ? 'طبقهٔ جدید' : `ویرایش طبقهٔ «${plan?.name}»`} onClose={onClose}>
      <Labeled label="نام طبقه">
        <input className={INPUT_CLS} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: همکف — فروشگاه اصلی" autoFocus />
      </Labeled>
      <div className="grid grid-cols-3 gap-2">
        <Labeled label="شمارهٔ طبقه" hint="۰ تا ۲۰">
          <input type="number" dir="ltr" min={0} max={20} className={cn(INPUT_CLS, 'text-center')} value={fi} onChange={(e) => setFi(e.target.value)} />
        </Labeled>
        <Labeled label="عرض (سانتی‌متر)" hint={`۲۰۰ تا ۱۲٬۰۰۰ (۱۲۰ متر)`}>
          <input type="number" dir="ltr" min={FLOOR_MIN} max={FLOOR_MAX} step={50} className={cn(INPUT_CLS, 'text-center')} value={w} onChange={(e) => setW(e.target.value)} />
        </Labeled>
        <Labeled label="ارتفاع (سانتی‌متر)" hint={`۲۰۰ تا ۱۲٬۰۰۰`}>
          <input type="number" dir="ltr" min={FLOOR_MIN} max={FLOOR_MAX} step={50} className={cn(INPUT_CLS, 'text-center')} value={h} onChange={(e) => setH(e.target.value)} />
        </Labeled>
      </div>
      <p className="rounded-xl bg-[#77934a]/10 p-2 text-[10px] font-bold leading-relaxed text-[#4c5c33]">
        💡 برای زمین با شکل دلخواه (ذوزنقه، L، فرورفتگی…) بعد از ساخت طبقه از دکمهٔ «رسم زمین چندضلعی» استفاده کنید.
        {isPolyFloor && ' این طبقه در حال حاضر زمین چندضلعی دارد؛ ابعاد مستطیلی فقط برای حالت مستطیلی به‌کار می‌رود.'}
      </p>
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0e7a4a] py-2.5 text-xs font-black text-white hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {mode === 'create' ? 'ساخت طبقه' : 'ذخیرهٔ تغییرات'}
        </button>
        <button onClick={onClose} className="rounded-xl border border-border bg-white px-4 py-2.5 text-xs font-black hover:bg-muted">
          انصراف
        </button>
      </div>
    </Modal>
  )
}

/* ── مودال درخواست تأمین (پُرکردن قفسه) ── */
function RestockModal({ block, planName, onClose }: { block: Block; planName: string; onClose: () => void }) {
  const [product, setProduct] = useState('')
  const [qty, setQty] = useState('10')
  const [busy, setBusy] = useState(false)
  const [skName, setSkName] = useState<string | null>(null)
  const [noSk, setNoSk] = useState(false)

  useEffect(() => {
    let live = true
    api<{ users: Array<{ id: string; name: string; role: string; active: boolean; hidden?: boolean }> }>('/api/users')
      .then((d) => {
        if (!live) return
        const sk = (d.users || []).find((u) => u.role === 'SK' && u.active && !u.hidden)
        if (sk) setSkName(sk.name)
        else setNoSk(true)
      })
      .catch(() => live && setNoSk(true))
    return () => {
      live = false
    }
  }, [])

  const submit = async () => {
    const p = product.trim()
    const q = Math.round(Number(qty))
    if (!p) return toast.error('نام محصول را بنویسید')
    if (!isFinite(q) || q < 1 || q > 999) return toast.error('تعداد بین ۱ تا ۹۹۹ باشد')
    setBusy(true)
    try {
      const sk = await api<{ users: Array<{ id: string; name: string; role: string; active: boolean; hidden?: boolean }> }>('/api/users').then(
        (d) => (d.users || []).find((u) => u.role === 'SK' && u.active && !u.hidden),
      )
      if (!sk) {
        toast.error('کاربر انبار (SK) فعالی یافت نشد — ابتدا در «نیروی انسانی» تعریف کنید')
        return
      }
      await api('/api/tasks', {
        method: 'POST',
        body: {
          title: `تأمین ${block.label || 'قفسه'}: ${faNum(q)} از ${p}`,
          description: `[پلان] درخواست پرکردن قفسه از نقشهٔ فروشگاه — طبقه: ${planName} — بلوک: ${block.label}${block.zoneName ? ` — زون: ${block.zoneName}` : ''} — محصول: ${p} — تعداد: ${q}`,
          type: 'TASK',
          priority: 'HIGH',
          assignedToId: sk.id,
          points: 20,
          dueDate: '',
        },
      })
      toast.success('ثبت شد — انبار تأیید می‌کند')
      onClose()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="درخواست پُرکردن قفسه 📦" onClose={onClose}>
      <div className="rounded-xl bg-muted/60 p-2.5 text-[11px] font-bold">
        بلوک: <span className="text-[#0e7a4a]">{block.label}</span>
        {block.zoneName ? ` • زون ${block.zoneName}` : ''} — تسک HIGH برای {skName ? `انبار (${skName})` : 'انبار'}
      </div>
      <Labeled label="محصول موردنیاز (راهنما)">
        <input className={INPUT_CLS} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="مثلاً: شیر پرچرب ۱ لیتری" autoFocus />
      </Labeled>
      <Labeled label="تعداد">
        <input type="number" dir="ltr" min={1} max={999} className={cn(INPUT_CLS, 'text-center')} value={qty} onChange={(e) => setQty(e.target.value)} />
      </Labeled>
      {noSk && <p className="rounded-xl bg-[#b3372f]/10 p-2 text-[11px] font-bold text-[#b3372f]">کاربر انبار (SK) فعالی یافت نشد — ثبت ممکن نیست.</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={busy || noSk} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-l from-[#c9a227] to-[#c96f4a] py-2.5 text-xs font-black text-white hover:brightness-105 disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : '📦'} ثبت درخواست تأمین
        </button>
        <button onClick={onClose} className="rounded-xl border border-border bg-white px-4 py-2.5 text-xs font-black hover:bg-muted">
          انصراف
        </button>
      </div>
      <p className="text-center text-[10px] text-muted-foreground">این درخواست با پیشوند «[پلان]» در فهرست وظایف انبار ثبت می‌شود.</p>
    </Modal>
  )
}

/* ── مودال انتخاب پلانوگرام ── */
function PlanogramPickerModal({
  planograms,
  loading,
  currentId,
  busy,
  onPick,
  onClose,
}: {
  planograms: PlanogramRow[]
  loading: boolean
  currentId?: string
  busy: boolean
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const list = planograms.filter((p) => !q.trim() || p.name.includes(q.trim()) || (p.section || '').includes(q.trim()))
  return (
    <Modal title="انتخاب پلانوگرام" onClose={onClose}>
      <div className="relative">
        <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className={cn(INPUT_CLS, 'ps-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در پلانوگرام‌ها…" autoFocus />
      </div>
      <div className="scroll-gold max-h-72 space-y-1.5 overflow-y-auto">
        {loading && (
          <p className="flex items-center justify-center gap-2 py-6 text-xs font-bold text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> در حال دریافت پلانوگرام‌ها…
          </p>
        )}
        {!loading && list.length === 0 && <p className="py-6 text-center text-xs font-bold text-muted-foreground">پلانوگرامی یافت نشد</p>}
        {!loading &&
          list.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              disabled={busy}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-xl border-2 p-2.5 text-start transition hover:bg-muted disabled:opacity-60',
                p.id === currentId ? 'border-[#c9a227] bg-[#c9a227]/10' : 'border-border bg-white',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-black">{p.name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {p.section || 'بدون بخش'} • {faNum(p.rows)}×{faNum(p.cols)} • {faNum(p.cells)} خانه
                </span>
              </span>
              {p.id === currentId ? (
                <span className="shrink-0 rounded-full bg-[#c9a227] px-2 py-0.5 text-[10px] font-black text-white">متصل</span>
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{p.status === 'ACTIVE' ? 'فعال' : p.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'}</span>
              )}
            </button>
          ))}
      </div>
    </Modal>
  )
}

/* ── مودال تأیید عمومی ── */
function ConfirmModal({ title, message, confirmLabel = 'حذف', busy, onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="rounded-xl bg-[#b3372f]/8 p-3 text-xs font-bold leading-relaxed text-[#8a2a23]">{message}</p>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0e7a4a] py-2.5 text-xs font-black text-white hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {confirmLabel}
        </button>
        <button onClick={onClose} className="rounded-xl border border-border bg-white px-4 py-2.5 text-xs font-black hover:bg-muted">
          انصراف
        </button>
      </div>
    </Modal>
  )
}

/* ── ورودی عددی با نمایش ارقام فارسی — ارقام لاتین/فارسی/عربی را می‌پذیرد (پنل نقاط دقیق) ── */
function FaDigitInput({ value, min, max, onCommit, label }: { value: number; min: number; max: number; onCommit: (n: number) => void; label: string }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      aria-label={label}
      title={`${label}: ${faNum(value)} سانتی‌متر`}
      className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-center text-[11px] font-bold tabular-nums outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"
      value={faNum(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const n = parseInt(enDigits(e.target.value).replace(/[^\d]/g, ''), 10)
        if (!isFinite(n)) return
        onCommit(clamp(n, min, max))
      }}
    />
  )
}

/* ── پنل «نقاط دقیق زمین»: فهرست همهٔ رأس‌ها با X/Y سانتی‌متری + درج/حذف + نشان کادر محیطی ──
   همان state زمین ویرایشگر را می‌بیند — هر تغییر بلافاصله روی بوم هم اعمال می‌شود (و برعکس). */
function VertexPanel({
  shape,
  bb,
  dimsW,
  dimsH,
  selVertex,
  onSel,
  onEdit,
  onInsertAfter,
  onDelete,
  onClose,
}: {
  shape: Vertex[]
  bb: { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number }
  dimsW: number
  dimsH: number
  selVertex: number | null
  onSel: (i: number | null) => void
  onEdit: (idx: number, x: number, y: number) => void
  onInsertAfter: (idx: number) => void
  onDelete: (idx: number) => void
  onClose: () => void
}) {
  const n = shape.length
  // محدودهٔ مجاز: کادر پلان (برای قالب هایپر زیتون = ۲۵۶۰×۱۲۰۰) — بزرگ‌تر با bbox فعلی تا چندضلعی‌های غیرصفرِ مبدا سالم بمانند
  const xMax = Math.max(dimsW, bb.maxX)
  const yMax = Math.max(dimsH, bb.maxY)
  return (
    <div className="glow-card gold-glow-border rounded-2xl bg-card p-4 fade-in-up">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-[#c9a227]/15 text-lg">📐</span>
          <div>
            <h3 className="text-sm font-black">نقاط دقیق زمین</h3>
            <p className="text-[11px] text-muted-foreground">مختصات تک‌تک رأس‌های چندضلعی — واحد سانتی‌متر، همگام با بوم</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* نشان طلایی: کادر محیطی (عرض×طول متر) + تعداد رأس */}
          <span className="flex items-center gap-1.5 rounded-full bg-[#c9a227]/15 px-3 py-1.5 text-[10px] font-black text-[#8a6d10]">
            <Ruler size={12} />
            کادر محیطی: عرض {fmtM(bb.h)} × طول {fmtM(bb.w)} متر • {faNum(n)} رأس
          </span>
          <button onClick={onClose} title="بستن پنل" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* سرستون */}
      <div className="mb-1 hidden items-center gap-2 px-2 text-[10px] font-black text-muted-foreground sm:flex">
        <span className="w-8 shrink-0 text-center">رأس</span>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <span className="text-center">X — افقی از غرب (سانتی‌متر)</span>
          <span className="text-center">Y — عمودی از پشت (سانتی‌متر)</span>
        </div>
        <span className="w-20 shrink-0 text-center">عملیات</span>
      </div>

      <div className="scroll-gold max-h-96 space-y-1.5 overflow-y-auto pl-1">
        {shape.map((v, i) => (
          <div key={i} className={cn('flex items-center gap-2 rounded-xl border p-2 transition', i === selVertex ? 'border-[#c9a227] bg-[#c9a227]/8' : 'border-border bg-white')}>
            <button
              onClick={() => onSel(i === selVertex ? null : i)}
              title={`رأس ${faNum(i)} — انتخاب/هایلایت روی بوم`}
              className={cn('grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-black text-white shadow-sm', i === selVertex ? 'bg-[#c9a227]' : i === 0 ? 'bg-[#c96f4a]' : 'bg-[#0b2e20]')}
            >
              {faNum(i)}
            </button>
            <div className="grid flex-1 grid-cols-2 gap-2">
              <FaDigitInput label={`X رأس ${i}`} value={v.x} min={0} max={xMax} onCommit={(nx) => onEdit(i, nx, v.y)} />
              <FaDigitInput label={`Y رأس ${i}`} value={v.y} min={0} max={yMax} onCommit={(ny) => onEdit(i, v.x, ny)} />
            </div>
            <button
              onClick={() => onInsertAfter(i)}
              title="درج رأس جدید بعد از این رأس (میانِ ضلع بعدی)"
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#0e7a4a]/40 text-[#0e7a4a] hover:bg-[#0e7a4a]/10"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onDelete(i)}
              disabled={n <= 3}
              title={n <= 3 ? 'حداقل ۳ رأس لازم است' : 'حذف این رأس'}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#b3372f]/40 text-[#b3372f] hover:bg-[#b3372f]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[10px] font-bold leading-relaxed text-muted-foreground">
        X: افقی از دیوار غربی (چپ نقشه) • Y: عمودی از دیوار پشتی (بالای نقشه) • ➕ = درج رأس در میان ضلع بعدی • 🗑 = حذف رأس (حداقل ۳ رأس) • مقادیر بین ۰ تا کادر پلان محدود می‌شوند و هر تغییر بلافاصله روی بوم اعمال می‌شود (درگ گرافیکی هم همین state را تغییر می‌دهد).
      </p>
    </div>
  )
}

/* ═══════════════════════════ view اصلی ═══════════════════════════ */

type DragState = {
  mode: 'move' | 'resize' | 'pan' | 'vertex'
  id?: string
  rot?: number
  vIdx?: number
  startX: number
  startY: number
  panX: number
  panY: number
  orig: Record<string, { x: number; y: number; w: number; h: number }>
  shapeOrig?: Vertex[]
  moved: boolean
  shift?: boolean
  wasMulti?: boolean
  clickedId?: string
  downWorld?: { x: number; y: number }
}

export default function FloorPlanView({ ctx }: { ctx: AppCtx }) {
  /* ── data ── */
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [prefabs, setPrefabs] = useState<Prefab[]>([])
  const [zones, setZones] = useState<ZoneLite[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false) // عملیات مودال‌ها

  /* ── editor ui ── */
  const [selection, setSelection] = useState<string[]>([])
  const [placeKind, setPlaceKind] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 24, y: 24 })
  const [snapOn, setSnapOn] = useState(true)

  /* ── زمین (shape) ── */
  const [shape, setShape] = useState<Vertex[]>([])
  const [dims, setDims] = useState({ w: 1200, h: 800 })
  const [drawMode, setDrawMode] = useState(false)
  const [drawSnapshot, setDrawSnapshot] = useState<Vertex[] | null>(null)
  const [selVertex, setSelVertex] = useState<number | null>(null)

  /* ── پرسنل (مسئول زون) ── */
  const [personnel, setPersonnel] = useState<PersonnelLite[]>([])
  const [personnelStatus, setPersonnelStatus] = useState<'idle' | 'loading' | 'ready'>('idle')

  /* ── modals ── */
  const [newFloorOpen, setNewFloorOpen] = useState(false)
  const [editFloorOpen, setEditFloorOpen] = useState(false)
  const [deleteFloorOpen, setDeleteFloorOpen] = useState(false)
  const [pendingTab, setPendingTab] = useState<string | null>(null)
  const [restockId, setRestockId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [presetOpen, setPresetOpen] = useState(false)
  const [vertexPanelOpen, setVertexPanelOpen] = useState(false) // پنل «نقاط دقیق زمین»

  /* ── planograms (lazy) ── */
  const [planoData, setPlanoData] = useState<{ planograms: PlanogramRow[]; productMap: ProductMap } | null>(null)
  const [planoLoading, setPlanoLoading] = useState(false)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const planRef = useRef<PlanRow | null>(null)
  const dimsRef = useRef(dims)
  const shapeRef = useRef(shape)
  const snapRef = useRef(snapOn)
  const drawModeRef = useRef(drawMode)
  const lastShapeWarnRef = useRef(0)

  dimsRef.current = dims
  shapeRef.current = shape
  snapRef.current = snapOn
  drawModeRef.current = drawMode

  const activePlan = useMemo(() => plans.find((p) => p.id === activeId) || null, [plans, activeId])
  planRef.current = activePlan

  const prefabMap = useMemo(() => new Map(prefabs.map((p) => [p.kind, p])), [prefabs])
  const selectionSet = useMemo(() => new Set(selection), [selection])
  const selectedBlock = selection.length === 1 ? blocks.find((b) => b.id === selection[0]) || null : null
  const restockBlock = restockId ? blocks.find((b) => b.id === restockId) || null : null
  const popupBlock = selectedBlock && (SHELF_KINDS.has(selectedBlock.kind) || !!selectedBlock.meta.planogramId) ? selectedBlock : null
  const popupPlanogram = popupBlock && planoData ? planoData.planograms.find((p) => p.id === popupBlock.meta.planogramId) || null : null
  const canManage = useMemo(() => {
    const r = ctx.user?.role || ''
    const all = [r, ...(ctx.user?.secondaryRoles || [])]
    return all.includes('GM') || all.includes('OM') || all.includes('OWNER') || all.includes('ADMIN')
  }, [ctx.user])
  const zoneLegend = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of blocks) if (b.zoneName) m.set(b.zoneName, (m.get(b.zoneName) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  }, [blocks])
  const zoneOptions = useMemo(() => {
    const s = new Set<string>(zones.map((z) => z.name))
    for (const b of blocks) if (b.zoneName) s.add(b.zoneName)
    return [...s].sort((a, b) => a.localeCompare(b, 'fa'))
  }, [zones, blocks])

  const isPoly = shape.length >= 3
  const shapeBB = useMemo(() => (shape.length >= 3 ? polyBBox(shape) : null), [shape])
  const shapeSimple = useMemo(() => (shape.length >= 3 ? polygonIsSimple(shape) : true), [shape])
  const clipPolyStr = useMemo(() => (isPoly ? `polygon(${shape.map((v) => `${v.x}px ${v.y}px`).join(', ')})` : undefined), [isPoly, shape])
  const ptsStr = useMemo(() => shape.map((v) => `${v.x},${v.y}`).join(' '), [shape])

  const kindLabel = useCallback((kind: string) => prefabMap.get(kind)?.label || 'فضای سفارشی', [prefabMap])
  const kindIcon = useCallback((kind: string) => prefabMap.get(kind)?.icon || '⬚', [prefabMap])
  const kindColor = useCallback((kind: string) => KIND_COLOR_OVERRIDE[kind] || prefabMap.get(kind)?.color || '#9c8b6a', [prefabMap])
  const blockColor = useCallback((b: Block) => (b.zoneName ? hashZoneColor(b.zoneName) : kindColor(b.kind)), [kindColor])

  /* ── بارگذاری اولیه ── */
  const loadPlanIntoEditor = useCallback((p: PlanRow) => {
    const sh = parseShapeClient(p.shape)
    setShape(sh)
    setDims(planDims(p))
    setBlocks(p.blocks.map(toEditorBlock))
  }, [])

  useEffect(() => {
    let live = true
    api<{ plans: PlanRow[]; prefabs: Prefab[] }>('/api/floorplans')
      .then((d) => {
        if (!live) return
        const ps = (d.plans || []).slice().sort((a, b) => a.floorIndex - b.floorIndex || a.name.localeCompare(b.name, 'fa'))
        setPlans(ps)
        setPrefabs(d.prefabs || [])
        if (ps[0]) {
          setActiveId(ps[0].id)
          loadPlanIntoEditor(ps[0])
        }
      })
      .catch((e) => live && toast.error(errMsg(e)))
      .finally(() => live && setLoading(false))
    api<{ zones: Array<{ name: string; color: string }> }>('/api/zones')
      .then((d) => live && setZones((d.zones || []).map((z) => ({ name: z.name, color: z.color }))))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [loadPlanIntoEditor])

  /* ── پرسنل برای «مسئول زون» (تنبل — با اولین انتخاب بلوک) ── */
  const personnelFetchedRef = useRef(false)
  useEffect(() => {
    if (selection.length === 0 || personnelFetchedRef.current) return
    personnelFetchedRef.current = true
    setPersonnelStatus('loading')
    api<{ personnel: Array<{ id: string; firstName: string; lastName: string; active: boolean; jobTitle?: string }> }>('/api/personnel')
      .then((d) => {
        setPersonnel(
          (d.personnel || [])
            .filter((p) => p.active)
            .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() || p.jobTitle || 'بدون نام' })),
        )
        setPersonnelStatus('ready')
      })
      .catch(() => {
        setPersonnel([])
        setPersonnelStatus('ready')
      })
  }, [selection.length])

  /* ── fit view (بعد از تغییر طبقه/ابعاد زمین) ── */
  const fitView = useCallback(() => {
    const vp = viewportRef.current
    const d = dimsRef.current
    if (!vp) return
    const r = vp.getBoundingClientRect()
    const z = clamp(Math.min((r.width - 48) / d.w, (r.height - 48) / d.h), 0.03, 1.6)
    setZoom(z)
    setPan({ x: (r.width - d.w * z) / 2, y: (r.height - d.h * z) / 2 })
  }, [])

  useEffect(() => {
    const t = setTimeout(fitView, 80)
    return () => clearTimeout(t)
  }, [activeId, dims.w, dims.h, fitView])

  /* ── هشدار خروج هنگام تغییرات ذخیره‌نشده (best-effort) ── */
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  /* ── دریافت پلانوگرام‌ها به‌صورت تنبل ── */
  const ensurePlanograms = useCallback(() => {
    if (planoData || planoLoading) return
    setPlanoLoading(true)
    api<{ planograms: PlanogramRow[]; productMap: ProductMap }>('/api/planograms')
      .then((d) => setPlanoData({ planograms: d.planograms || [], productMap: d.productMap || {} }))
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setPlanoLoading(false))
  }, [planoData, planoLoading])
  useEffect(() => {
    if ((popupBlock || pickerOpen) && !planoData) ensurePlanograms()
  }, [popupBlock, pickerOpen, planoData, ensurePlanograms])

  /* ── mutations ── */
  const markDirty = useCallback(() => setDirty(true), [])
  const updateBlock = useCallback(
    (id: string, patch: Partial<Block>) => {
      setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
      markDirty()
    },
    [markDirty],
  )
  const updateBlocks = useCallback(
    (ids: string[], fn: (b: Block) => Block) => {
      const s = new Set(ids)
      setBlocks((bs) => bs.map((b) => (s.has(b.id) ? fn(b) : b)))
      markDirty()
    },
    [markDirty],
  )
  const addBlock = useCallback(
    (b: Block) => {
      setBlocks((bs) => [...bs, b])
      setSelection([b.id])
      markDirty()
    },
    [markDirty],
  )
  const removeBlocks = useCallback(
    (ids: string[]) => {
      const s = new Set(ids)
      setBlocks((bs) => bs.filter((b) => !s.has(b.id)))
      setSelection((sel) => sel.filter((i) => !s.has(i)))
      markDirty()
    },
    [markDirty],
  )
  const duplicateBlock = useCallback(
    (b: Block) => {
      const d = dimsRef.current
      const w = clamp(Math.round(b.w), MIN_BLOCK, FLOOR_MAX)
      const h = clamp(Math.round(b.h), MIN_BLOCK, FLOOR_MAX)
      const nb: Block = { ...b, id: genId(), w, h, x: clamp(snap10(b.x + 20), 0, Math.max(0, d.w - w)), y: clamp(snap10(b.y + 20), 0, Math.max(0, d.h - h)), meta: { ...b.meta } }
      addBlock(nb)
      toast.success(`«${b.label || kindLabel(b.kind)}» تکثیر شد`)
    },
    [addBlock, kindLabel],
  )

  /* ── drop block (place mode) ── */
  const dropBlock = useCallback(
    (world: { x: number; y: number }) => {
      const pf = placeKind ? prefabMap.get(placeKind) : null
      if (!pf) return
      const d = dimsRef.current
      const sn = snapRef.current
      const w = clamp(pf.w, MIN_BLOCK, FLOOR_MAX)
      const h = clamp(pf.h, MIN_BLOCK, FLOOR_MAX)
      const x = clamp(sn ? snap10(world.x - w / 2) : Math.round(world.x - w / 2), 0, Math.max(0, d.w - w))
      const y = clamp(sn ? snap10(world.y - h / 2) : Math.round(world.y - h / 2), 0, Math.max(0, d.h - h))
      addBlock({ id: genId(), kind: pf.kind, x, y, w, h, rotation: 0, label: pf.label, zoneName: '', meta: {} })
    },
    [placeKind, prefabMap, addBlock],
  )

  /* ── shape ops (چندضلعی) ── */
  const snapVal = useCallback((v: number) => (snapRef.current ? snap10(v) : Math.round(v)), [])

  const addVertexAt = useCallback(
    (world: { x: number; y: number }) => {
      const v = { x: clamp(snapVal(world.x), 0, FLOOR_MAX), y: clamp(snapVal(world.y), 0, FLOOR_MAX) }
      const next = [...shapeRef.current, v]
      if (next.length >= 4 && !polygonIsSimple(next)) {
        toast.error('این رأس شکل را متقاطع می‌کند — جای دیگری بگذارید')
        return
      }
      setShape(next)
      setSelVertex(next.length - 1)
      markDirty()
    },
    [snapVal, markDirty],
  )

  const enterDraw = useCallback(
    (fresh: boolean) => {
      const cur = shapeRef.current
      const base = fresh ? [] : cur.length >= 3 ? cur : [{ x: 0, y: 0 }, { x: dimsRef.current.w, y: 0 }, { x: dimsRef.current.w, y: dimsRef.current.h }, { x: 0, y: dimsRef.current.h }]
      setDrawSnapshot(cur)
      setShape(base)
      setDrawMode(true)
      setSelVertex(null)
      setSelection([])
      setPlaceKind(null)
    },
    [],
  )

  const finishDraw = useCallback(() => {
    const verts = shapeRef.current
    if (verts.length < 3) {
      toast.error('حداقل ۳ رأس لازم است — روی زمین کلیک کنید')
      return
    }
    if (!polygonIsSimple(verts)) {
      toast.error('خطوط زمین نباید همدیگر را قطع کنند — رأس متقاطع را جابه‌جا کنید')
      return
    }
    const bb = polyBBox(verts)
    if (bb.w < FLOOR_MIN || bb.h < FLOOR_MIN) {
      toast.error('کمترین ضلع زمین باید حداقل ۲۰۰ سانتی‌متر (۲ متر) باشد')
      return
    }
    setDims({ w: bb.w, h: bb.h })
    setDrawMode(false)
    setDrawSnapshot(null)
    setSelVertex(null)
    setDirty(true)
    const outCount = blocks.filter((b) => !pointInPoly({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, verts)).length
    toast.success(`زمین چندضلعی ثبت شد — ${fmtM(bb.w)} × ${fmtM(bb.h)} متر`)
    if (outCount > 0) toast.info(`${faNum(outCount)} بلوک بیرون محدودهٔ زمین است — جابه‌جا یا حذفش کنید`)
  }, [blocks])

  const cancelDraw = useCallback(() => {
    const snap = drawSnapshot
    const cur = shapeRef.current
    setDrawMode(false)
    setDrawSnapshot(null)
    setSelVertex(null)
    if (snap) {
      setShape(snap)
      if (snap.length >= 3) {
        const bb = polyBBox(snap)
        setDims({ w: bb.w, h: bb.h })
      }
      if (JSON.stringify(snap) !== JSON.stringify(cur)) setDirty(true)
    } else {
      setShape([])
    }
  }, [drawSnapshot])

  /** خروج از حالت رسم هنگام پرش به کار دیگر — اگر معتبر است ثبت، وگرنه لغو */
  const exitDrawKeep = useCallback(() => {
    const verts = shapeRef.current
    if (verts.length >= 3 && polygonIsSimple(verts) && polyBBox(verts).w >= FLOOR_MIN && polyBBox(verts).h >= FLOOR_MIN) {
      finishDraw()
    } else {
      cancelDraw()
    }
  }, [finishDraw, cancelDraw])

  const convertToRect = useCallback(() => {
    const cur = shapeRef.current
    const bb = cur.length >= 3 ? polyBBox(cur) : null
    setShape([])
    setDrawMode(false)
    setDrawSnapshot(null)
    setSelVertex(null)
    if (bb && bb.w > 0 && bb.h > 0) setDims({ w: bb.w, h: bb.h })
    setDirty(true)
    toast.success('زمین به حالت مستطیلی بازگشت — کادر محیطی حفظ شد')
  }, [])

  const startFreshDraw = useCallback(() => {
    setShape([])
    setSelVertex(null)
    markDirty()
  }, [markDirty])

  const deleteVertex = useCallback(
    (idx: number) => {
      const verts = shapeRef.current
      if (verts.length <= 3) {
        toast.error('حداقل ۳ رأس لازم است — ابتدا رأس بیشتری رسم کنید')
        return
      }
      const cand = verts.filter((_, i) => i !== idx)
      if (!polygonIsSimple(cand)) {
        toast.error('حذف این رأس شکل را متقاطع می‌کند')
        return
      }
      setShape(cand)
      setSelVertex(null)
      markDirty()
    },
    [markDirty],
  )

  const insertVertexOnLongest = useCallback(() => {
    const verts = shapeRef.current
    if (verts.length < 2) {
      toast.error('اول چند رأس با کلیک روی زمین بگذارید')
      return
    }
    let best = 0
    let bestLen = -1
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i]
      const b = verts[(i + 1) % verts.length]
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L > bestLen) {
        bestLen = L
        best = i
      }
    }
    const a = verts[best]
    const b = verts[(best + 1) % verts.length]
    const mid = { x: clamp(snapVal((a.x + b.x) / 2), 0, FLOOR_MAX), y: clamp(snapVal((a.y + b.y) / 2), 0, FLOOR_MAX) }
    const cand = [...verts.slice(0, best + 1), mid, ...verts.slice(best + 1)]
    if (!polygonIsSimple(cand)) {
      toast.error('افزودن این رأس شکل را متقاطع می‌کند')
      return
    }
    setShape(cand)
    setSelVertex(best + 1)
    markDirty()
  }, [snapVal, markDirty])

  /** درج رأس جدید بعد از ایندکس داده‌شده — میانِ ضلع بعدی (پنل «نقاط دقیق زمین») */
  const insertVertexAfter = useCallback(
    (idx: number) => {
      const verts = shapeRef.current
      if (verts.length < 2) return
      const a = verts[idx]
      const b = verts[(idx + 1) % verts.length]
      const mid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }
      const cand = [...verts.slice(0, idx + 1), mid, ...verts.slice(idx + 1)]
      if (cand.length >= 3 && !polygonIsSimple(cand)) {
        toast.error('درج این رأس شکل را متقاطع می‌کند')
        return
      }
      setShape(cand)
      setSelVertex(idx + 1)
      markDirty()
      toast.success(`رأس ${faNum(idx + 1)} درج شد — میان ضلع بعدی`)
    },
    [markDirty],
  )

  /** ویرایش دقیق X/Y یک رأس از پنل — همگام با درگ گرافیکی؛ متقاطع‌شدن شکل رد می‌شود */
  const updateVertexXY = useCallback(
    (idx: number, x: number, y: number) => {
      const verts = shapeRef.current
      const cur = verts[idx]
      if (!cur) return
      if (cur.x === x && cur.y === y) return
      const cand = verts.map((v, i) => (i === idx ? { x, y } : v))
      if (cand.length >= 3 && !polygonIsSimple(cand)) {
        const now = Date.now()
        if (now - lastShapeWarnRef.current > 1800) {
          lastShapeWarnRef.current = now
          toast.error('این مختصات ضلع‌ها را متقاطع می‌کند — مقدار رد شد')
        }
        return
      }
      setShape(cand)
      markDirty()
    },
    [markDirty],
  )

  const onEdgeDoubleClick = useCallback(
    (e: React.MouseEvent, i: number) => {
      e.stopPropagation()
      e.preventDefault()
      const verts = shapeRef.current
      if (verts.length < 2) return
      const a = verts[i]
      const b = verts[(i + 1) % verts.length]
      const vp = viewportRef.current
      if (!vp) return
      const r = vp.getBoundingClientRect()
      const wp = { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom }
      const p = nearestOnSeg(wp, a, b)
      const np = { x: clamp(snapVal(p.x), 0, FLOOR_MAX), y: clamp(snapVal(p.y), 0, FLOOR_MAX) }
      const cand = [...verts.slice(0, i + 1), np, ...verts.slice(i + 1)]
      if (!polygonIsSimple(cand)) {
        toast.error('افزودن رأس در این نقطه شکل را متقاطع می‌کند')
        return
      }
      setShape(cand)
      setSelVertex(i + 1)
      markDirty()
    },
    [pan, zoom, snapVal, markDirty],
  )

  const applyPreset = useCallback(() => {
    const p = hyperZeytoonPreset
    setShape(p.shape.map((v) => ({ ...v })))
    setDims({ w: p.width, h: p.height })
    setBlocks(p.blocks.map((b) => ({ id: genId(), kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, rotation: b.rotation, label: b.label, zoneName: b.zoneName, meta: { ...(b.meta || {}) } })))
    setSelection([])
    setPlaceKind(null)
    setDrawMode(false)
    setDrawSnapshot(null)
    setSelVertex(null)
    setPresetOpen(false)
    setVertexPanelOpen(true) // پنل «نقاط دقیق زمین» را باز کن تا رأس‌های قالب دیده/ویرایش شوند
    setDirty(true)
    toast.success(`قالب «${p.nameFa}» اعمال شد — برای ثبت، «ذخیرهٔ نقشه» را بزنید`)
  }, [])

  /* ── pointer helpers ── */
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = viewportRef.current!.getBoundingClientRect()
      return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom }
    },
    [pan, zoom],
  )
  const clampPan = useCallback((p: { x: number; y: number }) => {
    const vp = viewportRef.current
    const d = dimsRef.current
    if (!vp) return p
    const r = vp.getBoundingClientRect()
    const margin = 140
    return { x: clamp(p.x, r.width - d.w * zoom - margin, margin), y: clamp(p.y, r.height - d.h * zoom - margin, margin) }
  }, [zoom])

  const onBgPointerDown = (e: React.PointerEvent) => {
    if (dragRef.current) return
    const el = viewportRef.current!
    el.setPointerCapture(e.pointerId)
    dragRef.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      orig: {},
      moved: false,
      downWorld: screenToWorld(e.clientX, e.clientY),
    }
  }

  const onBlockPointerDown = (e: React.PointerEvent, b: Block) => {
    if (placeKind) return // حباب به پس‌زمینه → جای‌گذاری بلوک
    e.stopPropagation()
    if (e.button !== 0 && e.pointerType === 'mouse') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    let ids: string[]
    let shift = false
    let wasMulti = selection.length > 1
    if (e.shiftKey) {
      shift = true
      const next = selection.includes(b.id) ? selection.filter((i) => i !== b.id) : [...selection, b.id]
      setSelection(next)
      if (!next.includes(b.id)) {
        dragRef.current = null
        return
      }
      ids = next
    } else if (selection.includes(b.id)) {
      ids = selection
    } else {
      ids = [b.id]
      setSelection([b.id])
    }
    const orig: DragState['orig'] = {}
    for (const bb of blocks) if (ids.includes(bb.id)) orig[bb.id] = { x: bb.x, y: bb.y, w: bb.w, h: bb.h }
    dragRef.current = { mode: 'move', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, orig, moved: false, shift, wasMulti, clickedId: b.id }
  }

  const onResizePointerDown = (e: React.PointerEvent, b: Block) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      mode: 'resize',
      id: b.id,
      rot: b.rotation,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      orig: { [b.id]: { x: b.x, y: b.y, w: b.w, h: b.h } },
      moved: false,
    }
  }

  const onVertexPointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setSelVertex(idx)
    dragRef.current = {
      mode: 'vertex',
      vIdx: idx,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      orig: {},
      shapeOrig: shapeRef.current.map((v) => ({ ...v })),
      moved: false,
    }
  }

  const onViewportPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (d.mode === 'pan') {
      if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true
      if (d.moved) setPan(clampPan({ x: d.panX + dx, y: d.panY + dy }))
      return
    }
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true
    if (d.mode === 'vertex' && d.vIdx != null && d.shapeOrig) {
      if (!d.moved) return
      const wpt = screenToWorld(e.clientX, e.clientY)
      const nx = clamp(snapVal(wpt.x), 0, FLOOR_MAX)
      const ny = clamp(snapVal(wpt.y), 0, FLOOR_MAX)
      const cur = shapeRef.current[d.vIdx]
      if (cur && cur.x === nx && cur.y === ny) return
      const cand = d.shapeOrig.map((v, i) => (i === d.vIdx ? { x: nx, y: ny } : v))
      if (cand.length >= 3 && !polygonIsSimple(cand)) {
        const now = Date.now()
        if (now - lastShapeWarnRef.current > 1800) {
          lastShapeWarnRef.current = now
          toast.error('شکل نمی‌تواند خودش را قطع کند — حرکت رد شد')
        }
        return
      }
      setShape(cand)
      setDirty(true)
      return
    }
    if (d.mode === 'move') {
      const wx = dx / zoom
      const wy = dy / zoom
      const sn = snapRef.current
      setBlocks((bs) =>
        bs.map((b) => {
          const o = d.orig[b.id]
          if (!o) return b
          const nx = sn ? snap10(o.x + wx) : Math.round(o.x + wx)
          const ny = sn ? snap10(o.y + wy) : Math.round(o.y + wy)
          return { ...b, x: clamp(nx, -2000, FLOOR_MAX), y: clamp(ny, -2000, FLOOR_MAX) }
        }),
      )
      setDirty(true)
    } else if (d.mode === 'resize' && d.id) {
      const o = d.orig[d.id]
      const rot = ((d.rot || 0) * Math.PI) / 180
      const ux = { x: Math.cos(rot), y: Math.sin(rot) }
      const uy = { x: -Math.sin(rot), y: Math.cos(rot) }
      const Dx = dx / zoom
      const Dy = dy / zoom
      const dl = Dx * ux.x + Dy * ux.y
      const dh = Dx * uy.x + Dy * uy.y
      const nw = clamp(Math.round((o.w + dl) / 10) * 10, MIN_BLOCK, FLOOR_MAX)
      const nh = clamp(Math.round((o.h + dh) / 10) * 10, MIN_BLOCK, FLOOR_MAX)
      // گوشهٔ مقابل ثابت می‌ماند (چرخش حول مرکز)
      const cx = o.x + o.w / 2
      const cy = o.y + o.h / 2
      const ox = cx - (o.w / 2) * ux.x - (o.h / 2) * uy.x
      const oy = cy - (o.w / 2) * ux.y - (o.h / 2) * uy.y
      const ncx = ox + (nw / 2) * ux.x + (nh / 2) * uy.x
      const ncy = oy + (nw / 2) * ux.y + (nh / 2) * uy.y
      const nx = Math.round(ncx - nw / 2)
      const ny = Math.round(ncy - nh / 2)
      setBlocks((bs) => bs.map((b) => (b.id === d.id ? { ...b, x: nx, y: ny, w: nw, h: nh } : b)))
      setDirty(true)
    }
  }

  const onViewportPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.mode === 'pan' && !d.moved) {
      if (placeKind && d.downWorld) dropBlock(d.downWorld)
      else if (drawModeRef.current && d.downWorld) addVertexAt(d.downWorld)
      else setSelection([])
    }
    if (d.mode === 'move' && !d.moved && !d.shift && d.wasMulti && d.clickedId) setSelection([d.clickedId])
  }

  /* ── zoom controls (چندگانه — برای زمین‌های تا ۱۲۰ متر) ── */
  const zoomBy = useCallback(
    (factor: number) => {
      const vp = viewportRef.current
      if (!vp) return
      const nz = clamp(zoom * factor, ZOOM_MIN, ZOOM_MAX)
      if (nz === zoom) return
      const r = vp.getBoundingClientRect()
      const wx = (r.width / 2 - pan.x) / zoom
      const wy = (r.height / 2 - pan.y) / zoom
      setZoom(nz)
      setPan(clampPan({ x: r.width / 2 - wx * nz, y: r.height / 2 - wy * nz }))
    },
    [zoom, pan, clampPan],
  )

  /* ── keyboard ── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'Escape') {
        if (drawModeRef.current) finishDraw()
        else if (placeKind) setPlaceKind(null)
        else if (selection.length) setSelection([])
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && drawModeRef.current && selVertex != null) {
        e.preventDefault()
        deleteVertex(selVertex)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
        e.preventDefault()
        removeBlocks(selection)
        return
      }
      const step = e.shiftKey ? 1 : 10
      const moves: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }
      const mv = moves[e.key]
      if (mv && drawModeRef.current && selVertex != null) {
        e.preventDefault()
        const verts = shapeRef.current
        const v = verts[selVertex]
        if (!v) return
        const cand = verts.map((vv, i) => (i === selVertex ? { x: clamp(v.x + mv[0], 0, FLOOR_MAX), y: clamp(v.y + mv[1], 0, FLOOR_MAX) } : vv))
        if (cand.length >= 3 && !polygonIsSimple(cand)) {
          toast.error('این حرکت شکل را متقاطع می‌کند')
          return
        }
        setShape(cand)
        setDirty(true)
        return
      }
      if (mv && selection.length) {
        e.preventDefault()
        updateBlocks(selection, (b) => ({ ...b, x: e.shiftKey ? b.x + mv[0] : snap10(b.x + mv[0]), y: e.shiftKey ? b.y + mv[1] : snap10(b.y + mv[1]) }))
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [selection, placeKind, selVertex, finishDraw, deleteVertex, removeBlocks, updateBlocks])

  /* ── floor ops ── */
  const switchTab = (id: string) => {
    if (id === activeId) return
    if (dirty) {
      setPendingTab(id)
      return
    }
    doSwitch(id)
  }
  const doSwitch = (id: string) => {
    const p = plans.find((x) => x.id === id)
    if (!p) return
    setActiveId(id)
    loadPlanIntoEditor(p)
    setSelection([])
    setPlaceKind(null)
    setDrawMode(false)
    setDrawSnapshot(null)
    setSelVertex(null)
    setDirty(false)
  }

  const saveBlocks = async () => {
    const plan = planRef.current
    if (!plan || saving) return
    const verts = shapeRef.current
    const poly = verts.length >= 3
    if (poly) {
      if (!polygonIsSimple(verts)) {
        toast.error('زمین چندضلعی متقاطع است — قبل از ذخیره اصلاحش کنید')
        return
      }
      const bb = polyBBox(verts)
      if (bb.w < FLOOR_MIN || bb.h < FLOOR_MIN) {
        toast.error('کمترین ضلع زمین باید حداقل ۲۰۰ سانتی‌متر باشد')
        return
      }
    }
    setSaving(true)
    try {
      const d = dimsRef.current
      const payload = blocks.map((b) => ({
        kind: b.kind,
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.w),
        h: Math.round(b.h),
        rotation: b.rotation,
        label: b.label,
        zoneName: b.zoneName,
        meta: JSON.stringify({
          planogramId: b.meta.planogramId || undefined,
          responsibleId: b.meta.responsibleId || undefined,
          responsibleName: b.meta.responsibleName || undefined,
          capacity: b.meta.capacity || undefined,
          note: b.meta.note || undefined,
        }),
      }))
      const res = await api<{ ok: boolean; count: number; plan: PlanRow }>('/api/floorplans', {
        method: 'POST',
        body: { action: 'save-blocks', planId: plan.id, blocks: payload, shape: JSON.stringify(poly ? verts : []), width: d.w, height: d.h },
      })
      setDirty(false)
      if (res.plan) {
        const rawBlocks: ServerBlock[] = res.plan.blocks || []
        const synced: PlanRow = { ...res.plan, blocks: rawBlocks }
        setPlans((ps) => ps.map((p) => (p.id === plan.id ? synced : p)).sort((a, b) => a.floorIndex - b.floorIndex || a.name.localeCompare(b.name, 'fa')))
        setShape(parseShapeClient(synced.shape))
        setDims(planDims(synced))
        setBlocks(rawBlocks.map(toEditorBlock))
        setSelection([])
      }
      toast.success(`نقشه ذخیره شد — ${faNum(res.count)} بلوک روی «${plan.name}»${poly ? ' (زمین چندضلعی)' : ''}`)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  const createFloor = async (v: { name: string; floorIndex: number; width: number; height: number }) => {
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; plan: PlanRow }>('/api/floorplans', { method: 'POST', body: { action: 'create-plan', ...v } })
      const plan = { ...res.plan, blocks: [] as ServerBlock[] }
      setPlans((ps) => [...ps, plan].sort((a, b) => a.floorIndex - b.floorIndex || a.name.localeCompare(b.name, 'fa')))
      setActiveId(plan.id)
      loadPlanIntoEditor(plan)
      setSelection([])
      setDrawMode(false)
      setDrawSnapshot(null)
      setSelVertex(null)
      setDirty(false)
      setNewFloorOpen(false)
      toast.success(`طبقهٔ «${plan.name}» ساخته شد`)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const patchFloor = async (v: { name: string; floorIndex: number; width: number; height: number }) => {
    const plan = planRef.current
    if (!plan) return
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; plan: PlanRow }>('/api/floorplans', { method: 'PATCH', body: { id: plan.id, ...v } })
      setPlans((ps) =>
        ps
          .map((p) => (p.id === plan.id ? { ...p, ...res.plan, blocks: p.blocks } : p))
          .sort((a, b) => a.floorIndex - b.floorIndex || a.name.localeCompare(b.name, 'fa')),
      )
      if (shapeRef.current.length < 3) setDims({ w: res.plan.width, h: res.plan.height })
      setEditFloorOpen(false)
      toast.success('طبقه به‌روزرسانی شد')
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteFloor = async () => {
    const plan = planRef.current
    if (!plan) return
    setBusy(true)
    try {
      await api(`/api/floorplans?id=${plan.id}`, { method: 'DELETE' })
      const rest = plans.filter((p) => p.id !== plan.id)
      setPlans(rest)
      setDeleteFloorOpen(false)
      if (rest[0]) {
        setActiveId(rest[0].id)
        loadPlanIntoEditor(rest[0])
      } else {
        setActiveId('')
        setShape([])
        setBlocks([])
      }
      setDirty(false)
      setSelection([])
      setDrawMode(false)
      setSelVertex(null)
      toast.success(`طبقهٔ «${plan.name}» حذف شد`)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  /* ── zone ops ── */
  const assignResponsible = (id: string) => {
    if (!id) return
    const nm = personnel.find((p) => p.id === id)?.name
    updateBlocks(selection, (b) => ({ ...b, meta: { ...b.meta, responsibleId: id, responsibleName: nm || undefined } }))
    toast.success(`مسئول زون برای ${faNum(selection.length)} بلوک ثبت شد${nm ? `: ${nm}` : ''}`)
  }

  /* ── planogram ops ── */
  const pickPlanogram = (id: string) => {
    if (!selectedBlock) return
    updateBlock(selectedBlock.id, { meta: { ...selectedBlock.meta, planogramId: id } })
    const name = planoData?.planograms.find((p) => p.id === id)?.name || ''
    setPickerOpen(false)
    toast.success(`پلانوگرام «${name}» به بلوک متصل شد`)
  }
  const unlinkPlanogram = () => {
    if (!selectedBlock) return
    updateBlock(selectedBlock.id, { meta: { ...selectedBlock.meta, planogramId: undefined } })
    toast.success('اتصال پلانوگرام قطع شد')
  }

  /* ═══════════ render ═══════════ */

  if (loading)
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-sm font-bold text-muted-foreground">
        <Loader2 className="animate-spin text-[#0e7a4a]" size={28} />
        در حال بارگذاری نقشهٔ فروشگاه…
      </div>
    )

  if (plans.length === 0)
    return (
      <div className="space-y-4">
        <SectionHeader onNew={() => setNewFloorOpen(true)} />
        <EmptyState
          emoji="🗺️"
          title="هنوز طبقه‌ای ثبت نشده"
          hint="اولین طبقهٔ فروشگاه را بسازید: نام، شمارهٔ طبقه و ابعاد (۲۰۰ تا ۱۲٬۰۰۰ سانتی‌متر). بعد «رسم زمین چندضلعی» برای شکل دلخواه، «قالب هایپر زیتون» برای زمین واقعی و چیدمان آماده، یا بلوک‌های قفسه و یخچال از کتابخانه."
        />
        {newFloorOpen && <FloorFormModal mode="create" plan={null} defaultIndex={0} busy={busy} onClose={() => setNewFloorOpen(false)} onSubmit={createFloor} />}
        <datalist id="fp-zone-options">{zoneOptions.map((z) => <option key={z} value={z} />)}</datalist>
      </div>
    )

  const plan = activePlan!
  const handleSize = clamp(16 / zoom, 12, 40)
  const selB = selectedBlock
  const hitR = 22 / zoom // دست‌گیرهٔ رأس — ۴۴px لمسی
  const visR = clamp(7 / zoom, 4, 30)
  const toolbarPos = (() => {
    if (!selB) return null
    const bw = selB.rotation % 180 === 0 ? selB.w : selB.h
    const bh = selB.rotation % 180 === 0 ? selB.h : selB.w
    const cx = selB.x + selB.w / 2
    const cy = selB.y + selB.h / 2
    return { x: pan.x + (cx - bw / 2) * zoom, y: Math.max(6, pan.y + (cy - bh / 2) * zoom - 40) }
  })()

  const inspector = (
    <InspectorBody
      plan={plan}
      blocks={blocks}
      selection={selection}
      selectedBlock={selB}
      zoneOptions={zoneOptions}
      zoneLegend={zoneLegend}
      shapeLabel={isPoly ? `چندضلعی (${faNum(shape.length)} رأس)` : 'مستطیلی'}
      dimsLabel={`${faNum(dims.w)}×${faNum(dims.h)} سانتی‌متر`}
      responsibleOptions={personnel}
      personnelDenied={personnelStatus === 'ready' && personnel.length === 0}
      canManage={canManage}
      busy={busy}
      kindLabel={kindLabel(selB?.kind || '')}
      kindIcon={kindIcon(selB?.kind || '')}
      kindColor={selB ? kindColor(selB.kind) : '#9c8b6a'}
      planogramName={selB?.meta.planogramId ? planoData?.planograms.find((p) => p.id === selB.meta.planogramId)?.name || '؟' : null}
      onPatch={(patch) => selB && updateBlock(selB.id, patch)}
      onRotate={() => selB && updateBlock(selB.id, { rotation: (selB.rotation + 90) % 360 })}
      onDuplicate={() => selB && duplicateBlock(selB)}
      onDelete={() => selection.length > 0 && removeBlocks(selection)}
      onRestock={() => selB && setRestockId(selB.id)}
      onPickPlanogram={() => {
        ensurePlanograms()
        setPickerOpen(true)
      }}
      onUnlinkPlanogram={unlinkPlanogram}
      onAssignZone={(z) => updateBlocks(selection, (b) => ({ ...b, zoneName: z }))}
      onClearZone={() => updateBlocks(selection, (b) => ({ ...b, zoneName: '' }))}
      onAssignResponsible={assignResponsible}
    />
  )

  return (
    <div className="space-y-3 pb-24 lg:pb-0">
      <datalist id="fp-zone-options">{zoneOptions.map((z) => <option key={z} value={z} />)}</datalist>

      {/* ── سربرگ: تب طبقه‌ها + زمین + عملیات ── */}
      <div className="glow-card gold-glow-border rounded-2xl bg-card p-3 fade-in-up">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#0e7a4a]/10 text-lg">🗺️</span>
            <div>
              <h2 className="text-sm font-black">نقشهٔ فروشگاه</h2>
              <p className="text-[11px] text-muted-foreground">ویرایشگر پلان دوبعدی — زمین چندضلعی، چیدمان، زون‌بندی و اتصال پلانوگرام</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#c9a227]/15 px-2.5 py-1 text-[10px] font-black text-[#8a6d10]">
                <span className="size-1.5 animate-pulse rounded-full bg-[#c9a227]" /> تغییرات ذخیره‌نشده
              </span>
            )}
            <button
              onClick={saveBlocks}
              disabled={!dirty || saving}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black text-white shadow transition',
                dirty && !saving ? 'bg-gradient-to-l from-[#0e7a4a] to-[#0b5c38] hover:brightness-110 active:scale-[0.98]' : 'cursor-not-allowed bg-muted text-muted-foreground',
              )}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} ذخیرهٔ نقشه
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto scroll-gold pb-1">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => switchTab(p.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition',
                p.id === activeId ? 'border-transparent bg-[#0b2e20] text-[#faf7ee] shadow' : 'border-border bg-white text-foreground hover:border-[#0e7a4a]/40 hover:bg-muted/60',
              )}
            >
              {p.name}
              <span className={cn('text-[9px]', p.id === activeId ? 'text-[#c9a227]' : 'text-muted-foreground')}>طبقهٔ {faNum(p.floorIndex)}</span>
              {p.id === activeId && dirty && <span className="size-1.5 rounded-full bg-[#c9a227]" />}
            </button>
          ))}
          <button onClick={() => setNewFloorOpen(true)} className="flex shrink-0 items-center gap-1 rounded-xl border-2 border-dashed border-[#0e7a4a]/40 px-3 py-2 text-xs font-black text-[#0e7a4a] hover:bg-[#0e7a4a]/8">
            <Plus size={13} /> طبقهٔ جدید
          </button>
          <span className="mx-1 h-6 w-px shrink-0 bg-border" />
          <button onClick={() => setEditFloorOpen(true)} title="تغییر نام/ابعاد طبقه" className="shrink-0 rounded-xl border border-border bg-white p-2 hover:bg-muted">
            <Pencil size={13} />
          </button>
          <button onClick={() => setDeleteFloorOpen(true)} title="حذف طبقه" className="shrink-0 rounded-xl border border-[#b3372f]/40 bg-white p-2 text-[#b3372f] hover:bg-[#b3372f]/10">
            <Trash2 size={13} />
          </button>
        </div>

        {/* ردیف زمین: حالت + ابزار چندضلعی + پیش‌تنظیم */}
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="flex items-center gap-1.5 rounded-full bg-[#0b2e20]/90 px-3 py-1.5 text-[10px] font-black text-[#faf7ee]">
            <Ruler size={12} />
            زمین: {isPoly ? `چندضلعی (${faNum(shape.length)} رأس)` : 'مستطیلی'} — {fmtM(dims.w)} × {fmtM(dims.h)} متر
          </span>
          <span className="hidden text-[10px] font-bold text-muted-foreground md:inline">ابعاد دلخواه — تراپزوئید، L، هر شکلی</span>
          {!drawMode ? (
            <>
              <button
                onClick={() => enterDraw(false)}
                className="flex items-center gap-1.5 rounded-xl border-2 border-[#0e7a4a]/40 bg-white px-3 py-2 text-[11px] font-black text-[#0e7a4a] hover:bg-[#0e7a4a]/8"
              >
                <Shapes size={13} /> {isPoly ? 'ویرایش رسم زمین' : 'رسم زمین چندضلعی'}
              </button>
              {isPoly && (
                <button onClick={convertToRect} className="rounded-xl border border-border bg-white px-3 py-2 text-[11px] font-black hover:bg-muted" title="حفظ کادر محیطی چندضلعی به‌صورت مستطیل">
                  ▭ تبدیل به مستطیل
                </button>
              )}
              {isPoly && (
                <button
                  onClick={() => setVertexPanelOpen((o) => !o)}
                  title="ویرایش دقیق مختصات همهٔ رأس‌ها"
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-[11px] font-black transition',
                    vertexPanelOpen ? 'border-transparent bg-[#c9a227] text-white shadow' : 'border-[#c9a227]/50 bg-white text-[#8a6d10] hover:bg-[#c9a227]/10',
                  )}
                >
                  <ListOrdered size={13} /> نقاط دقیق زمین
                </button>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1.5 rounded-xl bg-[#c9a227]/15 px-3 py-2 text-[11px] font-black text-[#8a6d10]">✏️ در حال رسم زمین — از نوار روی نقشه استفاده کنید</span>
          )}
          <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" />
          <button
            onClick={() => setPresetOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#77934a] px-3 py-2 text-[11px] font-black text-white shadow hover:brightness-110 active:scale-[0.98]"
          >
            🫒 قالب هایپر زیتون
          </button>
        </div>

        {/* راهن زون‌ها — انتخاب سریع اعضا */}
        {zoneLegend.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            <span className="text-[10px] font-black text-muted-foreground">زون‌ها:</span>
            {zoneLegend.map((zl) => (
              <button
                key={zl.name}
                onClick={() => setSelection(blocks.filter((b) => b.zoneName === zl.name).map((b) => b.id))}
                title={`انتخاب ${faNum(zl.count)} بلوک زون ${zl.name}`}
                className="flex items-center gap-1 rounded-full border border-border bg-white px-2 py-1 text-[10px] font-bold hover:bg-muted"
              >
                <span className="size-2.5 rounded-full" style={{ background: hashZoneColor(zl.name) }} />
                {zl.name}
                <span className="text-muted-foreground">({faNum(zl.count)})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── پنل «نقاط دقیق زمین» — ویرایش مختصات تک‌تک رأس‌ها (همگام با بوم) ── */}
      {vertexPanelOpen && isPoly && (
        <VertexPanel
          shape={shape}
          bb={shapeBB!} /* isPoly ⇒ shapeBB حتماً هست */
          dimsW={dims.w}
          dimsH={dims.h}
          selVertex={selVertex}
          onSel={setSelVertex}
          onEdit={updateVertexXY}
          onInsertAfter={insertVertexAfter}
          onDelete={deleteVertex}
          onClose={() => setVertexPanelOpen(false)}
        />
      )}

      {/* ── ادیتور ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* کتابخانه — موبایل: چیپ افقی / دسکتاپ: پنل کناری */}
        <aside className="glow-card shrink-0 rounded-2xl bg-card p-2.5 lg:w-56">
          <p className="mb-2 hidden text-xs font-black lg:block">🧱 کتابخانهٔ بلوک‌ها</p>
          <div className="flex gap-2 overflow-x-auto scroll-gold pb-1 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0">
            {prefabs.map((pf) => (
              <button
                key={pf.kind}
                onClick={() => {
                  if (drawModeRef.current) exitDrawKeep()
                  setPlaceKind(placeKind === pf.kind ? null : pf.kind)
                }}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-start transition lg:w-full',
                  placeKind === pf.kind ? 'border-[#c9a227] bg-[#c9a227]/10 ring-2 ring-[#c9a227]/25' : 'border-border bg-white hover:border-foreground/25 hover:bg-muted/50',
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: (KIND_COLOR_OVERRIDE[pf.kind] || pf.color) + '20', color: KIND_COLOR_OVERRIDE[pf.kind] || pf.color, border: `1px solid ${(KIND_COLOR_OVERRIDE[pf.kind] || pf.color) + '55'}` }}>
                  {pf.icon}
                </span>
                <span className="whitespace-nowrap text-[11px] font-bold lg:whitespace-normal">{pf.label}</span>
                <span className="ms-auto hidden shrink-0 text-[9px] text-muted-foreground lg:inline" dir="ltr">
                  {faNum(pf.w)}×{faNum(pf.h)}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* بوم */}
        <div className="relative min-w-0 flex-1">
          <div
            ref={viewportRef}
            className="relative h-[58vh] min-h-[420px] touch-none select-none overflow-hidden rounded-2xl border-2 border-[#0b2e20]/25 bg-[#efe9d8] shadow-inner lg:h-[calc(100vh-330px)]"
            style={{ cursor: placeKind ? 'copy' : drawMode ? 'crosshair' : 'grab' }}
            onPointerDown={onBgPointerDown}
            onPointerMove={onViewportPointerMove}
            onPointerUp={onViewportPointerUp}
            onPointerCancel={onViewportPointerUp}
          >
            {/* لایهٔ تبدیل‌شده (پلان) */}
            <div
              className="absolute left-0 top-0"
              style={{
                width: dims.w,
                height: dims.h,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                backgroundColor: isPoly ? '#e6dfca' : '#faf7ee',
                boxShadow: '0 10px 44px rgba(11,46,32,0.22)',
                borderRadius: 4,
              }}
            >
              {/* پرکارب زمین + شبکهٔ شطرنجی — در حالت چندضلعی به شکل زمین بریده می‌شود */}
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 1,
                  backgroundImage: GRID_BG,
                  backgroundSize: GRID_SIZE,
                  clipPath: clipPolyStr,
                  outline: isPoly ? undefined : '2px solid rgba(11,46,32,0.45)',
                }}
              />

              {/* بلوک‌ها */}
              {blocks.map((b) => {
                const c = blockColor(b)
                const sel = selectionSet.has(b.id)
                return (
                  <div
                    key={b.id}
                    onPointerDown={(e) => onBlockPointerDown(e, b)}
                    className={cn('absolute flex flex-col items-center justify-center overflow-hidden rounded-[5px] text-center leading-tight', placeKind ? 'cursor-copy' : 'cursor-move')}
                    style={{
                      left: b.x,
                      top: b.y,
                      width: b.w,
                      height: b.h,
                      zIndex: 10,
                      transform: `rotate(${b.rotation}deg)`,
                      transformOrigin: '50% 50%',
                      background: c + (sel ? '45' : '2b'),
                      border: `${sel ? 0 : clamp(1.4 / zoom, 1, 3)}px solid ${c}`,
                      outline: sel ? `${clamp(2.2 / zoom, 1.5, 5)}px solid ${GOLD}` : undefined,
                      outlineOffset: clamp(1.5 / zoom, 1, 4),
                      boxShadow: sel ? '0 6px 22px rgba(201,162,39,0.4)' : undefined,
                    }}
                  >
                    <BlockDeco kind={b.kind} color={c} zoom={zoom} />
                    <span className="pointer-events-none relative z-[1] w-full truncate px-1 font-black text-[#22301f]" style={{ fontSize: clamp(11 / zoom, 8, 40) }}>
                      {b.label || kindLabel(b.kind)}
                    </span>
                    {b.zoneName && (
                      <span className="pointer-events-none relative z-[1] w-full truncate px-1 font-bold text-[#22301f]/60" style={{ fontSize: clamp(9 / zoom, 7, 30) }}>
                        {b.zoneName}
                      </span>
                    )}
                    {sel && blocks.length > 0 && (
                      <div
                        onPointerDown={(e) => onResizePointerDown(e, b)}
                        title="تغییر اندازه"
                        className="absolute bottom-0 right-0 z-10 cursor-nwse-resize rounded-tl-md border-2 border-white bg-[#c9a227] shadow"
                        style={{ width: handleSize, height: handleSize, transform: 'translate(30%, 30%)' }}
                      />
                    )}
                  </div>
                )
              })}
              {blocks.length === 0 && !drawMode && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-[#0b2e20]/80 px-4 py-2 text-[11px] font-bold text-[#faf7ee]">بلوکی از کتابخانه انتخاب کنید و اینجا کلیک کنید 📍</span>
                </div>
              )}
              {blocks.length === 0 && drawMode && shape.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-[#0b2e20]/80 px-4 py-2 text-[11px] font-bold text-[#faf7ee]">برای شروع رسم زمین، اولین رأس را روی نقشه بزنید 📐</span>
                </div>
              )}

              {/* دیوار و ابزار چندضلعی (روی بلوک‌ها تا دست‌گیره‌ها همیشه در دسترس باشند) */}
              {isPoly && (
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={dims.w}
                  height={dims.h}
                  viewBox={`0 0 ${dims.w} ${dims.h}`}
                  style={{ zIndex: drawMode ? 20 : 12, overflow: 'visible' }}
                >
                  {/* دیوار ضخیم — ضخامت ثابت روی صفحه */}
                  <polygon points={ptsStr} fill={drawMode ? 'rgba(250,247,238,0.35)' : 'none'} stroke={WALL} strokeWidth={6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  {drawMode &&
                    shape.map((v, i) => {
                      const n = shape[(i + 1) % shape.length]
                      const len = Math.hypot(n.x - v.x, n.y - v.y)
                      const midX = (v.x + n.x) / 2
                      const midY = (v.y + n.y) / 2
                      const off = len > 0 ? 16 / zoom : 0
                      const px = len > 0 ? -(n.y - v.y) / len : 0
                      const py = len > 0 ? (n.x - v.x) / len : 0
                      return (
                        <g key={`e${i}`}>
                          <line
                            x1={v.x}
                            y1={v.y}
                            x2={n.x}
                            y2={n.y}
                            stroke="transparent"
                            strokeWidth={Math.max(18 / zoom, 12)}
                            style={{ pointerEvents: 'stroke', cursor: 'copy' }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => onEdgeDoubleClick(e, i)}
                          />
                          <line x1={v.x} y1={v.y} x2={n.x} y2={n.y} stroke="rgba(11,46,32,0.4)" strokeWidth={1.6} strokeDasharray="7 5" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                          {len > 0 && (
                            <text
                              x={midX + px * off}
                              y={midY + py * off}
                              fontSize={clamp(11 / zoom, 9, 44)}
                              fontWeight={800}
                              fill={WALL}
                              stroke="#faf7ee"
                              strokeWidth={clamp(3 / zoom, 2, 10)}
                              paintOrder="stroke"
                              textAnchor="middle"
                              dominantBaseline="central"
                              pointerEvents="none"
                            >
                              {fmtM(len)}
                            </text>
                          )}
                        </g>
                      )
                    })}
                  {drawMode &&
                    shape.map((v, i) => (
                      <g key={`v${i}`} style={{ pointerEvents: 'all', cursor: 'grab' }} onPointerDown={(e) => onVertexPointerDown(e, i)}>
                        <circle cx={v.x} cy={v.y} r={hitR} fill="transparent" />
                        {i === selVertex && <circle cx={v.x} cy={v.y} r={visR * 1.9} fill="none" stroke={GOLD} strokeWidth={2.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
                        <circle cx={v.x} cy={v.y} r={visR} fill={i === selVertex ? GOLD : i === 0 ? '#c96f4a' : WALL} stroke="#faf7ee" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                        {i === 0 && (
                          <text x={v.x} y={v.y - 16 / zoom} fontSize={clamp(10 / zoom, 8, 40)} fontWeight={800} fill="#8a6d10" stroke="#faf7ee" strokeWidth={clamp(3 / zoom, 2, 10)} paintOrder="stroke" textAnchor="middle" pointerEvents="none">
                            شروع
                          </text>
                        )}
                        {vertexPanelOpen && i !== 0 && (
                          <text x={v.x} y={v.y - 16 / zoom} fontSize={clamp(10 / zoom, 8, 40)} fontWeight={800} fill="#8a6d10" stroke="#faf7ee" strokeWidth={clamp(3 / zoom, 2, 10)} paintOrder="stroke" textAnchor="middle" pointerEvents="none">
                            {faNum(i)}
                          </text>
                        )}
                      </g>
                    ))}
                  {/* شمارهٔ رأس‌ها هنگام باز بودن پنل «نقاط دقیق زمین» (غیر رسم) — مطابقت پنل ↔ بوم؛ غیرتعاملی */}
                  {!drawMode &&
                    vertexPanelOpen &&
                    shape.map((v, i) => (
                      <g key={`vnum${i}`} pointerEvents="none">
                        <circle cx={v.x} cy={v.y} r={visR * 1.1} fill={i === selVertex ? GOLD : WALL} stroke="#faf7ee" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                        <text
                          x={v.x}
                          y={v.y - (visR * 1.7 + 3 / zoom)}
                          fontSize={clamp(11 / zoom, 9, 40)}
                          fontWeight={800}
                          fill={i === selVertex ? '#8a6d10' : WALL}
                          stroke="#faf7ee"
                          strokeWidth={clamp(3 / zoom, 2, 10)}
                          paintOrder="stroke"
                          textAnchor="middle"
                          dominantBaseline="auto"
                          pointerEvents="none"
                        >
                          {faNum(i)}
                        </text>
                      </g>
                    ))}
                </svg>
              )}
            </div>

            {/* نوار ابزار رسم چندضلعی */}
            {drawMode && (
              <div className="absolute inset-x-2 top-2 z-30 flex justify-center" onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-[#c9a227]/50 bg-white/97 p-2 shadow-2xl backdrop-blur">
                  <span className="rounded-full bg-[#0b2e20] px-2.5 py-1.5 text-[10px] font-black text-[#faf7ee]">
                    ✏️ رأس‌ها: {faNum(shape.length)} • {fmtM(shapeBB ? shapeBB.w : dims.w)} × {fmtM(shapeBB ? shapeBB.h : dims.h)} متر
                  </span>
                  {shape.length >= 3 && !shapeSimple && <span className="rounded-full bg-[#b3372f] px-2.5 py-1.5 text-[10px] font-black text-white">⚠ خطوط متقاطع است</span>}
                  <button onClick={finishDraw} className="flex min-h-[44px] items-center gap-1 rounded-xl bg-[#0e7a4a] px-3 text-[11px] font-black text-white hover:opacity-90">
                    <Check size={13} /> پایان رسم و بستن
                  </button>
                  <button onClick={insertVertexOnLongest} title="رأس جدید در میان بلندترین ضلع" className="flex min-h-[44px] items-center gap-1 rounded-xl border border-border bg-white px-2.5 text-[11px] font-black hover:bg-muted">
                    <Plus size={13} /> رأس روی ضلع
                  </button>
                  <button
                    onClick={() => selVertex != null && deleteVertex(selVertex)}
                    disabled={selVertex == null}
                    className="flex min-h-[44px] items-center gap-1 rounded-xl border border-[#b3372f]/40 bg-white px-2.5 text-[11px] font-black text-[#b3372f] hover:bg-[#b3372f]/10 disabled:opacity-40"
                  >
                    <Trash2 size={13} /> حذف رأس
                  </button>
                  <button onClick={startFreshDraw} className="flex min-h-[44px] items-center gap-1 rounded-xl border border-border bg-white px-2.5 text-[11px] font-black hover:bg-muted">
                    شروع از صفر
                  </button>
                  <button onClick={cancelDraw} className="flex min-h-[44px] items-center gap-1 rounded-xl border border-border bg-white px-2.5 text-[11px] font-black hover:bg-muted">
                    <Undo2 size={13} /> لغو رسم
                  </button>
                  <span className="w-full text-center text-[9px] font-bold leading-relaxed text-muted-foreground">
                    کلیک روی زمین = رأس جدید • درگ رأس = جابه‌جایی • دوبارکلیک روی ضلع = رأس جدید در ضلع • رأس نارنجی = نقطهٔ شروع
                  </span>
                </div>
              </div>
            )}

            {/* نوار ابزار بلوک انتخاب‌شده (مختصات نما — مقیاس ثابت) */}
            {selB && toolbarPos && !drawMode && (
              <div
                className="absolute z-20 flex items-center gap-0.5 rounded-xl border border-border bg-white p-1 shadow-xl"
                style={{ left: toolbarPos.x, top: toolbarPos.y }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button onClick={() => updateBlock(selB.id, { rotation: (selB.rotation + 90) % 360 })} title="چرخش ۹۰ درجه" className="rounded-lg p-1.5 hover:bg-muted">
                  <RotateCw size={13} />
                </button>
                <button onClick={() => duplicateBlock(selB)} title="تکثیر" className="rounded-lg p-1.5 hover:bg-muted">
                  <Copy size={13} />
                </button>
                <button onClick={() => removeBlocks([selB.id])} title="حذف" className="rounded-lg p-1.5 text-[#b3372f] hover:bg-[#b3372f]/10">
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            {/* کنترل زوم + اسنپ */}
            <div className="absolute bottom-3 start-3 z-20 flex items-center gap-0.5 rounded-full border border-border bg-white/95 p-1 shadow-lg backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={() => zoomBy(0.8)} disabled={zoom <= ZOOM_MIN} title="کوچک‌نمایی" className="rounded-full p-1.5 hover:bg-muted disabled:opacity-40">
                <ZoomOut size={14} />
              </button>
              <span className="min-w-12 text-center text-[11px] font-black">{zoom < 0.1 ? faNum((zoom * 100).toFixed(1)) : faNum(Math.round(zoom * 100))}٪</span>
              <button onClick={() => zoomBy(1.25)} disabled={zoom >= ZOOM_MAX} title="بزرگ‌نمایی" className="rounded-full p-1.5 hover:bg-muted disabled:opacity-40">
                <ZoomIn size={14} />
              </button>
              <span className="h-4 w-px bg-border" />
              <button onClick={fitView} title="اندازه‌گذاری در کادر" className="rounded-full p-1.5 hover:bg-muted">
                <Maximize size={14} />
              </button>
              <span className="h-4 w-px bg-border" />
              <button onClick={() => setSnapOn((s) => !s)} title={snapOn ? 'اسنپ ۱۰ سانتی‌متری: روشن' : 'اسنپ خاموش'} className={cn('rounded-full p-1.5 transition', snapOn ? 'bg-[#0e7a4a] text-white' : 'text-muted-foreground hover:bg-muted')}>
                <Magnet size={14} />
              </button>
            </div>

            {/* آمار بوم */}
            <div className="pointer-events-none absolute bottom-3 end-3 z-10 flex items-center gap-1.5">
              <span className="rounded-full bg-[#0b2e20]/85 px-2.5 py-1 text-[10px] font-bold text-[#faf7ee]">📐 {fmtM(dims.w)}×{fmtM(dims.h)} متر</span>
              <span className="rounded-full bg-[#0b2e20]/85 px-2.5 py-1 text-[10px] font-bold text-[#faf7ee]">🧱 {faNum(blocks.length)} بلوک</span>
              {zoneLegend.length > 0 && <span className="rounded-full bg-[#0b2e20]/85 px-2.5 py-1 text-[10px] font-bold text-[#faf7ee]">🏷️ {faNum(zoneLegend.length)} زون</span>}
            </div>

            {/* نوار حالت جای‌گذاری */}
            {placeKind && !drawMode && (
              <div className="pointer-events-none absolute inset-x-0 bottom-14 z-20 flex justify-center px-2">
                <div className="flex items-center gap-2 rounded-full bg-[#0b2e20] px-4 py-1.5 text-[11px] font-black text-[#faf7ee] shadow-xl">
                  📍 جای‌گذاری «{kindLabel(placeKind)}» — روی نقشه کلیک کنید
                  <button onClick={() => setPlaceKind(null)} className="pointer-events-auto rounded-full bg-[#c9a227] px-2 py-0.5 text-[10px] font-black text-white">
                    ESC لغو
                  </button>
                </div>
              </div>
            )}

            {/* پاپ‌آپ پلانوگرام (دسکتاپ) */}
            {popupBlock && (
              <div className="absolute end-3 top-3 z-30 hidden lg:block">
                <BlockPopup
                  block={popupBlock}
                  kindLabel={kindLabel(popupBlock.kind)}
                  planogram={popupPlanogram}
                  productMap={planoData?.productMap || {}}
                  canManage={canManage}
                  busy={busy}
                  onRestock={() => setRestockId(popupBlock.id)}
                  onPick={() => {
                    ensurePlanograms()
                    setPickerOpen(true)
                  }}
                  onUnlink={unlinkPlanogram}
                  onClose={() => setSelection([])}
                />
              </div>
            )}
          </div>
        </div>

        {/* بازرس — دسکتاپ */}
        <aside className="glow-card hidden w-72 shrink-0 self-stretch overflow-y-auto scroll-gold rounded-2xl bg-card p-3 lg:block" style={{ maxHeight: 'calc(100vh - 330px)' }}>
          {inspector}
        </aside>
      </div>

      {/* بازرس — موبایل: Bottom Sheet */}
      {selection.length > 0 && (
        <div className="fixed inset-x-2 bottom-2 z-40 max-h-[52vh] overflow-y-auto scroll-gold rounded-2xl border border-border bg-card p-3 shadow-2xl lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <span className="mx-auto h-1 w-10 rounded-full bg-border" />
            <button onClick={() => setSelection([])} className="absolute end-4 top-2 rounded-lg p-1 text-muted-foreground hover:bg-muted">
              <X size={15} />
            </button>
          </div>
          {inspector}
          {popupBlock && (
            <div className="mt-3 border-t border-border pt-3">
              <BlockPopup
                block={popupBlock}
                kindLabel={kindLabel(popupBlock.kind)}
                planogram={popupPlanogram}
                productMap={planoData?.productMap || {}}
                canManage={canManage}
                busy={busy}
                onRestock={() => setRestockId(popupBlock.id)}
                onPick={() => {
                  ensurePlanograms()
                  setPickerOpen(true)
                }}
                onUnlink={unlinkPlanogram}
                onClose={() => setSelection([])}
              />
            </div>
          )}
        </div>
      )}

      {/* ── مودال‌ها ── */}
      {newFloorOpen && (
        <FloorFormModal mode="create" plan={null} defaultIndex={Math.max(0, ...plans.map((p) => p.floorIndex + 1))} busy={busy} onClose={() => setNewFloorOpen(false)} onSubmit={createFloor} />
      )}
      {editFloorOpen && <FloorFormModal mode="edit" plan={plan} defaultIndex={plan.floorIndex} busy={busy} onClose={() => setEditFloorOpen(false)} onSubmit={patchFloor} />}
      {deleteFloorOpen && (
        <ConfirmModal
          title={`حذف طبقهٔ «${plan.name}»`}
          message={`کل نقشهٔ این طبقه به‌همراه ${faNum(blocks.length)} بلوک برای همیشه حذف می‌شود. این عمل قابل بازگشت نیست — مطمئنید؟`}
          confirmLabel="حذف طبقه"
          busy={busy}
          onConfirm={deleteFloor}
          onClose={() => setDeleteFloorOpen(false)}
        />
      )}
      {presetOpen && (
        <ConfirmModal
          title="اعمال قالب هایپر زیتون"
          message="قالب زمین واقعی: کادر ۲۵٫۶ × ۱۲ متر — ضلع خیابان ≈ ۲۲ متر (۲۷ کاشی ۸۰ سانتی‌متری) + ضلع مورب ۴ متری در گوشهٔ خیابان + ورودی فرورفتهٔ ۶٫۴ متری با الکوی ۸۰ سانتی‌متری (تا عابران درب اتوماتیک را فعال نکنند). بلوک‌ها: ورودی روی خط درب الکو، صندوق U و صندوق ۲ داخل الکو، و زون‌های نمونهٔ میوه‌فروشی، لبنیات و نان. محتوای فعلی این طبقه (زمین و همهٔ بلوک‌ها) جایگزین می‌شود."
          confirmLabel="اعمال قالب"
          busy={busy}
          onConfirm={applyPreset}
          onClose={() => setPresetOpen(false)}
        />
      )}
      {pendingTab && (
        <Modal title="تغییرات ذخیره‌نشده" onClose={() => setPendingTab(null)}>
          <p className="rounded-xl bg-[#c9a227]/10 p-3 text-xs font-bold leading-relaxed text-[#8a6d10]">روی طبقهٔ فعلی تغییرات ذخیره‌نشده دارید. قبل از رفتن به طبقهٔ دیگر چه کنید؟</p>
          <div className="grid gap-2">
            <button
              onClick={async () => {
                const target = pendingTab
                setPendingTab(null)
                await saveBlocks()
                doSwitch(target)
              }}
              className="rounded-xl bg-[#0e7a4a] py-2.5 text-xs font-black text-white hover:opacity-90"
            >
              <Save size={13} className="me-1 inline" /> ذخیره و رفتن
            </button>
            <button
              onClick={() => {
                doSwitch(pendingTab)
                setPendingTab(null)
              }}
              className="rounded-xl border border-[#b3372f]/40 py-2.5 text-xs font-black text-[#b3372f] hover:bg-[#b3372f]/10"
            >
              رفتن بدون ذخیره
            </button>
            <button onClick={() => setPendingTab(null)} className="rounded-xl border border-border bg-white py-2.5 text-xs font-black hover:bg-muted">
              انصراف
            </button>
          </div>
        </Modal>
      )}
      {restockBlock && <RestockModal block={restockBlock} planName={plan.name} onClose={() => setRestockId(null)} />}
      {pickerOpen && (
        <PlanogramPickerModal
          planograms={planoData?.planograms || []}
          loading={planoLoading}
          currentId={selB?.meta.planogramId}
          busy={busy}
          onPick={pickPlanogram}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

/* ── بدنهٔ بازرس (تک/گروه/خالی) ── */
function InspectorBody({
  plan,
  blocks,
  selection,
  selectedBlock,
  zoneOptions,
  zoneLegend,
  shapeLabel,
  dimsLabel,
  responsibleOptions,
  personnelDenied,
  canManage,
  busy,
  kindLabel,
  kindIcon,
  kindColor,
  planogramName,
  onPatch,
  onRotate,
  onDuplicate,
  onDelete,
  onRestock,
  onPickPlanogram,
  onUnlinkPlanogram,
  onAssignZone,
  onClearZone,
  onAssignResponsible,
}: {
  plan: PlanRow
  blocks: Block[]
  selection: string[]
  selectedBlock: Block | null
  zoneOptions: string[]
  zoneLegend: Array<{ name: string; count: number }>
  shapeLabel: string
  dimsLabel: string
  responsibleOptions: PersonnelLite[]
  personnelDenied: boolean
  canManage: boolean
  busy: boolean
  kindLabel: string
  kindIcon: string
  kindColor: string
  planogramName: string | null
  onPatch: (patch: Partial<Block>) => void
  onRotate: () => void
  onDuplicate: () => void
  onDelete: () => void
  onRestock: () => void
  onPickPlanogram: () => void
  onUnlinkPlanogram: () => void
  onAssignZone: (z: string) => void
  onClearZone: () => void
  onAssignResponsible: (id: string) => void
}) {
  if (selectedBlock)
    return (
      <InspectorSingle
        block={selectedBlock}
        planWidth={plan.width}
        planHeight={plan.height}
        zoneOptions={zoneOptions}
        kindLabel={kindLabel}
        kindIcon={kindIcon}
        kindColor={kindColor}
        planogramName={planogramName}
        responsibleOptions={responsibleOptions}
        personnelDenied={personnelDenied}
        canManage={canManage}
        busy={busy}
        onPatch={onPatch}
        onRotate={onRotate}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onRestock={onRestock}
        onPickPlanogram={onPickPlanogram}
        onUnlinkPlanogram={onUnlinkPlanogram}
      />
    )
  if (selection.length > 1)
    return (
      <InspectorMulti
        count={selection.length}
        zoneOptions={zoneOptions}
        responsibleOptions={responsibleOptions}
        personnelDenied={personnelDenied}
        onAssignZone={onAssignZone}
        onClearZone={onClearZone}
        onAssignResponsible={onAssignResponsible}
        onDeleteAll={onDelete}
      />
    )
  return <InspectorEmpty plan={plan} blockCount={blocks.length} zoneLegend={zoneLegend} shapeLabel={shapeLabel} dimsLabel={dimsLabel} />
}

/* ── سربرگ حالت خالی (بدون طبقه) ── */
function SectionHeader({ onNew }: { onNew: () => void }) {
  return (
    <div className="glow-card gold-glow-border flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card p-4 fade-in-up">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-[#0e7a4a]/10 text-lg">🗺️</span>
        <div>
          <h2 className="text-sm font-black">نقشهٔ فروشگاه</h2>
          <p className="text-[11px] text-muted-foreground">ویرایشگر پلان دوبعدی — زمین چندضلعی، چیدمان، زون‌بندی و اتصال پلانوگرام</p>
        </div>
      </div>
      <button onClick={onNew} className="flex items-center gap-1.5 rounded-xl bg-[#0e7a4a] px-3.5 py-2 text-xs font-black text-white shadow hover:opacity-90">
        <Plus size={14} /> طبقهٔ جدید
      </button>
    </div>
  )
}
