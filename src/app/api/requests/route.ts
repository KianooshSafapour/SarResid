import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/**
 * R16 — /api/requests — درخواست‌های کارکنان و پیگیری مشتری‌ها.
 * GET  ?status=&kind=&mine=1  → فهرست + شمارندها (همهٔ کارکنان واردشده؛ mine فقط خودم)
 * POST {kind,title,body?,priority?} → ثبت درخواست (هر کاربر واردشده) + اعلان به مدیران
 * PATCH {id, action: seen|approve|reject|done, note?} → پیشبردن گردش‌کار (نقش‌دار)
 */

const KINDS = ['NEW_PRODUCT', 'SUPPLY', 'REPAIR', 'SOFTWARE', 'CUSTOMER', 'OTHER'] as const
const STATUSES = ['SUBMITTED', 'SEEN', 'APPROVED', 'REJECTED', 'DONE'] as const
const HANDLER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC'] // زنجیرهٔ فرمان: مدیرعامل/مدیرکل/ادمین/عملیات

const KIND_FA: Record<string, string> = {
  NEW_PRODUCT: 'کالای جدید', SUPPLY: 'تأمین/خرید', REPAIR: 'تعمیر/تجهیز', SOFTWARE: 'نرم‌افزار/پلتفرم', CUSTOMER: 'پیگیری مشتری', OTHER: 'سایر',
}
const STATUS_FA: Record<string, string> = {
  SUBMITTED: 'ثبت‌شده — در انتظار بررسی', SEEN: 'دیده شد — در بررسی', APPROVED: 'تأیید شد — در حال انجام', REJECTED: 'رد شد', DONE: 'انجام شد',
}

type Ev = { at: string; by: string; action: string; detail?: string }
function pushEv(raw: string, ev: Ev): string {
  const list = safeJson<Ev[]>(raw, [])
  list.push({ at: ev.at || new Date().toISOString(), by: ev.by, action: ev.action, ...(ev.detail ? { detail: ev.detail } : {}) })
  return JSON.stringify(list.slice(-60))
}
const ACTION_FA: Record<string, string> = { create: 'ثبت درخواست', seen: 'دیده‌شد/شروع بررسی', approve: 'تأیید', reject: 'رد', done: 'انجام شد' }

async function nextCode(): Promise<string> {
  const last = await db.staffRequest.findFirst({ orderBy: { code: 'desc' } })
  let n = 100
  if (last) {
    const m = last.code.match(/REQ-(\d+)$/)
    if (m) n = Math.max(100, parseInt(m[1], 10) + 1)
  }
  return `REQ-${n}`
}

