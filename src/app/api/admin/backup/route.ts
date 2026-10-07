import { fail, getSessionUser, logActivity } from '@/lib/api-helpers'
import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

/**
 * دانلود نسخه پشتیبان دیتابیس (SQLite) — فقط مدیران.
 * فایل مستقیم از دیسک خوانده و با نام تاریخ‌دار دانلود می‌شود.
 */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!['OM', 'GM', 'OWNER'].includes(me.role)) return fail('دسترسی محدود', 403)

  const candidates = [
    path.join(process.cwd(), 'db', 'custom.db'),
    path.join(process.cwd(), 'db', 'dev.db'),
    path.join(process.cwd(), 'prisma', 'dev.db'),
    path.join(process.cwd(), 'db', 'data.db'),
  ]
  let dbPath = ''
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      dbPath = c
      break
    }
  }
  if (!dbPath) {
    const m = (process.env.DATABASE_URL || '').match(/^file:(.+)$/)
    if (m) {
      const p = path.join(process.cwd(), m[1].replace(/^\//, ''))
      if (fs.existsSync(p)) dbPath = p
    }
  }
  if (!dbPath) return fail('فایل دیتابیس پیدا نشد', 404)

  await logActivity(me, 'دریافت نسخه پشتیبان دیتابیس', 'system', 'backup')

  const buf = await fs.promises.readFile(dbPath)
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/x-sqlite3',
      'Content-Disposition': `attachment; filename="hyper-zeytoon-backup-${stamp}.db"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  })
}
