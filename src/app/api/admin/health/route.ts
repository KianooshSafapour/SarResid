import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'
import fs from 'fs'
import path from 'path'

/** System health snapshot for the Admin view — helps local-server operations */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!['OM', 'GM', 'OWNER'].includes(me.role)) return fail('دسترسی محدود', 403)

  const [users, activeUsers, orders, products, cheques, tasks, activities, messages, holidays] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { active: true } }),
    db.order.count(),
    db.product.count(),
    db.cheque.count(),
    db.task.count(),
    db.activityLog.count(),
    db.message.count(),
    db.holiday.count(),
  ])

  const lastActivity = await db.activityLog.findFirst({ orderBy: { createdAt: 'desc' } })

  // SQLite database file size
  let dbSizeBytes = 0
  let dbFile = ''
  try {
    const candidates = [
      path.join(process.cwd(), 'db', 'custom.db'),
      path.join(process.cwd(), 'db', 'dev.db'),
      path.join(process.cwd(), 'prisma', 'dev.db'),
      path.join(process.cwd(), 'db', 'data.db'),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        dbSizeBytes = fs.statSync(c).size
        dbFile = path.relative(process.cwd(), c)
        break
      }
    }
    if (!dbFile) {
      const envUrl = process.env.DATABASE_URL || ''
      const m = envUrl.match(/^file:(.+)$/)
      if (m) {
        const p = path.join(process.cwd(), m[1].replace(/^\//, ''))
        if (fs.existsSync(p)) {
          dbSizeBytes = fs.statSync(p).size
          dbFile = path.relative(process.cwd(), p)
        }
      }
    }
  } catch {
    /* ignore */
  }

  // holiday coverage: how far into the future the Jalali holidays go
  const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
  const futureHolidays = await db.holiday.count({ where: { date: { gte: new Date().toISOString().slice(0, 10) } } })

  return json({
    counts: { users, activeUsers, orders, products, cheques, tasks, activities, messages, holidays },
    lastActivity: lastActivity ? { at: lastActivity.createdAt, who: lastActivity.userName, what: lastActivity.action } : null,
    db: { file: dbFile, sizeBytes: dbSizeBytes },
    holidayCoverage: { futureHolidays, coveredThrough: nextYear },
    server: {
      node: process.version,
      env: process.env.NODE_ENV || 'development',
      uptimeSec: Math.round(process.uptime()),
      platform: process.platform,
    },
  })
}
