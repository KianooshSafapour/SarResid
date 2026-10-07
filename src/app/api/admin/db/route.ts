import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { canViewApi, guardCap } from '@/lib/rbac'
import { emitNotif } from '@/lib/notif-engine'
import fs from 'fs'
import path from 'path'

/* ═══════════════════════════════════════════════════════════════════════════
 * /api/admin/db — مدیریت داده‌ها: وضعیت، بازنشانی دادهٔ نمایشی، پاک‌سازی، حالت داده
 * round-19i: پشتیبان‌گیری دستی، نقطه‌های بازیابی نام‌دار، بازیابی دیتابیس و
 *            پاک‌سازی کامل و بازگشت به ویزارد نصب اولیه (منطقهٔ خطر — فقط مالک)
 * گاردها: GET → canViewApi(me,'data') | POST → cap «db.reset» (نقش‌های اجرایی همیشه دارند)
 *         backup / restore-point → فقط دسترسی داده | restore / factory-wipe → فقط OWNER
 * طراحی ری‌استارت (عمدی): پس از restore و factory-wipe سرور با process.exit(0) خاموش
 * می‌شود تا فایل دیتابیسِ تعویض‌شده از نو و تمیز باز شود؛ نگهبان بیرونی (docs/RESILIENCE.md)
 * تا حداکثر ~۲ دقیقه بعد آن را بالا می‌آورد. UI پیام «در حال بازگشت…» نشان می‌دهد.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** ارقام فارسی برای پیام‌ها و لاگ‌ها */
const fa = (n: number | string): string => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

/** عبارت تأیید تایپی برای هر پاک‌سازی — باید دقیقاً مطابق پیام سمت کلاینت باشد */
const PURGE_CONFIRMS: Record<string, string> = {
  'purge-products': 'حذف محصولات',
  'purge-providers': 'حذف تأمین‌کنندگان',
  'purge-customers': 'حذف مشتریان',
}

/* ───────────────── پشتیبان‌گیری و بازیابی (round-19i) ───────────────── */

const DB_PATH = path.join(process.cwd(), 'db', 'custom.db')
const BACKUP_DIR = path.join(process.cwd(), 'db', 'backups')
/** الگوی رسمی نام فایل پشتیبان — تنها نام‌های مطابق این الگو قابل دانلود/بازیابی‌اند */
const BACKUP_NAME_RE = /^(sarresid-backup-|restorepoint-)[\w-]+\.db$/
const RESTORE_POINTS_KEY = 'restore_points'
const MAX_MANUAL_BACKUPS = 10
const MAX_RESTORE_POINTS = 10
/** عبارت تأیید پاک‌سازی کامل — باید دقیقاً (بدون حاشیهٔ اضافه) تایپ شود */
const WIPE_PHRASE = 'بازگشت به نصب اولیه'

type RestorePointMeta = { file: string; label: string; at: string; byName: string }

/** مُهر زمانی فایل — yyyyMMdd-HHmmss */
function tsStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** برچسب فارسی → اسلاگ لاتین امن برای نام فایل (فقط حروف/عدد لاتین، حداکثر ۴۰ نویسه) */
function slugify(label: string): string {
  const slug = String(label || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean)
    .slice(0, 6)
    .join('-')
    .slice(0, 40)
  return slug || 'point'
}

