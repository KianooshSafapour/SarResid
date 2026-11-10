import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { todayJalaliDash, parseJalaliDash, jalaliToDate, formatJalaliDash, toFaDigits, addDaysJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

export const FINANCE_ROLES = ['OWNER', 'GM', 'ADMIN', 'ACC']
export const SIGN_ROLES = ['OWNER', 'GM', 'ADMIN'] // hasCap('signCheques') incl. owner-style override list

/** کلید KV برای اطلاعات گیرنده/صدور هر چک (بدون تغییر اسکیمای Cheque) */
export const metaKey = (id: string) => `cheque:meta:${id}`

export interface ChequeMeta {
  receiverName?: string
  receiverPhone?: string
  issuedAt?: string // Jalali YYYY-MM-DD (تاریخ صدور)
  issuedTime?: string // HH:MM (ساعت صدور)
  orderId?: string
  orderCode?: string
  note?: string
}

export function sanitizeMeta(raw: unknown): ChequeMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const str = (v: unknown, max = 60) => String(v ?? '').trim().slice(0, max) || undefined
  const time = String(b.issuedTime ?? '').trim()
  const m: ChequeMeta = {
    receiverName: str(b.receiverName, 80),
    receiverPhone: (str(b.receiverPhone, 20) ?? '').replace(/[^\d+]/g, '') || undefined,
    issuedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(b.issuedAt ?? '').replace(/\//g, '-')) ? String(b.issuedAt ?? '').replace(/\//g, '-') : undefined,
    issuedTime: /^\d{2}:\d{2}$/.test(time) ? time : undefined,
    orderId: str(b.orderId, 40),
    orderCode: str(b.orderCode, 40),
    note: str(b.note, 300),
  }
  const out: ChequeMeta = {}
  for (const k of Object.keys(m) as (keyof ChequeMeta)[]) if (m[k] !== undefined) out[k] = m[k]
  return Object.keys(out).length ? out : null
}

export async function upsertChequeMeta(id: string, meta: ChequeMeta | null) {
  const key = metaKey(id)
  if (!meta) {
    await db.setting.deleteMany({ where: { key } })
    return
  }
  await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(meta) },
    update: { value: JSON.stringify(meta) },
  })
}

export async function loadChequeMetas(ids: string[]): Promise<Record<string, ChequeMeta>> {
  if (!ids.length) return {}
  const rows = await db.setting.findMany({ where: { key: { in: ids.map(metaKey) } } })
  const out: Record<string, ChequeMeta> = {}
  for (const r of rows) {
    const id = r.key.slice('cheque:meta:'.length)
    const parsed = safeJson<ChequeMeta>(r.value, null as unknown as ChequeMeta)
    if (parsed && typeof parsed === 'object') out[id] = parsed
  }
  return out
}

/** '1405-07-30' → '۱۴۰۵/۰۷/۳۰' (نمایش فارسی با ممیز) */
function faSlashDash(d: string): string {
  return toFaDigits(String(d || '').replace(/-/g, '/'))
}

/**
 * ارزیابی تنبل «چک امضا شده اما برداشت نشده» —
 * چک‌های SIGNED که سررسیدشان گذشته → UNCOLLECTED + اعلان یک‌بارمصرف به مدیر کل.
 * kind اعلان شامل شناسه چک است → اجرای مجدد هیچ اعلان تکراری نمی‌سازد.
 */
export async function markUncollectedCheques(byName: string): Promise<number> {
  const today = todayJalaliDash()
  const stale = await db.cheque.findMany({
    where: { status: 'SIGNED', dueDate: { lt: today } },
    select: { id: true, number: true, amount: true, dueDate: true, historyJson: true },
  })
  if (!stale.length) return 0
  let made = 0
  for (const row of stale) {
    const kind = `cheque:uncollected:${row.id}`
    const exists = await db.notification.findFirst({ where: { kind }, select: { id: true } })
    if (!exists) {
      await db.notification.create({
        data: {
          role: 'GM',
          kind,
          severity: 'warning',
          title: 'چک امضا شده اما برداشت نشده',
          body: `چک ${row.number} به مبلغ ${toFaDigits(String(Math.round(row.amount)))} ریال با سررسید ${faSlashDash(row.dueDate)} گذشته و هنوز برداشت/تحویل نشده است — پیگیری کنید.`,
          go: '#/finance/cheques',
        },
      })
      made++
    }
    const history = safeJson<HistoryEntry[]>(row.historyJson, [])
    history.push({
      at: new Date().toISOString(),
      by: 'سامانه',
      action: 'uncollected',
      detail: `سررسید گذشته و چک برداشت نشده — علامت‌گذاری خودکار (${byName})`,
    })
    await db.cheque.update({
      where: { id: row.id },
      data: { status: 'UNCOLLECTED', historyJson: JSON.stringify(history) },
    })
  }
  if (made) {
    await logActivity({
      userId: null,
      userName: 'سامانه',
      action: 'cheque.uncollected',
      actionLabel: 'چک‌های برداشت‌نشده',
      category: 'finance',
      detail: `${made} چک امضا شده با سررسید گذشته → «برداشت‌نشده»`,
    })
  }
  return stale.length
}

