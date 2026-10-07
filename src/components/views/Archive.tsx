'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliDateTime, formatJalaliShort, todayIso, addDaysIso } from '@/lib/jalali'
import { ORDER_STATUSES } from '@/lib/constants'
import { SectionCard, Pill, EmptyState, Labeled, KeyValue, SearchInput, FaPriceInput } from '@/components/app/ui-bits'
import { JalaliDatePicker } from '@/components/app/jalali-widgets'
import { Modal } from '@/components/views/Orders'
import type { AppCtx } from '@/components/app/ui-bits'
import {
  Archive, Library, Plus, MapPin, Hand, Undo2, FileText, Landmark, FolderOpen, Users, Package, ChevronDown,
  UserCog, Clock, ShieldAlert, Copy, Pencil, Zap, Gavel, History, ShoppingBag, Trash2, Network,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Binder = {
  id: string; code: string; title: string; groupName: string; cabinet: string; shelf: string
  colorTag: string; capacity: number; docCount: number; active: boolean; notes?: string
}
type Doc = {
  id: string; code: string; title: string; docType: string; party: string; partyId: string; amount: number
  docDate: string; invoiceNo: string; binderId: string; binderCode: string; seq: number; status: string
  borrowByName: string; borrowAt: string; refOrderCode: string; notes: string
  createdByName: string; createdAt: string
  // ── آرشیو ۲٫۰ — چرخهٔ حیات + نگهداری + مالی + هلو + نماینده ──
  lifecycle: string; fiscalYear: string; retentionYears: number; legalHold: boolean; disposeAfterIso: string
  confidentiality: string; disposalApprovedBy: string; disposalMethod: string; disposalDate: string
  holooInvoiceNo: string; holooReceiptNo: string; paymentStatus: string; paidAmount: number
  deliveryAt: string; submittedAt: string; repId: string; repName: string
  editedAt: string; editedByName: string
}
type DocItem = {
  id: string; docId: string; productId: string; productName: string; barcode: string
  qty: number; unit: string; unitPrice: number; expiryDate: string
  returned: boolean; returnReason: string; rejected: boolean; rejectReason: string; missing: boolean
}
type Custody = {
  id: string; docId: string; docCode: string; action: string; userId: string; userName: string
  detail: string; dueBackIso: string; createdAt: string
}
type DocEventRow = {
  id: string; docId: string; docCode: string; kind: string; at: string; amount: number
  repId: string; repName: string; holooRef: string; note: string; items: { productName: string; qty: number; reason: string }[]
  createdByName: string; createdAt: string
  docTitle?: string; docParty?: string
}
type DetailRes = { doc: Doc; items: DocItem[]; custody: Custody[]; events: DocEventRow[] }
type PartyEntry = { party: string; partyId: string; docCount: number; totalAmount: number; lastDate: string; firstDate: string }
type PartyFilter = { id: string; name: string } | null
type Stats = { docs: number; binders: number; borrowed: number; monthIntake: number; totalValue: number; retentionDue?: number; disposalPending?: number }
type LedgerProduct = { id: string; name: string; unit: string; brand: string; category: string; stock: number; buyPrice: number }
type HistoryEntry = { at: string; kind: 'ORDER' | 'ARCHIVE' | 'WASTE'; label: string } & Record<string, any>
type HistoryRes = {
  product: { id: string; name: string; unit: string; brand: string; category: string; barcode: string }
  timeline: HistoryEntry[]
  summary: {
    purchaseCount: number; totalPurchasedQty: number; lastBuyPrice: number; lastExpiry: string
    archiveDocCount: number; wasteCount: number; wasteValue: number; archiveValue: number
  }
}
type RepLite = { id: string; fullName: string; providerName: string; providerId: string; jobRole: string; mobile: string; active: boolean }
type RepFull = RepLite & {
  phone2?: string; nationalId?: string; notes?: string; createdAt?: string
  kind?: string; company?: string; email?: string; address?: string; birthday?: string; tags?: string[]
  providerHistory?: { providerName: string; from: string; to?: string }[]
  docCount?: number; lastSeen?: string; totalCollected?: number; eventCount?: number
}
type RepProfileRes = { rep: RepFull; events: DocEventRow[]; docs: { id: string; code: string; title: string; party: string; amount: number; docDate: string }[] }

const DOC_TYPES: Record<string, { label: string; emoji: string }> = {
  INVOICE: { label: 'فاکتور خرید', emoji: '🧾' },
  CHEQUE_DOC: { label: 'سند چک', emoji: '🏦' },
  RECEIPT: { label: 'رسید پرداخت', emoji: '🎫' },
  CONTRACT: { label: 'قرارداد', emoji: '📜' },
  STATEMENT: { label: 'صورتحساب', emoji: '📊' },
  OTHER: { label: 'سایر اسناد', emoji: '📁' },
}

const KIND_META: Record<string, { label: string; emoji: string; color: string }> = {
  ORDER: { label: 'سفارش خرید', emoji: '🛒', color: '#0e7a4a' },
  ARCHIVE: { label: 'سند آرشیو', emoji: '🗂', color: '#8a5a2b' },
  WASTE: { label: 'ضایعات', emoji: '🗑', color: '#b3372f' },
}

// ── آرشیو ۲٫۰ — واژه‌نامهٔ چرخهٔ حیات (ISO 15489) ──
const LIFECYCLE_META: Record<string, { label: string; color: string; bg: string }> = {
  CAPTURED: { label: 'ثبت‌شده', color: '#8a5a2b', bg: '#8a5a2b1a' },
  CLASSIFIED: { label: 'طبقه‌بندی‌شده', color: '#c9a227', bg: '#c9a2271a' },
  ACTIVE: { label: 'فعال', color: '#0e7a4a', bg: '#0e7a4a1a' },
  SEMI_ACTIVE: { label: 'نیمه‌فعال', color: '#77934a', bg: '#77934a1a' },
  RETENTION_DUE: { label: 'سرِرسید نگهداری', color: '#c96f4a', bg: '#c96f4a1a' },
  DISPOSAL_PENDING: { label: 'در انتظار دفع', color: '#b3372f', bg: '#b3372f1a' },
  DISPOSED: { label: 'دفع‌شده', color: '#6b7280', bg: '#6b72801a' },
}
const LIFECYCLE_ORDER = ['CAPTURED', 'CLASSIFIED', 'ACTIVE', 'SEMI_ACTIVE', 'RETENTION_DUE', 'DISPOSAL_PENDING', 'DISPOSED']

const PAYMENT_META: Record<string, { label: string; color: string }> = {
  UNPAID: { label: 'پرداخت‌نشده', color: '#b3372f' },
  PARTIAL: { label: 'نیمه', color: '#c9a227' },
  PAID: { label: 'تسویه', color: '#0e7a4a' },
}

const EVENT_KINDS_META: Record<string, { label: string; emoji: string; color: string }> = {
  DELIVERY: { label: 'تحویل کالا', emoji: '🚚', color: '#0e7a4a' },
  PAYMENT_POS: { label: 'پرداخت کارتخوان (POS)', emoji: '💳', color: '#0e7a4a' },
  PAYMENT_CHEQUE: { label: 'پرداخت چک', emoji: '🏦', color: '#8a5a2b' },
  PAYMENT_CASH: { label: 'پرداخت نقدی', emoji: '💵', color: '#0e7a4a' },
  PAYMENT_TRANSFER: { label: 'پرداخت کارت‌به‌کارت', emoji: '🔁', color: '#77934a' },
  RETURN: { label: 'مرجوعی', emoji: '↩️', color: '#b3372f' },
  REJECT: { label: 'مردود', emoji: '⛔', color: '#b3372f' },
  SHORTAGE: { label: 'کسری/نیامده', emoji: '📦', color: '#c96f4a' },
  HOLOO_INVOICE: { label: 'ثبت فاکتور در هلو', emoji: '🏷', color: '#8a5a2b' },
  HOLOO_RECEIPT: { label: 'ثبت رسید در هلو', emoji: '🧾', color: '#8a5a2b' },
  NOTE: { label: 'یادداشت', emoji: '📝', color: '#6b7280' },
}
const PAYMENT_EVENT_KINDS = ['PAYMENT_POS', 'PAYMENT_CHEQUE', 'PAYMENT_CASH', 'PAYMENT_TRANSFER']
const FLAG_EVENT_KINDS = ['RETURN', 'REJECT', 'SHORTAGE']

const CUSTODY_META: Record<string, { label: string; emoji: string; color: string }> = {
  BORROW: { label: 'امانت', emoji: '✋', color: '#c96f4a' },
  RETURN: { label: 'بازگشت', emoji: '↩️', color: '#0e7a4a' },
  MOVE: { label: 'جابه‌جایی', emoji: '🔀', color: '#8a5a2b' },
  EDIT: { label: 'ویرایش', emoji: '✏️', color: '#8a6d10' },
  SCAN: { label: 'اسکن', emoji: '🖨️', color: '#6b7280' },
  DISPOSAL_REQUEST: { label: 'درخواست دفع', emoji: '🗑️', color: '#c96f4a' },
  DISPOSAL_DONE: { label: 'دفع انجام‌شده', emoji: '🏁', color: '#6b7280' },
  PAYMENT: { label: 'پرداخت', emoji: '💳', color: '#0e7a4a' },
  DELIVERY: { label: 'تحویل', emoji: '🚚', color: '#0e7a4a' },
  HOLOO_REF: { label: 'مرجع هلو', emoji: '🏷', color: '#8a5a2b' },
  LEGAL_HOLD: { label: 'نگهداری حقوقی', emoji: '🔒', color: '#b3372f' },
  LIFECYCLE: { label: 'مرحلهٔ حیات', emoji: '🔄', color: '#c9a227' },
}

const JOB_ROLES: Record<string, string> = { REP: 'ویزیتور فروش', DRIVER: 'راننده', ACCOUNTANT: 'حسابدار شرکت', MANAGER: 'مدیر شرکت' }
const CONF_META: Record<string, string> = { PUBLIC: 'عمومی', STAFF: 'کارکنان', MANAGEMENT: 'مدیریت' }
const DISPOSAL_METHODS: Record<string, string> = { SHRED: 'خردکن', BURN: 'سوزاندن', DIGITAL_DELETE: 'حذف دیجیتال' }

/** ISO datetime → مقدار input[type=datetime-local] به وقت محلی */
function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  if (isNaN(d.getTime())) return ''
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

type Tab = 'docs' | 'parties' | 'ledger' | 'reps' | 'structure' | 'orders'

/** انواع شخص در دفتر اشخاص (round-15) — برچسب فارسی برای نمایش */
const PERSON_KINDS: Record<string, string> = {
  REP: 'نماینده فروش', DRIVER: 'راننده', ACCOUNTANT: 'حسابدار', MANAGER: 'مدیر',
  CONTACT: 'تماس', INSPECTOR: 'کارشناس بازرسی', LANDLORD: 'مالک ملک', OTHER: 'سایر',
}

type OrderRow = {
  id: string; code: string; providerName: string; status: string; deliveryDate: string
  totalAmount: number; itemsCount: number; itemsTotalQty: number; isOverdue: boolean
  createdAt?: string
}
type ExtraShelf = { cabinet: string; shelf: string }

// ── چرخهٔ سفارش تا حسابداری — ۴ مرحلهٔ مشترک دو تب (بدون API جدید؛ از وضعیت سفارش) ──
const CYCLE_STEPS: { label: string; emoji: string }[] = [
  { label: 'سفارش', emoji: '🛒' },
  { label: 'دریافت', emoji: '🚚' },
  { label: 'تأیید انبار', emoji: '✅' },
  { label: 'ثبت در دفتر', emoji: '🧾' },
]

/** مرحلهٔ ۰..۳ سفارش از روی وضعیت آن — نگاشت وضعیت‌های ORDER_FLOW به ۴ مرحلهٔ چرخه */
function orderStage(status?: string): number {
  if (status === 'ACCOUNTED' || status === 'DONE') return 3
  if (status === 'VERIFIED') return 2
  if (status === 'RECEIVED' || status === 'RECEIVING') return 1
  return 0 // DRAFT / SUBMITTED / APPROVED / نامشخص
}

/**
 * تطبیق سند آرشیو با سفارش خرید (اتصال متقابل دفتر ↔ سفارش) — هیوریستیک ساده و عمداً محافظه‌کارانه:
 *  ۱) سفارش‌های همان طرف معامله (providerName === party — فیلد مشترک Order و ArchiveDoc).
 *  ۲) از میان آن‌ها نزدیک‌ترین به تاریخ سند (تاریخ تحویل سفارش، وگرنه تاریخ ثبت) با پنجرهٔ ±۳۰ روز.
 * در نبود تطبیقِ مطمئن null برمی‌گردد و UI دکمهٔ «جست‌وجو در سفارش‌ها با همین طرف معامله» را نشان می‌دهد
 * (این حالت هم اتصال را برقرار می‌کند: تب سفارش‌ها با جست‌وجوی همان طرف معامله باز می‌شود).
 * نکته: ArchiveDoc فیلد refOrderCode دارد ولی /api/archive/history آن را برنمی‌گرداند؛ اگر روزی اضافه شود
 * تطبیق مستقیم کد سفارش باید پیش از این هیوریستیک بررسی شود.
 */
function matchDocToOrder(row: { at: string; party?: string }, orders: OrderRow[]): OrderRow | null {
  const t = new Date(row.at || '').getTime()
  if (!row.party || isNaN(t)) return null
  let best: OrderRow | null = null
  let bestDiff = Infinity
  for (const o of orders) {
    if (o.providerName !== row.party) continue
    const ot = new Date(o.deliveryDate || o.createdAt || '').getTime()
    if (isNaN(ot)) continue
    const diff = Math.abs(ot - t)
    if (diff <= 30 * 86400000 && diff < bestDiff) {
      best = o
      bestDiff = diff
    }
  }
  return best
}

/** خوشه‌بندی تب‌ها (خواستهٔ مالک: «سفارش» و «دفتر حسابداری» کنار هم) — کلید تب‌ها و محتوایشان بدون تغییر، فقط گروه‌بندی/نمایش */
const TAB_GROUPS: { caption: string; dot: string; border: string; tabs: [Tab, React.ReactNode, string][] }[] = [
  {
    caption: 'اسناد و بایگانی',
    dot: '#8a5a2b',
    border: 'border-[#8a5a2b]/40',
    tabs: [
      ['docs', <FolderOpen key="i" size={15} />, 'اسناد'],
      ['structure', <Network key="i" size={15} />, 'ساختار بایگانی'],
    ],
  },
  {
    caption: 'چرخهٔ سفارش تا حسابداری',
    dot: '#0e7a4a',
    border: 'border-[#0e7a4a]/40',
    tabs: [
      ['orders', <ShoppingBag key="i" size={15} />, 'سفارش‌ها'],
      ['ledger', <Package key="i" size={15} />, 'دفتر حسابداری'],
    ],
  },
  {
    caption: 'اشخاص و شبکه',
    dot: '#77934a',
    border: 'border-[#77934a]/40',
    tabs: [
      ['parties', <Users key="i" size={15} />, 'تأمین‌کنندگان'],
      ['reps', <UserCog key="i" size={15} />, 'نمایندگان'],
    ],
  },
]

/** نوار توضیح «چرخهٔ سفارش تا حسابداری» — بالای هر دو تب سفارش‌ها و دفتر حسابداری؛ مرحلهٔ فعلی طلایی می‌درخشد */
function CycleStrip({ activeStage, note }: { activeStage: number | null; note?: string }) {
  return (
    <div className="fade-in-up mb-3 rounded-2xl border border-[#0e7a4a]/25 bg-[#f3f6ec] p-2.5">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
        <span className="text-[10px] font-black text-[#0e7a4a]">چرخهٔ سفارش تا حسابداری:</span>
        {CYCLE_STEPS.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-[#8a5a2b]/50">←</span>}
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black transition',
                activeStage === i
                  ? 'bg-[#c9a227] text-white shadow'
                  : activeStage != null && i < activeStage
                    ? 'bg-[#0e7a4a]/15 text-[#0e7a4a]'
                    : 'bg-white/80 text-[#8a5a2b]',
              )}
            >
              {s.emoji} {s.label}
            </span>
          </span>
        ))}
        {activeStage != null && (
          <span className="rounded-full bg-[#c9a227]/15 px-2 py-0.5 text-[9px] font-black text-[#8a5a2b]">
            مرحلهٔ فعلی: {CYCLE_STEPS[activeStage].label}
          </span>
        )}
      </div>
      {note && <p className="mt-1.5 text-[10px] font-bold leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  )
}

/** نشانگر فشردهٔ ۴ مرحلهٔ چرخه برای داخل ردیف‌ها — مرحلهٔ جاری طلایی، مرحله‌های گذاشته زیتونی */
function CycleDots({ stage }: { stage: number }) {
  return (
    <span className="flex items-center gap-1" title={`مرحلهٔ چرخه: ${CYCLE_STEPS[stage]?.label || '—'}`}>
      {CYCLE_STEPS.map((s, i) => (
        <span
          key={s.label}
          title={s.label}
          className={cn(
            'h-1.5 w-4 rounded-full',
            i < stage ? 'bg-[#0e7a4a]/50' : i === stage ? 'bg-[#c9a227]' : 'bg-[#8a5a2b]/15',
          )}
        />
      ))}
    </span>
  )
}