function ensureBackupDir(): void {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

function fileSizeMB(file: string): number {
  return Math.round((fs.statSync(file).size / (1024 * 1024)) * 100) / 100
}

type SqliteLike = { exec: (sql: string) => unknown; all: (sql: string) => Record<string, unknown>[]; close: () => void }

/** باز کردن SQLite بومی به‌دوستِ باندلر (بدون import ایستا) — bun:sqlite در ران‌تایم bun، node:sqlite در node */
function openSqlite(file: string): SqliteLike | null {
  const proc = process as unknown as { getBuiltinModule?: (m: string) => unknown }
  try {
    const bun = proc?.getBuiltinModule?.('bun:sqlite') as { Database?: new (f: string) => SqliteLike } | undefined
    if (bun?.Database) return new bun.Database(file)
  } catch { /* ران‌تایم bun نیست */ }
  try {
    const node = proc?.getBuiltinModule?.('node:sqlite') as { DatabaseSync?: new (f: string) => SqliteLike } | undefined
    if (node?.DatabaseSync) return new node.DatabaseSync(file)
  } catch { /* node:sqlite در دسترس نیست */ }
  return null
}

/** اسنپ‌شات سازگار از دیتابیس زنده — ترجیحاً VACUUM INTO (سازگار وسط تراکنش)؛ در خطا → کپی سادهٔ فایل */
function makeSnapshot(target: string): 'vacuum' | 'copy' {
  ensureBackupDir()
  if (fs.existsSync(target)) fs.rmSync(target, { force: true }) // VACUUM INTO روی فایل موجود خطا می‌دهد
  const conn = openSqlite(DB_PATH)
  if (conn) {
    try {
      conn.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
      try { conn.close() } catch { /* بستن بی‌خطر */ }
      return 'vacuum'
    } catch { /* افتاد به کپی ساده */ }
    try { conn.close() } catch { /* بستن بی‌خطر */ }
  }
  fs.copyFileSync(DB_PATH, target)
  return 'copy'
}

/** پشتیبان امنیتی پیش از عملیات مخرب (بازیابی/پاک‌سازی) — همیشه قبل از دست‌زدن به دیتابیس */
function createSafetyBackup(kind: 'pre-restore' | 'pre-wipe'): { file: string; sizeMB: number } {
  const file = `sarresid-backup-${kind}-${tsStamp()}.db`
  makeSnapshot(path.join(BACKUP_DIR, file))
  rotateManualBackups()
  return { file, sizeMB: fileSizeMB(path.join(BACKUP_DIR, file)) }
}

/** چرخش نگهداری: از sarresid-backup-*.db فقط ۱۰ نسخهٔ جدیدتر می‌ماند (نقاط بازیابی جدا هستند) */
function rotateManualBackups(keep = MAX_MANUAL_BACKUPS): void {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => /^sarresid-backup-[\w-]+\.db$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const x of files.slice(keep)) fs.rmSync(path.join(BACKUP_DIR, x.f), { force: true })
  } catch { /* چرخش نباید جریان اصلی را بشکند */ }
}

/** خروج برنامه‌ریزی‌شده پس از پاسخ — نگهبان بیرونی سرور را دوباره بالا می‌آورد (docs/RESILIENCE.md) */
let exitScheduled = false
function scheduleExit(ms = 800): void {
  if (exitScheduled) return
  exitScheduled = true
  setTimeout(() => process.exit(0), ms)
}

/** خالی‌کردن همهٔ جدول‌های کاربری — مسیر اصلی SQLite بومی؛ مسیر پشتیوان کوئری خام پرisma روی فایل واقعی */
async function wipeAllUserTables(): Promise<{ ok: boolean; tables?: number; error?: string }> {
  const LIST_SQL = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'"
  const conn = openSqlite(DB_PATH)
  if (conn) {
    try {
      const rows = conn.all(LIST_SQL)
      for (const r of rows) {
        const name = String(r.name || '')
        if (name) conn.exec(`DELETE FROM "${name.replace(/"/g, '""')}"`)
      }
      try { conn.exec('VACUUM') } catch { /* کوچک‌سازی فایل اختیاری است */ }
      conn.close()
      return { ok: true, tables: rows.length }
    } catch (e) {
      try { conn.close() } catch { /* بستن بی‌خطر */ }
      return { ok: false, error: e instanceof Error ? e.message : 'خطای ناشناخته' }
    }
  }
  // مسیر پشتیوان — پرisma مستقیم روی db/custom.db (نه کلاینت فعالِ سندباکس‌آگاه)
  try {
    const { PrismaClient } = await import('@prisma/client')
    const raw = new PrismaClient({ datasources: { db: { url: `file:${DB_PATH}` } } })
    try {
      const rows = await raw.$queryRawUnsafe<{ name: string }[]>(LIST_SQL)
      for (const r of rows) {
        if (r?.name) await raw.$executeRawUnsafe(`DELETE FROM "${String(r.name).replace(/"/g, '""')}"`)
      }
      return { ok: true, tables: rows.length }
    } finally {
      await raw.$disconnect().catch(() => { /* بی‌خطر */ })
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'خطای ناشناخته' }
  }
}