export interface HistoryEntry {
  at: string
  by: string
  action: string
  detail?: string
}

export function daysLeftOf(dueDate: string): number {
  try {
    const a = parseJalaliDash(dueDate)
    const b = parseJalaliDash(todayJalaliDash())
    const da = jalaliToDate(a.jy, a.jm, a.jd)
    const db = jalaliToDate(b.jy, b.jm, b.jd)
    return Math.round((da.getTime() - db.getTime()) / 86400000)
  } catch {
    return 0
  }
}

function monthLabelNow(): string {
  const t = todayJalaliDash()
  const jy = Number(t.slice(0, 4))
  const jm = Number(t.slice(5, 7))
  return `${JALALI_MONTHS[jm - 1]} ${toFaDigits(jy)}`
}

export { monthLabelNow }

export interface ChequeRow {
  id: string
  number: string
  amount: number
  status: string
  recipient: string | null
  sayadSerial: string | null
  selfIssued: boolean
  writtenAt: string | null
  dueDate: string
  note: string | null
  orderCode: string | null
  historyJson: string
  createdAt: Date
  updatedAt: Date
}

export function chequeOut(c: ChequeRow): Record<string, unknown> {
  return {
    id: c.id,
    number: c.number,
    amount: c.amount,
    status: c.status,
    recipient: c.recipient,
    sayadSerial: c.sayadSerial,
    selfIssued: c.selfIssued,
    writtenAt: c.writtenAt,
    dueDate: c.dueDate,
    note: c.note,
    orderCode: c.orderCode,
    history: safeJson<HistoryEntry[]>(c.historyJson, []),
    daysLeft: daysLeftOf(c.dueDate),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

/** خلاصه وضعیت‌های فعال برای کارت سررسیدهای پیش‌رو */
const ACTIVE_STATUSES = ['PENDING_OWNER', 'SIGNED', 'DELIVERED', 'UNCOLLECTED']

/** stats are always computed over the whole cheque book (matches live capture) */
async function chequeStats() {
  const all = await db.cheque.findMany({ select: { status: true, amount: true, updatedAt: true, dueDate: true } })
  const monthKey = todayJalaliDash().slice(0, 7)
  const today = todayJalaliDash()
  const bucket = (statuses: string[]) => {
    const rows = all.filter((c) => statuses.includes(c.status))
    return { count: rows.length, amount: rows.reduce((s, c) => s + c.amount, 0) }
  }
  const clearedMonth = all.filter(
    (c) => c.status === 'CLEARED' && formatJalaliDash(c.updatedAt).slice(0, 7) === monthKey,
  )
  // «نگارش‌شده» = کل دفتر چک · «در انتظار امضا/دریافت» = منتظر امضا یا تحویل به گیرنده
  // «دریافت/وصول‌شده» = تحویل شده یا از بانک وصول شده
  const active = all.filter((c) => ACTIVE_STATUSES.includes(c.status) && c.dueDate >= today)
  const dueBucket = (predicate: (due: string) => boolean) => {
    const rows = active.filter((c) => predicate(c.dueDate))
    return { count: rows.length, amount: rows.reduce((s, c) => s + c.amount, 0) }
  }
  const tomorrow = addDaysJalaliDash(today, 1)
  const weekEnd = addDaysJalaliDash(today, 7)
  return {
    pendingOwner: bucket(['PENDING_OWNER']),
    inTransit: bucket(['SIGNED', 'DELIVERED']),
    clearedThisMonth: {
      count: clearedMonth.length,
      amount: clearedMonth.reduce((s, c) => s + c.amount, 0),
    },
    bouncedRejected: bucket(['BOUNCED', 'REJECTED', 'RETURNED']),
    total: { count: all.length },
    // ── R5-G: کارت‌های جدید (خط ۱۳۵ new-4.txt) ──
    written: { count: all.length, amount: all.reduce((s, c) => s + c.amount, 0) },
    awaiting: bucket(['PENDING_OWNER', 'SIGNED']),
    received: bucket(['DELIVERED', 'CLEARED']),
    uncollected: bucket(['UNCOLLECTED']),
    due: {
      today: dueBucket((d) => d === today),
      tomorrow: dueBucket((d) => d === tomorrow),
      week: dueBucket((d) => d >= today && d <= weekEnd),
      month: dueBucket((d) => d >= today && d.slice(0, 7) === today.slice(0, 7)),
    },
  }
}

/** GET /api/cheques?status=&q= → {items, stats} — + ارزیابی تنبل «برداشت‌نشده» */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(me, 'finance/cheques')
  if (!gate.ok) return fail(gate.deny, 403)

  const url = new URL(req.url)
  const status = (url.searchParams.get('status') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()

  const where: Record<string, unknown> = {}
  if (status) {
    const list = status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (list.length) where.status = { in: list }
  }
  if (q) {
    where.OR = [
      { number: { contains: q } },
      { recipient: { contains: q } },
      { orderCode: { contains: q } },
      { sayadSerial: { contains: q } },
      { note: { contains: q } },
    ]
  }

  // ارزیابی تنبل (idempotent): چک‌های امضا شده با سررسید گذشته → UNCOLLECTED + اعلان یک‌بار به مدیر کل
  try { await markUncollectedCheques(me.fullName) } catch { /* never block the list */ }

  const rows = await db.cheque.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  })
  const metas = await loadChequeMetas(rows.map((r) => r.id))

  return ok({ items: rows.map((r) => ({ ...chequeOut(r), meta: metas[r.id] || null })), stats: await chequeStats() })
}

