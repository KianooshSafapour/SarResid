import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

async function stats() {
  const rows = await db.productImage.findMany({ select: { bytes: true, hits: true, createdAt: true } })
  const files = rows.length
  const totalBytes = rows.reduce((s, r) => s + r.bytes, 0)
  const hits = rows.reduce((s, r) => s + r.hits, 0)

  // misses counter lives in Setting (rows alone cannot express purged downloads)
  const row = await db.setting.findUnique({ where: { key: 'img_stats' } })
  let misses = 0
  if (row) {
    try {
      const parsed = JSON.parse(row.value)
      misses = Number(parsed?.misses) || 0
    } catch {
      misses = 0
    }
  }

  const times = rows.map((r) => r.createdAt.getTime()).filter((t) => !isNaN(t))
  const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0
  return {
    files,
    totalBytes,
    hits,
    misses,
    hitRate,
    oldestAt: times.length ? Math.min(...times) : null,
    newestAt: times.length ? Math.max(...times) : null,
  }
}

/** GET /api/img/stats — live shape: {files, totalBytes, hits, misses, hitRate, oldestAt, newestAt} (epoch ms) */
export async function GET(_req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  return ok(await stats())
}

/** POST /api/img/stats {action:"purge"} → {stats, purged} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') return fail('پاک‌سازی فقط برای مدیر ارشد/عملیات ممکن است', 403)

  const body = await req.json().catch(() => null)
  if (body?.action !== 'purge') return fail('عملیات ناشناخته است')

  const result = await db.productImage.deleteMany({})
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'img_purge',
    actionLabel: 'پاک‌سازی حافظه نهان تصاویر',
    category: 'system',
    detail: `${result.count} فایل از حافظه نهان حذف شد`,
  })
  return ok({ stats: await stats(), purged: result.count })
}
