import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Tabs, TabsList, TabsTrigger, money, fa, toEnDigits, toFaDigits, amountWords, todayJalali, JalaliDate, MoneyInput, printHTML, barcode128, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   archive — آرشیو اسناد (بایگانی هیبریدی دیجیتال + فیزیکی)
   جست‌وجو-محور: پیدا کردن کاغذ در یک ثانیه —
     کابینت ← قفسه ← زون‌بند ← برگه
   دو تب:
     ۱) اسناد: جست‌وجوی برجستهٔ سراسری (تأمین‌کننده، شماره فاکتور/رسید هلو،
        شماره چک، نام نماینده، عنوان…) + فیلتر نوع/وضعیت/زون‌بند/بازهٔ تاریخ
        + ثبت/ویرایش سند + دیالوگ جزئیات با چاپ برگهٔ جایگاه
     ۲) ساختار آرشیو: مدیریت کابینت/قفسه/زون‌بند با کد خودکار
        (CAB-01 · CAB-01-S2 · CAB-01-S2-B1) و آمار اسناد
   اسناد دارای قلم مرجوعی با برچسب قرمز نمایش داده می‌شوند.
   تب «نمایندگان فروش» در R8 به انبار ← تأمین‌کنندگان و اشخاص منتقل شد
   (suppliers.tsx) — فهرست نمایندگان فقط برای گزینشگر سند همین‌جا می‌آید.
   دسترسی: OWNER/GM/ADMIN/EXEC/ACC
   ───────────────────────────────────────────────────────────── */

/* ═══════════ ثابت‌ها و راهنماها ═══════════ */

