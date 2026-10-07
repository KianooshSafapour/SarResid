import { db, isSandboxActive, enterSandboxNow, exitSandboxNow } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { isExecRole } from '@/lib/constants'
import { currentLicense, invalidateLicenseCache, invalidateRoleCache } from '@/lib/rbac'
import { parseLicense, S_LICENSE, type LicenseState, type LicenseTier } from '@/lib/license'
import fs from 'fs'
import path from 'path'

/* ─────────────────────────────────────────────────────────────────────────────
 *  جادوگر نصب SarResid (round-16)
 *  GET  ?status=1 → {done, sandbox, business, license} (بدون session برای اولین اجرا)
 *  GET  ?preset=hz&key=… → پیش‌تنظیم مخفی هایپر زیتون (نام‌ها قابل ویرایش در ویزارد)
 *  POST action:
 *    complete  → ثبت پروفایل کسب‌وکار + لایسنس (+ ساخت کاربران اولیه برای مشتری جدید)
 *    license   → ویرایش لایسنس (فقط OWNER/ADMIN روت)
 *    sandbox-enter | sandbox-exit | sandbox-reset | rename-team | set-hzkey
 *  نکتهٔ جلسه (session): توکن در دیتابیس واقعی امضا شده؛ وقتی سندباکس فعال است
 *  lookup کاربر ناموفق است — برای «خروج از سندباکس» امضای توکن کافی است
 *  (خروج هیچ داده‌ای را تغییر نمی‌دهد) یا کلید مخفی hzKey به‌عنوان خروج اضطراری.
 * ────────────────────────────────────────────────────────────────────────────*/

const S_SETUP = 'setup.profile'
const S_DONE = 'setup.done'
const S_HZKEY = 'setup.hzKey'
const DEFAULT_HZ_KEY = 'zeytoon-1404'

/** احراز برای عملیات سندباکس: session معتبر (هر نقشی) یا توکن امضاشدهٔ معتبر یا کلید مخفی */
async function authForSandbox(req: Request, bodyKey: string): Promise<boolean> {
  try {
    const me = await getSessionUser(req)
    if (me) return true
  } catch {}
  // توکن امضاشدهٔ معتبر (کاربر واقعی که session‌اش در سندباکس resolve نمی‌شود)
  const token = req.headers.get('x-session-token') || ''
  if (token) {
    const { parseToken } = await import('@/lib/api-helpers')
    if (parseToken(token)) return true
  }
  // خروج اضطراری با کلید مخفی (مثلاً از صفحهٔ لاگین سندباکس)
  if (bodyKey) {
    const keyRow = await db.setting.findUnique({ where: { key: S_HZKEY } }).catch(() => null)
    if (bodyKey === (keyRow?.value || DEFAULT_HZ_KEY)) return true
  }
  return false
}

const TIER_MODULE_SET: Record<string, boolean> = {
  accounting: true, cheques: true, archive: true, payroll: true, planogram: true, crm: true, analytics: true,
}

function dbPath(name: string): string {
  return path.join(process.cwd(), 'db', name)
}

/** ساخت sandbox.db تازه از قالب — قالب در زمان ساخت محصول با دادهٔ دمو بذر شده */
function prepareSandboxDb(): { ok: boolean; error?: string } {
  const tpl = dbPath('sandbox-template.db')
  const target = dbPath('sandbox.db')
  try {
    if (!fs.existsSync(tpl)) {
      return { ok: false, error: 'قالب سندباکس یافت نشد (db/sandbox-template.db)' }
    }
    fs.copyFileSync(tpl, target)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'کپی قالب ناموفق بود' }
  }
}

async function readJsonSetting(key: string): Promise<Record<string, unknown>> {
  const row = await db.setting.findUnique({ where: { key } })
  return row ? safeParse<Record<string, unknown>>(row.value, {}) : {}
}

async function writeSetting(key: string, value: unknown) {
  const v = typeof value === 'string' ? value : JSON.stringify(value)
  await db.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } })
}