export default function ArchiveView({ ctx }: { ctx: AppCtx }) {
  const role = ctx.user!.role
  const canManage = ['GM', 'OM', 'ACC', 'OWNER'].includes(role)
  const canRegister = ['GM', 'OM', 'ACC', 'OWNER', 'SK', 'ADMIN'].includes(role)
  // عملیات حساس دفع/نگهداری حقوقی — ACC/OM/GM/OWNER/ADMIN (تأیید دوم همیشه کاربر دیگری است)
  const canDispose = ['ACC', 'OM', 'GM', 'OWNER', 'ADMIN'].includes(role)

  // تب پیش‌فرض «اسناد» — مگر این که پارامتر هش تب مشخصی را هدف گرفته باشد (لینک عمیق)
  const [tab, setTab] = useState<Tab>(() => {
    const p = ctx.param
    return p === 'parties' || p === 'reps' || p === 'orders' || p === 'ledger' || p === 'structure' ? p : 'docs'
  })
  const [binders, setBinders] = useState<Binder[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [parties, setParties] = useState<PartyEntry[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [q, setQ] = useState('')
  const [binderFilter, setBinderFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [lifecycleFilter, setLifecycleFilter] = useState('')
  const [dueMode, setDueMode] = useState<'' | 'due' | 'pending'>('')
  const [partyFilter, setPartyFilter] = useState<PartyFilter>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [binderOpen, setBinderOpen] = useState(false)
  const [lastFiled, setLastFiled] = useState<{ doc: Doc; binder: Binder | { id: string; code: string; title: string; cabinet: string; shelf: string }; pickReason: string; itemsCreated: number } | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // expandable line items (سجل کالا) per document
  const [expandedDoc, setExpandedDoc] = useState('')
  const [itemsMap, setItemsMap] = useState<Record<string, DocItem[]>>({})
  const [itemsLoading, setItemsLoading] = useState('')

  // ── نمایندگان ──
  const [reps, setReps] = useState<RepLite[]>([])
  const [repsStats, setRepsStats] = useState<RepFull[]>([])
  const [repsQ, setRepsQ] = useState('')
  const [repProfile, setRepProfile] = useState<RepProfileRes | null>(null)
  const [repProfileId, setRepProfileId] = useState('')
  const [repFormOpen, setRepFormOpen] = useState(false)
  const [repEdit, setRepEdit] = useState<RepFull | null>(null)

  // ── ساختار آرشیو (round-15) ──
  const [structureExtras, setStructureExtras] = useState<ExtraShelf[]>([])
  const [renameCab, setRenameCab] = useState('')
  const [renameShelf, setRenameShelf] = useState<{ cabinet: string; shelf: string } | null>(null)
  const [addShelfFor, setAddShelfFor] = useState('')
  const [binderEdit, setBinderEdit] = useState<Binder | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)

  // ── سفارش‌های در جریان (round-15) ──
  const [orders, setOrders] = useState<OrderRow[]>([])
  // ── چرخهٔ سفارش تا حسابداری: اتصال متقابل دو تب (خواستهٔ مالک) — فیلتر مشترکِ بالا-آمده از ردیف سفارش ──
  const [ledgerFocus, setLedgerFocus] = useState<{ party: string; orderCode: string; status?: string } | null>(null)
  const [ordersQ, setOrdersQ] = useState('')
  const [focusOrderId, setFocusOrderId] = useState('')
  const [focusSeq, setFocusSeq] = useState(0)
  const [ringOrderId, setRingOrderId] = useState('')

  // ── جزئیات سند + مودال‌های عملیات ──
  const [detail, setDetail] = useState<DetailRes | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [borrowOpen, setBorrowOpen] = useState(false)
  const [disposalOpen, setDisposalOpen] = useState(false)

  // کارت کالا (product 360)
  const [ledgerProducts, setLedgerProducts] = useState<LedgerProduct[]>([])
  const [prodQ, setProdQ] = useState('')
  const [partyQ, setPartyQ] = useState('')
  const [selProduct, setSelProduct] = useState<LedgerProduct | null>(null)
  const [history, setHistory] = useState<HistoryRes | null>(null)
  const [histBusy, setHistBusy] = useState(false)

  const load = useCallback((qq = q, bid = binderFilter, st = statusFilter, pf: PartyFilter = partyFilter, dm: '' | 'due' | 'pending' = dueMode, lc = lifecycleFilter) => {
    const params = new URLSearchParams()
    if (qq) params.set('q', qq)
    if (bid) params.set('binderId', bid)
    if (st) params.set('status', st)
    if (dm === 'due') params.set('retention', 'due')
    if (dm === 'pending') params.set('lifecycle', 'DISPOSAL_PENDING')
    else if (lc) params.set('lifecycle', lc)
    if (pf?.id) params.set('partyId', pf.id)
    if (pf?.name) params.set('party', pf.name)
    return api<{ binders: Binder[]; docs: Doc[]; parties: PartyEntry[]; stats: Stats; structure?: { extraShelves?: ExtraShelf[] } }>(`/api/archive?${params}`).then((d) => {
      setBinders(d.binders); setDocs(d.docs); setParties(d.parties || []); setStats(d.stats)
      setStructureExtras(d.structure?.extraShelves || [])
    })
  }, [q, binderFilter, statusFilter, partyFilter, dueMode, lifecycleFilter])

  const loadReps = useCallback(() => {
    api<{ reps: RepLite[] }>('/api/archive?reps=1').then((d) => setReps(d.reps || [])).catch(() => { /* silent */ })
    api<{ reps: RepFull[] }>('/api/sales-reps').then((d) => setRepsStats(d.reps || [])).catch(() => { /* silent */ })
  }, [])

  useEffect(() => { load(); loadReps() }, [])

  const onSearch = (v: string) => {
    setQ(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => load(v, binderFilter, statusFilter), 320)
  }

  const pickBinder = (id: string) => {
    const bid = id === binderFilter ? '' : id
    setBinderFilter(bid)
    load(q, bid, statusFilter)
  }

  const onPartyPick = (p: PartyEntry) => {
    const pf: PartyFilter = { id: p.partyId, name: p.party }
    setPartyFilter(pf)
    setTab('docs')
    load(q, '', statusFilter, pf)
  }

  const clearParty = () => {
    setPartyFilter(null)
    load(q, binderFilter, statusFilter, null)
  }

  const jumpRetention = (dm: '' | 'due' | 'pending') => {
    setDueMode(dm)
    setLifecycleFilter('')
    setTab('docs')
    load(q, binderFilter, statusFilter, partyFilter, dm)
  }

  const applyLifecycleFilter = (lc: string) => {
    setLifecycleFilter(lc)
    setDueMode('')
    load(q, binderFilter, statusFilter, partyFilter, '', lc)
  }

  const toggleDoc = async (id: string) => {
    if (expandedDoc === id) return setExpandedDoc('')
    setExpandedDoc(id)
    if (itemsMap[id]) return
    setItemsLoading(id)
    try {
      const d = await api<DetailRes>(`/api/archive?docId=${id}`)
      setItemsMap((m) => ({ ...m, [id]: d.items || [] }))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setItemsLoading('')
    }
  }

  // ── جزئیات کامل سند (پرونده) ──
  const openDoc = async (id: string) => {
    setDetail(null)
    setDetailBusy(true)
    try {
      const d = await api<DetailRes>(`/api/archive?docId=${id}`)
      setDetail(d)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDetailBusy(false)
    }
  }

  const refreshDetail = async () => {
    if (detail?.doc?.id) {
      try {
        setDetail(await api<DetailRes>(`/api/archive?docId=${detail.doc.id}`))
      } catch { /* keep current view */ }
      setItemsMap((m) => {
        const n = { ...m }
        delete n[detail.doc.id]
        return n
      })
    }
    await load()
  }

  const act = async (id: string, body: any, msg: string) => {
    try {
      await api(`/api/archive/${id}`, { method: 'PATCH', body })
      toast.success(msg)
      await refreshDetail()
    } catch (e: any) { toast.error(e.message) }
  }

  const openRep = async (id: string) => {
    setRepProfile(null)
    setRepProfileId(id)
    try {
      setRepProfile(await api<RepProfileRes>(`/api/sales-reps/${id}`))
    } catch (e: any) {
      toast.error(e.message)
      setRepProfileId('')
    }
  }

  // ── کارت کالا: load product list once the tab is opened ──
  useEffect(() => {
    if (tab !== 'ledger' || ledgerProducts.length > 0) return
    api<{ products: LedgerProduct[] }>('/api/products')
      .then((d) => setLedgerProducts((d.products || []).slice(0, 200)))
      .catch(() => { /*silent — retry on next tab open*/ })
  }, [tab, ledgerProducts.length])

  const openProduct = async (p: LedgerProduct) => {
    setSelProduct(p)
    setHistory(null)
    setHistBusy(true)
    try {
      setHistory(await api<HistoryRes>(`/api/archive/history?productId=${p.id}`))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setHistBusy(false)
    }
  }

  const filteredProducts = useMemo(() => {
    const n = prodQ.trim()
    if (!n) return ledgerProducts.slice(0, 8)
    return ledgerProducts.filter((p) => p.name.includes(n) || p.brand.includes(n) || p.category.includes(n)).slice(0, 8)
  }, [ledgerProducts, prodQ])

  const cabinets = useMemo(() => {
    const m = new Map<string, Binder[]>()
    for (const b of binders) {
      if (!m.has(b.cabinet)) m.set(b.cabinet, [])
      m.get(b.cabinet)!.push(b)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fa'))
  }, [binders])

  // ── درخت ساختار آرشیو: کابینت → طبقه → زونکن (+ طبقه‌های خالی ثبت‌شده) ──
  const structureTree = useMemo(() => {
    const cabMap = new Map<string, Map<string, Binder[]>>()
    for (const b of binders) {
      if (!cabMap.has(b.cabinet)) cabMap.set(b.cabinet, new Map())
      const shelves = cabMap.get(b.cabinet)!
      if (!shelves.has(b.shelf)) shelves.set(b.shelf, [])
      shelves.get(b.shelf)!.push(b)
    }
    for (const e of structureExtras) {
      if (!cabMap.has(e.cabinet)) cabMap.set(e.cabinet, new Map())
      const shelves = cabMap.get(e.cabinet)!
      if (!shelves.has(e.shelf)) shelves.set(e.shelf, [])
    }
    return [...cabMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'fa'))
      .map(([cabinet, shelves]) => ({
        cabinet,
        shelves: [...shelves.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], 'fa'))
          .map(([shelf, bs]) => ({ shelf, binders: bs })),
      }))
  }, [binders, structureExtras])

  const structureAction = async (body: Record<string, unknown>, msg: string) => {
    try {
      await api('/api/archive', { method: 'POST', body: { kind: 'structure', ...body } })
      toast.success(msg)
      await load()
    } catch (e: any) { toast.error(e.message) }
  }

  // ── سفارش‌ها: برای تب سفارش‌ها و نیز اتصال متقابل دفتر حسابداری، یک‌بار لود می‌شود ──
  useEffect(() => {
    if ((tab !== 'orders' && tab !== 'ledger') || orders.length > 0) return
    api<{ orders: OrderRow[] }>('/api/orders').then((d) => setOrders(d.orders || [])).catch(() => { /* silent — retry on next tab open */ })
  }, [tab, orders.length])

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'DONE' && o.status !== 'CANCELLED'),
    [orders],
  )

  // ── چرخهٔ سفارش تا حسابداری — حالت‌های مشتق و پرش‌های متقابل ──
  const focusedOrder = useMemo(
    () => (focusOrderId ? orders.find((o) => o.id === focusOrderId) || null : null),
    [orders, focusOrderId],
  )
  const ledgerFocusOrder = useMemo(
    () => (ledgerFocus ? orders.find((o) => o.code === ledgerFocus.orderCode) || null : null),
    [orders, ledgerFocus],
  )
  // با جست‌وجوی فعال، همهٔ سفارش‌های منطبق (حتی تکمیل‌شده) نمایش داده می‌شوند تا پرش از دفتر همیشه به مقصد برسد
  const displayOrders = useMemo(() => {
    const n = ordersQ.trim()
    if (!n && !focusOrderId) return activeOrders
    return orders.filter((o) => o.id === focusOrderId || (n ? o.providerName.includes(n) || o.code.includes(n) : false))
  }, [orders, activeOrders, ordersQ, focusOrderId])

  /** سفارش → دفتر حسابداری: فیلتر مشترک را بالا می‌برد و تب دفتر را با فیلتر همان سفارش/طرف معامله باز می‌کند */
  const goToLedgerForOrder = (o: OrderRow) => {
    setLedgerFocus({ party: o.providerName, orderCode: o.code, status: o.status })
    setTab('ledger')
    toast.info(`دفتر حسابداری برای سفارش ${o.code} آماده شد — کالای سفارش را انتخاب کنید تا سجلش هایلایت شود`)
  }

  /** دفتر حسابداری → سفارش‌ها: تب سفارش‌ها با جست‌وجوی طرف معامله + اسکرول و هالهٔ طلایی روی سفارش هدف */
  const goToOrders = (party: string, orderId = '') => {
    setOrdersQ(party)
    setFocusOrderId(orderId)
    setRingOrderId('')
    setFocusSeq((s) => s + 1)
    setTab('orders')
  }

  const clearOrdersFocus = () => {
    setOrdersQ('')
    setFocusOrderId('')
    setRingOrderId('')
  }

  // اسکرول به سفارش هدف + هالهٔ طلایی ۲ثانیه‌ای پس از پرش از دفتر حسابداری
  useEffect(() => {
    if (!focusSeq || !focusOrderId || tab !== 'orders' || orders.length === 0) return
    const t1 = setTimeout(() => {
      document.getElementById(`order-row-${focusOrderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setRingOrderId(focusOrderId)
    }, 350)
    const t2 = setTimeout(() => setRingOrderId(''), 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [focusSeq, focusOrderId, tab, orders.length])

  const binderById = useMemo(() => new Map(binders.map((b) => [b.id, b])), [binders])

  const partyEntry = useMemo(
    () => (partyFilter ? parties.find((p) => p.party === partyFilter.name) || null : null),
    [parties, partyFilter],
  )

  const filteredReps = useMemo(() => {
    const n = repsQ.trim()
    if (!n) return repsStats
    return repsStats.filter((r) => r.fullName.includes(n) || (r.providerName || '').includes(n) || (r.mobile || '').includes(n))
  }, [repsStats, repsQ])

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`«${text}» کپی شد`)
    } catch {
      toast.error('کپی خودکار ممکن نشد — مقدار: ' + text)
    }
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { l: 'اسناد ثبت‌شده', v: faNum(stats?.docs ?? 0), s: 'در چرخهٔ فعال', c: '#0e7a4a', i: <FileText size={14} /> },
          { l: 'زونکن‌های آرشیو', v: faNum(stats?.binders ?? 0), s: 'طبقه‌بندی موضوعی', c: '#8a5a2b', i: <Library size={14} /> },
          { l: 'اسناد امانتی', v: faNum(stats?.borrowed ?? 0), s: 'خارج از زونکن', c: '#c96f4a', i: <Hand size={14} /> },
          { l: 'ثبت این ماه', v: faNum(stats?.monthIntake ?? 0), s: 'ورودی جدید', c: '#77934a', i: <Plus size={14} /> },
          { l: 'ارزش اسناد', v: faMoney(stats?.totalValue ?? 0), s: 'تومان', c: '#c9a227', i: <Landmark size={14} /> },
        ].map((s) => (
          <div key={s.l} className="glow-card rounded-2xl bg-card p-3.5">
            <p className="flex items-center gap-1.5 text-lg font-black" style={{ color: s.c }}>{s.i}{s.v}</p>
            <p className="mt-0.5 text-xs font-bold">{s.l}</p>
            <p className="text-[10px] text-muted-foreground">{s.s}</p>
          </div>
        ))}
        <button
          type="button"
          onClick={() => jumpRetention('due')}
          className="glow-card rounded-2xl bg-card p-3.5 text-right transition hover:-translate-y-0.5"
        >
          <p className="flex items-center gap-1.5 text-lg font-black" style={{ color: '#c96f4a' }}>
            <Clock size={14} />
            {faNum((stats?.retentionDue ?? 0) + (stats?.disposalPending ?? 0))}
          </p>
          <p className="mt-0.5 text-xs font-bold">سرِرسید نگهداری و دفع</p>
          <p className="text-[10px] text-muted-foreground">
            {faNum(stats?.retentionDue ?? 0)} در آستانه • {faNum(stats?.disposalPending ?? 0)} در انتظار دفع
          </p>
        </button>
      </div>

      {/* ── تب‌ها: ۳ خوشهٔ برچسب‌دار — «سفارش‌ها» و «دفتر حسابداری» عمداً در یک خوشه‌اند (خواستهٔ مالک) ── */}
      {/* دسکتاپ: سه جعبهٔ خوشه با زیرنویس کوچک */}
      <div className="hidden gap-2 md:grid md:grid-cols-3" role="group" aria-label="گروه‌های بایگانی">
        {TAB_GROUPS.map((g) => {
          const activeGroup = g.tabs.some(([k]) => tab === k)
          return (
            <div
              key={g.caption}
              className={cn(
                'rounded-2xl border bg-[#f7efe2] p-1.5 transition',
                activeGroup ? cn('shadow-sm ring-1 ring-[#c9a227]/50', g.border) : 'border-[#8a5a2b]/25',
              )}
            >
              <p className="mb-1 flex items-center gap-1 px-1.5 text-[9px] font-black leading-4 text-[#8a5a2b]">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: g.dot }} />
                {g.caption}
              </p>
              <div className="flex gap-1.5">
                {g.tabs.map(([k, icon, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    aria-pressed={tab === k}
                    className={cn(
                      'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition',
                      tab === k ? 'bg-white text-[#0e7a4a] shadow ring-1 ring-[#c9a227]/40' : 'text-[#8a5a2b] hover:bg-white/60',
                    )}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {/* موبایل: ردیف افقی اسکرول‌دار — زیرنویس خوشه + قرص‌ها، همه با هدف لمسی ۴۴px */}
      <div className="flex gap-2 overflow-x-auto pb-1 scroll-gold md:hidden" role="group" aria-label="گروه‌های بایگانی">
        {TAB_GROUPS.map((g) => (
          <div key={g.caption} className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-[#8a5a2b]/25 bg-[#f7efe2] px-2 py-1.5">
            <span className="flex items-center gap-1 text-[9px] font-black leading-4 text-[#8a5a2b]">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: g.dot }} />
              {g.caption}
            </span>
            {g.tabs.map(([k, icon, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-pressed={tab === k}
                className={cn(
                  'flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-extrabold transition',
                  tab === k ? 'bg-white text-[#0e7a4a] shadow ring-1 ring-[#c9a227]/40' : 'text-[#8a5a2b] hover:bg-white/60',
                )}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {tab === 'docs' && (
        <>
          {/* ── ویجت نگهداری و دفع (ISO 15489 — دفع هرگز خودکار نیست) ── */}
          <div className="fade-in-up grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => jumpRetention(dueMode === 'due' ? '' : 'due')}
              className={cn(
                'flex min-h-[44px] items-center justify-between gap-2 rounded-2xl border-2 bg-[#fdf6dd] p-3.5 text-right transition',
                dueMode === 'due' ? 'border-[#c9a227] ring-2 ring-[#c9a227]/40' : 'border-[#c9a227]/50 hover:shadow-md',
              )}
            >
              <span className="flex items-center gap-2">
                <Clock size={18} className="text-[#8a6d10]" />
                <span>
                  <span className="block text-xs font-black text-[#8a6d10]">سرِرسید مهلت نگهداری</span>
                  <span className="block text-[10px] text-muted-foreground">مهلت دفع تا ۶۰ روز آینده — بررسی و تصمیم مدیریتی</span>
                </span>
              </span>
              <span className="rounded-xl bg-[#c9a227]/20 px-3 py-1.5 text-base font-black text-[#8a6d10]">{faNum(stats?.retentionDue ?? 0)}</span>
            </button>
            <button
              type="button"
              onClick={() => jumpRetention(dueMode === 'pending' ? '' : 'pending')}
              className={cn(
                'flex min-h-[44px] items-center justify-between gap-2 rounded-2xl border-2 bg-[#fbeae8] p-3.5 text-right transition',
                dueMode === 'pending' ? 'border-[#b3372f] ring-2 ring-[#b3372f]/30' : 'border-[#b3372f]/40 hover:shadow-md',
              )}
            >
              <span className="flex items-center gap-2">
                <Gavel size={18} className="text-[#b3372f]" />
                <span>
                  <span className="block text-xs font-black text-[#b3372f]">در انتظار دفع (تأیید دوم)</span>
                  <span className="block text-[10px] text-muted-foreground">درخواست دفع ثبت شده — نیازمند تأیید کاربر دیگر</span>
                </span>
              </span>
              <span className="rounded-xl bg-[#b3372f]/15 px-3 py-1.5 text-base font-black text-[#b3372f]">{faNum(stats?.disposalPending ?? 0)}</span>
            </button>
          </div>

          {partyFilter && (
            <div className="fade-in-up rounded-2xl border-2 border-[#c9a227]/60 bg-[#fdf6dd] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-black text-[#8a5a2b]">
                  <Users size={16} /> پروندهٔ طرف حساب: {partyFilter.name}
                </p>
                <button onClick={clearParty} className="min-h-[44px] rounded-xl border border-[#c9a227]/60 bg-white/70 px-3 py-2 text-[11px] font-black text-[#8a5a2b]">
                  نمایش همهٔ اسناد ✕
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                <KeyValue k="تعداد اسناد" v={faNum(partyEntry?.docCount ?? docs.length)} />
                <KeyValue k="مجموع ارزش" v={`${faMoney(partyEntry?.totalAmount ?? docs.reduce((s, d) => s + d.amount, 0))} تومان`} />
                <KeyValue k="نخستین سند" v={partyEntry?.firstDate ? formatJalaliShort(partyEntry.firstDate) : '—'} />
                <KeyValue k="آخرین سند" v={partyEntry?.lastDate ? formatJalaliShort(partyEntry.lastDate) : '—'} />
              </div>
              {partyFilter.id ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#0e7a4a]">
                  ✅ ذخیره در تأمین‌کنندگان — این طرف حساب با رکورد سامانه مرتبط است.
                  <button onClick={() => ctx.navigate('providers')} className="min-h-[44px] rounded-xl bg-[#0e7a4a]/10 px-3 py-2 text-[11px] font-black text-[#0e7a4a]">
                    بازکردن تأمین‌کنندگان
                  </button>
                </p>
              ) : (
                <p className="mt-2 text-[11px] font-bold text-[#c96f4a]">
                  ⚠️ این طرف حساب هنوز به رکورد تأمین‌کنندگان متصل نیست — در ثبت سند بعدی تطبیق خودکار انجام می‌شود.
                </p>
              )}
            </div>
          )}

          {dueMode && (
            <div className={cn('fade-in-up flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3', dueMode === 'due' ? 'border-[#c9a227]/60 bg-[#fdf6dd]' : 'border-[#b3372f]/50 bg-[#fbeae8]')}>
              <p className={cn('text-xs font-black', dueMode === 'due' ? 'text-[#8a6d10]' : 'text-[#b3372f]')}>
                {dueMode === 'due' ? '⏳ فیلتر فعال: اسنادی که مهلت نگهداری‌شان رو به پایان است' : '🗑️ فیلتر فعال: اسناد در انتظار تأیید دفع'}
                {' '}— {faNum(docs.length)} سند
              </p>
              <button onClick={() => jumpRetention('')} className="min-h-[44px] rounded-xl bg-white/70 px-3 py-2 text-[11px] font-black text-[#8a5a2b]">
                نمایش همهٔ اسناد ✕
              </button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            {/* ── binder shelf ── */}
            <SectionCard
              title="قفسهٔ آرشیو — طبقه‌بندی موضوعی زونکن‌ها"
              subtitle="ساختار ۲۰ زونکنی گروه‌بندی طرف‌حساب‌ها؛ روی هر زونکن بزنید تا اسنادش نمایش داده شود"
              icon={<Library size={18} />}
              className="lg:col-span-2"
              actions={canManage && (
                <button onClick={() => setBinderOpen(true)} className="flex items-center gap-1 rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd]/60 px-3 py-2 text-[11px] font-extrabold text-[#8a5a2b]">
                  <Plus size={13} /> زونکن جدید
                </button>
              )}
            >
              <div className="scroll-gold max-h-[52vh] space-y-3 overflow-y-auto pl-1">
                {cabinets.map(([cab, bs]) => (
                  <div key={cab} className="rounded-2xl border border-[#8a5a2b]/25 bg-gradient-to-b from-[#f7efe2] to-[#fdf6dd] p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-[#8a5a2b]">
                      <Archive size={13} /> کابینت {faNum(cab)}
                    </p>
                    <div className="space-y-1.5">
                      {bs.map((b) => {
                        const fill = Math.min(100, Math.round((b.docCount / Math.max(1, b.capacity)) * 100))
                        const active = binderFilter === b.id
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => pickBinder(b.id)}
                            className={cn(
                              'w-full rounded-xl bg-white/85 p-2.5 text-right transition hover:shadow-md',
                              active && 'ring-2 ring-[#c9a227]',
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="h-9 w-2.5 shrink-0 rounded-full" style={{ background: b.colorTag }} />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="truncate text-[11px] font-black">{b.title}</span>
                                  <span className="shrink-0 rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b]" dir="ltr">{b.code}</span>
                                </span>
                                <span className="mt-0.5 flex items-center justify-between text-[9px] text-muted-foreground">
                                  <span>طبقهٔ {faNum(b.shelf)} • {faNum(b.docCount)} سند</span>
                                  <span style={{ color: fill >= 90 ? '#b3372f' : undefined }}>{faNum(fill)}٪ پر</span>
                                </span>
                                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-[#8a5a2b]/10">
                                  <span className="block h-full rounded-full transition-all" style={{ width: `${fill}%`, background: b.colorTag }} />
                                </span>
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* ── docs registry ── */}
            <SectionCard
              title="دفتر ثبت اسناد"
              subtitle="روی سند بزنید تا پروندهٔ کامل (مالی، هلو، نماینده، اقلام و زنجیرهٔ custody) باز شود"
              icon={<FolderOpen size={18} />}
              className="lg:col-span-3"
              actions={canRegister && (
                <button onClick={() => setIntakeOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white">
                  <Plus size={14} /> ثبت سند در آرشیو
                </button>
              )}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="w-full max-w-sm"><SearchInput value={q} onChange={onSearch} placeholder="جست‌وجو: طرف حساب، شماره هلو، نماینده، شماره سند…" /></div>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); load(q, binderFilter, e.target.value) }}
                  className="rounded-xl border border-input bg-white p-2 text-xs font-bold"
                >
                  <option value="">همهٔ وضعیت‌ها</option>
                  <option value="IN_BINDER">در زونکن</option>
                  <option value="BORROWED">امانتی</option>
                  <option value="DESTROYED">خارج‌شده</option>
                </select>
                <select
                  value={lifecycleFilter}
                  onChange={(e) => applyLifecycleFilter(e.target.value)}
                  className="rounded-xl border border-input bg-white p-2 text-xs font-bold"
                >
                  <option value="">همهٔ مراحل حیات</option>
                  {LIFECYCLE_ORDER.map((k) => <option key={k} value={k}>{LIFECYCLE_META[k].label}</option>)}
                </select>
                {binderFilter && (
                  <button onClick={() => pickBinder(binderFilter)} className="rounded-xl bg-[#c9a227]/15 px-2.5 py-2 text-[11px] font-black text-[#8a5a2b]">
                    فقط {binderById.get(binderFilter)?.code || 'زونکن'} ✕
                  </button>
                )}
              </div>

              {lastFiled && (
                <div className="fade-in-up mb-3 rounded-2xl border-2 border-[#c9a227] bg-[#fdf6dd] p-4 shadow-[0_8px_24px_rgba(201,162,39,0.18)]">
                  <p className="flex items-center gap-1.5 text-xs font-black text-[#8a5a2b]">
                    <MapPin size={14} /> سند بایگانی شد — موقعیت فیزیکی برای یافتن فوری
                  </p>
                  <p className="mt-2 text-center text-lg font-black tracking-wide text-[#0e7a4a]" dir="ltr">{lastFiled.doc.code}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                    <KeyValue k="زونکن" v={lastFiled.doc.binderCode} />
                    <KeyValue k="کابینت" v={faNum(lastFiled.binder.cabinet)} />
                    <KeyValue k="طبقه" v={faNum(lastFiled.binder.shelf)} />
                    <KeyValue k="ترتیب در زونکن" v={faNum(lastFiled.doc.seq)} />
                  </div>
                  <p className="mt-2 text-center text-[11px] font-bold text-[#8a5a2b]">
                    🗄️ کابینت {faNum(lastFiled.binder.cabinet)} → طبقهٔ {faNum(lastFiled.binder.shelf)} → زونکن «{lastFiled.binder.title}» → جایگاه {faNum(lastFiled.doc.seq)}
                    {' '}— {lastFiled.pickReason}
                  </p>
                  {lastFiled.itemsCreated > 0 && (
                    <p className="mt-1 text-center text-[11px] font-black text-[#0e7a4a]">
                      📋 {faNum(lastFiled.itemsCreated)} قلم کالا در سجل سند ثبت شد — تاریخچهٔ کالا از تب «دفتر حسابداری» قابل ردیابی است
                    </p>
                  )}
                  <button onClick={() => setLastFiled(null)} className="mt-2 w-full rounded-xl border border-[#c9a227]/50 py-1.5 text-[11px] font-bold text-[#8a5a2b]">متوجه شدم</button>
                </div>
              )}

              <div className="scroll-gold max-h-[46vh] space-y-2 overflow-y-auto pl-1">
                {docs.length === 0 && <EmptyState emoji="🗂️" title="سندی یافت نشد" hint="با «ثبت سند در آرشیو» نخستین سند را بایگانی کنید" />}
                {docs.map((d) => {
                  const t = DOC_TYPES[d.docType] || DOC_TYPES.OTHER
                  const b = binderById.get(d.binderId)
                  const items = itemsMap[d.id]
                  const expanded = expandedDoc === d.id
                  const lc = LIFECYCLE_META[d.lifecycle] || LIFECYCLE_META.ACTIVE
                  const pm = PAYMENT_META[d.paymentStatus] || PAYMENT_META.UNPAID
                  return (
                    <div
                      key={d.id}
                      onClick={() => openDoc(d.id)}
                      className={cn('glow-card cursor-pointer rounded-2xl bg-white/80 p-3.5 transition hover:shadow-md', expanded && 'ring-1 ring-[#c9a227]/60', d.legalHold && 'border-2 border-[#b3372f]/40')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black">
                            <ChevronDown size={14} className={cn('ml-1 inline transition-transform', expanded && 'rotate-180')} />
                            {t.emoji} {d.title}
                            <span className="mr-2 rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b]" dir="ltr">{d.code}</span>
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                            <span>{d.party}</span>
                            <span>• {formatJalaliShort(d.docDate)}</span>
                            {d.amount > 0 && <span>• {faMoney(d.amount)} تومان</span>}
                            {d.invoiceNo && (
                              <span className="rounded-md bg-[#0e7a4a]/10 px-1.5 py-0.5 font-black text-[#0e7a4a]">🧾 فاکتور {d.invoiceNo}</span>
                            )}
                            {d.refOrderCode && <span>• سفارش {d.refOrderCode}</span>}
                          </p>
                          {/* chips آرشیو ۲٫۰ */}
                          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] font-bold">
                            <span className="rounded-full px-2 py-0.5" style={{ color: lc.color, background: lc.bg }}>{lc.label}</span>
                            <span className="rounded-full px-2 py-0.5" style={{ color: pm.color, background: `${pm.color}1a` }}>{pm.label}</span>
                            {d.repName && <span className="rounded-full bg-[#77934a]/15 px-2 py-0.5 text-[#5c7236]">👤 {d.repName}</span>}
                            {d.holooInvoiceNo && <span className="rounded-full bg-[#8a5a2b]/10 px-2 py-0.5 text-[#8a5a2b]" title="فاکتور خرید در هلو">🏷 {d.holooInvoiceNo}</span>}
                            {d.holooReceiptNo && <span className="rounded-full bg-[#8a5a2b]/10 px-2 py-0.5 text-[#8a5a2b]" title="رسید پرداخت در هلو">🧾 {d.holooReceiptNo}</span>}
                            {d.legalHold && <span className="rounded-full bg-[#b3372f]/15 px-2 py-0.5 font-black text-[#b3372f]">🔒 نگهداری حقوقی</span>}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-[#0e7a4a]">
                            <MapPin size={11} /> زونکن {d.binderCode}
                            {b && <> — کابینت {faNum(b.cabinet)} • طبقهٔ {faNum(b.shelf)} • جایگاه {faNum(d.seq)}</>}
                          </p>
                          {d.status === 'BORROWED' && (
                            <p className="mt-1 text-[10px] font-black text-[#c96f4a]">✋ امانت‌گرفته توسط {d.borrowByName}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {d.status === 'IN_BINDER' && <Pill label="در زونکن" color="#0e7a4a" bg="#0e7a4a/10" />}
                          {d.status === 'BORROWED' && <Pill label="امانتی" color="#c96f4a" bg="#c96f4a/10" />}
                          {d.status === 'DESTROYED' && <Pill label="خارج‌شده" color="#6b7280" bg="#6b7280/10" />}
                          {d.status === 'IN_BINDER' && canRegister && (
                            <button
                              onClick={(e) => { e.stopPropagation(); act(d.id, { action: 'borrow' }, 'امانت ثبت شد — پس از استفاده بازگردانید') }}
                              className="flex items-center gap-1 rounded-lg bg-[#c96f4a]/10 px-2.5 py-1.5 text-[10px] font-black text-[#c96f4a]"
                            >
                              <Hand size={12} /> امانت می‌برم
                            </button>
                          )}
                          {d.status === 'BORROWED' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); act(d.id, { action: 'return' }, 'سند به زونکن بازگشت ✅') }}
                              className="flex items-center gap-1 rounded-lg bg-[#0e7a4a]/10 px-2.5 py-1.5 text-[10px] font-black text-[#0e7a4a]"
                            >
                              <Undo2 size={12} /> بازگشت به زونکن
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleDoc(d.id) }}
                            className="rounded-lg bg-[#8a5a2b]/10 px-2.5 py-1.5 text-[10px] font-black text-[#8a5a2b]"
                          >
                            📋 اقلام سجل
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="mt-3 rounded-xl border border-[#8a5a2b]/20 bg-[#fdf6dd]/70 p-3" onClick={(e) => e.stopPropagation()}>
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-[#8a5a2b]">📋 اقلام سند — سجل کالا</p>
                          {itemsLoading === d.id ? (
                            <p className="py-2 text-center text-[11px] text-muted-foreground">…در حال بارگذاری اقلام</p>
                          ) : !items || items.length === 0 ? (
                            <p className="py-2 text-[11px] text-muted-foreground">ردیف کالایی برای این سند ثبت نشده است — از «ثبت سند» با ساخت اقلام یا از عملیات افزودن اقلام می‌توانید تکمیل کنید.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {items.map((it) => (
                                <ItemLine key={it.id} it={it} />
                              ))}
                              <p className="text-left text-[10px] font-black text-[#8a5a2b]">
                                جمع اقلام: {faMoney(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0))} تومان
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </div>
        </>
      )}

      {tab === 'parties' && (
        <SectionCard
          title="راهنمای تأمین‌کنندگان و طرف‌حساب‌ها"
          subtitle="جست‌وجوی نام تأمین‌کننده/پخش — روی هر کارت بزنید تا پروندهٔ کامل اسنادش (فاکتورها و موقعیت فیزیکی) باز شود"
          icon={<Users size={18} />}
        >
          <div className="mb-3 max-w-sm">
            <SearchInput value={partyQ} onChange={setPartyQ} placeholder="نام تأمین‌کننده، پخش یا شرکت را بزنید…" />
          </div>
          {parties.length === 0 ? (
            <EmptyState emoji="🤝" title="هنوز طرف‌حسابی ثبت نشده" hint="با ثبت نخستین سند آرشیو، راهنمای طرف‌حساب‌ها ساخته می‌شود" />
          ) : (
            <div className="scroll-gold grid max-h-[56vh] gap-2.5 overflow-y-auto pl-1 sm:grid-cols-2 lg:grid-cols-3">
              {parties
                .filter((p) => !partyQ.trim() || p.party.includes(partyQ.trim()))
                .map((p) => (
                  <button
                    key={p.party}
                    type="button"
                    onClick={() => onPartyPick(p)}
                    className="glow-card rounded-2xl bg-white/85 p-3.5 text-right transition hover:shadow-md"
                  >
                    <p className="truncate text-sm font-black">{p.party}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Pill label={`${faNum(p.docCount)} سند`} color="#8a5a2b" bg="#c9a227/15" />
                      <span className="text-[10px] font-bold text-muted-foreground">{faMoney(p.totalAmount)} تومان</span>
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      آخرین سند: {p.lastDate ? formatJalaliShort(p.lastDate) : '—'}
                    </p>
                  </button>
                ))}
              {parties.filter((p) => !partyQ.trim() || p.party.includes(partyQ.trim())).length === 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <EmptyState emoji="🔍" title="طرف‌حسابی با این نام یافت نشد" hint="بخشی از نام را امتحان کنید — مثلاً «کاله» یا «رامک»" />
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'reps' && (
        <SectionCard
          title="دفتر نمایندگان — ثبت یک‌بار، همیشه در تاریخچه"
          subtitle="هر رخداد سند (تحویل، وصول چک، پرداخت POS، مرجوعی و مردودی) با نام نمایندهٔ طرف حساب ثبت می‌شود"
          icon={<UserCog size={18} />}
          actions={canManage && (
            <button onClick={() => { setRepEdit(null); setRepFormOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white">
              <Plus size={14} /> نمایندهٔ جدید
            </button>
          )}
        >
          <div className="mb-3 max-w-sm">
            <SearchInput value={repsQ} onChange={setRepsQ} placeholder="نام نماینده، شرکت یا موبایل را بزنید…" />
          </div>
          {filteredReps.length === 0 ? (
            <EmptyState emoji="🧑‍💼" title="هنوز نماینده‌ای ثبت نشده" hint="نمایندگان طرف‌حساب‌ها (ویزیتور، راننده، حسابدار شرکت) را یک‌بار در دفتر ثبت کنید؛ سپس در اسناد و رخدادها فقط انتخاب می‌کنید" />
          ) : (
            <div className="scroll-gold grid max-h-[56vh] gap-2.5 overflow-y-auto pl-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredReps.map((r) => (
                <div key={r.id} className="glow-card rounded-2xl bg-white/85 p-3.5">
                  <button type="button" onClick={() => openRep(r.id)} className="w-full text-right">
                    <p className="flex items-center justify-between gap-2 text-sm font-black">
                      <span className="truncate">👤 {r.fullName}</span>
                      {!r.active && <Pill label="غیرفعال" color="#6b7280" bg="#6b72801a" />}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {r.providerName ? <Pill label={r.providerName} color="#8a5a2b" bg="#c9a227/15" /> : <span className="text-[10px] text-muted-foreground">بدون شرکت</span>}
                      <span className="rounded-full bg-[#0e7a4a]/10 px-2 py-0.5 text-[10px] font-bold text-[#0e7a4a]">{PERSON_KINDS[(r as any).kind || ''] || JOB_ROLES[r.jobRole] || r.jobRole}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                      <span className="rounded-lg bg-muted/60 px-1 py-1.5"><b className="block text-xs">{faNum(r.docCount || 0)}</b>سند</span>
                      <span className="rounded-lg bg-muted/60 px-1 py-1.5"><b className="block text-xs">{faNum(r.eventCount || 0)}</b>رخداد</span>
                      <span className="rounded-lg bg-muted/60 px-1 py-1.5"><b className="block text-xs" style={{ color: '#0e7a4a' }}>{faMoney(r.totalCollected || 0)}</b>وصولی (تومان)</span>
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
                      {r.mobile ? <a href={`tel:${r.mobile}`} onClick={(e) => e.stopPropagation()} className="rounded-md bg-[#0e7a4a]/10 px-2 py-1 font-black text-[#0e7a4a]" dir="ltr">📞 {faNum(r.mobile)}</a> : <span>بدون موبایل</span>}
                      <span>آخرین رخداد: {r.lastSeen ? formatJalaliShort(r.lastSeen) : '—'}</span>
                    </p>
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => { setRepEdit(r); setRepFormOpen(true) }}
                      className="mt-2 w-full rounded-xl bg-[#c9a227]/15 py-2 text-[11px] font-black text-[#8a5a2b]"
                    >
                      ✏️ ویرایش نماینده
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'structure' && (
        <SectionCard
          title="ساختار آرشیو — کابینت‌ها، طبقه‌ها و زونکن‌ها"
          subtitle="ویرایش کامل ساختار فیزیکی: تغییر نام کابینت/طبقه با اعمال بر همهٔ زونکن‌ها، افزودن طبقهٔ خالی، و ویرایش هر زونکن (کد، موقعیت، رنگ، ظرفیت)"
          icon={<Network size={18} />}
        >
          {structureTree.length === 0 ? (
            <EmptyState emoji="🗄️" title="هنوز کابینتی نیست" hint="با ثبت نخستین زونکن، ساختار آرشیو اینجا ساخته می‌شود" />
          ) : (
            <div className="scroll-gold max-h-[62vh] space-y-3 overflow-y-auto pl-1">
              {structureTree.map(({ cabinet, shelves }) => {
                const cabBinders = binders.filter((b) => b.cabinet === cabinet)
                return (
                  <div key={cabinet} className="rounded-2xl border border-[#8a5a2b]/25 bg-gradient-to-b from-[#f7efe2] to-[#fdf6dd] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[13px] font-black text-[#8a5a2b]">
                        <Archive size={14} /> کابینت {cabinet}
                        <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{faNum(cabBinders.length)} زونکن • {faNum(shelves.length)} طبقه</span>
                      </p>
                      {canManage && (
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => setRenameCab(cabinet)} className="rounded-lg bg-white/80 px-2.5 py-1.5 text-[10px] font-black text-[#8a5a2b]">✏️ تغییر نام کابینت</button>
                          <button onClick={() => setAddShelfFor(cabinet)} className="rounded-lg bg-white/80 px-2.5 py-1.5 text-[10px] font-black text-[#0e7a4a]">＋ طبقهٔ جدید</button>
                          <button
                            onClick={() => structureAction({ action: 'del-cabinet', cabinet }, `کابینت ${cabinet} از ساختار حذف شد`)}
                            disabled={cabBinders.length > 0}
                            title={cabBinders.length > 0 ? 'کابینت خالی نیست — حذف مسدود است' : 'حذف کابینت'}
                            className="rounded-lg bg-white/80 px-2.5 py-1.5 text-[10px] font-black text-[#b3372f] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {shelves.map(({ shelf, binders: bs }) => (
                        <div key={shelf} className="rounded-xl bg-white/85 p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-1.5 text-[11px] font-black text-[#334155]">
                              📚 طبقهٔ {shelf}
                              <span className="text-[9px] font-bold text-muted-foreground">{bs.length ? `${faNum(bs.length)} زونکن` : 'خالی — آمادهٔ زونکن جدید'}</span>
                            </p>
                            {canManage && (
                              <div className="flex gap-1">
                                <button onClick={() => setRenameShelf({ cabinet, shelf })} className="rounded-lg bg-[#fdf6dd] px-2 py-1 text-[10px] font-black text-[#8a5a2b]">✏️ تغییر نام طبقه</button>
                                {bs.length === 0 && (
                                  <button onClick={() => structureAction({ action: 'del-shelf', cabinet, shelf }, `طبقهٔ ${shelf} حذف شد`)} className="rounded-lg bg-[#fee2e2] px-2 py-1 text-[10px] font-black text-[#b3372f]">
                                    🗑 حذف طبقه
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {bs.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {bs.map((b) => (
                                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#fdf6dd]/70 px-2.5 py-1.5">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="h-4 w-2 shrink-0 rounded-full" style={{ background: b.colorTag }} />
                                    <span className="truncate text-[11px] font-black">{b.title}</span>
                                    <span className="shrink-0 rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b]" dir="ltr">{b.code}</span>
                                    <span className="shrink-0 text-[9px] text-muted-foreground">{faNum(b.docCount)} سند از {faNum(b.capacity)}</span>
                                  </span>
                                  {canManage && (
                                    <button onClick={() => setBinderEdit(b)} className="shrink-0 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-black text-[#8a5a2b]">
                                      ✏️ ویرایش زونکن
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'orders' && (
        <SectionCard
          title="سفارش‌های در جریان — پل سفارش تا بایگانی"
          subtitle="سفارش‌های خریدِ هنوز تکمیل‌نشده؛ پس از تکمیل، اسنادشان در همین آرشیو بایگانی می‌شود"
          icon={<ShoppingBag size={18} />}
          actions={
            <button onClick={() => setOrders([])} className="min-h-[44px] rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd]/60 px-3 py-2 text-[11px] font-extrabold text-[#8a5a2b]">
              ↻ به‌روزرسانی
            </button>
          }
        >
          <CycleStrip
            activeStage={focusedOrder ? orderStage(focusedOrder.status) : null}
            note="هر سفارش از «سفارش» شروع می‌شود، پس از «دریافت» و «تأیید انبار» به حسابداری می‌رسد و فاکتورش در همین آرشیو بایگانی می‌شود — دکمهٔ «در دفتر حسابداری» هر ردیف، کارت کالای همان طرف معامله را باز می‌کند."
          />

          <p className="mb-3 rounded-xl bg-[#fdf6dd] p-3 text-[11px] font-bold text-[#8a5a2b]">
            💡 تسویه، بازبینی حسابدار و ویرایش اقلام در نمای «سفارش‌ها» انجام می‌شود؛ سفارش‌های تکمیل‌شده به‌عنوان سند خرید در همین آرشیو ثبت و بایگانی می‌شوند.
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-full max-w-xs">
              <SearchInput value={ordersQ} onChange={(v) => { setOrdersQ(v); setFocusOrderId('') }} placeholder="جست‌وجو: نام تأمین‌کننده یا کد سفارش…" />
            </div>
            {(ordersQ.trim() || focusOrderId) && (
              <button onClick={clearOrdersFocus} className="min-h-[44px] rounded-xl bg-[#c9a227]/15 px-3 py-2 text-[11px] font-black text-[#8a5a2b]">
                فیلتر فعال: {ordersQ.trim() || 'سفارش مرتبط از دفتر حسابداری'} ✕
              </button>
            )}
          </div>

          {displayOrders.length === 0 ? (
            ordersQ.trim() || focusOrderId ? (
              <EmptyState emoji="🔍" title="سفارشی برای این طرف معامله یافت نشد" hint="فیلتر را پاک کنید یا بخشی دیگر از نام را امتحان کنید" />
            ) : (
              <EmptyState emoji="🛒" title="سفارش در جریانی نیست" hint="سفارش‌های جدید را از نمای «سفارش‌ها» ثبت کنید" />
            )
          ) : (
            <div className="scroll-gold max-h-[56vh] space-y-2 overflow-y-auto pl-1">
              {displayOrders.map((o) => {
                const st = ORDER_STATUSES[o.status] || { label: o.status, color: '#6b7280', bg: '#f3f4f6' }
                return (
                  <div
                    key={o.id}
                    id={`order-row-${o.id}`}
                    className={cn(
                      'glow-card flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/85 p-3 transition',
                      ringOrderId === o.id && 'bg-[#fffdf6] ring-2 ring-[#c9a227]',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-xs font-black">
                        <span dir="ltr" className="rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[10px] font-black text-[#8a5a2b]">{o.code}</span>
                        {o.providerName}
                        {o.isOverdue && <span className="rounded-full bg-[#b3372f]/15 px-2 py-0.5 text-[9px] font-black text-[#b3372f]">⏰ گذشته از موعد تحویل</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                        <span>تحویل: {formatJalaliShort(o.deliveryDate)}</span>
                        <span>• {faNum(o.itemsCount)} قلم ({faNum(o.itemsTotalQty)} واحد)</span>
                        <span>• {faMoney(o.totalAmount)} تومان</span>
                      </p>
                      <p className="mt-1 flex items-center gap-1.5">
                        <CycleDots stage={orderStage(o.status)} />
                        <span className="text-[9px] font-bold text-muted-foreground">مرحلهٔ فعلی چرخه: {CYCLE_STEPS[orderStage(o.status)].label}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                      <button
                        onClick={() => goToLedgerForOrder(o)}
                        title="پرش به دفتر حسابداری (کارت کالا) با فیلتر همین سفارش"
                        className="min-h-[44px] rounded-xl bg-[#c9a227]/20 px-3 py-2 text-[10px] font-black text-[#8a5a2b] transition hover:bg-[#c9a227]/35"
                      >
                        🧾 در دفتر حسابداری
                      </button>
                      <button onClick={() => ctx.navigate('orders', o.id)} className="min-h-[44px] rounded-xl bg-[#0e7a4a]/10 px-3 py-2 text-[10px] font-black text-[#0e7a4a]">
                        مشاهده در سفارش‌ها
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'ledger' && (
        <SectionCard
          title="دفتر حسابداری (کارت کالا) — تاریخچهٔ کامل رکورد هر کالا"
          subtitle="سفارش‌های خرید + اسناد آرشیو فیزیکی + ضایعات در یک خط زمانی — پل رکورد دیجیتال به سند فیزیکی"
          icon={<Package size={18} />}
        >
          <CycleStrip
            activeStage={ledgerFocus ? orderStage(ledgerFocusOrder?.status || ledgerFocus.status) : null}
            note="🛒 ردیف‌های «سفارش خرید» سرآغاز زنجیره و 🗂 «سند آرشیو» پایان آن است — با دکمهٔ «📦 سفارش مرتبط» هر ردیف به تب سفارش‌ها بروید و از آن‌جا با «🧾 در دفتر حسابداری» برگردید."
          />
          {ledgerFocus && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#c9a227]/60 bg-[#fdf6dd] p-3">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-black text-[#8a5a2b]">
                🔗 فیلتر چرخه: سفارش
                <span dir="ltr" className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px]">{ledgerFocus.orderCode}</span>
                — طرف معامله {ledgerFocus.party}
                <span className="text-[10px] font-bold text-muted-foreground">(با انتخاب کالا، ردیف همین سفارش در سجل طلایی می‌درخشد)</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => goToOrders(ledgerFocus.party, ledgerFocusOrder?.id || '')}
                  className="min-h-[44px] rounded-xl bg-[#0e7a4a]/10 px-3 py-2 text-[11px] font-black text-[#0e7a4a]"
                >
                  📦 مشاهده در سفارش‌ها
                </button>
                <button onClick={() => setLedgerFocus(null)} className="min-h-[44px] rounded-xl bg-white/70 px-3 py-2 text-[11px] font-black text-[#8a5a2b]">
                  پاک‌کردن فیلتر ✕
                </button>
              </div>
            </div>
          )}
          {selProduct && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fdf6dd] p-3">
              <p className="text-sm font-black text-[#8a5a2b]">📦 {selProduct.name} <span className="text-[10px] font-bold text-muted-foreground">({selProduct.category}{selProduct.brand ? ` — ${selProduct.brand}` : ''})</span></p>
              <button onClick={() => { setSelProduct(null); setHistory(null); setProdQ('') }} className="min-h-[44px] rounded-xl border border-[#c9a227]/50 bg-white/70 px-3 py-2 text-[11px] font-black text-[#8a5a2b]">
                انتخاب کالای دیگر
              </button>
            </div>
          )}

          {!selProduct && (
            <>
              <div className="mb-3 max-w-sm"><SearchInput value={prodQ} onChange={setProdQ} placeholder="نام کالا را بزنید — مثلاً: شیر کاله ۱ لیتری" /></div>
              {filteredProducts.length === 0 ? (
                <EmptyState emoji="🔎" title="کالایی یافت نشد" hint={ledgerProducts.length === 0 ? 'در حال بارگذاری فهرست کالاها…' : 'بخشی از نام کالا را وارد کنید'} />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openProduct(p)}
                      className="glow-card flex min-h-[44px] items-center justify-between rounded-xl bg-white/85 p-3 text-right transition hover:shadow-md"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground">{p.category}{p.brand ? ` — ${p.brand}` : ''}</span>
                      </span>
                      <span className="shrink-0 rounded-lg bg-[#0e7a4a]/10 px-2 py-1 text-[10px] font-black text-[#0e7a4a]">مشاهدهٔ تاریخچه</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {selProduct && histBusy && <p className="py-6 text-center text-xs font-bold text-muted-foreground">…در حال تجمیع تاریخچهٔ کالا</p>}

          {selProduct && !histBusy && history && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {[
                  { l: 'تعداد خرید', v: faNum(history.summary.purchaseCount), s: 'سفارش تأمین', c: '#0e7a4a' },
                  { l: 'مجموع خریداری‌شده', v: faNum(history.summary.totalPurchasedQty), s: history.product.unit, c: '#77934a' },
                  { l: 'آخرین قیمت خرید', v: faMoney(history.summary.lastBuyPrice), s: 'تومان', c: '#c9a227' },
                  { l: 'آخرین انقضا', v: history.summary.lastExpiry ? formatJalaliShort(history.summary.lastExpiry) : '—', s: 'ثبت‌شده', c: '#c96f4a' },
                  { l: 'اسناد آرشیو مرتبط', v: faNum(history.summary.archiveDocCount), s: `${faMoney(history.summary.archiveValue)} تومان`, c: '#8a5a2b' },
                  { l: 'ضایعات', v: faNum(history.summary.wasteCount), s: `${faMoney(history.summary.wasteValue)} تومان`, c: '#b3372f' },
                ].map((s) => (
                  <div key={s.l} className="glow-card rounded-2xl bg-card p-3">
                    <p className="text-base font-black" style={{ color: s.c }}>{s.v}</p>
                    <p className="mt-0.5 text-[10px] font-bold">{s.l}</p>
                    <p className="text-[9px] text-muted-foreground">{s.s}</p>
                  </div>
                ))}
              </div>

              {history.timeline.length === 0 ? (
                <EmptyState emoji="📭" title="رکوردی برای این کالا یافت نشد" hint="پس از ثبت سفارش خرید یا سند آرشیو با اقلام کالا، تاریخچه اینجا ساخته می‌شود" />
              ) : (
                <div className="scroll-gold mt-4 max-h-[48vh] space-y-0 overflow-y-auto pr-2">
                  {history.timeline.map((r, idx) => {
                    const meta = KIND_META[r.kind] || KIND_META.ORDER
                    // ── اتصال متقابل سفارش ↔ دفتر حسابداری ──
                    // ردیف ORDER: تطبیق مستقیم با کد سفارش؛ ردیف ARCHIVE: هیوریستیک مستند در matchDocToOrder
                    const linkedOrderRow = r.kind === 'ORDER' ? orders.find((o) => o.code === r.orderCode) || null : null
                    const linkedDocOrder = r.kind === 'ARCHIVE' ? matchDocToOrder(r, orders) : null
                    const focusHere = Boolean(ledgerFocus && r.kind === 'ORDER' && r.orderCode === ledgerFocus.orderCode)
                    const samePartyHere = Boolean(ledgerFocus && r.kind === 'ORDER' && !focusHere && r.providerName === ledgerFocus.party)
                    return (
                      <div key={idx} className="relative border-r-2 pr-4 pb-4" style={{ borderColor: `${meta.color}40` }}>
                        <span className="absolute -right-[7px] top-1 h-3 w-3 rounded-full border-2 border-white" style={{ background: meta.color }} />
                        <div className={cn(
                          'glow-card rounded-xl p-3 transition',
                          focusHere ? 'bg-[#fffdf6] ring-2 ring-[#c9a227]' : samePartyHere ? 'bg-[#fffdf6]/70 ring-1 ring-[#c9a227]/40' : 'bg-white/80',
                        )}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-1.5 text-xs font-black" style={{ color: meta.color }}>
                              {meta.emoji} {meta.label} <span className="text-[#334155]">— {r.label}</span>
                            </p>
                            <span className="rounded-md bg-[#8a5a2b]/10 px-2 py-0.5 text-[10px] font-black text-[#8a5a2b]">{formatJalaliShort(r.at)}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            {r.kind === 'ORDER' && (
                              <>
                                <span className="font-bold">تأمین‌کننده: {r.providerName}</span>
                                <span>مقدار: {faNum(r.qty)}{r.receivedQty != null && r.receivedQty !== r.qty ? ` (دریافتی: ${faNum(r.receivedQty)})` : ''}</span>
                                <span className="font-bold text-[#0e7a4a]">قیمت خرید: {faMoney(r.unitPrice)} تومان</span>
                                {r.printedPrice != null && r.printedPrice > 0 && <span>قیمت چاپ‌شده: {faMoney(r.printedPrice)}</span>}
                                {r.orderStatus && <span className="rounded-md bg-[#0e7a4a]/10 px-1.5 py-0.5 font-black text-[#0e7a4a]">{ORDER_STATUSES[r.orderStatus]?.label || r.orderStatus}</span>}
                                <CycleDots stage={orderStage(r.orderStatus)} />
                                {linkedOrderRow && (
                                  <button
                                    onClick={() => goToOrders(r.providerName, linkedOrderRow.id)}
                                    title="پرش به تب سفارش‌ها با هایلایت همین سفارش"
                                    className="min-h-[36px] rounded-md bg-[#0e7a4a]/10 px-2 py-1.5 text-[10px] font-black text-[#0e7a4a] transition hover:bg-[#0e7a4a]/20"
                                  >
                                    📦 سفارش مرتبط — دیدن در سفارش‌ها
                                  </button>
                                )}
                              </>
                            )}
                            {r.kind === 'ARCHIVE' && (
                              <>
                                <span className="font-bold">طرف حساب: {r.party}</span>
                                {r.invoiceNo && <span>فاکتور {r.invoiceNo}</span>}
                                <span>مقدار: {faNum(r.qty)} {r.unit}</span>
                                <span className="font-bold text-[#0e7a4a]">{faMoney((Number(r.qty) || 0) * (Number(r.unitPrice) || 0))} تومان</span>
                                {r.docStatus && r.docStatus !== 'IN_BINDER' && <span className="rounded-md bg-[#c96f4a]/10 px-1.5 py-0.5 font-black text-[#c96f4a]">{r.docStatus === 'BORROWED' ? 'در امانت' : 'خارج‌شده'}</span>}
                              </>
                            )}
                            {r.kind === 'WASTE' && (
                              <>
                                <span className="font-bold text-[#b3372f]">دلیل: {r.reasonLabel}</span>
                                <span>مقدار: {faNum(r.qty)} {r.unit}</span>
                                <span>ارزش تقریبی: {faMoney(r.estValue)} تومان</span>
                                {r.note && <span>— {r.note}</span>}
                              </>
                            )}
                            {(r.kind === 'ORDER' || r.kind === 'ARCHIVE') && r.expiryDate && (
                              <span className="rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 font-black text-[#8a5a2b]">انقضا {formatJalaliShort(r.expiryDate)}</span>
                            )}
                          </div>
                          {r.kind === 'ARCHIVE' && (
                            <p className="mt-2 flex flex-wrap items-center gap-1 rounded-lg bg-[#fdf6dd] px-2.5 py-1.5 text-[10px] font-black text-[#8a5a2b]">
                              <MapPin size={11} /> سند فیزیکی: {r.cabinet ? <>کابینت {faNum(r.cabinet)} › </> : ''}{r.shelf ? <>طبقهٔ {faNum(r.shelf)} › </> : ''}زونکن {r.binderCode}{r.binderTitle ? ` «${r.binderTitle}»` : ''} › جایگاه {faNum(r.seq)} — همین مسیر را در آرشیو اتاق اسناد دنبال کنید
                            </p>
                          )}
                          {/* اتصال متقابل دفتر ↔ سفارش: اگر تطبیق قطعی نبود، جست‌وجوی طرف معامله در تب سفارش‌ها اتصال را برقرار می‌کند */}
                          {r.kind === 'ARCHIVE' && (
                            linkedDocOrder ? (
                              <button
                                onClick={() => goToOrders(r.party, linkedDocOrder.id)}
                                title={`تطبیق هیوریستیک (طرف معامله + نزدیک‌ترین تاریخ) — سفارش ${linkedDocOrder.code}`}
                                className="mt-1.5 min-h-[36px] rounded-lg bg-[#0e7a4a]/10 px-2.5 py-1.5 text-[10px] font-black text-[#0e7a4a] transition hover:bg-[#0e7a4a]/20"
                              >
                                📦 سفارش مرتبط: {linkedDocOrder.code} — {linkedDocOrder.providerName}
                              </button>
                            ) : (
                              <button
                                onClick={() => goToOrders(r.party)}
                                title="تطبیق قطعی یافت نشد — تب سفارش‌ها با جست‌وجوی همین طرف معامله باز می‌شود"
                                className="mt-1.5 min-h-[36px] rounded-lg bg-[#8a5a2b]/10 px-2.5 py-1.5 text-[10px] font-black text-[#8a5a2b] transition hover:bg-[#8a5a2b]/20"
                              >
                                🔍 جست‌وجو در سفارش‌ها با همین طرف معامله
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </SectionCard>
      )}

      <SectionCard title="مبانی علمی آرشیو" icon={<Archive size={18} />}>
        <div className="grid gap-2 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <p className="rounded-xl bg-card p-3"><span className="font-black text-[#0e7a4a]">ISO 15489 (مدیریت اسناد):</span> هر سند یک شناسهٔ ماندگار می‌گیرد که هرگز تغییر نمی‌کند؛ جابه‌جایی فیزیکی فقط «نشانگر موقعیت» را عوض می‌کند.</p>
          <p className="rounded-xl bg-card p-3"><span className="font-black text-[#0e7a4a]">چرخهٔ حیات و نگهداری:</span> اسناد از ثبت تا دفع ۷ مرحله دارند؛ مهلت نگهداری بر پایهٔ سال مالی (مادهٔ ۱۳ قانون تجارت — ۱۰ سال) محاسبه می‌شود و دفع هرگز خودکار نیست و نیازمند «تأیید دوم» کاربر دیگر است.</p>
          <p className="rounded-xl bg-card p-3"><span className="font-black text-[#0e7a4a]">زنجیرهٔ custody (ISO 23081 / ARMA):</span> هر امانت، بازگشت، جابه‌جایی، ویرایش و پرداخت رویدادنگاری می‌شود؛ امانت فیزیکی با الگوی outguide و مهلت بازگشت پیگیری می‌شود.</p>
          <p className="rounded-xl bg-card p-3"><span className="font-black text-[#0e7a4a]">نماینده و شفافیت:</span> هر رخداد با نام نمایندهٔ طرف حساب ثبت می‌شود؛ مرجوعی‌ها و مردودی‌ها با دلیل قرمز می‌درخشند و مرجع هلوِ هر فاکتور در چند ثانیه قابل جست‌وجوست.</p>
        </div>
      </SectionCard>

      {intakeOpen && (
        <IntakeModal
          binders={binders}
          reps={reps}
          onClose={() => setIntakeOpen(false)}
          onSaved={(doc, binder, pickReason, itemsCreated) => { setIntakeOpen(false); setLastFiled({ doc, binder, pickReason, itemsCreated }); load(); loadReps() }}
        />
      )}
      {binderOpen && canManage && (
        <BinderModal
          onClose={() => setBinderOpen(false)}
          onSaved={() => { setBinderOpen(false); load() }}
        />
      )}

      {/* ── ساختار آرشیو: مودال‌های تغییر نام/افزودن طبقه/ویرایش زونکن ── */}
      {renameCab && (
        <StructureRenameModal
          mode="cabinet"
          cabinet={renameCab}
          onClose={() => setRenameCab('')}
          onSaved={(to) => { setRenameCab(''); if (to) structureAction({ action: 'rename', fromCabinet: renameCab, toCabinet: to }, 'نام کابینت با اعمال بر همهٔ زونکن‌ها تغییر کرد') }}
        />
      )}
      {renameShelf && (
        <StructureRenameModal
          mode="shelf"
          cabinet={renameShelf.cabinet}
          shelf={renameShelf.shelf}
          onClose={() => setRenameShelf(null)}
          onSaved={(to) => { const from = renameShelf; setRenameShelf(null); if (to && from) structureAction({ action: 'rename', fromCabinet: from.cabinet, fromShelf: from.shelf, toShelf: to }, 'نام طبقه با اعمال بر همهٔ زونکن‌ها تغییر کرد') }}
        />
      )}
      {addShelfFor && (
        <StructureAddShelfModal
          cabinet={addShelfFor}
          onClose={() => setAddShelfFor('')}
          onSaved={(shelf) => { const cab = addShelfFor; setAddShelfFor(''); if (shelf) structureAction({ action: 'add-shelf', cabinet: cab, shelf }, `طبقهٔ ${shelf} به کابینت ${cab} اضافه شد`) }}
        />
      )}
      {binderEdit && (
        <BinderEditModal
          binder={binderEdit}
          onClose={() => setBinderEdit(null)}
          onSaved={() => { setBinderEdit(null); load() }}
        />
      )}

      {/* ── پروندهٔ کامل سند ── */}
      {detail && (
        <DocDetailModal
          detail={detail}
          meId={ctx.user!.id}
          canRegister={canRegister}
          canDispose={canDispose}
          onClose={() => setDetail(null)}
          onAct={act}
          onEdit={() => setEditOpen(true)}
          onEvent={() => setEventOpen(true)}
          onBorrow={() => setBorrowOpen(true)}
          onMove={() => setMoveOpen(true)}
          onDisposal={() => setDisposalOpen(true)}
          onOpenRep={openRep}
          onCopy={copyText}
          onNavigateProviders={() => ctx.navigate('providers')}
        />
      )}
      {detailBusy && <DetailSkeleton />}
      {detail && editOpen && (
        <DocEditModal
          doc={detail.doc}
          reps={reps}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); toast.success('سند ویرایش شد'); refreshDetail() }}
        />
      )}
      {detail && eventOpen && (
        <DocEventModal
          doc={detail.doc}
          items={detail.items}
          reps={reps}
          onClose={() => setEventOpen(false)}
          onSaved={() => { setEventOpen(false); toast.success('رخداد سند ثبت شد'); refreshDetail(); loadReps() }}
          onRepCreated={loadReps}
        />
      )}
      {detail && borrowOpen && (
        <BorrowModal
          doc={detail.doc}
          meName={ctx.user!.name}
          onClose={() => setBorrowOpen(false)}
          onSaved={() => { setBorrowOpen(false); toast.success('امانت سند با مهلت بازگشت ثبت شد'); refreshDetail() }}
        />
      )}
      {detail && moveOpen && (
        <MoveDocModal
          doc={detail.doc}
          binders={binders}
          onClose={() => setMoveOpen(false)}
          onSaved={() => { setMoveOpen(false); toast.success('سند به زونکن مقصد جابه‌جا شد'); refreshDetail() }}
        />
      )}
      {detail && disposalOpen && (
        <DisposalModal
          doc={detail.doc}
          onClose={() => setDisposalOpen(false)}
          onSaved={() => { setDisposalOpen(false); toast.success('درخواست دفع ثبت شد — منتظر تأیید دوم'); refreshDetail() }}
        />
      )}

      {/* ── نمایندگان ── */}
      {repProfileId && (
        <RepProfileModal
          data={repProfile}
          onClose={() => { setRepProfileId(''); setRepProfile(null) }}
          onOpenDoc={openDoc}
        />
      )}
      {repFormOpen && (
        <RepFormModal
          rep={repEdit}
          onClose={() => { setRepFormOpen(false); setRepEdit(null) }}
          onSaved={() => { setRepFormOpen(false); setRepEdit(null); toast.success(repEdit ? 'نماینده ویرایش شد' : 'نماینده ثبت شد'); loadReps(); if (repProfileId) openRep(repProfileId) }}
        />
      )}
    </div>
  )
}

/** ردیف قلم کالا — اقلام مرجوعی/مردود/نیامده قرمز می‌درخشند با دلیل (خواستهٔ مالک) */
function ItemLine({ it }: { it: DocItem }) {
  const flagged = it.returned || it.rejected || it.missing
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2.5 py-2', flagged ? 'bg-[#fee2e2]' : 'bg-white/80')}>
      <div className="min-w-0">
        <span className="text-[11px] font-black">{it.productName}</span>
        {flagged && (
          <span className="mt-0.5 block text-[10px] font-black text-[#b3372f]">
            {it.returned && <span className="mr-2">↩️ برگشتی{it.returnReason ? `: ${it.returnReason}` : ''}</span>}
            {it.rejected && <span className="mr-2">⛔ مردود{it.rejectReason ? `: ${it.rejectReason}` : ''}</span>}
            {it.missing && <span className="mr-2">📦 نیامده (کسری فاکتور)</span>}
          </span>
        )}
      </div>
      <span className="flex flex-wrap items-center gap-x-2.5 text-[10px] text-muted-foreground">
        <span>{faNum(it.qty)} {it.unit}</span>
        <span>× {faMoney(it.unitPrice)}</span>
        <span className={cn('font-black', flagged ? 'text-[#b3372f]' : 'text-[#0e7a4a]')}>= {faMoney((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))} تومان</span>
        {it.expiryDate && <span className="rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 font-black text-[#8a5a2b]">انقضا {formatJalaliShort(it.expiryDate)}</span>}
      </span>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="glow-card rounded-2xl bg-card p-6 text-center text-xs font-bold text-muted-foreground">…در حال بازکردن پروندهٔ سند</div>
    </div>
  )
}

/** پروندهٔ کامل سند — شناسنامه، مالی، نماینده، هلو، مسیر فیزیکی، اقلام قرمز، دو خط زمانی و نوار عملیات */
function DocDetailModal({ detail, meId, canRegister, canDispose, onClose, onAct, onEdit, onEvent, onBorrow, onMove, onDisposal, onOpenRep, onCopy, onNavigateProviders }: {
  detail: DetailRes
  meId: string
  canRegister: boolean
  canDispose: boolean
  onClose: () => void
  onAct: (id: string, body: any, msg: string) => Promise<void>
  onEdit: () => void
  onEvent: () => void
  onBorrow: () => void
  onMove: () => void
  onDisposal: () => void
  onOpenRep: (id: string) => void
  onCopy: (t: string) => void
  onNavigateProviders: () => void
}) {
  const { doc, items, custody, events } = detail
  const [lifecyclePick, setLifecyclePick] = useState(doc.lifecycle)
  // official render-phase adjustment — resync the picker when the doc updates after an action
  const [prevLifecycle, setPrevLifecycle] = useState(doc.lifecycle)
  if (prevLifecycle !== doc.lifecycle) {
    setPrevLifecycle(doc.lifecycle)
    setLifecyclePick(doc.lifecycle)
  }
  const lc = LIFECYCLE_META[doc.lifecycle] || LIFECYCLE_META.ACTIVE
  const pm = PAYMENT_META[doc.paymentStatus] || PAYMENT_META.UNPAID
  const t = DOC_TYPES[doc.docType] || DOC_TYPES.OTHER
  const paidPct = doc.amount > 0 ? Math.min(100, Math.round(((doc.paidAmount || 0) / doc.amount) * 100)) : doc.paidAmount > 0 ? 100 : 0
  const lastDisposalReq = custody.find((c) => c.action === 'DISPOSAL_REQUEST')
  const canApprove = doc.lifecycle === 'DISPOSAL_PENDING' && !doc.legalHold && canDispose && lastDisposalReq && lastDisposalReq.userId !== meId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="scroll-gold glow-card max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-card p-5">
        {/* header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-black tracking-wide text-[#0e7a4a]" dir="ltr">{doc.code}</p>
            <p className="mt-0.5 text-sm font-bold">{t.emoji} {doc.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-black" style={{ color: lc.color, background: lc.bg }}>{lc.label}</span>
              {doc.legalHold && <span className="rounded-full bg-[#b3372f]/15 px-2.5 py-0.5 text-[11px] font-black text-[#b3372f]">🔒 نگهداری حقوقی</span>}
              {doc.status === 'BORROWED' && <span className="rounded-full bg-[#c96f4a]/15 px-2.5 py-0.5 text-[11px] font-black text-[#c96f4a]">✋ امانتی — {doc.borrowByName}</span>}
              {doc.confidentiality === 'MANAGEMENT' && <span className="rounded-full bg-[#8a5a2b]/10 px-2.5 py-0.5 text-[11px] font-black text-[#8a5a2b]">🔐 طبقه‌بندی: مدیریت</span>}
            </div>
          </div>
          <button onClick={onClose} className="min-h-[44px] rounded-xl bg-muted px-4 py-2 text-xs font-black">بستن ✕</button>
        </div>

        {/* action bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#8a5a2b]/20 bg-[#f7efe2] p-2.5">
          {canRegister && (
            <>
              <button onClick={onEdit} className="flex min-h-[44px] items-center gap-1 rounded-xl bg-[#8a5a2b]/10 px-3 py-2 text-[11px] font-black text-[#8a5a2b]"><Pencil size={13} /> ویرایش سند</button>
              <button onClick={onEvent} className="flex min-h-[44px] items-center gap-1 rounded-xl bg-[#0e7a4a]/10 px-3 py-2 text-[11px] font-black text-[#0e7a4a]"><Zap size={13} /> ثبت رخداد</button>
              {doc.status === 'IN_BINDER' && (
                <button onClick={onBorrow} className="flex min-h-[44px] items-center gap-1 rounded-xl bg-[#c96f4a]/10 px-3 py-2 text-[11px] font-black text-[#c96f4a]"><Hand size={13} /> امانی (با مهلت)</button>
              )}
              <button onClick={onMove} className="flex min-h-[44px] items-center gap-1 rounded-xl bg-[#8a5a2b]/10 px-3 py-2 text-[11px] font-black text-[#8a5a2b]" title="جابه‌جایی سند به زونکن دیگر — جایگاه جدید خودکار و رخداد MOVE در زنجیرهٔ custody">
                <Library size={13} /> جابه‌جایی بین زونکن‌ها
              </button>
            </>
          )}
          {doc.status === 'BORROWED' && canRegister && (
            <button onClick={() => onAct(doc.id, { action: 'return' }, 'سند به زونکن بازگشت ✅')} className="flex min-h-[44px] items-center gap-1 rounded-xl bg-[#0e7a4a]/10 px-3 py-2 text-[11px] font-black text-[#0e7a4a]"><Undo2 size={13} /> بازگشت امانی</button>
          )}
          {canDispose && doc.lifecycle !== 'DISPOSED' && doc.lifecycle !== 'DISPOSAL_PENDING' && !doc.legalHold && (
            <button onClick={onDisposal} className="flex min-h-[44px] items-center gap-1 rounded-xl bg-[#c96f4a]/10 px-3 py-2 text-[11px] font-black text-[#c96f4a]"><Gavel size={13} /> درخواست دفع</button>
          )}
          {canApprove && (
            <button
              onClick={() => onAct(doc.id, { action: 'approve-disposal' }, 'دفع سند با تأیید دوم انجام شد — رکورد سند محفوظ ماند')}
              className="flex min-h-[44px] items-center gap-1 rounded-xl bg-[#b3372f] px-3 py-2 text-[11px] font-black text-white"
            >
              <Gavel size={13} /> تأیید دفع (تأیید دوم)
            </button>
          )}
          {doc.lifecycle === 'DISPOSAL_PENDING' && lastDisposalReq?.userId === meId && (
            <span className="rounded-xl bg-[#b3372f]/10 px-3 py-2 text-[10px] font-black text-[#b3372f]">درخواست شما ثبت شده — تأیید دوم باید توسط کاربر دیگری انجام شود</span>
          )}
          {canDispose && (
            <button
              onClick={() => onAct(doc.id, { action: 'legal-hold', on: !doc.legalHold }, doc.legalHold ? 'نگهداری حقوقی برداشته شد' : 'سند تحت نگهداری حقوقی قرار گرفت — دفع مسدود شد')}
              className={cn('flex min-h-[44px] items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-black', doc.legalHold ? 'bg-[#b3372f] text-white' : 'bg-[#b3372f]/10 text-[#b3372f]')}
            >
              <ShieldAlert size={13} /> {doc.legalHold ? 'برداشتن نگهداری حقوقی' : 'نگهداری حقوقی'}
            </button>
          )}
          {canDispose && doc.lifecycle !== 'DISPOSED' && (
            <span className="flex items-center gap-1.5">
              <select
                value={lifecyclePick}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === doc.lifecycle) return
                  onAct(doc.id, { action: 'set-lifecycle', lifecycle: v }, 'مرحلهٔ حیات سند به‌روز شد')
                }}
                className="rounded-xl border border-input bg-white p-2 text-[11px] font-bold"
              >
                {LIFECYCLE_ORDER.map((k) => <option key={k} value={k}>مرحله: {LIFECYCLE_META[k].label}</option>)}
              </select>
            </span>
          )}
        </div>

        {/* شناسنامه */}
        <p className="mb-2 text-xs font-black text-[#8a5a2b]">📄 شناسنامهٔ سند</p>
        <div className="grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
          <KeyValue k="عنوان" v={doc.title} />
          <KeyValue k="طرف حساب" v={
            doc.partyId ? (
              <span className="flex items-center gap-1">
                {doc.party}
                <button onClick={() => { onClose(); onNavigateProviders() }} className="rounded-md bg-[#0e7a4a]/10 px-1.5 py-0.5 text-[9px] font-black text-[#0e7a4a]" title="مشاهده در تأمین‌کنندگان">✦ مرتبط با تأمین‌کنندگان</button>
              </span>
            ) : doc.party
          } />
          <KeyValue k="نوع سند" v={`${t.emoji} ${t.label}`} />
          <KeyValue k="مبلغ سند" v={`${faMoney(doc.amount)} تومان`} />
          <KeyValue k="تاریخ سند" v={formatJalaliShort(doc.docDate)} />
          <KeyValue k="شماره فاکتور (روی سند)" v={doc.invoiceNo || '—'} />
          <KeyValue k="سال مالی (لنگر قانونی)" v={doc.fiscalYear ? faNum(doc.fiscalYear) : '—'} />
          <KeyValue k="مهلت نگهداری" v={`${faNum(doc.retentionYears)} سال`} />
          <KeyValue k="پایان مهلت دفع" v={doc.disposeAfterIso ? `${formatJalaliShort(doc.disposeAfterIso)}${doc.legalHold ? ' (مسدود: نگهداری حقوقی)' : ''}` : '—'} />
          <KeyValue k="طبقه‌بندی محرمانگی" v={CONF_META[doc.confidentiality] || doc.confidentiality} />
          {doc.lifecycle === 'DISPOSED' && (
            <>
              <KeyValue k="روش دفع" v={DISPOSAL_METHODS[doc.disposalMethod] || doc.disposalMethod || '—'} />
              <KeyValue k="تاریخ دفع / تأییدکنندهٔ دوم" v={`${doc.disposalDate ? formatJalaliShort(doc.disposalDate) : '—'} — ${doc.disposalApprovedBy || '—'}`} />
            </>
          )}
        </div>

        {/* وضعیت مالی */}
        <p className="mb-2 mt-4 text-xs font-black text-[#8a5a2b]">💰 وضعیت مالی</p>
        <div className="grid gap-2 text-[11px] sm:grid-cols-3">
          <KeyValue k="وضعیت" v={<span className="rounded-full px-2 py-0.5" style={{ color: pm.color, background: `${pm.color}1a` }}>{pm.label}</span>} />
          <KeyValue k="پرداخت‌شده" v={`${faMoney(doc.paidAmount)} تومان`} />
          <KeyValue k="باقیمانده" v={`${faMoney(Math.max(0, doc.amount - (doc.paidAmount || 0)))} تومان`} />
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#8a5a2b]/10">
          <div className="h-full rounded-full transition-all" style={{ width: `${paidPct}%`, background: pm.color === '#b3372f' ? '#c9a227' : pm.color }} />
        </div>
        <p className="mt-1 text-left text-[10px] font-bold text-muted-foreground">{faNum(paidPct)}٪ از مبلغ سند وصول شده</p>

        {/* نمایندهٔ طرف حساب */}
        <p className="mb-2 mt-4 text-xs font-black text-[#8a5a2b]">🧑‍💼 نمایندهٔ طرف حساب</p>
        {doc.repId || doc.repName ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f3f6ec] p-3">
            <div>
              <p className="text-xs font-black">👤 {doc.repName || '—'}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">نمایندهٔ ثبت‌شده در دفتر نمایندگان — همهٔ رخدادهای این سند به او متصل است</p>
            </div>
            {doc.repId && (
              <button onClick={() => onOpenRep(doc.repId)} className="min-h-[44px] rounded-xl bg-[#0e7a4a]/10 px-3 py-2 text-[11px] font-black text-[#0e7a4a]">
                مشاهدهٔ سابقهٔ کامل نماینده
              </button>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">هنوز نماینده‌ای به این سند متصل نشده — از «ثبت رخداد» یا «ویرایش سند» نماینده را انتخاب کنید.</p>
        )}

        {/* مراجع هلو */}
        <p className="mb-2 mt-4 text-xs font-black text-[#8a5a2b]">🏷 مراجع هلو — جست‌وجوی ثانیه‌ای</p>
        <div className="grid gap-2 text-[11px] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">شماره فاکتور خرید (هلو)</span>
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-black" dir="ltr">{doc.holooInvoiceNo || '—'}</span>
              {doc.holooInvoiceNo && <button onClick={() => onCopy(doc.holooInvoiceNo)} className="rounded-md bg-[#0e7a4a]/10 p-1 text-[#0e7a4a]" title="کپی"><Copy size={12} /></button>}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">شماره رسید پرداخت (هلو)</span>
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-black" dir="ltr">{doc.holooReceiptNo || '—'}</span>
              {doc.holooReceiptNo && <button onClick={() => onCopy(doc.holooReceiptNo)} className="rounded-md bg-[#0e7a4a]/10 p-1 text-[#0e7a4a]" title="کپی"><Copy size={12} /></button>}
            </span>
          </div>
        </div>

        {/* مسیر فیزیکی */}
        <p className="mb-2 mt-4 text-xs font-black text-[#8a5a2b]">🗺 مسیر فیزیکی سند</p>
        <p className="rounded-xl bg-[#fdf6dd] p-3 text-xs font-black text-[#8a5a2b]">
          <MapPin size={13} className="ml-1 inline" />
          زونکن {doc.binderCode} › جایگاه {faNum(doc.seq)} {doc.binderId ? <span className="text-[10px] font-bold text-muted-foreground">(شناسهٔ زونکن در سامانه ثبت است)</span> : null}
        </p>

        {/* timestamps */}
        <div className="mt-4 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue k="تحویل کالا" v={doc.deliveryAt ? formatJalaliDateTime(doc.deliveryAt) : '—'} />
          <KeyValue k="ثبت در سامانه" v={doc.submittedAt ? formatJalaliDateTime(doc.submittedAt) : '—'} />
          <KeyValue k="آخرین ویرایش" v={doc.editedAt ? `${formatJalaliDateTime(doc.editedAt)} — ${doc.editedByName}` : '—'} />
          <KeyValue k="ثبت سند" v={`${formatJalaliShort(doc.createdAt)} — ${doc.createdByName}`} />
        </div>

        {/* اقلام سند — قرمزها */}
        <p className="mb-2 mt-4 text-xs font-black text-[#8a5a2b]">📋 اقلام سند — سجل کالا (موارد مرجوعی/مردود/نیامده قرمز است)</p>
        {items.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">ردیف کالایی ثبت نشده است.</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((it) => <ItemLine key={it.id} it={it} />)}
            <p className="text-left text-[10px] font-black text-[#8a5a2b]">
              جمع اقلام: {faMoney(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0))} تومان
            </p>
          </div>
        )}

        {/* رخدادهای سند */}
        <p className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-black text-[#8a5a2b]"><Zap size={13} /> رخدادهای سند (دفتر رخدادها — append-only)</p>
        {events.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">هنوز رخدادی (تحویل، پرداخت، مرجوعی، هلو…) ثبت نشده است.</p>
        ) : (
          <div className="scroll-gold max-h-56 space-y-1.5 overflow-y-auto pl-1">
            {events.map((e) => {
              const meta = EVENT_KINDS_META[e.kind] || EVENT_KINDS_META.NOTE
              return (
                <div key={e.id} className="rounded-xl bg-white/85 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-black" style={{ color: meta.color }}>
                      {meta.emoji} {meta.label}
                      {e.amount > 0 && <span className="mr-2 text-[#0e7a4a]">{faMoney(e.amount)} تومان</span>}
                    </p>
                    <span className="rounded-md bg-[#8a5a2b]/10 px-2 py-0.5 text-[9px] font-black text-[#8a5a2b]">{formatJalaliDateTime(e.at)}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    {e.repName && <span className="rounded-md bg-[#77934a]/15 px-1.5 py-0.5 font-black text-[#5c7236]">👤 {e.repName}</span>}
                    {e.holooRef && <span dir="ltr">🏷 {e.holooRef}</span>}
                    {e.note && <span>{e.note}</span>}
                    <span>ثبت: {e.createdByName}</span>
                  </p>
                  {e.items.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {e.items.map((ri, i) => (
                        <p key={i} className="rounded-md bg-[#fee2e2] px-2 py-1 text-[10px] font-black text-[#b3372f]">
                          {ri.productName} — {faNum(ri.qty)}{ri.reason ? ` — ${ri.reason}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* زنجیرهٔ custody */}
        <p className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-black text-[#8a5a2b]"><History size={13} /> زنجیرهٔ custody (حسابرسی جابه‌جایی و عملیات)</p>
        {custody.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">زنجیرهٔ custody برای این سند خالی است — با نخستین عملیات (امانت/ویرایش/پرداخت…) ثبت می‌شود.</p>
        ) : (
          <div className="scroll-gold max-h-56 space-y-1.5 overflow-y-auto pl-1">
            {custody.map((c) => {
              const meta = CUSTODY_META[c.action] || CUSTODY_META.EDIT
              return (
                <div key={c.id} className="rounded-xl bg-white/85 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-black" style={{ color: meta.color }}>{meta.emoji} {meta.label}</p>
                    <span className="rounded-md bg-[#8a5a2b]/10 px-2 py-0.5 text-[9px] font-black text-[#8a5a2b]">{formatJalaliDateTime(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="font-bold">{c.userName}</span>
                    {c.dueBackIso && <span className="rounded-md bg-[#c96f4a]/10 px-1.5 py-0.5 font-black text-[#c96f4a]">مهلت بازگشت: {formatJalaliShort(c.dueBackIso)}</span>}
                    {c.detail && <span>{c.detail}</span>}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** مودال ویرایش کامل سند */
function DocEditModal({ doc, reps, onClose, onSaved }: {
  doc: Doc
  reps: RepLite[]
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    title: doc.title, docType: doc.docType, party: doc.party, amount: String(doc.amount || ''),
    docDate: doc.docDate || todayIso(), invoiceNo: doc.invoiceNo, fiscalYear: doc.fiscalYear,
    retentionYears: String(doc.retentionYears || 10), confidentiality: doc.confidentiality,
    lifecycle: doc.lifecycle, paymentStatus: doc.paymentStatus, paidAmount: String(doc.paidAmount || ''),
    holooInvoiceNo: doc.holooInvoiceNo, holooReceiptNo: doc.holooReceiptNo,
    deliveryAt: doc.deliveryAt ? toLocalInput(doc.deliveryAt) : '', submittedAt: doc.submittedAt ? toLocalInput(doc.submittedAt) : '',
    repId: doc.repId, notes: doc.notes,
  })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))
  const years = ['1400', '1401', '1402', '1403', '1404', '1405', '1406', '1407']

  const save = async () => {
    if (!f.title || !f.party) return toast.error('عنوان سند و طرف حساب الزامی است')
    setBusy(true)
    try {
      await api(`/api/archive/${doc.id}`, {
        method: 'PATCH',
        body: {
          action: 'edit',
          title: f.title, docType: f.docType, party: f.party, amount: Number(f.amount) || 0,
          docDate: f.docDate, invoiceNo: f.invoiceNo, fiscalYear: f.fiscalYear,
          retentionYears: Number(f.retentionYears) || 10, confidentiality: f.confidentiality,
          lifecycle: f.lifecycle, paymentStatus: f.paymentStatus, paidAmount: Number(f.paidAmount) || 0,
          holooInvoiceNo: f.holooInvoiceNo, holooReceiptNo: f.holooReceiptNo,
          deliveryAt: f.deliveryAt ? new Date(f.deliveryAt).toISOString() : '',
          submittedAt: f.submittedAt ? new Date(f.submittedAt).toISOString() : '',
          repId: f.repId, notes: f.notes,
        },
      })
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`ویرایش سند ${doc.code}`} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="عنوان سند *"><input value={f.title} onChange={(e) => set('title', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="نوع سند">
          <select value={f.docType} onChange={(e) => set('docType', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="طرف حساب *"><input value={f.party} onChange={(e) => set('party', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="مبلغ سند (تومان)">
          <FaPriceInput value={f.amount === '' ? '' : Number(f.amount)} onChange={(v) => set('amount', v === '' ? '' : String(v))} ariaLabel="مبلغ سند" className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" />
        </Labeled>
        <Labeled label="تاریخ سند"><JalaliDatePicker value={f.docDate} onChange={(v) => set('docDate', v)} holidays={new Map()} compact /></Labeled>
        <Labeled label="شماره فاکتور (روی سند)"><input value={f.invoiceNo} onChange={(e) => set('invoiceNo', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="سال مالی (لنگر قانونی نگهداری)" hint="پایان مهلت دفع از آخرین اسفندِ (سال مالی + مهلت) محاسبه می‌شود">
          <select value={f.fiscalYear} onChange={(e) => set('fiscalYear', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            <option value="">— انتخاب سال مالی —</option>
            {years.map((y) => <option key={y} value={y}>{faNum(y)}</option>)}
          </select>
        </Labeled>
        <Labeled label="مهلت نگهداری (سال)" hint="پیش‌فرض قانون تجارت ماده ۱۳: ۱۰ سال">
          <select value={f.retentionYears} onChange={(e) => set('retentionYears', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            {['3', '5', '10', '15', '20', '30'].map((y) => <option key={y} value={y}>{faNum(y)} سال</option>)}
          </select>
        </Labeled>
        <Labeled label="مرحلهٔ حیات">
          <select value={f.lifecycle} onChange={(e) => set('lifecycle', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            {LIFECYCLE_ORDER.map((k) => <option key={k} value={k}>{LIFECYCLE_META[k].label}</option>)}
          </select>
        </Labeled>
        <Labeled label="محرمانگی">
          <select value={f.confidentiality} onChange={(e) => set('confidentiality', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            {Object.entries(CONF_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Labeled>
        <Labeled label="وضعیت مالی">
          <select value={f.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            {Object.entries(PAYMENT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="مبلغ پرداخت‌شده (تومان)">
          <FaPriceInput value={f.paidAmount === '' ? '' : Number(f.paidAmount)} onChange={(v) => set('paidAmount', v === '' ? '' : String(v))} ariaLabel="مبلغ پرداخت‌شده" className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" />
        </Labeled>
        <Labeled label="شماره فاکتور خرید در هلو 🏷"><input value={f.holooInvoiceNo} onChange={(e) => set('holooInvoiceNo', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" placeholder="مثلاً HZ-INV-111" /></Labeled>
        <Labeled label="شماره رسید پرداخت در هلو 🧾"><input value={f.holooReceiptNo} onChange={(e) => set('holooReceiptNo', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="تحویل کالا (تاریخ و ساعت)"><input type="datetime-local" value={f.deliveryAt} onChange={(e) => set('deliveryAt', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="ثبت اطلاعات در سامانه (تاریخ و ساعت)"><input type="datetime-local" value={f.submittedAt} onChange={(e) => set('submittedAt', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="نمایندهٔ طرف حساب">
          <select value={f.repId} onChange={(e) => set('repId', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            <option value="">— بدون نماینده —</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.fullName}{r.providerName ? ` — ${r.providerName}` : ''}</option>)}
          </select>
        </Labeled>
        <Labeled label="توضیح"><input value={f.notes} onChange={(e) => set('notes', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
      </div>
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ذخیرهٔ تغییرات سند'}
      </button>
    </Modal>
  )
}

/** مودال ثبت رخداد سند — تحویل/پرداخت/مرجوعی/مردود/کسری/هلو/یادداشت + نماینده */
function DocEventModal({ doc, items, reps, onClose, onSaved, onRepCreated }: {
  doc: Doc
  items: DocItem[]
  reps: RepLite[]
  onClose: () => void
  onSaved: () => void
  onRepCreated: () => void
}) {
  const [f, setF] = useState({ kind: 'PAYMENT_POS', at: toLocalInput(), amount: '', repId: doc.repId || '', holooRef: '', note: '' })
  const [rows, setRows] = useState<{ productName: string; qty: string; reason: string }[]>([{ productName: '', qty: '', reason: '' }])
  const [quickRep, setQuickRep] = useState(false)
  const [qr, setQr] = useState({ fullName: '', mobile: '', providerName: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))
  const needItems = FLAG_EVENT_KINDS.includes(f.kind)
  const needAmount = PAYMENT_EVENT_KINDS.includes(f.kind)
  const needHoloo = f.kind === 'HOLOO_INVOICE' || f.kind === 'HOLOO_RECEIPT'
  const setRow = (idx: number, patch: Partial<{ productName: string; qty: string; reason: string }>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const prefillItems = () => {
    if (!items.length) return toast.error('این سند ردیف کالایی ندارد — نام کالا را دستی وارد کنید')
    setRows(items.map((it) => ({ productName: it.productName, qty: String(it.qty || ''), reason: '' })))
  }

  const quickCreateRep = async () => {
    if (!qr.fullName.trim()) return toast.error('نام نماینده الزامی است')
    setBusy(true)
    try {
      const res = await api<{ rep: RepLite; warning?: string }>('/api/sales-reps', { method: 'POST', body: qr })
      toast.success(`نماینده «${res.rep.fullName}» ثبت شد${res.warning ? ' — توجه: ' + res.warning : ''}`)
      onRepCreated()
      set('repId', res.rep.id)
      setQuickRep(false)
      setQr({ fullName: '', mobile: '', providerName: '' })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (needAmount && (Number(f.amount) || 0) <= 0) return toast.error('مبلغ رخداد الزامی است')
    if (needHoloo && !f.holooRef.trim()) return toast.error('شماره ثبت‌شده در هلو را وارد کنید')
    const evItems = needItems
      ? rows.filter((r) => r.productName.trim()).map((r) => ({ productName: r.productName.trim(), qty: Number(r.qty) || 0, reason: r.reason.trim() }))
      : []
    if (needItems && !evItems.length) return toast.error('حداقل یک قلم با نام کالا وارد کنید')
    setBusy(true)
    try {
      await api(`/api/archive/${doc.id}`, {
        method: 'PATCH',
        body: {
          action: 'doc-event', kind: f.kind,
          at: f.at ? new Date(f.at).toISOString() : new Date().toISOString(),
          amount: Number(f.amount) || 0, repId: f.repId, holooRef: f.holooRef, note: f.note, items: evItems,
        },
      })
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const kindKeys = ['DELIVERY', ...PAYMENT_EVENT_KINDS, 'RETURN', 'REJECT', 'SHORTAGE', 'HOLOO_INVOICE', 'HOLOO_RECEIPT', 'NOTE']

  return (
    <Modal title={`ثبت رخداد برای سند ${doc.code}`} onClose={onClose} wide>
      <div className="flex flex-wrap gap-1.5">
        {kindKeys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => set('kind', k)}
            className={cn(
              'rounded-xl px-3 py-2 text-[11px] font-black transition',
              f.kind === k ? 'text-white' : 'bg-muted/70 text-[#8a5a2b]',
            )}
            style={f.kind === k ? { background: EVENT_KINDS_META[k].color } : undefined}
          >
            {EVENT_KINDS_META[k].emoji} {EVENT_KINDS_META[k].label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Labeled label="تاریخ و ساعت رخداد"><input type="datetime-local" value={f.at} onChange={(e) => set('at', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        {needAmount && (
          <Labeled label="مبلغ (تومان)">
            <FaPriceInput value={f.amount === '' ? '' : Number(f.amount)} onChange={(v) => set('amount', v === '' ? '' : String(v))} ariaLabel="مبلغ رخداد" className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" />
          </Labeled>
        )}
        {needHoloo && (
          <Labeled label="شماره در هلو" hint={f.kind === 'HOLOO_INVOICE' ? 'شماره فاکتور خرید در هلو' : 'شماره رسید پرداخت در هلو'}>
            <input value={f.holooRef} onChange={(e) => set('holooRef', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" />
          </Labeled>
        )}
        <Labeled label="نمایندهٔ طرف حساب" hint="هر رخداد با نام نماینده ثبت می‌شود — دفتر نمایندگان">
          <div className="flex gap-2">
            <select value={f.repId} onChange={(e) => set('repId', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
              <option value="">— بدون نماینده —</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.fullName}{r.providerName ? ` — ${r.providerName}` : ''}</option>)}
            </select>
            <button type="button" onClick={() => setQuickRep((s) => !s)} className="shrink-0 rounded-xl bg-[#0e7a4a]/10 px-3 text-[11px] font-black text-[#0e7a4a]">＋ جدید</button>
          </div>
        </Labeled>
        <Labeled label="یادداشت / توضیح"><input value={f.note} onChange={(e) => set('note', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
      </div>

      {quickRep && (
        <div className="mt-2 rounded-xl border border-[#0e7a4a]/30 bg-[#f3f6ec] p-3">
          <p className="mb-2 text-[11px] font-black text-[#0e7a4a]">ثبت سریع نمایندهٔ جدید</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={qr.fullName} onChange={(e) => setQr((s) => ({ ...s, fullName: e.target.value }))} className="rounded-lg border border-input p-2 text-xs" placeholder="نام و نام خانوادگی *" />
            <input value={qr.mobile} onChange={(e) => setQr((s) => ({ ...s, mobile: e.target.value }))} className="rounded-lg border border-input p-2 text-xs" dir="ltr" placeholder="۰۹۱۲…" />
            <input value={qr.providerName} onChange={(e) => setQr((s) => ({ ...s, providerName: e.target.value }))} className="rounded-lg border border-input p-2 text-xs" placeholder="شرکت" />
          </div>
          <button type="button" onClick={quickCreateRep} disabled={busy} className="mt-2 w-full rounded-xl bg-[#0e7a4a] py-2 text-[11px] font-black text-white disabled:opacity-50">ثبت نماینده و انتخاب</button>
        </div>
      )}

      {needItems && (
        <div className="mt-3 rounded-2xl border border-[#b3372f]/30 bg-[#fbeae8]/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-black text-[#b3372f]">{EVENT_KINDS_META[f.kind].label} — اقلام با دلیل</p>
            <button type="button" onClick={prefillItems} className="rounded-lg bg-white/80 px-2.5 py-1.5 text-[10px] font-black text-[#8a5a2b]">همهٔ اقلام سند</button>
          </div>
          <div className="space-y-2">
            {rows.map((r, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-white/85 p-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <input value={r.productName} onChange={(e) => setRow(idx, { productName: e.target.value })} list="event-item-opts" className="w-full rounded-lg border border-input p-2 text-xs" placeholder="نام کالا" />
                  <input value={r.qty} onChange={(e) => setRow(idx, { qty: e.target.value.replace(/[^\d.]/g, '') })} className="w-full rounded-lg border border-input p-2 text-xs" dir="ltr" inputMode="decimal" placeholder="مقدار" />
                  <input value={r.reason} onChange={(e) => setRow(idx, { reason: e.target.value })} className="w-full rounded-lg border border-input p-2 text-xs" placeholder="دلیل / توضیح" />
                </div>
                <button
                  type="button"
                  onClick={() => setRows((rs) => (rs.length === 1 ? [{ productName: '', qty: '', reason: '' }] : rs.filter((_, i) => i !== idx)))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#b3372f]/10 text-sm font-black text-[#b3372f]"
                  aria-label="حذف ردیف"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <datalist id="event-item-opts">
            {items.map((it) => <option key={it.id} value={it.productName} />)}
          </datalist>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { productName: '', qty: '', reason: '' }])}
            className="mt-2 w-full rounded-xl border border-dashed border-[#b3372f]/40 bg-white/60 py-2 text-[11px] font-black text-[#b3372f]"
          >
            ＋ افزودن قلم
          </button>
        </div>
      )}

      {needAmount && doc.amount > 0 && (
        <p className="mt-2 rounded-xl bg-[#fdf6dd] p-2.5 text-[11px] font-bold text-[#8a5a2b]">
          پس از ثبت: پرداخت‌شده {faMoney(doc.paidAmount + (Number(f.amount) || 0))} از {faMoney(doc.amount)} تومان
        </p>
      )}

      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ثبت رخداد در دفتر سند'}
      </button>
    </Modal>
  )
}

/** امانت سند با مهلت بازگشت — الگوی outguide / charge-out */
function BorrowModal({ doc, meName, onClose, onSaved }: { doc: Doc; meName: string; onClose: () => void; onSaved: () => void }) {
  const [byName, setByName] = useState(meName)
  const [due, setDue] = useState(addDaysIso(7))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api(`/api/archive/${doc.id}`, { method: 'PATCH', body: { action: 'borrow', byName, dueBackIso: due } })
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`امانت سند ${doc.code}`} onClose={onClose}>
      <p className="rounded-xl bg-[#fdf6dd] p-2.5 text-[11px] leading-relaxed text-[#8a5a2b]">
        الگوی outguide: به‌جای سند، یک «کارت راهنما» در جایگاهش می‌ماند — چه کسی، کِی برداشت و کِی باید برگرداند. زنجیرهٔ custody این رخداد را همیشه نگه می‌دارد.
      </p>
      <Labeled label="امانت‌گیرنده"><input value={byName} onChange={(e) => setByName(e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
      <Labeled label="مهلت بازگشت"><JalaliDatePicker value={due} onChange={setDue} holidays={new Map()} /></Labeled>
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ثبت امانت با مهلت بازگشت'}
      </button>
    </Modal>
  )
}

/** درخواست دفع سند — نیازمند تأیید دوم (جداسازی وظایف) */
function DisposalModal({ doc, onClose, onSaved }: { doc: Doc; onClose: () => void; onSaved: () => void }) {
  const [method, setMethod] = useState(doc.disposalMethod || 'SHRED')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api(`/api/archive/${doc.id}`, { method: 'PATCH', body: { action: 'request-disposal', method } })
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`درخواست دفع سند ${doc.code}`} onClose={onClose}>
      <p className="rounded-xl bg-[#fbeae8] p-2.5 text-[11px] leading-relaxed text-[#b3372f]">
        دفع سند فرایندی دو مرحله‌ای است: شما درخواست می‌دهید؛ کاربر دیگر (حسابدار/مدیریت) باید تأیید کند. هیچ سندی هرگز به‌صورت خودکار یا تک‌نفره دفع نمی‌شود و پس از دفع هم رکورد سند در سامانه باقی می‌ماند.
      </p>
      <Labeled label="روش دفع پیشنهادی">
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
          {Object.entries(DISPOSAL_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Labeled>
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-[#c96f4a] py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ثبت درخواست دفع'}
      </button>
    </Modal>
  )
}

/** مودال ثبت/ویرایش نماینده */
function RepFormModal({ rep, onClose, onSaved }: { rep: RepFull | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    fullName: rep?.fullName || '', mobile: rep?.mobile || '', phone2: rep?.phone2 || '',
    providerName: rep?.providerName || '', jobRole: rep?.jobRole || 'REP', nationalId: rep?.nationalId || '', notes: rep?.notes || '',
  })
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))
  useEffect(() => {
    api<{ providers: { id: string; name: string }[] }>('/api/providers')
      .then((d) => setProviders((d.providers || []).slice(0, 200)))
      .catch(() => { /* free text still works */ })
  }, [])

  const save = async () => {
    if (!f.fullName.trim()) return toast.error('نام نماینده الزامی است')
    setBusy(true)
    try {
      const providerId = providers.find((p) => p.name === f.providerName)?.id || rep?.providerId || ''
      if (rep) {
        await api(`/api/sales-reps?id=${rep.id}`, { method: 'PATCH', body: { ...f, providerId } })
      } else {
        const res = await api<{ warning?: string }>('/api/sales-reps', { method: 'POST', body: { ...f, providerId } })
        if (res?.warning) toast.warning(res.warning, { duration: 9000 })
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={rep ? `ویرایش نماینده — ${rep.fullName}` : 'ثبت نمایندهٔ جدید'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نام و نام خانوادگی *"><input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="موبایل"><input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" inputMode="tel" placeholder="۰۹۱۲…" /></Labeled>
        <Labeled label="تلفن دوم"><input value={f.phone2} onChange={(e) => set('phone2', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="شرکت / تأمین‌کننده" hint="در صورت تغییر شرکت، سابقهٔ شرکت‌های قبلی نگه‌داری می‌شود">
          <input value={f.providerName} onChange={(e) => set('providerName', e.target.value)} list="rep-provider-opts" className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="انتخاب یا تایپ آزاد" />
        </Labeled>
        <Labeled label="سمت در شرکت">
          <select value={f.jobRole} onChange={(e) => set('jobRole', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            {Object.entries(JOB_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Labeled>
        <Labeled label="کد ملی"><input value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="یادداشت"><input value={f.notes} onChange={(e) => set('notes', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
      </div>
      <datalist id="rep-provider-opts">
        {providers.map((p) => <option key={p.id} value={p.name} />)}
      </datalist>
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : rep ? 'ذخیرهٔ تغییرات' : 'ثبت نماینده'}
      </button>
    </Modal>
  )
}

/** پروندهٔ نماینده — آمار + سابقهٔ شرکت‌ها + خط زمانی رخدادها + اسناد */
function RepProfileModal({ data, onClose, onOpenDoc }: { data: RepProfileRes | null; onClose: () => void; onOpenDoc: (id: string) => void }) {
  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" />
        <div className="glow-card rounded-2xl bg-card p-6 text-center text-xs font-bold text-muted-foreground">…در حال بازکردن پروندهٔ نماینده</div>
      </div>
    )
  }
  const { rep, events, docs } = data
  let history: { providerName: string; from: string; to?: string }[] = []
  try {
    const arr = JSON.parse((rep as any).providerHistory || '[]')
    if (Array.isArray(arr)) history = arr
  } catch { /* malformed */ }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="scroll-gold glow-card max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-black">👤 {rep.fullName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {rep.providerName && <Pill label={rep.providerName} color="#8a5a2b" bg="#c9a227/15" />}
              <span className="rounded-full bg-[#0e7a4a]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#0e7a4a]">{PERSON_KINDS[(rep as any).kind || ''] || JOB_ROLES[rep.jobRole] || rep.jobRole}</span>
              {!rep.active && <Pill label="غیرفعال" color="#6b7280" bg="#6b72801a" />}
            </div>
          </div>
          <button onClick={onClose} className="min-h-[44px] rounded-xl bg-muted px-4 py-2 text-xs font-black">بستن ✕</button>
        </div>

        <div className="grid gap-2 text-[11px] sm:grid-cols-2">
          <KeyValue k="موبایل" v={rep.mobile ? <a href={`tel:${rep.mobile}`} className="font-black text-[#0e7a4a]" dir="ltr">{faNum(rep.mobile)}</a> : '—'} />
          <KeyValue k="تلفن دوم" v={rep.phone2 ? <span dir="ltr">{faNum(rep.phone2)}</span> : '—'} />
          <KeyValue k="کد ملی" v={rep.nationalId ? faNum(rep.nationalId) : '—'} />
          <KeyValue k="یادداشت" v={rep.notes || '—'} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="glow-card rounded-xl bg-card p-2.5 text-center"><p className="text-base font-black text-[#0e7a4a]">{faNum(rep.docCount || 0)}</p><p className="text-[10px] font-bold">سند مرتبط</p></div>
          <div className="glow-card rounded-xl bg-card p-2.5 text-center"><p className="text-base font-black text-[#8a5a2b]">{faNum(rep.eventCount || 0)}</p><p className="text-[10px] font-bold">رخداد ثبت‌شده</p></div>
          <div className="glow-card rounded-xl bg-card p-2.5 text-center"><p className="text-base font-black text-[#0e7a4a]">{faMoney(rep.totalCollected || 0)}</p><p className="text-[10px] font-bold">مجموع وصولی (تومان)</p></div>
          <div className="glow-card rounded-xl bg-card p-2.5 text-center"><p className="text-sm font-black text-[#c96f4a]">{rep.lastSeen ? formatJalaliDateTime(rep.lastSeen) : '—'}</p><p className="text-[10px] font-bold">آخرین رخداد</p></div>
        </div>

        {(history.length > 0 || rep.providerName) && (
          <>
            <p className="mb-2 mt-4 text-xs font-black text-[#8a5a2b]">🏢 سابقهٔ طرف حساب (شرکت‌ها)</p>
            <div className="flex flex-wrap gap-1.5">
              {rep.providerName && <Pill label={`فعلی: ${rep.providerName}`} color="#0e7a4a" bg="#0e7a4a1a" />}
              {history.map((h, i) => (
                <span key={i} className="rounded-full bg-[#c9a227]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#8a5a2b]">
                  {h.providerName}{h.from || h.to ? ` (${h.from ? formatJalaliShort(h.from) : '؟'} تا ${h.to ? formatJalaliShort(h.to) : 'امروز'})` : ''}
                </span>
              ))}
              {history.length === 0 && !rep.providerName && <span className="text-[11px] text-muted-foreground">—</span>}
            </div>
          </>
        )}

        <p className="mb-2 mt-4 text-xs font-black text-[#8a5a2b]">⚡ تاریخچهٔ رخدادهای این نماینده (تحویل، وصول، مرجوعی، مردودی…)</p>
        {events.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">هنوز رخدادی با نام این نماینده ثبت نشده است.</p>
        ) : (
          <div className="scroll-gold max-h-64 space-y-1.5 overflow-y-auto pl-1">
            {events.map((e) => {
              const meta = EVENT_KINDS_META[e.kind] || EVENT_KINDS_META.NOTE
              return (
                <div key={e.id} className="rounded-xl bg-white/85 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-black" style={{ color: meta.color }}>
                      {meta.emoji} {meta.label}
                      {e.amount > 0 && <span className="mr-2 text-[#0e7a4a]">{faMoney(e.amount)} تومان</span>}
                    </p>
                    <span className="rounded-md bg-[#8a5a2b]/10 px-2 py-0.5 text-[9px] font-black text-[#8a5a2b]">{formatJalaliDateTime(e.at)}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    {e.docCode && (
                      <button onClick={() => { onClose(); onOpenDoc(e.docId) }} className="rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 font-black text-[#8a5a2b]" dir="ltr">
                        {e.docCode}
                      </button>
                    )}
                    {e.docTitle && <span className="font-bold">{e.docTitle}</span>}
                    {e.docParty && <span>طرف حساب: {e.docParty}</span>}
                    {e.holooRef && <span dir="ltr">🏷 {e.holooRef}</span>}
                    {e.note && <span>{e.note}</span>}
                  </p>
                  {e.items.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {e.items.map((ri, i) => (
                        <p key={i} className="rounded-md bg-[#fee2e2] px-2 py-1 text-[10px] font-black text-[#b3372f]">
                          {ri.productName} — {faNum(ri.qty)}{ri.reason ? ` — ${ri.reason}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {docs.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-xs font-black text-[#8a5a2b]">🗂 اسناد مرتبط با این نماینده</p>
            <div className="space-y-1.5">
              {docs.map((d) => (
                <button key={d.id} onClick={() => { onClose(); onOpenDoc(d.id) }} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-white/85 p-2.5 text-right transition hover:shadow-md">
                  <span className="text-[11px] font-black">{d.title} <span className="mr-1 rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b]" dir="ltr">{d.code}</span></span>
                  <span className="text-[10px] text-muted-foreground">{d.party} • {formatJalaliShort(d.docDate)} • {faMoney(d.amount)} تومان</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** register a document → auto location assignment + line items builder + instant physical-location card */
function IntakeModal({ binders, reps, onClose, onSaved }: {
  binders: Binder[]
  reps: RepLite[]
  onClose: () => void
  onSaved: (doc: Doc, binder: any, pickReason: string, itemsCreated: number) => void
}) {
  type ItemRow = { productName: string; productId: string; qty: string; unitPrice: string; expiry: string; returned: boolean; returnReason: string; rejected: boolean; rejectReason: string; missing: boolean }
  const emptyRow = (): ItemRow => ({ productName: '', productId: '', qty: '', unitPrice: '', expiry: '', returned: false, returnReason: '', rejected: false, rejectReason: '', missing: false })

  const [form, setForm] = useState({ title: '', docType: 'INVOICE', party: '', amount: '', invoiceNo: '', docDate: todayIso(), binderId: '', refOrderCode: '', notes: '', holooInvoiceNo: '', repId: '' })
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()])
  const [productOpts, setProductOpts] = useState<{ id: string; name: string; buyPrice: number; unit: string }[]>([])
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    api<{ products: any[] }>('/api/products')
      .then((d) => setProductOpts((d.products || []).slice(0, 200).map((p) => ({ id: p.id, name: p.name, buyPrice: p.buyPrice, unit: p.unit }))))
      .catch(() => { /* free-text still works without suggestions */ })
  }, [])

  const setRow = (idx: number, patch: Partial<ItemRow>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const onRowName = (idx: number, name: string) => {
    const p = productOpts.find((o) => o.name === name)
    if (p) setRow(idx, { productName: p.name, productId: p.id, unitPrice: rows[idx].unitPrice === '' && p.buyPrice > 0 ? String(p.buyPrice) : rows[idx].unitPrice })
    else setRow(idx, { productName: name, productId: '' })
  }

  const rowsTotal = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0)
  const validRows = rows.filter((r) => r.productName.trim())
  const effectiveAmount = Number(form.amount) || (validRows.length ? rowsTotal : 0)

  const save = async () => {
    if (!form.title || !form.party) return toast.error('عنوان سند و طرف حساب الزامی است')
    const items = validRows.map((r) => ({
      productId: r.productId,
      productName: r.productName.trim(),
      qty: Number(r.qty) || 0,
      unitPrice: Number(r.unitPrice) || 0,
      expiryDate: r.expiry || '',
      returned: r.returned,
      returnReason: r.returned ? r.returnReason.trim() : '',
      rejected: r.rejected,
      rejectReason: r.rejected ? r.rejectReason.trim() : '',
      missing: r.missing,
    }))
    setBusy(true)
    try {
      const res = await api<{ doc: Doc; binder: any; pickReason: string; itemsCreated: number }>('/api/archive', {
        method: 'POST',
        body: { kind: 'doc', ...form, amount: effectiveAmount, items },
      })
      toast.success('سند در آرشیو ثبت شد')
      onSaved(res.doc, res.binder, res.pickReason, res.itemsCreated || 0)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="ثبت سند در آرشیو فیزیکی" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="عنوان سند *"><input value={form.title} onChange={(e) => set('title', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="مثلاً: فاکتور شماره ۲۴۱ کاله" /></Labeled>
        <Labeled label="نوع سند">
          <select value={form.docType} onChange={(e) => set('docType', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="طرف حساب *"><input value={form.party} onChange={(e) => set('party', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="نام تأمین‌کننده / شرکت" /></Labeled>
        <Labeled label="شماره فاکتور (روی سند فیزیکی)"><input value={form.invoiceNo} onChange={(e) => set('invoiceNo', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" placeholder="241-1405" /></Labeled>
        <Labeled label="مبلغ سند (تومان)" hint={validRows.length > 0 ? `جمع اقلام: ${faMoney(rowsTotal)} تومان — اگر خالی بماند، از جمع اقلام محاسبه می‌شود` : undefined}>
          <FaPriceInput
            value={form.amount === '' ? '' : Number(form.amount)}
            onChange={(v) => set('amount', v === '' ? '' : String(v))}
            ariaLabel="مبلغ سند"
            className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]"
          />
        </Labeled>
        <Labeled label="تاریخ سند"><JalaliDatePicker value={form.docDate} onChange={(v) => set('docDate', v)} holidays={new Map()} compact /></Labeled>
        <Labeled label="زونکن مقصد">
          <select value={form.binderId} onChange={(e) => set('binderId', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            <option value="">پیشنهاد خودکار سامانه 🎯</option>
            {binders.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.title}</option>)}
          </select>
        </Labeled>
        <Labeled label="کد سفارش مرتبط (اختیاری)"><input value={form.refOrderCode} onChange={(e) => set('refOrderCode', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="شماره فاکتور خرید در هلو 🏷" hint="برای جست‌وجوی ثانیه‌ای در نرم‌افزار هلو">
          <input value={form.holooInvoiceNo} onChange={(e) => set('holooInvoiceNo', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" placeholder="مثلاً HZ-INV-111" />
        </Labeled>
        <Labeled label="نمایندهٔ طرف حساب" hint="دفتر نمایندگان — رخدادهای بعدی هم به همین نماینده متصل می‌شود">
          <select value={form.repId} onChange={(e) => set('repId', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            <option value="">— بدون نماینده —</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.fullName}{r.providerName ? ` — ${r.providerName}` : ''}</option>)}
          </select>
        </Labeled>
      </div>
      <Labeled label="توضیح (اختیاری)"><input value={form.notes} onChange={(e) => set('notes', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>

      {/* ── line items builder (سجل کالا) ── */}
      <div className="mt-4 rounded-2xl border border-[#8a5a2b]/25 bg-[#f7efe2] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-black text-[#8a5a2b]">📋 اقلام فاکتور — سجل کالا (اختیاری)</p>
          <p className="text-[11px] font-black text-[#0e7a4a]">جمع: {faMoney(rowsTotal)} تومان</p>
        </div>
        <div className="space-y-2">
          {rows.map((r, idx) => {
            const flagged = r.returned || r.rejected || r.missing
            return (
              <div key={idx} className={cn('rounded-xl p-2', flagged ? 'bg-[#fee2e2]/80' : 'bg-white/85')}>
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <input
                      value={r.productName}
                      onChange={(e) => onRowName(idx, e.target.value)}
                      list="intake-product-opts"
                      className="w-full rounded-lg border border-input p-2 text-xs"
                      placeholder="نام کالا (انتخاب یا تایپ آزاد)"
                    />
                    <input
                      value={r.qty}
                      onChange={(e) => setRow(idx, { qty: e.target.value.replace(/[^\d.]/g, '') })}
                      className="w-full rounded-lg border border-input p-2 text-xs"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="مقدار"
                    />
                    <FaPriceInput
                      value={r.unitPrice === '' ? '' : Number(r.unitPrice)}
                      onChange={(v) => setRow(idx, { unitPrice: v === '' ? '' : String(v) })}
                      ariaLabel={`قیمت واحد ردیف ${idx + 1}`}
                      className="w-full rounded-lg border border-input p-2 text-xs"
                    />
                    <JalaliDatePicker value={r.expiry} onChange={(v) => setRow(idx, { expiry: v })} holidays={new Map()} compact warnHoliday={false} quickChips={false} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((_, i) => i !== idx)))}
                    aria-label="حذف ردیف"
                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#b3372f]/10 text-sm font-black text-[#b3372f]"
                  >
                    ✕
                  </button>
                </div>
                {/* پرچم‌های قرمز — برگشتی / مردود / نیامده */}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {([
                    ['returned', '↩️ برگشتی', 'returnReason'],
                    ['rejected', '⛔ مردود', 'rejectReason'],
                    ['missing', '📦 نیامده', ''],
                  ] as [keyof ItemRow, string, string][]).map(([key, label, reasonKey]) => {
                    const checked = Boolean(r[key])
                    return (
                      <span key={String(key)} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setRow(idx, { [key]: !checked } as Partial<ItemRow>)}
                          className={cn(
                            'rounded-lg px-2 py-1.5 text-[10px] font-black transition',
                            checked ? 'bg-[#b3372f] text-white' : 'bg-white/80 text-[#8a5a2b]',
                          )}
                        >
                          {label} {checked ? '✓' : ''}
                        </button>
                        {checked && reasonKey && (
                          <input
                            value={String(r[reasonKey as keyof ItemRow] || '')}
                            onChange={(e) => setRow(idx, { [reasonKey]: e.target.value } as Partial<ItemRow>)}
                            className="w-36 rounded-lg border border-input p-1.5 text-[10px]"
                            placeholder="دلیل…"
                          />
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <datalist id="intake-product-opts">
          {productOpts.map((o) => <option key={o.id} value={o.name} />)}
        </datalist>
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, emptyRow()])}
          className="mt-2 w-full rounded-xl border border-dashed border-[#8a5a2b]/40 bg-white/60 py-2.5 text-[11px] font-black text-[#8a5a2b]"
        >
          ＋ افزودن ردیف کالا
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          با ثبت اقلام، تاریخچهٔ هر کالا (خرید، انقضا، قیمت) به سجل کالا اضافه می‌شود و از تب «دفتر حسابداری» تا سند فیزیکی قابل ردیابی است؛ اقلام برگشتی/مردود/نیامده در پروندهٔ سند قرمز و با دلیل نمایش داده می‌شوند.
        </p>
      </div>

      <p className="mt-2 rounded-xl bg-[#fdf6dd]/70 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
        در حالت «پیشنهاد خودکار»، سامانه بر پایهٔ تطبیق موضوعی طرف حساب با دستهٔ زونکن‌ها (و در نبود تطبیق، کم‌ترین پرشدگی) جایگاه سند را تعیین و کد ماندگار می‌سازد؛ طرف حساب همچنین با فهرست تأمین‌کنندگان تطبیق داده می‌شود. سال مالی سند به‌صورت خودکار از تاریخ سند و مهلت نگهداری ۱۰ ساله (مادهٔ ۱۳ قانون تجارت) اعمال می‌گردد.
      </p>
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ثبت و تعیین جایگاه فیزیکی'}
      </button>
    </Modal>
  )
}

/** register a new binder (management) */
function BinderModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', groupName: '', cabinet: '۵', shelf: '۵', colorTag: '#0e7a4a', capacity: '250', notes: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const COLORS = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#8a5a2b', '#1e40af', '#6d28d9']

  const save = async () => {
    if (!form.title) return toast.error('عنوان زونکن الزامی است')
    setBusy(true)
    try {
      await api('/api/archive', { method: 'POST', body: { kind: 'binder', ...form, capacity: Number(form.capacity) || 250 } })
      toast.success('زونکن ثبت شد')
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="ثبت زونکن جدید" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="عنوان گروه اسناد *"><input value={form.title} onChange={(e) => set('title', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="مثلاً: فرآورده‌های گوشتی" /></Labeled>
        <Labeled label="دستهٔ موضوعی"><input value={form.groupName} onChange={(e) => set('groupName', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="مثلاً: پروتئینی" /></Labeled>
        <Labeled label="کابینت"><input value={form.cabinet} onChange={(e) => set('cabinet', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="طبقه"><input value={form.shelf} onChange={(e) => set('shelf', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="ظرفیت (سند)">
          <input
            value={form.capacity}
            onChange={(e) => set('capacity', e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]"
            dir="ltr"
            inputMode="numeric"
          />
        </Labeled>
        <Labeled label="رنگ عطف زونکن">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => set('colorTag', c)} className={cn('h-7 w-7 rounded-full transition', form.colorTag === c && 'ring-2 ring-offset-2 ring-[#8a5a2b]')} style={{ background: c }} aria-label={`رنگ ${c}`} />
            ))}
          </div>
        </Labeled>
      </div>
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ثبت زونکن'}
      </button>
    </Modal>
  )
}

/** تغییر نام کابینت یا طبقه — با اعمال CASCADE روی همهٔ زونکن‌ها (یک فراخوان سرور) */
function StructureRenameModal({ mode, cabinet, shelf, onClose, onSaved }: {
  mode: 'cabinet' | 'shelf'
  cabinet: string
  shelf?: string
  onClose: () => void
  onSaved: (to: string) => void
}) {
  const [value, setValue] = useState(shelf || cabinet)
  const [busy, setBusy] = useState(false)
  const save = () => {
    const v = value.trim()
    if (!v) return toast.error('نام جدید الزامی است')
    if (v === (shelf || cabinet)) return toast.error('نام جدید باید با نام فعلی تفاوت داشته باشد')
    setBusy(true)
    onSaved(v)
  }
  return (
    <Modal title={mode === 'cabinet' ? `تغییر نام کابینت «${cabinet}»` : `تغییر نام طبقهٔ «${shelf}» — کابینت ${cabinet}`} onClose={onClose}>
      <p className="rounded-xl bg-[#fdf6dd] p-3 text-[11px] font-bold text-[#8a5a2b]">
        {mode === 'cabinet'
          ? 'نام جدید برای همهٔ زونکن‌های این کابینت در یک عملیات اعمال می‌شود (CASCADE). اگر کابینتی با این نام موجود باشد، خطای تکراری می‌گیرید.'
          : 'نام جدید برای همهٔ زونکن‌های این طبقه اعمال می‌شود. اگر طبقه‌ای با این نام در همین کابینت موجود باشد، خطای تکراری می‌گیرید.'}
      </p>
      <Labeled label={mode === 'cabinet' ? 'نام جدید کابینت *' : 'نام جدید طبقه *'}>
        <input value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" autoFocus />
      </Labeled>
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'اعمال تغییر نام'}
      </button>
    </Modal>
  )
}

/** افزودن برچسب طبقهٔ خالی به یک کابینت — برای رزرو جای خالی در درخت ساختار */
function StructureAddShelfModal({ cabinet, onClose, onSaved }: { cabinet: string; onClose: () => void; onSaved: (shelf: string) => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const save = () => {
    const v = value.trim()
    if (!v) return toast.error('نام طبقه الزامی است')
    setBusy(true)
    onSaved(v)
  }
  return (
    <Modal title={`افزودن طبقهٔ جدید — کابینت ${cabinet}`} onClose={onClose}>
      <p className="rounded-xl bg-[#f3f6ec] p-3 text-[11px] font-bold text-[#0e7a4a]">
        طبقهٔ خالی در درخت ساختار نمایش داده می‌شود تا جای فیزیکی خالیِ قفسه هم در سامانه دیده شود.
      </p>
      <Labeled label="نام طبقه *">
        <input value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" autoFocus placeholder="مثلاً: ۶" />
      </Labeled>
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'افزودن طبقه'}
      </button>
    </Modal>
  )
}

/** ویرایش کامل زونکن — کد (تا قبل از نخستین سند)، شناسنامه، موقعیت فیزیکی، رنگ، ظرفیت، فعال/غیرفعال، حذف */
function BinderEditModal({ binder, onClose, onSaved }: { binder: Binder; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: binder.code, title: binder.title, groupName: binder.groupName, cabinet: binder.cabinet,
    shelf: binder.shelf, colorTag: binder.colorTag, capacity: String(binder.capacity), notes: binder.notes,
  })
  const [active, setActive] = useState(binder.active)
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const COLORS = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#8a5a2b', '#1e40af', '#6d28d9']

  const save = async () => {
    if (!form.title.trim()) return toast.error('عنوان زونکن الزامی است')
    setBusy(true)
    try {
      await api('/api/archive', {
        method: 'PATCH',
        body: { id: binder.id, ...form, capacity: Number(form.capacity) || 250, active },
      })
      toast.success('زونکن ویرایش شد')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`حذف کامل زونکن «${binder.title}»؟ فقط اگر هیچ سندی به آن الصاق نشده باشد انجام می‌شود.`)) return
    setBusy(true)
    try {
      await api(`/api/archive?id=${binder.id}`, { method: 'DELETE' })
      toast.success('زونکن حذف شد')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`ویرایش زونکن ${binder.code} — ${binder.title}`} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="کد زونکن" hint="فقط تا قبل از الصاق نخستین سند قابل تغییر است">
          <input value={form.code} onChange={(e) => set('code', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" />
        </Labeled>
        <Labeled label="عنوان گروه اسناد *"><input value={form.title} onChange={(e) => set('title', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="دستهٔ موضوعی"><input value={form.groupName} onChange={(e) => set('groupName', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="کابینت"><input value={form.cabinet} onChange={(e) => set('cabinet', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="طبقه"><input value={form.shelf} onChange={(e) => set('shelf', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="ظرفیت (سند)">
          <input value={form.capacity} onChange={(e) => set('capacity', e.target.value.replace(/\D/g, ''))} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" inputMode="numeric" />
        </Labeled>
        <Labeled label="رنگ عطف زونکن">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => set('colorTag', c)} className={cn('h-7 w-7 rounded-full transition', form.colorTag === c && 'ring-2 ring-offset-2 ring-[#8a5a2b]')} style={{ background: c }} aria-label={`رنگ ${c}`} />
            ))}
          </div>
        </Labeled>
        <Labeled label="وضعیت">
          <button type="button" onClick={() => setActive((a) => !a)} className={cn('w-full rounded-xl px-2.5 py-2 text-[12px] font-extrabold', active ? 'bg-[#0e7a4a]/10 text-[#0e7a4a]' : 'bg-muted text-muted-foreground')}>
            {active ? '✅ فعال — در چرخهٔ بایگانی' : '⏸ غیرفعال — بسته'}
          </button>
        </Labeled>
        <div className="sm:col-span-2">
          <Labeled label="یادداشت"><input value={form.notes} onChange={(e) => set('notes', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        </div>
      </div>
      <p className="rounded-xl bg-muted/50 p-2.5 text-[10px] font-bold text-muted-foreground">
        🔒 قاعدهٔ اسناد: {faNum(binder.docCount)} سند به این زونکن الصاق است{binder.docCount > 0 ? ' — تغییر کد و غیرفعال‌سازی مسدود است؛ اسناد را ابتدا جابه‌جا کنید' : ' — کد قابل تغییر است و حذف کامل مجاز است'}.
      </p>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex-1 rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
          {busy ? '…' : 'ذخیرهٔ تغییرات'}
        </button>
        {binder.docCount === 0 && (
          <button onClick={remove} disabled={busy} className="rounded-xl bg-[#b3372f]/10 px-4 py-3 text-sm font-extrabold text-[#b3372f] disabled:opacity-50">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </Modal>
  )
}

/** جابه‌جایی سند بین زونکن‌ها — جایگاه جدید (seq) خودکار = آخرین جایگاه + ۱ */
function MoveDocModal({ doc, binders, onClose, onSaved }: { doc: Doc; binders: Binder[]; onClose: () => void; onSaved: () => void }) {
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!target) return toast.error('زونکن مقصد را انتخاب کنید')
    setBusy(true)
    try {
      await api(`/api/archive/${doc.id}`, { method: 'PATCH', body: { action: 'move', binderId: target } })
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`جابه‌جایی سند ${doc.code} بین زونکن‌ها`} onClose={onClose} wide>
      <p className="rounded-xl bg-[#fdf6dd] p-3 text-[11px] font-bold text-[#8a5a2b]">
        📦 جایگاه جدید در زونکن مقصد خودکار (بعدی) تعیین می‌شود و رخداد MOVE در زنجیرهٔ custody ثبت می‌گردد — مسیر فیزیکی روی کارت سند به‌روز می‌شود.
      </p>
      <Labeled label="زونکن مقصد *">
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
          <option value="">— انتخاب زونکن مقصد —</option>
          {binders.map((b) => (
            <option key={b.id} value={b.id} disabled={b.id === doc.binderId}>
              {b.code} — {b.title} (کابینت {b.cabinet} / طبقهٔ {b.shelf} — {faNum(b.docCount)} سند){b.id === doc.binderId ? ' — موقعیت فعلی' : ''}
            </option>
          ))}
        </select>
      </Labeled>
      <p className="text-[10px] font-bold text-muted-foreground">موقعیت فعلی: زونکن {doc.binderCode} — جایگاه {faNum(doc.seq)}</p>
      <button onClick={save} disabled={busy || !target} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'جابه‌جایی سند'}
      </button>
    </Modal>
  )
}