async function getSetting(key: string, dflt = ''): Promise<string> {
  try {
    const row = await db.setting.findUnique({ where: { key } })
    return row?.value ?? dflt
  } catch {
    return dflt
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

/* ───────────────────────────── GET — وضعیت داده‌ها ───────────────────────────── */

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'data'))) return fail('دسترسی محدود — فقط مالک، مدیران و IT', 403)

  const url = new URL(req.url)

  /* ۱) دانلود فایل پشتیبان — فقط نام‌های مطابق الگوی رسمی، همیشه از درون db/backups (گارد path-traversal) */
  const download = url.searchParams.get('download')
  if (download) {
    const base = path.basename(download)
    if (!BACKUP_NAME_RE.test(base)) return fail('نام فایل پشتیبان مجاز نیست', 400)
    const backupRoot = path.resolve(BACKUP_DIR)
    const full = path.resolve(backupRoot, base)
    if (!full.startsWith(backupRoot + path.sep)) return fail('نام فایل پشتیبان مجاز نیست', 400)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return fail('فایل پشتیبان یافت نشد', 404)
    const buf = fs.readFileSync(full)
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${base}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  /* ۲) فهرست پشتیبان‌های دستی و نقاط بازیابی — جدای پشتیبان‌های خودکار نگهبان (db/backups/auto) */
  if (url.searchParams.get('list') === 'backups') {
    let backups: { file: string; sizeMB: number; mtimeISO: string }[] = []
    try {
      backups = fs.readdirSync(BACKUP_DIR)
        .filter((f) => BACKUP_NAME_RE.test(f))
        .map((f) => {
          const st = fs.statSync(path.join(BACKUP_DIR, f))
          return { file: f, sizeMB: Math.round((st.size / (1024 * 1024)) * 100) / 100, mtimeISO: st.mtime.toISOString() }
        })
        .sort((a, b) => b.mtimeISO.localeCompare(a.mtimeISO))
    } catch { /* پوشهٔ پشتیبان هنوز ساخته نشده — فهرست خالی */ }
    const restorePoints = safeParse<RestorePointMeta[]>(await getSetting(RESTORE_POINTS_KEY, '[]'), []).filter((r) => r && typeof r.file === 'string')
    return json({ backups, restorePoints })
  }

  /* ۳) وضعیت کلی داده‌ها */
  const [
    products, providers, customers, orders, orderItems, cheques, payments,
    preorders, users, personnel, zoneCounts, tasks, messages, activities,
    archiveDocs, customerEvents, saleEngagements, holidayCount, settings,
  ] = await Promise.all([
    db.product.count(), db.provider.count(), db.customer.count(), db.order.count(),
    db.orderItem.count(), db.cheque.count(), db.payment.count(), db.preOrder.count(),
    db.user.count(), db.personnel.count(), db.zoneCount.count(), db.task.count(),
    db.message.count(), db.activityLog.count(), db.archiveDoc.count(),
    db.customerEvent.count(), db.saleEngagement.count(), db.holiday.count(),
    db.setting.findMany({ where: { key: { in: ['data_mode', 'last_reset_at', 'last_reset_by'] } } }),
  ])

  const settingMap = new Map(settings.map((s) => [s.key, s.value]))

  // حجم فایل دیتابیس روی دیسک
  let dbSizeMB = 0
  try {
    const candidates = [
      path.join(process.cwd(), 'db', 'custom.db'),
      path.join(process.cwd(), 'prisma', 'dev.db'),
      path.join(process.cwd(), 'db', 'dev.db'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        dbSizeMB = Math.round((fs.statSync(p).size / (1024 * 1024)) * 100) / 100
        break
      }
    }
  } catch { /* حجم در دسترس نیست — صفر می‌ماند */ }

  // چک‌لیست دادهٔ واقعی — «انجام‌شده» یعنی رکورد موجود است (راهنمای مدیر برای جایگزینی دمو با واقعی)
  const realDataChecklist = [
    { key: 'products', label: 'کالاهای واقعی فروشگاه وارد شده باشد', done: products > 0 },
    { key: 'providers', label: 'تأمین‌کنندگان واقعی ثبت شده باشد', done: providers > 0 },
    { key: 'customers', label: 'مشتریان واقعی ثبت شده باشد', done: customers > 0 },
  ]

  return json({
    counts: {
      products, providers, customers, orders, orderItems, cheques, payments,
      preorders, users, personnel, zoneCounts, tasks, messages, activities,
      archiveDocs, customerEvents, saleEngagements, holidayCount,
    },
    demoFlag: settingMap.get('data_mode') || 'demo',
    lastReset: { at: settingMap.get('last_reset_at') || '', by: settingMap.get('last_reset_by') || '' },
    dbSizeMB,
    realDataChecklist,
  })
}