/* ═══════════════════════════ GET ═══════════════════════════ */

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sandbox = isSandboxActive()
  const doneRow = await db.setting.findUnique({ where: { key: S_DONE } })
  const done = doneRow?.value === '1'
  const business = await readJsonSetting(S_SETUP)
  const license = await currentLicense()

  /* پیش‌تنظیم مخفی هایپر زیتون — کلید از Setting یا پیش‌فرض (قابل تغییر توسط مدیر) */
  if (url.searchParams.get('preset') === 'hz') {
    const keyRow = await db.setting.findUnique({ where: { key: S_HZKEY } })
    const expected = keyRow?.value || DEFAULT_HZ_KEY
    if (url.searchParams.get('key') !== expected) return fail('کلید پیش‌تنظیم نامعتبر است', 403)
    // دادهٔ واقعی هایپر زیتون — ویزارد اجازهٔ ویرایش نام‌ها را می‌دهد پیش از اعمال
    const users = await db.user.findMany({ where: { hidden: false }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true, secondaryRoles: true, pin: true, color: true, active: true } })
    const personnel = await db.personnel.findMany({ select: { firstName: true, lastName: true, jobTitle: true, active: true } })
    return json({
      preset: 'hyperzeytoon',
      business: {
        name: 'هایپر زیتون',
        brand: 'SarResid — سررسید',
        city: 'کرمان',
        kind: 'هایپرمارکت',
        founder: true,
      },
      license: { tier: 'ENTERPRISE', founder: true, modules: [] },
      members: users.map((u) => ({ id: u.id, name: u.name, role: u.role, secondaryRoles: safeParse<string[]>(u.secondaryRoles, []), pin: u.pin, color: u.color, active: u.active })),
      personnel,
      note: 'نام‌ها از استقرار فعلی خوانده شده‌اند — در ویزارد قابل اصلاح‌اند و پس از تأیید اعمال می‌شوند.',
    })
  }

  if (!done) {
    return json({ done, sandbox, business: null, license: null })
  }
  return json({ done, sandbox, business, license })
}