/** POST /api/cheques — {number, amount, dueDate, recipient, selfIssued, sayadSerial?, orderCode?, note?, writtenAt?, meta?} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(me, 'finance/cheques')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const number = String(body.number ?? '').trim()
  if (!number) return fail('شماره چک را وارد کنید')
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('مبلغ چک را وارد کنید')
  const dueDate = String(body.dueDate ?? '').trim().replace(/\//g, '-')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail('تاریخ سررسید را وارد کنید')

  const recipient = String(body.recipient ?? '').trim() || null
  const selfIssued = body.selfIssued === undefined ? true : !!body.selfIssued
  const sayadSerial = String(body.sayadSerial ?? '').trim() || null
  const orderCode = String(body.orderCode ?? '').trim() || null
  const note = String(body.note ?? '').trim() || null
  const writtenAt = /^\d{4}-\d{2}-\d{2}$/.test(String(body.writtenAt ?? '').replace(/\//g, '-'))
    ? String(body.writtenAt).replace(/\//g, '-')
    : todayJalaliDash()
  const meta = sanitizeMeta(body.meta)

  const history: HistoryEntry[] = [
    {
      at: new Date().toISOString(),
      by: me.fullName,
      action: 'create',
      detail: selfIssued ? 'چک صادره (منتشرشده توسط فروشگاه)' : 'چک دریافتنی از مشتری/طرف حساب',
    },
  ]

  const created = await db.cheque.create({
    data: {
      number,
      amount,
      status: 'PENDING_OWNER',
      recipient,
      sayadSerial,
      selfIssued,
      writtenAt,
      dueDate,
      note,
      orderCode,
      historyJson: JSON.stringify(history),
    },
  })
  if (meta) await upsertChequeMeta(created.id, { ...meta, orderCode: meta.orderCode || orderCode || undefined })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'cheque.create',
    actionLabel: 'ثبت چک',
    category: 'finance',
    detail: `${number} — ${toFaDigits(String(amount))} ریال — سررسید ${faSlashDash(dueDate)}`,
    entityId: created.id,
  })
  // R5-G: جهت درست گردش کار — ثبت مدیر کل → تأیید و امضای «مالک» (owner flow)
  await db.notification.create({
    data: {
      role: 'OWNER',
      kind: 'cheque',
      severity: 'info',
      title: 'چک جدید در انتظار تأیید و امضا',
      body: `${number} — سررسید ${faSlashDash(dueDate)} — ثبت‌شده توسط ${me.fullName}`,
      go: '#/finance/cheques',
    },
  })

  return ok({ ...chequeOut(created as unknown as ChequeRow), meta: meta || null })
}