/* ───────────────────────────── POST — عملیات مخرب ───────────────────────────── */

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = String(body.action || '')

  /* ۰) تهیهٔ پشتیبان دستی / نقطهٔ بازیابی نام‌دار — هر کاربر واردشده با دسترسی داده */
  if (action === 'backup' || action === 'restore-point') {
    if (!(await canViewApi(me, 'data'))) return fail('دسترسی محدود — فقط مالک، مدیران و IT', 403)
    ensureBackupDir()
    const stamp = tsStamp()
    let file: string
    let label = ''
    if (action === 'backup') {
      file = `sarresid-backup-${stamp}.db`
    } else {
      label = String(body.label || '').trim()
      if (!label) return fail('برچسب نقطهٔ بازیابی را بنویسید — مثلاً «پیش از تعویض دفتر سالانه»')
      if (label.length > 60) return fail('برچسب حداکثر ۶۰ نویسه است')
      file = `restorepoint-${slugify(label)}-${stamp}.db`
    }
    try {
      const method = makeSnapshot(path.join(BACKUP_DIR, file))
      const sizeMB = fileSizeMB(path.join(BACKUP_DIR, file))
      rotateManualBackups()
      if (action === 'backup') {
        await logActivity(me, 'تهیهٔ پشتیبان دستی', 'system', 'backup', `${file} — ${fa(sizeMB)} مگابایت (${method === 'vacuum' ? 'VACUUM INTO' : 'کپی فایل'})`)
        return json({ ok: true, file, sizeMB })
      }
      // نقطهٔ بازیابی — ثبت برچسب در Setting (سقف ۱۰ مورد؛ جدیدترین‌ها می‌مانند)
      const list = safeParse<RestorePointMeta[]>(await getSetting(RESTORE_POINTS_KEY, '[]'), []).filter((r) => r && typeof r.file === 'string')
      list.push({ file, label, at: new Date().toISOString(), byName: me.name })
      await setSetting(RESTORE_POINTS_KEY, JSON.stringify(list.slice(-MAX_RESTORE_POINTS)))
      await logActivity(me, 'ایجاد نقطهٔ بازیابی', 'system', 'restore-point', `«${label}» — ${file} (${fa(sizeMB)} مگابایت)`)
      return json({ ok: true, file, sizeMB, label })
    } catch (e) {
      return fail('تهیهٔ پشتیبان ناموفق بود: ' + (e instanceof Error ? e.message : 'خطای ناشناخته'), 500)
    }
  }

  const guard = await guardCap(me, 'db.reset')
  if (guard) return fail(guard, 403)

  /* ۱) بازنشانی دادهٔ نمایشی — پاک‌سازی همهٔ داده‌های عملیاتی دمو */
  if (action === 'reset-demo') {
    const deleted: Record<string, number> = {}
    try {
      // ترتیب منطقی: فرزندان قبل از والدین (بدون قید FK — ترتیب برای شفافیت گزارش است)
      const steps: { table: string; run: () => Promise<{ count: number }> }[] = [
        { table: 'orderItem', run: () => db.orderItem.deleteMany({}) },
        { table: 'order', run: () => db.order.deleteMany({}) },
        { table: 'cheque', run: () => db.cheque.deleteMany({}) },
        { table: 'payment', run: () => db.payment.deleteMany({}) },
        { table: 'preOrder', run: () => db.preOrder.deleteMany({}) },
        { table: 'customerEvent', run: () => db.customerEvent.deleteMany({}) },
        { table: 'saleEngagement', run: () => db.saleEngagement.deleteMany({}) },
        { table: 'complaint', run: () => db.complaint.deleteMany({}) },
        { table: 'extraActivity', run: () => db.extraActivity.deleteMany({}) },
        { table: 'notifOutbox', run: () => db.notifOutbox.deleteMany({}) },
        { table: 'zoneCount', run: () => db.zoneCount.deleteMany({}) },
        { table: 'laborHour', run: () => db.laborHour.deleteMany({}) },
        { table: 'leaveRequest', run: () => db.leaveRequest.deleteMany({}) },
        { table: 'urgentQuestion', run: () => db.urgentQuestion.deleteMany({}) },
        { table: 'archiveDocItem', run: () => db.archiveDocItem.deleteMany({}) },
        { table: 'archiveDoc', run: () => db.archiveDoc.deleteMany({}) },
        { table: 'archiveCustody', run: () => db.archiveCustody.deleteMany({}) },
        { table: 'docEvent', run: () => db.docEvent.deleteMany({}) },
        { table: 'activityLog', run: () => db.activityLog.deleteMany({}) },
        { table: 'award', run: () => db.award.deleteMany({}) },
      ]
      for (const s of steps) {
        const r = await s.run()
        if (r.count > 0) deleted[s.table] = r.count
      }
    } catch (e) {
      return fail('بازنشانی ناتمام ماند: ' + (e instanceof Error ? e.message : 'خطای ناشناخته'), 500)
    }

    await Promise.all([
      setSetting('data_mode', 'demo'),
      setSetting('last_reset_at', new Date().toISOString()),
      setSetting('last_reset_by', me.name),
    ])

    const detail = Object.keys(deleted).length
      ? 'حذف شد: ' + Object.entries(deleted).map(([t, n]) => `${fa(n)} ${t}`).join('، ')
      : 'دادهٔ عملیاتی برای حذف وجود نداشت'
    await logActivity(me, 'بازنشانی دادهٔ نمایشی', 'system', 'reset-demo', detail)
    await emitNotif({
      event: 'db.reset',
      title: 'داده‌های نمایشی بازنشانی شد',
      detail: `${me.name} — ${detail}`,
      go: '#/data',
      severity: 'critical',
      icon: '🗄️',
      actor: me,
    })
    return json({ ok: true, summary: { deleted } })
  }

  /* ۲) پاک‌سازی موجودیت‌های پایه — با عبارت تأیید تایپی */
  if (action in PURGE_CONFIRMS) {
    const expected = PURGE_CONFIRMS[action]
    if (String(body.confirm || '').trim() !== expected) {
      return fail(`برای اجرای این عملیات باید عبارت «${expected}» را دقیقاً تایپ کنید`, 400)
    }

    if (action === 'purge-products') {
      const linked = await db.orderItem.count()
      if (linked > 0) {
        return fail(
          `حذف محصولات ممکن نیست — ${fa(linked)} قلم سفارش به کالاها وصل است و تاریخچهٔ مالی نباید بی‌مرجع بماند. ابتدا «بازنشانی دادهٔ نمایشی» را اجرا کنید.`,
          409
        )
      }
      const n = await db.product.deleteMany({})
      await logActivity(me, 'پاک‌سازی کامل محصولات', 'product', 'purge-products', `${fa(n.count)} کالا حذف شد`)
      return json({ ok: true, summary: { deleted: { product: n.count } } })
    }

    if (action === 'purge-providers') {
      const n = await db.provider.deleteMany({})
      await logActivity(me, 'پاک‌سازی کامل تأمین‌کنندگان', 'provider', 'purge-providers', `${fa(n.count)} تأمین‌کننده حذف شد`)
      return json({ ok: true, summary: { deleted: { provider: n.count } } })
    }

    // purge-customers — رخدادهای مشتری هم به آن‌ها وصل است؛ برای جلوگیری از رکورد یتیم همزمان پاک می‌شوند
    const events = await db.customerEvent.deleteMany({})
    const n = await db.customer.deleteMany({})
    await logActivity(me, 'پاک‌سازی کامل مشتریان', 'customer', 'purge-customers', `${fa(n.count)} مشتری و ${fa(events.count)} رخداد مشتری حذف شد`)
    return json({ ok: true, summary: { deleted: { customer: n.count, customerEvent: events.count } } })
  }

  /* ۳) تغییر حالت داده — نمایشی / واقعی */
  if (action === 'set-mode') {
    const mode = String(body.mode || '')
    if (mode !== 'demo' && mode !== 'real') return fail('حالت باید «demo» یا «real» باشد')
    await setSetting('data_mode', mode)
    await logActivity(
      me, 'تغییر حالت داده', 'system', 'set-mode',
      mode === 'real' ? 'سامانه به حالت «دادهٔ واقعی» رفت' : 'سامانه به حالت «دادهٔ نمایشی» برگشت'
    )
    return json({ ok: true, mode })
  }

  /* ۴) پاک‌سازی اعلان‌های قدیمی دمو — بیشتر از ۷ روز */
  if (action === 'purge-demo-notifs') {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600_000)
    const n = await db.notifOutbox.deleteMany({ where: { createdAt: { lt: cutoff } } })
    await logActivity(me, 'پاک‌سازی اعلان‌های قدیمی', 'notifOutbox', 'purge-demo-notifs', `${fa(n.count)} اعلان قدیمی‌تر از ۷ روز حذف شد`)
    return json({ ok: true, summary: { deleted: { notifOutbox: n.count } } })
  }

  /* ۵) بازیابی دیتابیس از پشتیبان — فقط مالک؛ با پشتیبان امنیتی و ری‌استارت نگهبان */
  if (action === 'restore') {
    if (me.role !== 'OWNER') return fail('بازیابی دیتابیس فقط از دست مالک سامانه است', 403)
    const base = path.basename(String(body.file || ''))
    if (!BACKUP_NAME_RE.test(base)) return fail('فایل انتخابی نامعتبر است', 400)
    const backupRoot = path.resolve(BACKUP_DIR)
    const src = path.resolve(backupRoot, base)
    if (!src.startsWith(backupRoot + path.sep)) return fail('فایل انتخابی نامعتبر است', 400)
    if (!fs.existsSync(src)) return fail('فایل پشتیبان یافت نشد — شاید در چرخش پشتیبان‌ها حذف شده باشد', 404)

    // گام ۱ — پشتیبان امنیتی از وضعیت فعلی (قاعدهٔ تاب‌آوری: بازیابی بدون پشتیبان تازه ممنوع)
    let safety = ''
    try {
      safety = createSafetyBackup('pre-restore').file
    } catch (e) {
      return fail('پشتیبان امنیتی ساخته نشد — بازیابی لغو شد: ' + (e instanceof Error ? e.message : 'خطای ناشناخته'), 500)
    }

    // گام ۲ — جایگزینی فایل دیتابیس با پشتیبان انتخابی
    try {
      fs.copyFileSync(src, DB_PATH)
    } catch (e) {
      return fail('جایگزینی دیتابیس ناموفق بود: ' + (e instanceof Error ? e.message : 'خطای ناشناخته'), 500)
    }
    await logActivity(me, 'بازیابی دیتابیس از پشتیبان', 'system', 'restore', `${base} — پشتیبان امنیتی: ${safety}`)
    await emitNotif({
      event: 'db.restore',
      title: 'دیتابیس بازیابی شد',
      detail: `${me.name} — از «${base}» · پشتیبان امنیتی: ${safety}`,
      go: '#/data',
      severity: 'critical',
      icon: '♻️',
      actor: me,
    })

    // گام ۳ — پاسخ فوری و خروج عمدی: نگهبان بیرونی (docs/RESILIENCE.md) سرور را تا ~۲ دقیقه
    // دیگر با فایل دیتابیس نو بالا می‌آورد. این process.exit بخشی از طراحی بازیابی است.
    scheduleExit(800)
    return json({ ok: true, reboot: true, message: 'بازیابی انجام شد؛ سامانه در حال راه‌اندازی مجدد است' })
  }

  /* ۶) پاک‌سازی کامل و بازگشت به نصب اولیه — فقط مالک + عبارت تأیید تایپی دقیق */
  if (action === 'factory-wipe') {
    if (me.role !== 'OWNER') return fail('بازگشت به نصب اولیه فقط از دست مالک سامانه است', 403)
    if (String(body.confirm || '') !== WIPE_PHRASE) {
      return fail(`برای اجرای این عملیات باید عبارت «${WIPE_PHRASE}» را دقیقاً تایپ کنید`, 400)
    }

    // گام ۱ — پشتیبان امنیتی پیش از پاک‌سازی (بدون پشتیبان تازه، پاک‌سازی هرگز اجرا نمی‌شود)
    let safety = ''
    try {
      safety = createSafetyBackup('pre-wipe').file
    } catch (e) {
      return fail('پشتیبان امنیتی ساخته نشد — پاک‌سازی لغو شد (قاعدهٔ تاب‌آوری): ' + (e instanceof Error ? e.message : 'خطای ناشناخته'), 500)
    }

    // گام ۲ — خالی‌کردن همهٔ جدول‌های کاربری بر اساس sqlite_master (جدول‌های سیستمی دست نمی‌خورند)
    const wiped = await wipeAllUserTables()
    if (!wiped.ok) {
      return fail('پاک‌سازی ناتمام ماند — برای بازگشت به وضعیت پیشین از پشتیبان امنیتی بازیابی کنید: ' + (wiped.error || ''), 500)
    }

    // گام ۳ — نشانگر نصب = نصب‌نشده → ویزارد نصب اولیه در بارگذاری بعدی نمایش داده می‌شود
    await setSetting('setup.done', '0')
    await logActivity(me, 'پاک‌سازی کامل و بازگشت به نصب اولیه', 'system', 'factory-wipe', `${fa(wiped.tables || 0)} جدول خالی شد — پشتیبان امنیتی: ${safety}`)

    // گام ۴ — پاسخ و خروج عمدی؛ نگهبان بیرونی سرور را بالا می‌آورد و ویزارد نصب ظاهر می‌شود
    scheduleExit(800)
    return json({ ok: true, reboot: true, message: 'پاک‌سازی کامل انجام شد؛ سامانه در حال راه‌اندازی مجدد است' })
  }

  return fail('عملیات ناشناخته است', 400)
}