/* ═══════════════════════════ POST ═══════════════════════════ */

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || '')
  const doneRow = await db.setting.findUnique({ where: { key: S_DONE } })
  const setupDone = doneRow?.value === '1'

  /* ── complete — پایان نصب (بدون session اگر هنوز نصب نشده؛ پس از آن فقط OWNER/ADMIN/EXEC) ── */
  if (action === 'complete') {
    if (setupDone) {
      const me = await getSessionUser(req)
      if (!me) return fail('ابتدا وارد شوید', 401)
      if (!isExecRole(me.role)) return fail('فقط مدیران اجرایی می‌توانند نصب را دوباره اجرا کنند', 403)
    }
    const name = String(body.name || '').trim()
    if (!name || name.length > 120) return fail('نام کسب‌وکار الزامی است (حداکثر ۱۲۰ نویسه)')
    const city = String(body.city || '').trim().slice(0, 60)
    const kind = String(body.kind || 'سوپرمارکت').trim().slice(0, 60)
    const phone = String(body.phone || '').trim().slice(0, 30)

    // لایسنس
    const licIn = (body.license || {}) as { tier?: string; founder?: boolean; moduleMonths?: Record<string, number> }
    const tier: LicenseTier = licIn.tier === 'PRO' || licIn.tier === 'BASE' ? licIn.tier : 'ENTERPRISE'
    const founder = !!licIn.founder
    const modules: Record<string, { until: string; trial?: boolean }> = {}
    for (const [mod, months] of Object.entries(licIn.moduleMonths || {})) {
      const m = Math.round(Number(months))
      if (!TIER_MODULE_SET[mod] || !isFinite(m) || m <= 0 || m > 120) continue
      const d = new Date()
      d.setMonth(d.getMonth() + m)
      modules[mod] = { until: d.toISOString().slice(0, 10), trial: m <= 1 }
    }
    const license: LicenseState = { tier, founder, modules, updatedAt: new Date().toISOString() }
    await writeSetting(S_LICENSE, license)
    invalidateLicenseCache()

    // کاربران اولیه (برای مشتری جدید — هایپر زیتون کاربرانش را دارد)
    const members = Array.isArray(body.members) ? (body.members as Array<Record<string, unknown>>) : []
    let createdUsers = 0
    for (const m of members) {
      const uname = String(m.name || '').trim()
      const role = String(m.role || 'SALES')
      if (!uname || uname.length > 60) continue
      const exists = await db.user.findUnique({ where: { name: uname } })
      if (exists) continue
      const pin = String(m.pin || '1234').replace(/\D/g, '').slice(0, 6) || '1234'
      const color = /^#[0-9a-fA-F]{6}$/.test(String(m.color || '')) ? String(m.color) : '#0e7a4a'
      try {
        await db.user.create({
          data: {
            name: uname,
            username: `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
            pin,
            role,
            color,
            active: true,
          },
        })
        createdUsers++
      } catch {}
    }

    const profile = { name, city, kind, phone, founder, completedAt: new Date().toISOString() }
    await writeSetting(S_SETUP, profile)
    await writeSetting(S_DONE, '1')
    return json({ ok: true, business: profile, license, createdUsers })
  }

  /* ── از اینجا به بعد نصب باید کامل شده باشد ── */
  if (!setupDone) return fail('نصب سامانه کامل نشده است', 409)

  /* ── سندباکس: خروج/بازنشانی حتی وقتی session در دیتابیس سندباکس resolve نمی‌شود (توکن امضاشده یا کلید مخفی کافی است) ── */
  if (action === 'sandbox-exit' || action === 'sandbox-reset') {
    const okAuth = await authForSandbox(req, String(body.key || ''))
    if (!okAuth) return fail('ابتدا وارد شوید', 401)
    if (action === 'sandbox-exit') {
      exitSandboxNow()
      return json({ ok: true, sandbox: false })
    }
    if (!isSandboxActive()) return fail('سندباکس فعال نیست', 409)
    const prep = prepareSandboxDb()
    if (!prep.ok) return fail(prep.error || 'بازنشانی ناموفق بود', 500)
    return json({ ok: true, sandbox: true })
  }

  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  /* ── license — ویرایش لایسنس (فقط OWNER/ADMIN روت) ── */
  if (action === 'license') {
    if (!(me.role === 'OWNER' || me.role === 'ADMIN')) return fail('تغییر لایسنس فقط از سوی مالک یا مدیر سامانه مجاز است', 403)
    const licIn = (body.license || {}) as { tier?: string; founder?: boolean; moduleMonths?: Record<string, number>; revoke?: string[] }
    const cur = await currentLicense()
    const tier: LicenseTier = licIn.tier === 'PRO' || licIn.tier === 'BASE' || licIn.tier === 'ENTERPRISE' ? (licIn.tier as LicenseTier) : cur.tier
    const founder = typeof licIn.founder === 'boolean' ? licIn.founder : cur.founder
    const modules: Record<string, { until: string; trial?: boolean }> = { ...cur.modules }
    for (const [mod, months] of Object.entries(licIn.moduleMonths || {})) {
      const m = Math.round(Number(months))
      if (!TIER_MODULE_SET[mod] || !isFinite(m) || m <= 0 || m > 120) continue
      const d = new Date()
      d.setMonth(d.getMonth() + m)
      modules[mod] = { until: d.toISOString().slice(0, 10), trial: m <= 1 }
    }
    for (const mod of licIn.revoke || []) delete modules[mod]
    const license: LicenseState = { tier, founder, modules, updatedAt: new Date().toISOString() }
    await writeSetting(S_LICENSE, license)
    invalidateLicenseCache()
    await logActivity(me, 'لایسنس ماژول‌ها به‌روزرسانی شد', 'setting', S_LICENSE, JSON.stringify({ tier, founder }))
    return json({ ok: true, license })
  }

  /* ── سندباکس: ورود (مدیران) + لاگ فعالیت با نام امن ── */
  if (action === 'sandbox-enter') {
    if (!isExecRole(me.role)) return fail('ورود به سندباکس فقط برای مدیران مجاز است', 403)
    const prep = prepareSandboxDb()
    if (!prep.ok) return fail(prep.error || 'آماده‌سازی سندباکس ناموفق بود', 500)
    enterSandboxNow()
    await logActivity(me, 'ورود به سندباکس دمو (هایپر نمونه)', 'setting', 'sandbox', 'enter')
    return json({ ok: true, sandbox: true })
  }

  /* ── set-hzkey — تغییر کلید میان‌بر مخفی (مالک/روت) ── */
  if (action === 'set-hzkey') {
    if (!(me.role === 'OWNER' || me.role === 'ADMIN')) return fail('دسترسی لازم را ندارید', 403)
    const key = String(body.key || '').trim()
    if (!key || key.length < 6 || key.length > 60) return fail('کلید باید بین ۶ تا ۶۰ نویسه باشد')
    await writeSetting(S_HZKEY, key)
    return json({ ok: true })
  }

  /* ── rename-team — اعمال نام‌های ویرایش‌شدهٔ تیم (میان‌بر مخفی هایپر زیتون) ── */
  if (action === 'rename-team') {
    if (!isExecRole(me.role)) return fail('دسترسی لازم را ندارید', 403)
    const members = Array.isArray(body.members) ? (body.members as Array<{ id?: string; name?: string; role?: string; pin?: string }>) : []
    let renamed = 0
    for (const m of members) {
      const id = String(m.id || '')
      const newName = String(m.name || '').trim()
      if (!id || !newName || newName.length > 60) continue
      const u = await db.user.findUnique({ where: { id } })
      if (!u || u.name === newName) continue
      const dup = await db.user.findUnique({ where: { name: newName } })
      if (dup) continue
      await db.user.update({ where: { id }, data: { name: newName } })
      if (u.personnelId) {
        const parts = newName.split(' ').filter(Boolean)
        await db.personnel.update({ where: { id: u.personnelId }, data: { firstName: parts[0] || u.name, lastName: parts.slice(1).join(' ') } }).catch(() => {})
      }
      renamed++
    }
    await logActivity(me, `اصلاح نام ${renamed} عضو تیم از ویزارد نصب`, 'user', 'rename-team', String(renamed))
    invalidateRoleCache()
    return json({ ok: true, renamed })
  }

  return fail('عملیات نامعتبر است', 400)
}
