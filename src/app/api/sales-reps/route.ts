import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'
import { isExecRole } from '@/lib/constants'

/**
 * دفتر اشخاص (round-15) — نمایندگان، راننده‌ها، حسابدارها، بازرس‌ها، مالکان ملک و…
 * Sales reps registry: every document event (cheque pickup, POS payment, returns,
 * rejected/missing items) records WHICH person handled it — so the stats here are
 * computed from the append-only DocEvent ledger (distinct docs, last seen, collected).
 * ثبت یک‌بار، همیشه در تاریخچه — حذفِ اشخاصِ دارای رخداد فقط غیرفعال‌سازی است.
 */

const KINDS = ['REP', 'DRIVER', 'ACCOUNTANT', 'MANAGER', 'CONTACT', 'INSPECTOR', 'LANDLORD', 'OTHER']

/** kinds غیر-تأمین‌کننده: شرکت به‌صورت آزاد تایپ می‌شود (نه انتخاب از دفتر تأمین‌کنندگان) */
const NON_PROVIDER_KINDS = ['CONTACT', 'INSPECTOR', 'LANDLORD', 'OTHER']

const MOBILE_RE = /^[0-9+\-\s()۰-۹]{7,16}$/

function validBirthday(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function parseJsonArr(s: string): string[] {
  try {
    const arr = JSON.parse(s || '[]')
    return Array.isArray(arr) ? arr.map((x: any) => String(x)).filter(Boolean) : []
  } catch {
    return []
  }
}

/** آیا کاربر مجاز به تغییر دفتر اشخاص است؟ (cap people/archive یا حسابدار یا نقش اجرایی) */
async function canManage(me: { id: string; role: string; secondaryRoles: string[]; roleIds?: string } | null): Promise<boolean> {
  if (!me) return false
  if (me.role === 'ACC') return true
  if (isExecRole(me.role)) return true
  if (await hasCap(me as any, 'people.manage')) return true
  return hasCap(me as any, 'archive.manage')
}

/** providerName را از دفتر تأمین‌کنندگان کامل کن (SSOT) */
async function resolveProviderName(providerId: string, fallback: string): Promise<string> {
  if (!providerId) return fallback
  const p = await db.provider.findUnique({ where: { id: providerId } })
  return p?.name || fallback
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'archive')) && !(await canViewApi(me, 'people')))
    return fail('دسترسی به دفتر اشخاص را ندارید', 403)

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const kind = (url.searchParams.get('kind') || '').trim()
  const providerId = (url.searchParams.get('providerId') || '').trim()
  const includeInactive = url.searchParams.get('all') === '1'

  const where: Record<string, unknown> = {}
  if (!includeInactive) where.active = true
  if (kind && KINDS.includes(kind)) where.kind = kind
  if (providerId) where.providerId = providerId
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { providerName: { contains: q } },
      { company: { contains: q } },
      { mobile: { contains: q } },
      { nationalId: { contains: q } },
      { jobRole: { contains: q } },
    ]
  }

  const reps = await db.salesRep.findMany({
    where,
    orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
  })

  // ── per-rep activity stats from the append-only DocEvent ledger ──
  const events = await db.docEvent.findMany({
    select: { repId: true, docId: true, kind: true, amount: true, at: true },
  })
  type Acc = { docIds: Set<string>; lastSeen: string; totalCollected: number; eventCount: number }
  const acc = new Map<string, Acc>()
  for (const e of events) {
    if (!e.repId) continue
    let a = acc.get(e.repId)
    if (!a) {
      a = { docIds: new Set(), lastSeen: '', totalCollected: 0, eventCount: 0 }
      acc.set(e.repId, a)
    }
    if (e.docId) a.docIds.add(e.docId)
    if ((e.at || '') > a.lastSeen) a.lastSeen = e.at || ''
    a.eventCount++
    if (String(e.kind).startsWith('PAYMENT')) a.totalCollected += Number(e.amount) || 0
  }
  // docs where the rep is attached directly (edited/intake) also count as handled
  const repDocs = await db.archiveDoc.findMany({ where: { repId: { not: '' } }, select: { id: true, repId: true } })
  for (const d of repDocs) {
    let a = acc.get(d.repId)
    if (!a) {
      a = { docIds: new Set(), lastSeen: '', totalCollected: 0, eventCount: 0 }
      acc.set(d.repId, a)
    }
    a.docIds.add(d.id)
  }

  return json({
    reps: reps.map((r) => {
      const a = acc.get(r.id)
      return {
        ...r,
        tags: parseJsonArr(r.tags),
        providerHistory: parseJsonArr(r.providerHistory),
        docCount: a ? a.docIds.size : 0,
        lastSeen: a?.lastSeen || '',
        totalCollected: a?.totalCollected || 0,
        eventCount: a?.eventCount || 0,
      }
    }),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('ثبت شخص نیازمند دسترسی مدیریت دفتر اشخاص است', 403)

  const body = await req.json()
  const fullName = String(body.fullName || '').trim()
  if (!fullName) return fail('نام شخص الزامی است', 400)
  const mobile = String(body.mobile || '').trim()
  if (mobile && !MOBILE_RE.test(mobile)) return fail('شمارهٔ موبایل معتبر نیست', 400)
  const birthday = String(body.birthday || '').trim()
  if (birthday && !validBirthday(birthday)) return fail('تاریخ تولد باید به شکل جلالی yyyy-mm-dd باشد', 400)
  const kind = KINDS.includes(String(body.kind)) ? String(body.kind) : 'REP'

  const providerId = NON_PROVIDER_KINDS.includes(kind) ? '' : String(body.providerId || '').trim()
  const providerName = await resolveProviderName(providerId, NON_PROVIDER_KINDS.includes(kind) ? String(body.company || '').trim() : String(body.providerName || '').trim())

  // dedupe — records management: no silent duplicates (409 with the existing person's name)
  if (mobile) {
    const dup = await db.salesRep.findFirst({ where: { fullName, mobile } })
    if (dup) return fail(`شخص تکراری است — «${dup.fullName}» با همین موبایل از قبل در دفتر ثبت شده است`, 409)
  }

  const tags = (Array.isArray(body.tags) ? body.tags : []).map((t: any) => String(t).trim()).filter(Boolean)

  const rep = await db.salesRep.create({
    data: {
      fullName,
      mobile,
      phone2: String(body.phone2 || '').trim(),
      email: String(body.email || '').trim(),
      address: String(body.address || '').trim(),
      birthday,
      kind,
      company: NON_PROVIDER_KINDS.includes(kind) ? String(body.company || '').trim() : '',
      providerId,
      providerName,
      jobRole: String(body.jobRole || '').trim(),
      nationalId: String(body.nationalId || '').trim(),
      notes: String(body.notes || ''),
      tags: JSON.stringify(tags),
    },
  })
  await logActivity(me, 'ثبت شخص در دفتر اشخاص', 'sales-rep', rep.id, `${fullName}${providerName ? ` — ${providerName}` : ''}`)
  return json({ rep: { ...rep, tags, providerHistory: [] } }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('ویرایش شخص نیازمند دسترسی مدیریت دفتر اشخاص است', 403)

  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '')
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const repId = id || String(body?.id || '')
  if (!repId) return fail('شناسهٔ شخص الزامی است', 400)
  const rep = await db.salesRep.findUnique({ where: { id: repId } })
  if (!rep) return fail('شخص یافت نشد', 404)

  const data: Record<string, unknown> = {}
  if (body.fullName !== undefined && String(body.fullName).trim()) data.fullName = String(body.fullName).trim()
  if (body.mobile !== undefined) {
    const mobile = String(body.mobile || '').trim()
    if (mobile && !MOBILE_RE.test(mobile)) return fail('شمارهٔ موبایل معتبر نیست', 400)
    data.mobile = mobile
  }
  if (body.phone2 !== undefined) data.phone2 = String(body.phone2 || '').trim()
  if (body.email !== undefined) data.email = String(body.email || '').trim()
  if (body.address !== undefined) data.address = String(body.address || '').trim()
  if (body.birthday !== undefined) {
    const birthday = String(body.birthday || '').trim()
    if (birthday && !validBirthday(birthday)) return fail('تاریخ تولد باید به شکل جلالی yyyy-mm-dd باشد', 400)
    data.birthday = birthday
  }
  if (body.kind !== undefined && KINDS.includes(String(body.kind))) data.kind = String(body.kind)
  if (body.jobRole !== undefined) data.jobRole = String(body.jobRole || '').trim()
  if (body.nationalId !== undefined) data.nationalId = String(body.nationalId || '').trim()
  if (body.notes !== undefined) data.notes = String(body.notes || '')
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.tags !== undefined) {
    const tags = (Array.isArray(body.tags) ? body.tags : []).map((t: any) => String(t).trim()).filter(Boolean)
    data.tags = JSON.stringify([...new Set(tags)])
  }

  const nextKind = (data.kind as string) || rep.kind
  const isNonProviderKind = NON_PROVIDER_KINDS.includes(nextKind)

  if (body.providerId !== undefined || body.company !== undefined) {
    const newProviderId = isNonProviderKind ? '' : body.providerId !== undefined ? String(body.providerId || '').trim() : rep.providerId
    const newCompany = isNonProviderKind && body.company !== undefined ? String(body.company || '').trim() : isNonProviderKind ? rep.company : ''
    data.providerId = newProviderId
    data.company = newCompany
    if (newProviderId !== rep.providerId || newProviderId) {
      data.providerName = await resolveProviderName(newProviderId, newCompany || (body.providerName !== undefined ? String(body.providerName).trim() : rep.providerName))
    }
  } else if (body.providerName !== undefined) {
    data.providerName = String(body.providerName || '').trim()
  }

  // providerName / providerId change → close the previous tenure into the append-only provider history
  const newProviderName = (data.providerName as string) ?? rep.providerName
  if (newProviderName !== rep.providerName) {
    const history = parseJsonArr(rep.providerHistory).map((h: any) => (typeof h === 'object' && h ? h : { providerName: String(h) }))
    if (rep.providerName) {
      const from = (history.length && history[history.length - 1]?.to) || rep.createdAt.toISOString().slice(0, 10)
      history.push({ providerName: rep.providerName, from, to: new Date().toISOString().slice(0, 10) })
    }
    data.providerHistory = JSON.stringify(history)
    data.providerName = newProviderName
  }

  const updated = await db.salesRep.update({ where: { id: repId }, data })
  await logActivity(me, 'ویرایش شخص در دفتر اشخاص', 'sales-rep', repId, `${updated.fullName}${updated.providerName ? ` — ${updated.providerName}` : ''}`)
  return json({ rep: { ...updated, tags: parseJsonArr(updated.tags), providerHistory: parseJsonArr(updated.providerHistory) } })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('حذف شخص نیازمند دسترسی مدیریت دفتر اشخاص است', 403)

  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '')
  if (!id) return fail('شناسهٔ شخص الزامی است', 400)
  const rep = await db.salesRep.findUnique({ where: { id } })
  if (!rep) return fail('شخص یافت نشد', 404)

  // records-management rule: a person referenced by the event ledger is never hard-deleted
  const used = (await db.docEvent.count({ where: { repId: id } })) > 0 || (await db.archiveDoc.count({ where: { repId: id } })) > 0
  if (used) {
    await db.salesRep.update({ where: { id }, data: { active: false } })
    await logActivity(me, 'غیرفعال‌سازی شخص (دارای رخداد ثبت‌شده)', 'sales-rep', id, rep.fullName)
    return json({ ok: true, mode: 'soft', message: 'این شخص دارای رخداد ثبت‌شده است — غیرفعال شد (تاریخچه محفوظ ماند)' })
  }
  await db.salesRep.delete({ where: { id } })
  await logActivity(me, 'حذف شخص بدون رخداد', 'sales-rep', id, rep.fullName)
  return json({ ok: true, mode: 'hard' })
}
