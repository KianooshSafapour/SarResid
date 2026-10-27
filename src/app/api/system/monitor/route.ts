import { NextRequest } from 'next/server'
import os from 'os'
import fs from 'fs'
import { execFile } from 'child_process'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * R13 — GET /api/system/monitor — سنجه‌های زندهٔ سرور برای «پایش سرور».
 * فقط مالک/ادمین (مدیر سامانه). هر فراخوانی:
 *   cpu     — نمونه‌گیری دو مرحله‌ای (۲۵۰ms) از os.cpus → درصد مصرف
 *   mem     — total/free/used + rss پروسهٔ وب
 *   disk    — statfs مسیر اپ (ظرفیت/آزاد)
 *   db      — حجم فایل + تأخیر SELECT 1 + شمارش‌های کلیدی
 *   services — وضعیت systemd (اگر در لینوکسِ ریشه باشد) + پینگ TCP
 *              realtime (۳۰۳۰) و holoo-sim (۳۰۴۰)
 *   runtime — نسخهٔ bun/node، آپ‌تایم پروسه و سرور، لود ۱/۵/۱۵ دقیقه
 */

const MONITOR_ROLES = ['OWNER', 'ADMIN']

function promisifyExec(cmd: string, args: string[]): Promise<{ out: string; code: number | null }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
      resolve({ out: String(stdout ?? '').trim(), code: err ? ((err as { code?: number }).code ?? 1) : 0 })
    })
  })
}

/** پینگ TCP سبک — resolve در باز/بسته‌شدن */
function tcpPing(port: number, host = '127.0.0.1', ms = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net') as typeof import('net')
    const sock = new net.Socket()
    const done = (v: boolean) => {
      sock.destroy()
      resolve(v)
    }
    sock.setTimeout(ms, () => done(false))
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.connect(port, host)
  })
}

function cpuSnapshot(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const c of os.cpus()) {
    idle += c.times.idle
    total += c.times.idle + c.times.user + c.times.nice + c.times.sys + c.times.irq
  }
  return { idle, total }
}

async function dbPath(): Promise<string | null> {
  const url = process.env.DATABASE_URL || ''
  const m = url.match(/^file:(.+)$/)
  const candidates = m ? [m[1]] : ['db/custom.db', 'prisma/db/custom.db', 'db/custom.db']
  for (const raw of candidates) {
    const p = raw.replace(/^\.\//, '')
    try {
      fs.statSync(p)
      return p
    } catch {
      /* امتحان کاندید بعدی */
    }
  }
  return null
}

export async function GET(_req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MONITOR_ROLES.includes(me.role)) return fail('پایش سرور فقط برای مدیر سامانه (مالک/ادمین) است', 403)

  const started = Date.now()

  /* ── CPU: دو نمونه با فاصلهٔ ۲۵۰ms ── */
  const s1 = cpuSnapshot()
  await new Promise((r) => setTimeout(r, 250))
  const s2 = cpuSnapshot()
  const idleDelta = s2.idle - s1.idle
  const totalDelta = s2.total - s1.total
  const cpuPct = totalDelta > 0 ? Math.min(100, Math.max(0, ((totalDelta - idleDelta) / totalDelta) * 100)) : 0

  /* ── حافظه ── */
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const mu = process.memoryUsage()

  /* ── دیسک ── */
  let disk: Record<string, unknown> | null = null
  try {
    const fsPromises = fs.promises as typeof fs.promises & { statfs?: (p: string) => Promise<{ blocks: number; bsize: number; bavail: number; bfree: number }> }
    if (typeof fsPromises.statfs === 'function') {
      const st = await fsPromises.statfs(process.cwd())
      const total = st.blocks * st.bsize
      const free = st.bavail * st.bsize
      disk = {
        total,
        free,
        used: total - free,
        usedPct: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0,
        path: process.cwd(),
      }
    }
  } catch {
    disk = null
  }

  /* ── دیتابیس ── */
  let dbLatencyMs: number | null = null
  try {
    const t0 = Date.now()
    await db.$queryRaw`SELECT 1`
    dbLatencyMs = Date.now() - t0
  } catch {
    dbLatencyMs = null
  }
  let dbSize: number | null = null
  try {
    const p = await dbPath()
    dbSize = p ? fs.statSync(p).size : null
  } catch {
    dbSize = null
  }
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)
  const [productCount, userCount, orderToday, invoiceOpen, notifToday] = await Promise.all([
    db.product.count().catch(() => 0),
    db.user.count().catch(() => 0),
    db.order.count({ where: { createdAt: { gte: startToday } } }).catch(() => 0),
    db.marginInvoice.count({ where: { status: { in: ['draft', 'delivered', 'reviewing', 'final'] } } }).catch(() => 0),
    db.notification.count({ where: { createdAt: { gte: startToday } } }).catch(() => 0),
  ])

  /* ── سرویس‌ها ── (واحد systemd شبیه‌ساز «holoo-sim» است؛ بقیه sarresid-*) */
  const svcNames = ['sarresid-web', 'sarresid-realtime', 'holoo-sim']
  const services: { name: string; systemd: string | null; tcp: boolean; note?: string }[] = []
  const isLinux = process.platform === 'linux'
  for (const name of svcNames) {
    let systemd: string | null = null
    if (isLinux) {
      const r = await promisifyExec('systemctl', ['is-active', name])
      systemd = r.code === 0 && r.out ? r.out : (r.out || 'unknown')
    }
    services.push({ name, systemd, tcp: false })
  }
  /* پینگ پورت‌ها: realtime=3030، holoo-sim=3040 */
  const [rt, sim] = await Promise.all([tcpPing(3030), tcpPing(3040)])
  const svcBy = (n: string) => services.find((s) => s.name === n)
  if (svcBy('sarresid-realtime')) svcBy('sarresid-realtime')!.tcp = rt
  if (svcBy('holoo-sim')) svcBy('holoo-sim')!.tcp = sim
  if (svcBy('sarresid-web')) svcBy('sarresid-web')!.tcp = true /* خودِ همین درخواست زنده است */

  const load = os.loadavg()
  return ok({
    at: new Date().toISOString(),
    tookMs: Date.now() - started,
    cpu: {
      pct: Math.round(cpuPct * 10) / 10,
      cores: os.cpus().length,
      model: os.cpus()[0]?.model ?? '',
      load1: Math.round(load[0] * 100) / 100,
      load5: Math.round(load[1] * 100) / 100,
      load15: Math.round(load[2] * 100) / 100,
    },
    mem: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usedPct: totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : 0,
      rss: mu.rss,
      heapUsed: mu.heapUsed,
    },
    disk,
    db: {
      size: dbSize,
      latencyMs: dbLatencyMs,
      productCount,
      userCount,
      orderToday,
      invoiceOpen,
      notifToday,
    },
    services,
    runtime: {
      platform: `${os.platform()} ${os.arch()}`,
      hostname: os.hostname(),
      bun: typeof Bun !== 'undefined' ? Bun.version : null,
      node: process.version,
      processUptimeSec: Math.round(process.uptime()),
      serverUptimeSec: Math.round(os.uptime()),
    },
  })
}
