import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { buildBriefing, briefingDigest } from '@/lib/briefing'
import { formatJalaliShort } from '@/lib/jalali'

const MANAGERS = ['GM', 'OM', 'OWNER', 'ACC']

/**
 * GET /api/briefing            → live briefing payload (auto-archives today's snapshot on first view)
 * GET /api/briefing?archive=1  → list of archived snapshots
 * GET /api/briefing?id=xxx     → single archived snapshot (parsed data)
 */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MANAGERS.includes(me.role))
    return fail('صبح‌نامه فقط برای مدیران و حسابداری است', 403)

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (id) {
    const snap = await db.briefingSnapshot.findUnique({ where: { id } })
    if (!snap) return fail('نسخه آرشیو پیدا نشد', 404)
    return json({
      snapshot: {
        id: snap.id,
        forDate: snap.forDate,
        jalaliLabel: snap.jalaliLabel,
        createdByName: snap.createdByName,
        createdAt: snap.createdAt.toISOString(),
        data: JSON.parse(snap.data || '{}'),
      },
    })
  }

  if (searchParams.get('archive') === '1') {
    const snaps = await db.briefingSnapshot.findMany({ orderBy: { forDate: 'desc' }, take: 60 })
    return json({
      archive: snaps.map((s) => {
        let digest = { createdYesterday: 0, overdueOrders: 0, todayDeliveries: 0, dueCheques: 0 }
        try { digest = briefingDigest(JSON.parse(s.data || '{}')) } catch { /* keep zeros */ }
        return {
          id: s.id,
          forDate: s.forDate,
          jalaliLabel: s.jalaliLabel,
          createdByName: s.createdByName,
          createdAt: s.createdAt.toISOString(),
          digest,
        }
      }),
    })
  }

  const data = await buildBriefing()

  /* آرشیو خودکار صبحگاهی — اگر امروز هنوز نسخه‌ای ثبت نشده، همین اولین بازدید ثبتش می‌کند
   * (نسخه دستی مدیر را بازنویسی نمی‌کند) */
  const forDate = new Date().toISOString().slice(0, 10)
  const existing = await db.briefingSnapshot.findUnique({ where: { forDate } })
  let autoArchived = false
  if (!existing) {
    await db.briefingSnapshot.create({
      data: {
        forDate,
        jalaliLabel: data.todayLabel,
        data: JSON.stringify(data),
        createdById: me.id,
        createdByName: 'ذخیره خودکار صبحگاهی',
      },
    })
    autoArchived = true
  }

  return json({ ...data, autoArchived })
}

/** POST /api/briefing/save — archive today's briefing (one per day, re-save overwrites) */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MANAGERS.includes(me.role))
    return fail('فقط مدیران می‌توانند صبح‌نامه را آرشیو کنند', 403)

  const data = await buildBriefing()
  const forDate = new Date().toISOString().slice(0, 10)
  const existing = await db.briefingSnapshot.findUnique({ where: { forDate } })
  const payload = {
    forDate,
    jalaliLabel: data.todayLabel,
    data: JSON.stringify(data),
    createdById: me.id,
    createdByName: me.name,
  }
  const snap = existing
    ? await db.briefingSnapshot.update({ where: { forDate }, data: payload })
    : await db.briefingSnapshot.create({ data: payload })
  await logActivity(me, existing ? 'به‌روزرسانی آرشیو صبح‌نامه' : 'آرشیو صبح‌نامه', 'briefing', snap.id, formatJalaliShort(forDate))
  return json({ snapshot: { id: snap.id, forDate, jalaliLabel: data.todayLabel }, overwritten: !!existing }, 201)
}