export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const sp = req.nextUrl.searchParams
  const status = (sp.get('status') ?? '').trim()
  const kind = (sp.get('kind') ?? '').trim()
  const mine = sp.get('mine') === '1'

  const where: Record<string, unknown> = {}
  if (status && (STATUSES as readonly string[]).includes(status)) where.status = status
  if (kind && (KINDS as readonly string[]).includes(kind)) where.kind = kind
  if (mine) where.requestedById = me.id

  const [rows, counts] = await Promise.all([
    db.staffRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.staffRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const byStatus: Record<string, number> = {}
  for (const c of counts) byStatus[c.status] = c._count._all

  return ok({
    requests: rows.map((r) => ({
      id: r.id, code: r.code, kind: r.kind, kindLabel: KIND_FA[r.kind] ?? r.kind,
      title: r.title, body: r.body, status: r.status, statusLabel: STATUS_FA[r.status] ?? r.status,
      priority: r.priority, requestedByName: r.requestedByName, handledByName: r.handledByName,
      resultNote: r.resultNote, createdAt: r.createdAt.toISOString(),
      history: (safeJson<Ev[]>(r.historyJson, [])).map((h) => ({ ...h, label: ACTION_FA[h.action] ?? h.action })),
      mine: r.requestedById === me.id,
    })),
    byStatus,
    canHandle: HANDLER_ROLES.includes(me.role),
    kinds: KINDS.map((k) => ({ key: k, label: KIND_FA[k] })),
  })
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return fail('درخواست نامعتبر است')
  const kind = String(body.kind ?? 'OTHER')
  if (!(KINDS as readonly string[]).includes(kind)) return fail('نوع درخواست نامعتبر است')
  const title = String(body.title ?? '').trim().slice(0, 160)
  if (title.length < 3) return fail('عنوان درخواست را حداقل با ۳ حرف بنویسید')
  const text = String(body.body ?? '').trim().slice(0, 2000) || null
  const priority = ['LOW', 'NORMAL', 'HIGH'].includes(String(body.priority)) ? String(body.priority) : 'NORMAL'
  const code = await nextCode()
  const now = new Date().toISOString()

  const r = await db.staffRequest.create({
    data: {
      code, kind, title, body: text, priority,
      requestedById: me.id, requestedByName: me.fullName,
      historyJson: JSON.stringify([{ at: now, by: me.fullName, action: 'create', detail: `${KIND_FA[kind]} — ${title}` }]),
    },
  })
  for (const role of HANDLER_ROLES) {
    await notify({
      role, kind: `request:new:${r.id}`, severity: priority === 'HIGH' ? 'warning' : 'info',
      title: 'درخواست جدید ثبت شد',
      body: `${code} — ${KIND_FA[kind]}: ${title} (از ${me.fullName}) — از «درخواست‌ها» پیگیری کنید.`,
      go: '#/tasks/requests',
    }).catch(() => {})
  }
  await logActivity({ userId: me.id, userName: me.fullName, action: 'request.create', actionLabel: 'ثبت درخواست', category: 'tasks', detail: `${code} — ${title}`, entityId: r.id })
  return ok({ id: r.id, code })
}

export async function PATCH(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!HANDLER_ROLES.includes(me.role)) return fail('پیشبردن درخواست فقط برای مدیران (زنجیرهٔ فرمان) ممکن است', 403)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = String(body?.id ?? '')
  const action = String(body?.action ?? '')
  if (!id || !['seen', 'approve', 'reject', 'done'].includes(action)) return fail('درخواست یا عملیات نامعتبر است')
  const r = await db.staffRequest.findUnique({ where: { id } })
  if (!r) return fail('درخواست یافت نشد', 404)
  if (r.status === 'DONE' || r.status === 'REJECTED') return fail('این درخواست بسته شده است')
  const note = String(body?.note ?? '').trim().slice(0, 500)
  if ((action === 'reject' || action === 'done') && note.length < 3) return fail('برای رد/انجام، توضیح نتیجه الزامی است (حداقل ۳ حرف)')
  const now = new Date().toISOString()
  const nextStatus = action === 'seen' ? 'SEEN' : action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'DONE'
  const updated = await db.staffRequest.update({
    where: { id },
    data: {
      status: nextStatus,
      handledById: me.id,
      handledByName: me.fullName,
      ...(action === 'reject' || action === 'done' ? { resultNote: note } : {}),
      historyJson: pushEv(r.historyJson, { at: now, by: me.fullName, action, detail: note || STATUS_FA[nextStatus] }),
    },
  })
  /* اعلان به ثبت‌کننده — گردش کار شفاف */
  await notify({
    userId: r.requestedById, kind: `request:${action}:${r.id}`,
    severity: action === 'reject' ? 'warning' : action === 'done' ? 'success' : 'info',
    title: `درخواست ${r.code}: ${STATUS_FA[nextStatus]}`,
    body: `${r.title} — توسط ${me.fullName}${note ? ` · ${note}` : ''}`,
    go: '#/tasks/requests',
  }).catch(() => {})
  await logActivity({ userId: me.id, userName: me.fullName, action: `request.${action}`, actionLabel: `درخواست — ${ACTION_FA[action]}`, category: 'tasks', detail: `${r.code} — ${note || ''}`.slice(0, 160), entityId: r.id })
  return ok({ id: updated.id, status: updated.status })
}