const KINDS: { key: string; label: string; cls: string }[] = [
  { key: 'ORDER', label: 'سفارش خرید', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  { key: 'INVOICE', label: 'فاکتور خرید', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { key: 'RECEIPT', label: 'رسید پرداخت', cls: 'border-teal-200 bg-teal-50 text-teal-700' },
  { key: 'CHEQUE', label: 'چک', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  { key: 'RETURN', label: 'مرجوعی', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  { key: 'OTHER', label: 'سایر', cls: 'border-stone-200 bg-stone-100 text-stone-600' },
]
const kindMeta = (k: string) => KINDS.find((x) => x.key === k) || KINDS[KINDS.length - 1]

const STATUSES: { key: string; label: string; cls: string }[] = [
  { key: 'PENDING', label: 'در انتظار بایگانی', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  { key: 'IN_PROGRESS', label: 'در حال بایگانی', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  { key: 'ARCHIVED', label: 'بایگانی‌شده', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { key: 'MISSING', label: 'مفقود', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
]
const statusMeta = (s: string) => STATUSES.find((x) => x.key === s) || STATUSES[2]

/** سمت نماینده نسبت به این سند */
const REP_ROLES = ['دریافت چک', 'دریافت نقدی', 'تحویل مرجوعی', 'کالای نیامده', 'تحویل کالا', 'سایر']

/** رنگ دایرهٔ زون‌بند (متن آزاد است — فقط نمایش) */
const COLOR_DOT: Record<string, string> = {
  'آبی': 'bg-sky-500', 'سبز': 'bg-emerald-500', 'قرمز': 'bg-rose-500', 'زرد': 'bg-amber-400',
  'قهوه‌ای': 'bg-amber-800', 'طلایی': 'bg-yellow-500', 'بنفش': 'bg-violet-500', 'نارنجی': 'bg-orange-500',
  'صورتی': 'bg-pink-500', 'سفید': 'bg-white border border-stone-300', 'مشکی': 'bg-stone-800',
}
const colorDot = (c?: string | null) => COLOR_DOT[c || ''] || 'bg-stone-400'

/** ۱۴۰۵-۰۸-۰۲ → ۱۴۰۵/۰۸/۰۲ */
function faDate(v?: string | null): string {
  if (!v) return '—'
  return toFaDigits(String(v).replace(/-/g, '/'))
}

/* ═══════════ شکل داده‌ها ═══════════ */

interface DocItem {
  id: string
  kind: string
  title: string
  dateJalali?: string | null
  supplierId?: string | null
  supplierName?: string | null
  orderId?: string | null
  orderCode?: string | null
  returnId?: string | null
  returnCode?: string | null
  chequeId?: string | null
  chequeNumber?: string | null
  holooInvoiceNo?: string | null
  holooReceiptNo?: string | null
  repId?: string | null
  repName?: string | null
  repRole?: string | null
  repNote?: string | null
  binderId?: string | null
  folio?: string | null
  amount: number
  status: string
  returned: { name: string; qty: number; reason: string }[]
  returnedCount: number
  note?: string | null
  createdByName?: string | null
  createdAt: string
  location?: {
    binder: { id: string; name: string; code: string; category?: string | null; color?: string | null }
    shelf: { id: string; name: string; code: string } | null
    cabinet: { id: string; name: string; code: string; location?: string | null } | null
  } | null
  /* فقط در دیالوگ جزئیات */
  linkedOrder?: any
  linkedReturn?: any
  linkedCheque?: any
  rep?: { id: string; name: string; mobile?: string | null; company?: string | null; title?: string | null } | null
}

interface BinderNode {
  id: string
  name: string
  code: string
  category?: string | null
  color?: string | null
  note?: string | null
  sortOrder: number
  documentsCount: number
}
interface ShelfNode {
  id: string
  cabinetId: string
  name: string
  code: string
  note?: string | null
  bindersCount: number
  documentsCount: number
  binders: BinderNode[]
}
interface CabinetNode {
  id: string
  name: string
  code: string
  location?: string | null
  note?: string | null
  shelvesCount: number
  bindersCount: number
  documentsCount: number
  shelves: ShelfNode[]
}

interface RepItem {
  id: string
  name: string
  mobile?: string | null
  company?: string | null
  title?: string | null
  note?: string | null
  active: boolean
  documentsCount: number
}

/** همهٔ زون‌بندهای تخت (برای فیلتر و انتخاب جایگاه) */
interface FlatBinder extends BinderNode {
  cabinetId: string
  cabinetName: string
  shelfName: string
}

/* ═══════════ چاپ: برگهٔ جایگاه سند (برچسب A4) ═══════════ */

const PRINT_FONTS = [
  [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'],
].map(([w, n]) => `@font-face{font-family:'Vazirmatn';src:url(/fonts/Vazirmatn-${n}.woff2) format('woff2');font-weight:${w};font-display:swap}`).join('\n')

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** HTML کامل برگهٔ جایگاه — محل فیزیکی درشت تا از دور خوانده شود */
function coverHTML(d: DocItem, printedBy: string): string {
  const k = kindMeta(d.kind)
  const st = statusMeta(d.status)
  const loc = d.location
  const bc = loc ? barcode128(loc.binder.code, { height: 64, moduleWidth: 2, showText: false }) : null
  const bcUrl = bc ? (bc as HTMLCanvasElement).toDataURL('image/png') : ''
  const words = d.amount > 0 ? amountWords(d.amount) : null
  const rows: { k: string; v: string }[] = [
    { k: 'تأمین‌کننده', v: d.supplierName || '—' },
    { k: 'تاریخ سند', v: faDate(d.dateJalali) },
    { k: 'مبلغ', v: d.amount > 0 ? `${money(d.amount)} ریال` : '—' },
    { k: 'نوع سند', v: k.label },
    { k: 'وضعیت', v: st.label },
  ]
  if (d.orderCode) rows.push({ k: 'سفارش مرتبط', v: toFaDigits(d.orderCode) })
  if (d.returnCode) rows.push({ k: 'مرجوعی مرتبط', v: toFaDigits(d.returnCode) })
  if (d.chequeNumber) rows.push({ k: 'شماره چک', v: toFaDigits(d.chequeNumber) })
  if (d.holooInvoiceNo) rows.push({ k: 'شماره فاکتور هلو', v: toFaDigits(d.holooInvoiceNo) })
  if (d.holooReceiptNo) rows.push({ k: 'شماره رسید هلو', v: toFaDigits(d.holooReceiptNo) })
  if (d.repName) rows.push({ k: 'نماینده', v: `${d.repName}${d.repRole ? ` (${d.repRole})` : ''}` })
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>برگهٔ جایگاه سند — ${esc(d.title)}</title>
<style>
${PRINT_FONTS}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
body{font-family:'Vazirmatn','Segoe UI',Tahoma,sans-serif;color:#292524;font-size:12px;line-height:1.9;background:#f5f5f4}
.sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:12mm 13mm}
.lh{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.lh-brand{display:flex;align-items:center;gap:11px}
.lh-emblem{flex:none;width:56px;height:56px;border-radius:50%;background:linear-gradient(145deg,#ecfdf5,#d1fae5);border:2px solid #047857;display:flex;align-items:center;justify-content:center;font-size:28px}
.lh-name{font-size:23px;font-weight:800;color:#065f46;line-height:1.35}
.lh-sub{font-size:10.5px;font-weight:600;color:#57534e}
.lh-doc{text-align:left;flex:none}
.doc-title{font-size:16px;font-weight:800;color:#1c1917}
.doc-meta{font-size:9.5px;color:#57534e;margin-top:4px}
.rule{height:3px;border-radius:2px;background:linear-gradient(to left,#065f46,#047857 45%,#14b8a6);margin:9px 0 13px}
.sec-title{font-size:13px;font-weight:800;color:#065f46;border-right:3.5px solid #14b8a6;padding-right:9px;margin:13px 0 8px}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px;border:1px solid #e7e5e4;border-radius:11px;padding:9px 12px;background:#fafaf9}
.kv .k{font-size:9px;color:#78716c}
.kv .v{font-size:11.5px;font-weight:700;word-break:break-word}
/* محل فیزیکی — درشت و برجسته */
.loc{border:3px solid #047857;background:linear-gradient(180deg,#ecfdf5,#f6fefb);border-radius:14px;padding:11px 16px;text-align:center}
.loc-cap{font-size:11px;font-weight:700;color:#0f766e;letter-spacing:1px;margin-bottom:4px}
.loc-chain{font-size:26px;font-weight:800;color:#065f46;line-height:1.75}
.loc-chain .sep{color:#14b8a6;font-weight:400;margin:0 7px}
.loc-code{direction:ltr;display:inline-block;font-family:ui-monospace,'Courier New',monospace;font-size:14px;font-weight:700;color:#047857;background:#fff;border:1px solid #a7f3d0;border-radius:7px;padding:2px 13px;margin-top:7px;letter-spacing:.6px}
.loc-folio{font-size:19px;font-weight:800;color:#1c1917;margin-top:6px}
.loc-bar{margin-top:8px}
.loc-bar img{height:17mm}
.warn{border:1.5px solid #fecdd3;background:#fff1f2;color:#9f1239;border-radius:10px;padding:7px 12px;font-size:11px;font-weight:700;margin-top:10px}
.note{border:1px solid #e7e5e4;border-radius:10px;background:#fafaf9;padding:6px 11px;font-size:11px;color:#44403c;margin-top:10px}
.words{margin-top:9px;border:1px dashed #a7f3d0;background:#f6fefb;border-radius:10px;padding:6px 12px;font-size:10.5px;color:#065f46;font-weight:700}
.docfoot{margin-top:14px;border-top:1px solid #e7e5e4;padding-top:6px;display:flex;justify-content:space-between;font-size:8.8px;color:#78716c}
@media print{body{background:#fff}.sheet{margin:0;width:auto;min-height:auto;padding:10mm}}
@page{size:210mm auto;margin:6mm}
</style></head>
<body><div class="sheet">
<header class="lh">
  <div class="lh-brand">
    <div class="lh-emblem">🫒</div>
    <div><div class="lh-name">هایپر زیتون</div><div class="lh-sub">فروشگاه زنجیره‌ای — رفسنجان</div><div class="lh-sub">سامانهٔ سر رسید · آرشیو اسناد</div></div>
  </div>
  <div class="lh-doc">
    <div class="doc-title">برگهٔ جایگاه سند</div>
    <div class="doc-meta">چاپ: ${esc(printedBy)}</div>
    <div class="doc-meta">${esc(faDate(d.dateJalali))}</div>
  </div>
</header>
<div class="rule"></div>

<div class="sec-title">اطلاعات سند</div>
<div class="kv">${rows.map((r) => `<div><div class="k">${esc(r.k)}</div><div class="v">${esc(r.v)}</div></div>`).join('')}</div>
${words ? `<div class="words">مبلغ به حروف: ${esc(words.rial)}</div>` : ''}
${d.title ? `<div class="note"><b>عنوان:</b> ${esc(d.title)}</div>` : ''}
${d.returnedCount > 0 ? `<div class="warn">⚠ این سند ${toFaDigits(d.returnedCount)} قلم کالای مرجوعی دارد — هنگام مراجعه به کاغذ، برگهٔ مرجوعی را هم بررسی کنید.</div>` : ''}
${d.note ? `<div class="note"><b>یادداشت:</b> ${esc(d.note)}</div>` : ''}

<div class="sec-title">محل فیزیکی سند</div>
${loc ? `<div class="loc">
  <div class="loc-cap">کاغذ این سند اینجاست</div>
  <div class="loc-chain">${esc(loc.cabinet?.name || '')}<span class="sep">‹</span>${esc(loc.shelf?.name || '')}<span class="sep">‹</span>${esc(loc.binder.name)}</div>
  ${bcUrl ? `<div class="loc-bar"><img src="${bcUrl}" alt="barcode" /></div>` : ''}
  <div class="loc-code">${esc(loc.binder.code)}</div>
  ${d.folio ? `<div class="loc-folio">برگهٔ شمارهٔ ${toFaDigits(d.folio)}</div>` : ''}
</div>` : `<div class="warn">این سند هنوز جایگاه فیزیکی ندارد — به زون‌بندی منتقل شود.</div>`}

<div class="docfoot">
  <span>ثبت‌کننده: ${esc(d.createdByName || '—')}</span>
  <span>شناسهٔ سند: ${esc(d.id)}</span>
</div>
</div></body></html>`
}

/* ═══════════ نما ═══════════ */

export default function ArchiveView() {
  const { user } = useShell()
  const today = todayJalali()

  /* ── تب فعال ── */
  const [tab, setTab] = useState('docs')

  /* ── فهرست اسناد ── */
  const [q, setQ] = useState('')
  const [qEff, setQEff] = useState('')
  const [fKind, setFKind] = useState('ALL')
  const [fStatus, setFStatus] = useState('ALL')
  const [fBinder, setFBinder] = useState('ALL')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<DocItem[]>([])
  const [stats, setStats] = useState<any>(null)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const reqSeq = useRef(0)

  /* ── ساختار آرشیو ── */
  const [cabinets, setCabinets] = useState<CabinetNode[]>([])
  const [totals, setTotals] = useState<any>(null)

  /* ── نمایندگان (فقط برای گزینشگر سند — مدیریت کامل در انبار ← تأمین‌کنندگان و اشخاص) ── */
  const [reps, setReps] = useState<RepItem[]>([])

  /* ── دیالوگ سند (ثبت/ویرایش) ── */
  const emptyForm = {
    kind: 'INVOICE', title: '', dateJalali: today, status: 'ARCHIVED', amount: '',
    supplierId: 'NONE', supplierName: '',
    orderId: 'NONE', returnId: 'NONE', chequeId: 'NONE',
    holooInvoiceNo: '', holooReceiptNo: '',
    repId: 'NONE', repName: '', repRole: 'NONE', repNote: '',
    cabinetId: 'NONE', shelfId: 'NONE', binderId: 'NONE', folio: '',
    note: '',
    returned: [] as { name: string; qty: string; reason: string }[],
  }
  const [docOpen, setDocOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<any>(emptyForm)
  const [savingDoc, setSavingDoc] = useState(false)

  /* ── گزینشگرهای فرم (تأمین‌کننده/سفارش/مرجوعی/چک) — بارگذاری تنبل ── */
  const [pickersLoading, setPickersLoading] = useState(false)
  const [pickersLoaded, setPickersLoaded] = useState(false)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supFilter, setSupFilter] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [returns_, setReturns] = useState<any[]>([])
  const [cheques, setCheques] = useState<any[]>([])

  /* ── دیالوگ جزئیات ── */
  const [detail, setDetail] = useState<DocItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  /* ── دیالوگ ساختار (کابینت/قفسه/زون‌بند) ── */
  const emptyStruct = { type: 'cabinet', mode: 'create' as 'create' | 'edit', id: '', parentId: '', name: '', location: '', note: '', category: '', color: 'NONE', code: '' }
  const [structOpen, setStructOpen] = useState(false)
  const [structForm, setStructForm] = useState<any>(emptyStruct)
  const [savingStruct, setSavingStruct] = useState(false)

  /* ═══════════ بارگذاری داده‌ها ═══════════ */

  useEffect(() => {
    const t = setTimeout(() => setQEff(q), 400)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setPage(1)
    void loadDocs(1)
  }, [qEff, fKind, fStatus, fBinder, fFrom, fTo])
  useEffect(() => { void loadStructure() }, [])
  useEffect(() => { void loadReps() }, [])

  /** صفحهٔ صریح می‌گیرد تا رقابت پاسخ‌ها ممکن نشود؛ پاسخ کهنه با seq دور ریخته می‌شود */
  async function loadDocs(p = page) {
    const seq = ++reqSeq.current
    setLoading(true)
    const r = await api(`/api/archive${qs({
      q: qEff || undefined,
      kind: fKind !== 'ALL' ? fKind : undefined,
      status: fStatus !== 'ALL' ? fStatus : undefined,
      binderId: fBinder !== 'ALL' ? fBinder : undefined,
      from: fFrom || undefined,
      to: fTo || undefined,
      page: String(p),
      pageSize: '50',
    })}`)
    if (seq !== reqSeq.current) return /* پاسخ کهنه — درخواست جدیدتری در راه است */
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری اسناد ناموفق بود'); return }
    setItems(r.data.items || [])
    setStats(r.data.stats || null)
    setTotal(r.data.total || 0)
    setPages(r.data.pages || 1)
  }

  /** رفتن به صفحهٔ دیگر (بدون اثر جانبی دوباره) */
  function gotoPage(p: number) {
    setPage(p)
    void loadDocs(p)
  }

  async function loadStructure() {
    const r = await api('/api/archive/structure')
    if (!r.ok) { toast.error(r.error || 'بارگذاری ساختار آرشیو ناموفق بود'); return }
    setCabinets(r.data.cabinets || [])
    setTotals(r.data.totals || null)
  }

  /** فهرست نمایندگان — برای گزینشگر سند (CRUD کامل: انبار ← تأمین‌کنندگان و اشخاص) */
  async function loadReps() {
    const r = await api('/api/archive/reps')
    if (!r.ok) return /* بدون toast — فقط گزینشگر خالی می‌ماند */
    setReps(r.data.items || [])
  }

  /** بارگذاری یک‌بارهٔ فهرست‌های انتخاب — با اولین باز شدن فرم سند */
  async function loadPickers() {
    if (pickersLoaded || pickersLoading) return
    setPickersLoading(true)
    /* تأمین‌کنندگان — همهٔ صفحه‌ها (api سقف ۱۰۰ تایی دارد) */
    const sups: any[] = []
    for (let p = 1; p <= 30; p++) {
      const r = await api(`/api/suppliers?pageSize=100&page=${p}`)
      if (!r.ok) break
      const list = r.data?.items || []
      sups.push(...list)
      if (list.length < 100 || sups.length >= (r.data?.total || 0)) break
    }
    setSuppliers(sups)
    /* سفارش‌های تکمیل‌شده/تأییدشدهٔ اخیر */
    const [d1, d2] = await Promise.all([
      api('/api/orders?status=DONE&pageSize=100'),
      api('/api/orders?status=VERIFIED&pageSize=100'),
    ])
    const ords: any[] = []
    if (d1.ok) ords.push(...(d1.data?.items || []))
    if (d2.ok) ords.push(...(d2.data?.items || []))
    ords.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    setOrders(ords)
    /* مرجوعی‌ها و چک‌ها */
    const rr = await api('/api/returns?limit=100')
    setReturns(rr.ok ? rr.data?.items || [] : [])
    const rc = await api('/api/cheques')
    setCheques(rc.ok ? rc.data?.items || [] : [])
    setPickersLoaded(true)
    setPickersLoading(false)
  }

  /* ═══════════ فهرست تخت زون‌بندها (فیلتر + فرم) ═══════════ */

  const flatBinders: FlatBinder[] = useMemo(
    () => cabinets.flatMap((c) => c.shelves.flatMap((s) => s.binders.map((b) => ({ ...b, cabinetId: c.id, cabinetName: c.name, shelfName: s.name })))),
    [cabinets],
  )

  /** زون‌بندهای قابل انتخاب در فرم — بر اساس کابینت/قفسهٔ انتخاب‌شده */
  const formShelves = useMemo(() => cabinets.find((c) => c.id === form.cabinetId)?.shelves || [], [cabinets, form.cabinetId])
  const formBinders = useMemo(() => formShelves.find((s) => s.id === form.shelfId)?.binders || [], [formShelves, form.shelfId])

  /** تأمین‌کنندگان فیلترشده — سقف ۱۵۰ ردیف در Select */
  const filteredSuppliers = useMemo(() => {
    const f = supFilter.trim()
    const list = f ? suppliers.filter((s) => String(s.name || '').includes(f) || String(s.code || '').includes(f)) : suppliers
    return list.slice(0, 150)
  }, [suppliers, supFilter])

  /* ═══════════ ثبت / ویرایش سند ═══════════ */

  function openCreate() {
    setEditingId('')
    setForm({ ...emptyForm, dateJalali: today })
    setSupFilter('')
    setDocOpen(true)
    void loadPickers()
  }

  function openEdit(d: DocItem) {
    setEditingId(d.id)
    setForm({
      kind: d.kind, title: d.title || '', dateJalali: d.dateJalali || '', status: d.status,
      amount: d.amount ? String(Math.round(d.amount)) : '',
      supplierId: d.supplierId || 'NONE', supplierName: d.supplierId ? '' : d.supplierName || '',
      orderId: d.orderId || 'NONE', returnId: d.returnId || 'NONE', chequeId: d.chequeId || 'NONE',
      holooInvoiceNo: d.holooInvoiceNo || '', holooReceiptNo: d.holooReceiptNo || '',
      repId: d.repId || 'NONE', repName: d.repId ? '' : d.repName || '', repRole: d.repRole || 'NONE', repNote: d.repNote || '',
      cabinetId: d.location?.cabinet?.id || 'NONE', shelfId: d.location?.shelf?.id || 'NONE', binderId: d.binderId || 'NONE',
      folio: d.folio || '', note: d.note || '',
      returned: (d.returned || []).map((r) => ({ name: r.name, qty: String(r.qty || 1), reason: r.reason || '' })),
    })
    setSupFilter('')
    setDocOpen(true)
    void loadPickers()
  }

  /** انتخاب سفارش ← پیش‌پرکردن تأمین‌کننده و مبلغ */
  function onOrderChange(v: string) {
    setForm((f: any) => {
      const ord = orders.find((o) => o.id === v)
      return {
        ...f,
        orderId: v,
        supplierId: ord?.supplier?.id ? ord.supplier.id : f.supplierId,
        amount: ord?.totalAmount && !f.amount ? String(Math.round(ord.totalAmount)) : f.amount,
      }
    })
  }

  async function submitDoc() {
    if (!form.title.trim()) return toast.error('عنوان سند را وارد کنید')
    setSavingDoc(true)
    const body: any = {
      kind: form.kind,
      title: form.title.trim(),
      dateJalali: form.dateJalali || null,
      status: form.status,
      amount: Number(toEnDigits(form.amount || '0').replace(/[^\d]/g, '')) || 0,
      orderId: form.orderId !== 'NONE' ? form.orderId : null,
      returnId: form.returnId !== 'NONE' ? form.returnId : null,
      chequeId: form.chequeId !== 'NONE' ? form.chequeId : null,
      holooInvoiceNo: form.holooInvoiceNo.trim() || null,
      holooReceiptNo: form.holooReceiptNo.trim() || null,
      repId: form.repId !== 'NONE' ? form.repId : null,
      repName: form.repId === 'NONE' ? (form.repName.trim() || null) : undefined,
      repRole: form.repRole !== 'NONE' ? form.repRole : null,
      repNote: form.repNote.trim() || null,
      binderId: form.binderId !== 'NONE' ? form.binderId : null,
      folio: form.folio.trim() || null,
      note: form.note.trim() || null,
      returned: form.returned.filter((r: any) => r.name.trim()).map((r: any) => ({
        name: r.name.trim(),
        qty: Number(toEnDigits(r.qty || '1')) || 1,
        reason: r.reason.trim(),
      })),
    }
    if (form.supplierId !== 'NONE') body.supplierId = form.supplierId
    else { body.supplierId = null; body.supplierName = form.supplierName.trim() || null }
    const r = editingId
      ? await api(`/api/archive/${editingId}`, { method: 'PUT', body })
      : await api('/api/archive', { method: 'POST', body })
    setSavingDoc(false)
    if (!r.ok) return toast.error(r.error || 'ثبت سند انجام نشد')
    toast.success(editingId ? 'سند به‌روزرسانی شد' : 'سند ثبت شد')
    setDocOpen(false)
    void loadDocs(); void loadStructure()
    if (detail?.id === (editingId || r.data?.id)) setDetail(null)
  }

  async function delDoc(d: DocItem) {
    if (!window.confirm(`سند «${d.title}» حذف شود؟ رکورد دیجیتال حذف می‌شود (کاغذ فیزیکی دست‌نخورده می‌ماند).`)) return
    const r = await api(`/api/archive/${d.id}`, { method: 'DELETE' })
    if (!r.ok) return toast.error(r.error || 'حذف انجام نشد')
    toast.success('سند حذف شد')
    if (detail?.id === d.id) setDetail(null)
    void loadDocs(); void loadStructure()
  }

  /* ═══════════ جزئیات سند ═══════════ */

  async function openDetails(d: DocItem) {
    setDetail(d)
    setDetailLoading(true)
    const r = await api(`/api/archive/${d.id}`)
    setDetailLoading(false)
    if (!r.ok) { toast.error(r.error || 'دریافت جزئیات ناموفق بود'); return }
    setDetail(r.data)
  }

  /* ═══ R8: اسکن دیجیتال سند — بارگذاری/مشاهده/حذف ═══ */
  const [scanBusy, setScanBusy] = useState(false)
  const scanFileRef = useRef<HTMLInputElement | null>(null)

  async function uploadScan(d: DocItem, file: File) {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast.error('قالب اسکن باید PNG یا JPG یا WebP باشد')
    if (file.size > 300 * 1024) return toast.error('حجم اسکن بیش از ۳۰۰ کیلوبایت است — اسکن کوچک‌تر بارگذاری کنید')
    setScanBusy(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => reject(new Error('read-failed'))
        fr.readAsDataURL(file)
      })
      const r = await api('/api/archive', { method: 'PATCH', body: { id: d.id, scan: { dataUrl, name: file.name } } })
      if (!r.ok) { toast.error(r.error || 'بارگذاری اسکن ناموفق بود'); return }
      toast.success('اسکن دیجیتال سند ذخیره شد')
      setDetail((cur: any) => (cur && cur.id === d.id ? { ...cur, ...r.data, scanDataUrl: dataUrl } : cur))
      void loadDocs()
    } finally { setScanBusy(false) }
  }

  async function removeScan(d: DocItem) {
    if (!window.confirm('اسکن دیجیتال این سند حذف شود؟')) return
    setScanBusy(true)
    try {
      const r = await api('/api/archive', { method: 'PATCH', body: { id: d.id, scan: null } })
      if (!r.ok) { toast.error(r.error || 'حذف اسکن ناموفق بود'); return }
      toast.success('اسکن حذف شد')
      setDetail((cur: any) => (cur && cur.id === d.id ? { ...cur, hasScan: false, scanName: null, scanDataUrl: null } : cur))
      void loadDocs()
    } finally { setScanBusy(false) }
  }

  function printCover(d: DocItem) {
    printHTML(coverHTML(d, user?.fullName || '—'), { width: '210mm' })
  }

  /* ═══════════ ساختار آرشیو (کابینت/قفسه/زون‌بند) ═══════════ */

  function openStructCreate(type: string, parentId?: string) {
    setStructForm({ ...emptyStruct, type, mode: 'create', parentId: parentId || '' })
    setStructOpen(true)
  }
  function openStructEdit(type: string, node: any) {
    setStructForm({
      ...emptyStruct, type, mode: 'edit', id: node.id, parentId: '',
      name: node.name || '', location: node.location || '', note: node.note || '',
      category: node.category || '', color: node.color || 'NONE', code: node.code || '',
    })
    setStructOpen(true)
  }

  async function submitStruct() {
    if (!structForm.name.trim()) return toast.error('نام را وارد کنید')
    setSavingStruct(true)
    const isEdit = structForm.mode === 'edit'
    const body: any = {
      type: structForm.type,
      name: structForm.name.trim(),
      note: structForm.note.trim() || null,
    }
    if (isEdit) {
      body.id = structForm.id
      if (structForm.type === 'cabinet') body.location = structForm.location.trim() || null
      if (structForm.type === 'binder') {
        body.category = structForm.category.trim() || null
        body.color = structForm.color !== 'NONE' ? structForm.color : null
      }
    } else {
      if (structForm.type === 'shelf') body.cabinetId = structForm.parentId
      if (structForm.type === 'binder') {
        body.shelfId = structForm.parentId
        body.category = structForm.category.trim() || null
        body.color = structForm.color !== 'NONE' ? structForm.color : null
      }
    }
    const r = isEdit
      ? await api('/api/archive/structure', { method: 'PUT', body })
      : await api('/api/archive/structure', { method: 'POST', body })
    setSavingStruct(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره انجام نشد')
    const node = r.data?.node
    toast.success(isEdit ? 'به‌روزرسانی شد' : `«${node?.name}» با کد ${node?.code} ساخته شد`)
    setStructOpen(false)
    void loadStructure()
  }

  /** حذف نود ساختار — اگر سند متصل باشد سرور می‌بلاکد؛ با تأیید دوم «حذف قطعی» جایگاه سندها برداشته می‌شود */
  async function delNode(type: string, node: any, label: string) {
    const childHint =
      type === 'cabinet' ? ' (همهٔ قفسه‌ها و زون‌بندهای داخلش هم حذف می‌شوند)'
        : type === 'shelf' ? ' (زون‌بندهای داخلش هم حذف می‌شوند)' : ''
    if (!window.confirm(`${label} حذف شود؟${childHint}`)) return
    let r = await api(`/api/archive/structure?type=${type}&id=${node.id}`, { method: 'DELETE' })
    if (!r.ok) {
      if (String(r.error || '').includes('متصل است')) {
        if (!window.confirm(`${r.error}\n\nبا «تأیید» جایگاه این سندها برداشته می‌شود (خود اسناد حذف نمی‌شوند و در فهرست «بدون جایگاه» می‌آیند). حذف قطعی انجام شود؟`)) return
        r = await api(`/api/archive/structure?type=${type}&id=${node.id}&force=1`, { method: 'DELETE' })
        if (!r.ok) return toast.error(r.error || 'حذف انجام نشد')
        toast.success(`${label} حذف شد — ${fa(r.data?.detached || 0)} سند بدون جایگاه شد`)
        void loadStructure(); void loadDocs()
        return
      }
      return toast.error(r.error || 'حذف انجام نشد')
    }
    toast.success(`${label} حذف شد`)
    void loadStructure(); void loadDocs()
  }


  /* ═══════════ رندر ═══════════ */

  const statusChip = (key: string, n?: number) => {
    const s = statusMeta(key)
    return (
      <Badge variant="outline" className={cn('text-[10px]', s.cls)}>
        {s.label}{n !== undefined && n !== null ? ` · ${fa(n)}` : ''}
      </Badge>
    )
  }

  /** زنجیرهٔ محل فیزیکی در جدول */
  function locCell(d: DocItem) {
    if (!d.location) return <span className="text-xs text-amber-700">بدون جایگاه</span>
    const { cabinet, shelf, binder } = d.location
    return (
      <div className="leading-tight">
        <div className="text-xs font-bold text-emerald-800">
          {cabinet?.name} ‹ {shelf?.name} ‹ {binder.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span dir="ltr" className="num text-[10px] text-emerald-600">{binder.code}</span>
          {d.folio ? <span className="num text-[10px] text-stone-500">· برگهٔ {toFaDigits(d.folio)}</span> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ═══════ سربرگ + آمار ═══════ */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-emerald-900">
                <I.store size={18} /> آرشیو اسناد
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">
                بایگانی هیبریدی دیجیتال + فیزیکی — کابینت ‹ قفسه ‹ زون‌بند ‹ برگه؛ کاغذ را در یک ثانیه پیدا کنید.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">کل اسناد · {fa(stats?.total ?? 0)}</Badge>
              {statusChip('PENDING', stats?.byStatus?.PENDING)}
              {statusChip('ARCHIVED', stats?.byStatus?.ARCHIVED)}
              {statusChip('MISSING', stats?.byStatus?.MISSING)}
              {stats?.unfiled ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800">بدون جایگاه · {fa(stats.unfiled)}</Badge> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="docs"><I.search size={14} className="ml-1 inline" /> اسناد</TabsTrigger>
          <TabsTrigger value="structure"><I.layoutGrid size={14} className="ml-1 inline" /> ساختار آرشیو</TabsTrigger>
        </TabsList>

        {/* ═══════════ تب ۱: اسناد ═══════════ */}
        {tab === 'docs' && (
          <div className="space-y-3 pt-3">
            {/* جست‌وجوی برجسته — قلب سامانه */}
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-60 flex-1">
                    <I.search size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <Input
                      value={q}
                      onChange={(e: any) => setQ(e.target.value)}
                      placeholder="جست‌وجو: تأمین‌کننده، شماره فاکتور هلو، شماره رسید هلو، شماره چک، نام نماینده، عنوان سند، کد سفارش/مرجوعی…"
                      className="h-11 border-emerald-300 bg-emerald-50/40 pr-9 text-sm font-semibold placeholder:font-normal placeholder:text-stone-400 focus:border-emerald-500"
                    />
                  </div>
                  <Button className="h-11 gap-1.5" onClick={openCreate}><I.plus size={15} /> سند جدید</Button>
                </div>
                {/* فیلترها */}
                <div className="flex flex-wrap items-center gap-2">
                  <Select dir="rtl" value={fKind} onValueChange={setFKind}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">همهٔ انواع</SelectItem>
                      {KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select dir="rtl" value={fStatus} onValueChange={setFStatus}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">همهٔ وضعیت‌ها</SelectItem>
                      {STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select dir="rtl" value={fBinder} onValueChange={setFBinder}>
                    <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">همهٔ زون‌بندها</SelectItem>
                      {flatBinders.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.cabinetName} · {b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 text-xs text-stone-500">
                    از <JalaliDate value={fFrom} onChange={setFFrom} className="h-8 w-32 text-xs" placeholder="—" />
                    تا <JalaliDate value={fTo} onChange={setFTo} className="h-8 w-32 text-xs" placeholder="—" />
                  </div>
                  {(q || fKind !== 'ALL' || fStatus !== 'ALL' || fBinder !== 'ALL' || fFrom || fTo) && (
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-stone-500"
                      onClick={() => { setQ(''); setFKind('ALL'); setFStatus('ALL'); setFBinder('ALL'); setFFrom(''); setFTo('') }}>
                      <I.x size={13} /> پاک‌کردن فیلترها
                    </Button>
                  )}
                  <span className="mr-auto num text-[11px] text-stone-500">
                    {loading ? '…' : `${fa(total)} سند`}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* فهرست اسناد */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-center">نوع</TableHead>
                      <TableHead>عنوان / تأمین‌کننده</TableHead>
                      <TableHead className="text-center">تاریخ</TableHead>
                      <TableHead className="text-left">مبلغ (ریال)</TableHead>
                      <TableHead>محل فیزیکی</TableHead>
                      <TableHead className="text-center">هلو / مراجع</TableHead>
                      <TableHead>نماینده</TableHead>
                      <TableHead className="text-center">وضعیت</TableHead>
                      <TableHead className="text-center">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && items.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-stone-400">در حال بارگذاری…</TableCell></TableRow>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-10 text-center text-sm text-stone-400">
                          سندی یافت نشد — {q ? 'عبارت دیگری را جست‌وجو کنید یا' : 'اولین سند را ثبت کنید:'}{' '}
                          <button className="font-bold text-emerald-700 underline" onClick={openCreate}>سند جدید</button>
                        </TableCell>
                      </TableRow>
                    ) : items.map((d) => {
                      const k = kindMeta(d.kind)
                      const s = statusMeta(d.status)
                      return (
                        <TableRow key={d.id} className="cursor-pointer hover:bg-emerald-50/40" onClick={() => void openDetails(d)}>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={cn('text-[10px]', k.cls)}>{k.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="max-w-56 truncate text-sm font-bold text-stone-800">{d.title}</span>
                              {d.returnedCount > 0 && (
                                <Badge variant="outline" className="border-rose-300 bg-rose-50 px-1.5 py-0 text-[9px] text-rose-700">
                                  {fa(d.returnedCount)} قلم مرجوعی
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 max-w-56 truncate text-[11px] text-stone-500">{d.supplierName || 'بدون تأمین‌کننده'}</div>
                          </TableCell>
                          <TableCell className="num text-center text-xs text-stone-600">{faDate(d.dateJalali)}</TableCell>
                          <TableCell className="num text-left text-xs font-bold text-stone-700">{d.amount > 0 ? money(d.amount) : '—'}</TableCell>
                          <TableCell>{locCell(d)}</TableCell>
                          <TableCell className="text-center">
                            <div className="num inline-flex flex-col items-center gap-0.5 text-[10px] leading-tight text-stone-600">
                              {d.holooInvoiceNo ? <span dir="ltr">فاکتور {toFaDigits(d.holooInvoiceNo)}</span> : null}
                              {d.holooReceiptNo ? <span dir="ltr">رسید {toFaDigits(d.holooReceiptNo)}</span> : null}
                              {d.orderCode ? <span>سفارش {toFaDigits(d.orderCode)}</span> : null}
                              {d.returnCode ? <span>مرجوعی {toFaDigits(d.returnCode)}</span> : null}
                              {d.chequeNumber ? <span>چک {toFaDigits(d.chequeNumber)}</span> : null}
                              {!d.holooInvoiceNo && !d.holooReceiptNo && !d.orderCode && !d.returnCode && !d.chequeNumber ? <span className="text-stone-300">—</span> : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            {d.repName ? (
                              <div className="leading-tight">
                                <div className="max-w-32 truncate text-xs font-semibold text-stone-700">{d.repName}</div>
                                {d.repRole ? <div className="text-[10px] text-stone-500">{d.repRole}</div> : null}
                              </div>
                            ) : <span className="text-stone-300">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={cn('text-[10px]', s.cls)}>{s.label}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="چاپ برگهٔ جایگاه"
                                onClick={(e: any) => { e.stopPropagation(); printCover(d) }}>
                                <I.printer size={14} className="text-emerald-700" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="ویرایش"
                                onClick={(e: any) => { e.stopPropagation(); openEdit(d) }}>
                                <I.pencil size={13} className="text-stone-600" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="حذف"
                                onClick={(e: any) => { e.stopPropagation(); void delDoc(d) }}>
                                <I.trash size={13} className="text-rose-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                {/* صفحه‌بندی */}
                {pages > 1 && (
                  <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>
                      <I.chevronRight size={14} /> قبلی
                    </Button>
                    <span className="num text-xs text-stone-500">صفحهٔ {fa(page)} از {fa(pages)}</span>
                    <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => gotoPage(page + 1)}>
                      بعدی <I.chevronLeft size={14} />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═══════════ تب ۲: ساختار آرشیو ═══════════ */}
        {tab === 'structure' && (
          <div className="space-y-3 pt-3">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-2 p-4">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{fa(totals?.cabinets ?? 0)} کابینت</Badge>
                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">{fa(totals?.shelves ?? 0)} قفسه</Badge>
                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">{fa(totals?.binders ?? 0)} زون‌بند</Badge>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{fa(totals?.documents ?? 0)} سند بایگانی</Badge>
                  {totals?.unfiled ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{fa(totals.unfiled)} بدون جایگاه</Badge> : null}
                </div>
                <Button size="sm" className="mr-auto gap-1.5" onClick={() => openStructCreate('cabinet')}><I.plus size={14} /> کابینت جدید</Button>
              </CardContent>
            </Card>

            {cabinets.length === 0 && !loading ? (
              <Card><CardContent className="py-10 text-center text-sm text-stone-400">
                هنوز کابینی ثبت نشده — اولین کابینت آرشیو را بسازید (کد به‌صورت خودکار CAB-01 ساخته می‌شود).
              </CardContent></Card>
            ) : cabinets.map((cab) => (
              <Card key={cab.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-emerald-900">
                      <I.store size={15} /> {cab.name}
                    </CardTitle>
                    <span dir="ltr" className="num rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{cab.code}</span>
                    {cab.location ? <span className="text-[11px] text-stone-500">📍 {cab.location}</span> : null}
                    <span className="num text-[11px] text-stone-500">
                      {fa(cab.shelvesCount)} قفسه · {fa(cab.bindersCount)} زون‌بند · {fa(cab.documentsCount)} سند
                    </span>
                    <div className="mr-auto flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => openStructCreate('shelf', cab.id)}><I.plus size={12} /> قفسهٔ جدید</Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="ویرایش کابینت" onClick={() => openStructEdit('cabinet', cab)}><I.pencil size={13} /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="حذف کابینت" onClick={() => void delNode('cabinet', cab, `کابینت «${cab.name}»`)}><I.trash size={13} className="text-rose-600" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cab.shelves.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-stone-200 p-3 text-center text-xs text-stone-400">قفسه‌ای نیست — «قفسهٔ جدید» را بزنید.</p>
                  ) : cab.shelves.map((sh) => (
                    <div key={sh.id} className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-stone-700"><I.layers size={13} className="text-teal-700" /> {sh.name}</span>
                        <span dir="ltr" className="num rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">{sh.code}</span>
                        <span className="num text-[10px] text-stone-500">{fa(sh.bindersCount)} زون‌بند · {fa(sh.documentsCount)} سند</span>
                        <div className="mr-auto flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-6 gap-1 border-stone-300 bg-white text-[10px]" onClick={() => openStructCreate('binder', sh.id)}><I.plus size={11} /> زون‌بند جدید</Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="ویرایش قفسه" onClick={() => openStructEdit('shelf', sh)}><I.pencil size={12} /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="حذف قفسه" onClick={() => void delNode('shelf', sh, `قفسهٔ «${sh.name}»`)}><I.trash size={12} className="text-rose-600" /></Button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {sh.binders.length === 0 ? (
                          <p className="col-span-full text-center text-[11px] text-stone-400">زون‌بندی نیست — «زون‌بند جدید» را بزنید.</p>
                        ) : sh.binders.map((b) => (
                          <div key={b.id} className="rounded-lg border border-stone-200 bg-white p-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className={cn('h-2.5 w-2.5 flex-none rounded-full', colorDot(b.color))} title={b.color || ''} />
                              <span className="min-w-0 flex-1 truncate text-xs font-bold text-stone-800">{b.name}</span>
                              <span className="num rounded bg-stone-100 px-1 text-[10px] font-bold text-stone-600">{fa(b.documentsCount)}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span dir="ltr" className="num text-[10px] text-stone-500">{b.code}</span>
                              {b.category ? <span className="truncate text-[10px] text-emerald-700">{b.category}</span> : null}
                            </div>
                            {b.note ? <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-400">{b.note}</p> : null}
                            <div className="mt-1.5 flex items-center justify-end gap-0.5">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="اسناد این زون‌بند"
                                onClick={() => { setFBinder(b.id); setPage(1); setTab('docs') }}>
                                <I.eye size={12} className="text-emerald-700" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="ویرایش زون‌بند" onClick={() => openStructEdit('binder', b)}><I.pencil size={12} /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="حذف زون‌بند" onClick={() => void delNode('binder', b, `زون‌بند «${b.name}»`)}><I.trash size={12} className="text-rose-600" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      </Tabs>

      {/* ═══════════ دیالوگ ثبت/ویرایش سند ═══════════ */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <I.receipt size={17} className="text-emerald-700" />
              {editingId ? 'ویرایش سند آرشیو' : 'ثبت سند جدید در آرشیو'}
            </DialogTitle>
            <DialogDescription>
              {editingId ? 'اطلاعات دیجیتال سند و جایگاه فیزیکی آن را اصلاح کنید.' : 'هر مدرک کاغذی (فاکتور، رسید، چک، مرجوعی…) را با جایگاه فیزیکی‌اش ثبت کنید.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-stone-500">نوع سند</label>
              <Select dir="rtl" value={form.kind} onValueChange={(v: string) => setForm((f: any) => ({ ...f, kind: v }))}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">تاریخ سند</label>
              <JalaliDate value={form.dateJalali} onChange={(v: string) => setForm((f: any) => ({ ...f, dateJalali: v }))} className="h-9 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">وضعیت</label>
              <Select dir="rtl" value={form.status} onValueChange={(v: string) => setForm((f: any) => ({ ...f, status: v }))}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="mb-1 block text-xs text-stone-500">عنوان سند <span className="text-rose-500">*</span></label>
              <Input value={form.title} onChange={(e: any) => setForm((f: any) => ({ ...f, title: e.target.value }))}
                placeholder="مثلاً: فاکتور خرید کاله — مهر ۱۴۰۵" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">مبلغ (ریال)</label>
              <MoneyInput value={form.amount} onChange={(v: string) => setForm((f: any) => ({ ...f, amount: v }))} suffix="ریال" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-stone-500">تأمین‌کننده</label>
              <div className="flex gap-1.5">
                <Input className="h-9 w-28 text-xs" placeholder="فیلتر…" value={supFilter} onChange={(e: any) => setSupFilter(e.target.value)} />
                <Select dir="rtl" value={form.supplierId} onValueChange={(v: string) => setForm((f: any) => ({ ...f, supplierId: v }))}
                  disabled={pickersLoading}>
                  <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder={pickersLoading ? 'در حال بارگذاری…' : 'انتخاب از فهرست'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— بدون انتخاب —</SelectItem>
                    {form.supplierId !== 'NONE' && !filteredSuppliers.some((s) => s.id === form.supplierId) && (
                      <SelectItem value={form.supplierId}>{suppliers.find((s) => s.id === form.supplierId)?.name || 'انتخاب قبلی'}</SelectItem>
                    )}
                    {filteredSuppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.supplierId === 'NONE' && (
                <Input className="mt-1.5 h-8 text-xs" placeholder="یا نام آزاد تأمین‌کننده…"
                  value={form.supplierName} onChange={(e: any) => setForm((f: any) => ({ ...f, supplierName: e.target.value }))} />
              )}
            </div>
          </div>

          {/* شماره‌های هلو + مراجع متصل */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-stone-500">شماره فاکتور هلو</label>
              <Input dir="ltr" className="num h-9 text-center text-sm" value={toFaDigits(form.holooInvoiceNo)}
                onChange={(e: any) => setForm((f: any) => ({ ...f, holooInvoiceNo: toEnDigits(e.target.value).replace(/[^\d]/g, '') }))}
                placeholder="مثلاً 12345" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">شماره رسید هلو</label>
              <Input dir="ltr" className="num h-9 text-center text-sm" value={toFaDigits(form.holooReceiptNo)}
                onChange={(e: any) => setForm((f: any) => ({ ...f, holooReceiptNo: toEnDigits(e.target.value).replace(/[^\d]/g, '') }))}
                placeholder="مثلاً 67890" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">سفارش مرتبط</label>
              <Select dir="rtl" value={form.orderId} onValueChange={onOrderChange} disabled={pickersLoading}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون اتصال —</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{toFaDigits(o.code)} — {o.supplier?.name || 'بدون تأمین‌کننده'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">مرجوعی مرتبط</label>
              <Select dir="rtl" value={form.returnId} onValueChange={(v: string) => setForm((f: any) => ({ ...f, returnId: v }))} disabled={pickersLoading}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون اتصال —</SelectItem>
                  {returns_.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{toFaDigits(r.code)} — {r.customerName || 'مشتری ناشناس'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">چک مرتبط</label>
              <Select dir="rtl" value={form.chequeId} onValueChange={(v: string) => setForm((f: any) => ({ ...f, chequeId: v }))} disabled={pickersLoading}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون اتصال —</SelectItem>
                  {cheques.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{toFaDigits(c.number)} — {money(c.amount)} ریال</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* نمایندهٔ فروش */}
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-stone-600"><I.user size={13} /> نمایندهٔ فروش (طرف بیرونی این سند)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Select dir="rtl" value={form.repId} onValueChange={(v: string) => setForm((f: any) => ({ ...f, repId: v }))}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="انتخاب نماینده" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون نماینده —</SelectItem>
                  {reps.filter((r) => r.active || r.id === form.repId).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}{r.company ? ` — ${r.company}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.repId === 'NONE' && (
                <Input className="h-9 text-xs" placeholder="یا نام آزاد…" value={form.repName}
                  onChange={(e: any) => setForm((f: any) => ({ ...f, repName: e.target.value }))} />
              )}
              <Select dir="rtl" value={form.repRole} onValueChange={(v: string) => setForm((f: any) => ({ ...f, repRole: v }))}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="سمت در این سند" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون سمت —</SelectItem>
                  {REP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="h-9 text-xs" placeholder="یادداشت (مثلاً ساعت دریافت)" value={form.repNote}
                onChange={(e: any) => setForm((f: any) => ({ ...f, repNote: e.target.value }))} />
            </div>
            <p className="mt-2 text-[10px] text-stone-400">
              مدیریت فهرست نمایندگان (ثبت/ویرایش/سوابق): انبار ← تأمین‌کنندگان و اشخاص ← تب «نمایندگان فروش».
            </p>
          </div>

          {/* جایگاه فیزیکی */}
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-800"><I.store size={13} /> جایگاه فیزیکی سند</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] text-stone-500">کابینت</label>
                <Select dir="rtl" value={form.cabinetId}
                  onValueChange={(v: string) => setForm((f: any) => ({ ...f, cabinetId: v, shelfId: 'NONE', binderId: 'NONE' }))}>
                  <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— بدون کابینت —</SelectItem>
                    {cabinets.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-stone-500">قفسه</label>
                <Select dir="rtl" value={form.shelfId} disabled={form.cabinetId === 'NONE'}
                  onValueChange={(v: string) => setForm((f: any) => ({ ...f, shelfId: v, binderId: 'NONE' }))}>
                  <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— بدون قفسه —</SelectItem>
                    {formShelves.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-stone-500">زون‌بند</label>
                <Select dir="rtl" value={form.binderId} disabled={form.shelfId === 'NONE'}
                  onValueChange={(v: string) => setForm((f: any) => ({ ...f, binderId: v }))}>
                  <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— بدون زون‌بند —</SelectItem>
                    {formBinders.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}{b.category ? ` (${b.category})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-stone-500">برگه / صفحه</label>
                <Input dir="ltr" className="num h-9 text-center text-sm" value={toFaDigits(form.folio)}
                  onChange={(e: any) => setForm((f: any) => ({ ...f, folio: toEnDigits(e.target.value).replace(/[^\d]/g, '') }))}
                  placeholder="مثلاً 15" />
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-emerald-700">
              زون‌بند و قفسهٔ لازم را ندارید؟ از تب «ساختار آرشیو» بسازید — کدها (CAB-01 / S2 / B1) خودکار ساخته می‌شوند.
            </p>
          </div>

          {/* اقلام مرجوعی — قرمز */}
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700"><I.alertTriangle size={13} /> اقلام مرجوعی این سند</p>
              <Button variant="outline" size="sm" className="mr-auto h-6 gap-1 border-rose-200 bg-white text-[10px] text-rose-700"
                onClick={() => setForm((f: any) => ({ ...f, returned: [...f.returned, { name: '', qty: '1', reason: '' }] }))}>
                <I.plus size={11} /> افزودن قلم
              </Button>
            </div>
            {form.returned.length === 0 ? (
              <p className="text-[11px] text-stone-400">اگر بخشی از کالا مرجوع شده، اینجا ثبت کنید تا در فهرست و جزئیات با رنگ قرمز مشخص شود.</p>
            ) : (
              <div className="space-y-1.5">
                {form.returned.map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input className="h-8 flex-1 border-rose-200 bg-white text-xs" placeholder="نام کالا"
                      value={r.name} onChange={(e: any) => setForm((f: any) => ({ ...f, returned: f.returned.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x) }))} />
                    <Input dir="ltr" className="num h-8 w-16 border-rose-200 bg-white text-center text-xs" placeholder="۱"
                      value={toFaDigits(r.qty)} onChange={(e: any) => setForm((f: any) => ({ ...f, returned: f.returned.map((x: any, j: number) => j === i ? { ...x, qty: toEnDigits(e.target.value).replace(/[^\d]/g, '') } : x) }))} />
                    <Input className="h-8 flex-1 border-rose-200 bg-white text-xs" placeholder="علت (مثلاً تاریخ انقضا)"
                      value={r.reason} onChange={(e: any) => setForm((f: any) => ({ ...f, returned: f.returned.map((x: any, j: number) => j === i ? { ...x, reason: e.target.value } : x) }))} />
                    <Button variant="ghost" size="sm" className="h-8 w-8 flex-none p-0"
                      onClick={() => setForm((f: any) => ({ ...f, returned: f.returned.filter((_: any, j: number) => j !== i) }))}>
                      <I.x size={13} className="text-rose-600" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-stone-500">یادداشت</label>
            <Textarea rows={2} value={form.note} onChange={(e: any) => setForm((f: any) => ({ ...f, note: e.target.value }))}
              placeholder="هر نکته‌ای دربارهٔ این سند…" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDocOpen(false)}>انصراف</Button>
            <Button disabled={savingDoc} onClick={() => void submitDoc()} className="gap-1.5">
              {savingDoc ? 'در حال ذخیره…' : editingId ? 'ذخیرهٔ تغییرات' : 'ثبت سند'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ جزئیات سند ═══════════ */}
      <Dialog open={!!detail} onOpenChange={(o: boolean) => !o && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          {detail && (() => {
            const k = kindMeta(detail.kind)
            const s = statusMeta(detail.status)
            const loc = detail.location
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn('text-[10px]', k.cls)}>{k.label}</Badge>
                    <span className="text-sm">{detail.title}</span>
                    {detail.returnedCount > 0 && (
                      <Badge variant="outline" className="border-rose-300 bg-rose-50 text-[10px] text-rose-700">{fa(detail.returnedCount)} قلم مرجوعی</Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription>جزئیات کامل سند آرشیو و جایگاه فیزیکی آن</DialogDescription>
                </DialogHeader>

                {detailLoading ? (
                  <p className="py-8 text-center text-sm text-stone-400">در حال دریافت جزئیات…</p>
                ) : (
                  <div className="space-y-3">
                    {/* جایگاه فیزیکی — برجسته */}
                    {loc ? (
                      <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-b from-emerald-50 to-white p-3 text-center">
                        <p className="text-[11px] font-bold tracking-wide text-emerald-600">محل فیزیکی سند</p>
                        <p className="mt-1 text-lg font-extrabold text-emerald-800">
                          {loc.cabinet?.name} ‹ {loc.shelf?.name} ‹ {loc.binder.name}
                        </p>
                        <p className="mt-1 flex items-center justify-center gap-2 text-xs text-stone-600">
                          <span dir="ltr" className="num rounded border border-emerald-200 bg-white px-2 py-0.5 font-bold text-emerald-700">{loc.binder.code}</span>
                          {detail.folio ? <span className="num">برگهٔ {toFaDigits(detail.folio)}</span> : null}
                          {loc.cabinet?.location ? <span className="text-stone-400">({loc.cabinet.location})</span> : null}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3 text-center text-sm font-bold text-amber-800">
                        این سند هنوز جایگاه فیزیکی ندارد — «ویرایش» را بزنید و به زون‌بندی متصل کنید.
                      </div>
                    )}

                    {/* اطلاعات اصلی */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-stone-200 p-3 text-xs sm:grid-cols-3">
                      {[
                        ['تأمین‌کننده', detail.supplierName || '—'],
                        ['تاریخ سند', faDate(detail.dateJalali)],
                        ['مبلغ', detail.amount > 0 ? `${money(detail.amount)} ریال` : '—'],
                        ['شماره فاکتور هلو', detail.holooInvoiceNo ? toFaDigits(detail.holooInvoiceNo) : '—'],
                        ['شماره رسید هلو', detail.holooReceiptNo ? toFaDigits(detail.holooReceiptNo) : '—'],
                        ['وضعیت', s.label],
                        ['سفارش مرتبط', detail.orderCode ? toFaDigits(detail.orderCode) : '—'],
                        ['مرجوعی مرتبط', detail.returnCode ? toFaDigits(detail.returnCode) : '—'],
                        ['شماره چک', detail.chequeNumber ? toFaDigits(detail.chequeNumber) : '—'],
                        ['ثبت‌کننده', detail.createdByName || '—'],
                      ].map(([kk, vv]) => (
                        <div key={kk}>
                          <div className="text-[10px] text-stone-400">{kk}</div>
                          <div className="mt-0.5 font-bold text-stone-700">{vv}</div>
                        </div>
                      ))}
                    </div>

                    {/* نماینده */}
                    {(detail.repName || detail.rep) && (
                      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-stone-600"><I.user size={13} /> نمایندهٔ فروش</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-700">
                          <span className="font-bold">{detail.repName}</span>
                          {detail.repRole ? <span className="text-stone-500">سمت: {detail.repRole}</span> : null}
                          {detail.rep?.mobile ? <span className="num" dir="ltr">{toFaDigits(detail.rep.mobile)}</span> : null}
                          {detail.rep?.company ? <span className="text-stone-500">{detail.rep.company}</span> : null}
                          {detail.repNote ? <span className="text-stone-500">یادداشت: {detail.repNote}</span> : null}
                        </div>
                      </div>
                    )}

                    {/* اقلام مرجوعی — قرمز */}
                    {detail.returnedCount > 0 && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-rose-700">
                          <I.alertTriangle size={13} /> اقلام مرجوعی ({fa(detail.returnedCount)} قلم)
                        </p>
                        <ul className="space-y-1">
                          {detail.returned.map((r, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                              <span className="font-bold text-rose-700">{r.name}</span>
                              <span className="num text-rose-500">{fa(r.qty)} عدد</span>
                              {r.reason ? <span className="text-stone-500">— {r.reason}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* مراجع متصل */}
                    {detail.linkedOrder && (
                      <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-xs">
                        <p className="mb-1 font-bold text-sky-800">سفارش متصل: {toFaDigits(detail.linkedOrder.code)} — {detail.linkedOrder.supplierName || '—'} · {money(detail.linkedOrder.totalAmount || 0)} ریال</p>
                        <p className="leading-5 text-stone-600">
                          {(detail.linkedOrder.items || []).slice(0, 6).map((it: any) => `${it.name} (${fa(it.qty)})`).join('، ')}
                          {(detail.linkedOrder.items || []).length > 6 ? ' و…' : ''}
                        </p>
                      </div>
                    )}
                    {detail.linkedReturn && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 text-xs">
                        <p className="mb-1 font-bold text-rose-800">مرجوعی متصل: {toFaDigits(detail.linkedReturn.code)} — {detail.linkedReturn.customerName || 'مشتری ناشناس'} · {money(detail.linkedReturn.totalAmount || 0)} ریال</p>
                        <p className="leading-5 text-stone-600">
                          {(detail.linkedReturn.items || []).slice(0, 6).map((it: any) => `${it.name} (${fa(it.qty)} ${it.unit})`).join('، ')}
                          {(detail.linkedReturn.items || []).length > 6 ? ' و…' : ''}
                        </p>
                      </div>
                    )}
                    {detail.linkedCheque && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs">
                        <p className="mb-1 font-bold text-amber-800">چک متصل: {toFaDigits(detail.linkedCheque.number)} — {money(detail.linkedCheque.amount || 0)} ریال</p>
                        <p className="text-stone-600">سررسید: {faDate(detail.linkedCheque.dueDate)} · گیرنده: {detail.linkedCheque.recipient || '—'}</p>
                      </div>
                    )}

                    {detail.note ? (
                      <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-6 text-stone-700">
                        <b>یادداشت:</b> {detail.note}
                      </div>
                    ) : null}

                    {/* ═══ R8: اسکن دیجیتال سند ═══ */}
                    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                      <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-bold text-teal-800">
                        <I.scan size={13} /> اسکن دیجیتال سند
                        {detail.hasScan && <Badge variant="outline" className="border-teal-300 bg-white text-[10px] text-teal-700">موجود</Badge>}
                      </p>
                      {(detail as any).scanDataUrl ? (
                        <div className="space-y-2">
                          <a href={(detail as any).scanDataUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-teal-200 bg-white transition-shadow hover:shadow-md">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={(detail as any).scanDataUrl} alt={`اسکن ${detail.title}`} className="max-h-72 w-full object-contain" />
                          </a>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                            <span className="truncate">{detail.scanName || 'اسکن سند'} — برای بزرگ‌نمایی روی تصویر کلیک کنید</span>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" className="h-8 gap-1" disabled={scanBusy} onClick={() => scanFileRef.current?.click()}>
                                <I.loader size={12} className={scanBusy ? 'animate-spin' : 'hidden'} /> جایگزینی
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 gap-1 text-rose-600" disabled={scanBusy} onClick={() => void removeScan(detail)}>
                                <I.trash size={12} /> حذف اسکن
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-teal-300 bg-white/60 p-4 text-center">
                          <p className="text-xs leading-5 text-stone-600">تصویر اسکن‌شدهٔ مدرک (فاکتور/رسید/چک) را اینجا نگه دارید تا بعداً بدون مراجعه به بایگانی فیزیکی قابل مشاهده باشد.</p>
                          <Button size="sm" className="gap-1.5" disabled={scanBusy} onClick={() => scanFileRef.current?.click()}>
                            {scanBusy ? <I.loader size={13} className="animate-spin" /> : <I.scan size={13} />} بارگذاری اسکن (PNG/JPG · حداکثر ۳۰۰KB)
                          </Button>
                        </div>
                      )}
                      <input ref={scanFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                        onChange={(e: any) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadScan(detail, f) }} />
                    </div>

                    <DialogFooter className="mt-1">
                      <Button variant="outline" className="gap-1.5" onClick={() => printCover(detail)}>
                        <I.printer size={14} /> چاپ برگهٔ جایگاه
                      </Button>
                      <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
                        <Button variant="ghost" className="gap-1 text-rose-600" onClick={() => void delDoc(detail)}>
                          <I.trash size={14} /> حذف
                        </Button>
                        <Button className="gap-1.5" onClick={() => { setDetail(null); openEdit(detail) }}>
                          <I.pencil size={14} /> ویرایش
                        </Button>
                      </div>
                    </DialogFooter>
                  </div>
                )}
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ ساختار (کابینت/قفسه/زون‌بند) ═══════════ */}
      <Dialog open={structOpen} onOpenChange={setStructOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <I.layoutGrid size={16} className="text-emerald-700" />
              {structForm.mode === 'edit' ? 'ویرایش' : 'افزودن'} {
                structForm.type === 'cabinet' ? 'کابینت' : structForm.type === 'shelf' ? 'قفسه' : 'زون‌بند'
              }
            </DialogTitle>
            <DialogDescription>
              {structForm.mode === 'create'
                ? 'کد یکتا به‌صورت خودکار ساخته می‌شود (مثل CAB-01 · CAB-01-S2 · CAB-01-S2-B1).'
                : 'نام و جزئیات را اصلاح کنید.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-stone-500">
                نام {structForm.type === 'cabinet' ? 'کابینت' : structForm.type === 'shelf' ? 'قفسه' : 'زون‌بند'} <span className="text-rose-500">*</span>
              </label>
              <Input value={structForm.name} onChange={(e: any) => setStructForm((f: any) => ({ ...f, name: e.target.value }))}
                placeholder={structForm.type === 'cabinet' ? 'مثلاً: کابینت حسابداری ۲' : structForm.type === 'shelf' ? 'مثلاً: قفسهٔ ۴' : 'مثلاً: زون‌بند نوشیدنی'} />
            </div>
            {structForm.type === 'cabinet' && (
              <div>
                <label className="mb-1 block text-xs text-stone-500">محل فیزیکی</label>
                <Input value={structForm.location} onChange={(e: any) => setStructForm((f: any) => ({ ...f, location: e.target.value }))}
                  placeholder="مثلاً: دفتر حسابداری — دیوار شرقی" />
              </div>
            )}
            {structForm.type === 'binder' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-stone-500">دسته‌بندی محتوا</label>
                  <Input value={structForm.category} onChange={(e: any) => setStructForm((f: any) => ({ ...f, category: e.target.value }))}
                    placeholder="مثلاً: لبنیات" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-500">رنگ زون‌بند</label>
                  <Select dir="rtl" value={structForm.color} onValueChange={(v: string) => setStructForm((f: any) => ({ ...f, color: v }))}>
                    <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— بدون رنگ —</SelectItem>
                      {Object.keys(COLOR_DOT).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-stone-500">یادداشت</label>
              <Textarea rows={2} value={structForm.note} onChange={(e: any) => setStructForm((f: any) => ({ ...f, note: e.target.value }))}
                placeholder="مثلاً: تأمین‌کنندگان این زون‌بند…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStructOpen(false)}>انصراف</Button>
            <Button disabled={savingStruct} onClick={() => void submitStruct()}>{savingStruct ? 'در حال ذخیره…' : 'ذخیره'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
