import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  لایهٔ داده — سوئیچ پویای «واقعی ⇄ سندباکس» (round-16)
 * ─────────────────────────────────────────────────────────────────────────────
 *  • پایگاه واقعی کسب‌وکار:   db/custom.db   (DATABASE_URL)
 *  • پایگاه سندباکس دمو:      db/sandbox.db (همان اسکیما + دادهٔ نمایشی «هایپر نمونه»)
 *  • نشانگر حالت:             db/.sandbox   (اگر موجود باشد → همهٔ کوئری‌ها به sandbox.db می‌روند)
 *
 *  چرا فایل نشانگر؟ چون هر استقرار SarResid یک کسب‌وکار واحد را سرو می‌کند؛ سوییچ
 *  سندباکس یک عمل مدیریتی سراسری است و با اطمینان کامل قابل بازگشت است — دادهٔ
 *  واقعی هرگز لمس نمی‌شود و هیچ رد دمو در سیستم واقعی باقی نمی‌ماند.
 *
 *  Proxy است که در هر فراخوانی کلاینت فعال را resolve می‌کند (کش ۲ ثانیه‌ای
 *  برای حذف ضربهٔ فایل‌سیستم). تمام کدهای موجود `db` را از همین ماژول
 *  import می‌کنند — بدون هیچ تغییری سندباکس را می‌بینند.
 */

const globalForPrisma = globalThis as unknown as {
  prismaReal: PrismaClient | undefined
  prismaSandbox: PrismaClient | undefined
}

const SANDBOX_MARKER = path.join(process.cwd(), 'db', '.sandbox')
const SANDBOX_DB_URL = 'file:/home/z/my-project/db/sandbox.db'
let markerCache: { at: number; active: boolean } | null = null

function sandboxActive(): boolean {
  if (markerCache && Date.now() - markerCache.at < 2_000) return markerCache.active
  let active = false
  try {
    active = fs.existsSync(SANDBOX_MARKER)
  } catch {
    active = false
  }
  markerCache = { at: Date.now(), active }
  return active
}

/** خروج از سندباکس — حذف نشانگر + پاک‌سازی کش (فقط سمت سرور) */
export function exitSandboxNow() {
  try {
    fs.rmSync(SANDBOX_MARKER, { force: true })
  } catch {}
  markerCache = null
}

/** ورود به سندباکس — نوشتن نشانگر (توسط /api/setup پس از آماده‌سازی sandbox.db) */
export function enterSandboxNow() {
  try {
    fs.writeFileSync(SANDBOX_MARKER, new Date().toISOString())
  } catch {}
  markerCache = null
}

export function isSandboxActive(): boolean {
  return sandboxActive()
}

function makeClient(): PrismaClient {
  return new PrismaClient({ log: ['query'] })
}

function realClient(): PrismaClient {
  if (!globalForPrisma.prismaReal) {
    globalForPrisma.prismaReal = makeClient()
  }
  return globalForPrisma.prismaReal
}

function sandboxClient(): PrismaClient {
  if (!globalForPrisma.prismaSandbox) {
    globalForPrisma.prismaSandbox = new PrismaClient({
      log: ['query'],
      datasources: { db: { url: SANDBOX_DB_URL } },
    })
  }
  return globalForPrisma.prismaSandbox
}

export function activeClient(): PrismaClient {
  return sandboxActive() ? sandboxClient() : realClient()
}

type DbTarget = PrismaClient
type DbProxy = DbTarget & { __isSandbox: () => boolean }

export const db = new Proxy({} as DbProxy, {
  get(_t, prop, receiver) {
    if (prop === '__isSandbox') return () => sandboxActive()
    const client = activeClient() as unknown as Record<string | symbol, unknown>
    const value = client[prop as string | symbol]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value
  },
}) as DbProxy

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaReal = globalForPrisma.prismaReal ?? realClient()
}
