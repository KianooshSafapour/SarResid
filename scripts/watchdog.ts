/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SarResid Watchdog — نگهبان مستقل سامانه (لایه‌های تاب‌آوری ۱ تا ۳)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * مستقل از Next.js اجرا می‌شود تا خودِ سامانه اگر مُرد، این زنده بماند:
 *
 *  لایهٔ ۱ — ضربان‌سنج و خودترمیمی (هر ۴۵ ثانیه):
 *      GET /api/health — اگر ۳ بار پشت‌سرهم پاسخ نیامد، سرور را
 *      به‌صورت خودکار ری‌استارت می‌کند (kill port 3000 → bun run dev).
 *
 *  لایهٔ ۲ — پشتیبان‌گیری آنلاین (هر ۱۰ دقیقه):
 *      «VACUUM INTO» اسنپ‌شات سازگار از DB می‌گیرد (حتی هنگام تراکنش فعال)،
 *      صحت آن را با PRAGMA integrity_check تأیید می‌کند، در
 *      db/backups/auto نگه‌داری ۱۲ نسخهٔ اخیر + آینهٔ بیرون از پروژه در
 *      ~/sarresid-backups (مصون از خرابی خودِ پوشهٔ پروژه).
 *
 *  لایهٔ ۳ — اسنپ‌شات گیت (هر ۳ ساعت):
 *      اگر تغییراتی در کد/داده باشد، commit خودکار «auto-snapshot» می‌سازد
 *      تا هیچ‌وقت مثل حادثهٔ راوند-۱۹ کد از دست نرود.
 *
 * اجرا:  nohup bun scripts/watchdog.ts > /dev/null 2>&1 &
 * لاگ:   logs/watchdog.log
 */
import { Database } from 'bun:sqlite'
import fs from 'fs'
import path from 'path'
import os from 'os'

const ROOT = '/home/z/my-project'
const LOG = path.join(ROOT, 'logs', 'watchdog.log')
const BACKUP_DIR = path.join(ROOT, 'db', 'backups', 'auto')
const MIRROR_DIR = path.join(os.homedir(), 'sarresid-backups', 'auto')
const DB_FILE = path.join(ROOT, 'db', 'custom.db')
const HEALTH_URL = 'http://127.0.0.1:3000/api/health'
const MAX_AUTO_BACKUPS = 12

/* ─────────────────────────── لاگ با چرخش ─────────────────────────── */
function log(msg: string) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 1_500_000) {
      const old = fs.readFileSync(LOG, 'utf8').slice(-200_000)
      fs.writeFileSync(LOG, old)
    }
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(LOG, line)
  } catch { /* لاگ نباید هرگز خودش خطا بدهد */ }
}

/* ─────────────────────── لایهٔ ۱: ضربان‌سنج ─────────────────────── */
let failStreak = 0
let restarting = false

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { db?: string }
      return j.db === 'up'
    }
    return false
  } catch {
    return false
  }
}

function restartServer(reason: string) {
  if (restarting) return
  restarting = true
  log(`⚠️  سرور پاسخ نمی‌دهد (${reason}) — شروع خودترمیمی…`)
  const script = `
    fuser -k 3000/tcp 2>/dev/null
    pkill -f 'next dev' 2>/dev/null
    pkill -f 'next-server' 2>/dev/null
    pkill -f 'bun run dev' 2>/dev/null
    sleep 2
    rm -f ${ROOT}/.next/dev.lock 2>/dev/null
    cd ${ROOT} && setsid nohup bun run dev >> dev.log 2>&1 < /dev/null &
    sleep 1
  `
  try {
    Bun.spawnSync(['bash', '-c', script], { stdout: 'ignore', stderr: 'ignore' })
    log('✅ دستور ری‌استارت سرور صادر شد — ۶۰ ثانیه بعد دوباره بررسی می‌شود')
  } catch (e) {
    log(`❌ خطای ری‌استارت: ${e instanceof Error ? e.message : e}`)
  }
  setTimeout(() => { restarting = false }, 60_000)
}

async function healthCheck() {
  if (restarting) return
  const alive = await probe()
  if (alive) {
    if (failStreak > 0) log(`✅ سرور دوباره بالا آمد (پس از ${failStreak} خطا)`)
    failStreak = 0
    return
  }
  failStreak++
  log(`✗ سلامت ${failStreak}/۳ ناموفق`)
  if (failStreak >= 3) restartServer('health 3x fail')
}

/* ─────────────────── لایهٔ ۲: پشتیبان‌گیری آنلاین ─────────────────── */
function rotateDir(dir: string, keep: number) {
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const x of files.slice(keep)) fs.rmSync(path.join(dir, x.f), { force: true })
  } catch (e) {
    log(`⚠️ چرخش پشتیبان ${dir}: ${e instanceof Error ? e.message : e}`)
  }
}

function backupDatabase() {
  if (!fs.existsSync(DB_FILE)) { log('✗ فایل DB یافت نشد'); return }
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  fs.mkdirSync(MIRROR_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) // yyyyMMddHHMMSS
  const target = path.join(BACKUP_DIR, `sarresid-${stamp}.db`)
  let db: Database | null = null
  try {
    // VACUUM INTO — اسنپ‌شات سازگار و تراکنش-پذیر حتی وسط کارِ پرحجم
    db = new Database(DB_FILE)
    db.run(`VACUUM INTO '${target}'`)
    db.close(); db = null
    // تأیید صحت نسخهٔ پشتیبان
    const check = new Database(target, { readonly: true })
    const ic = (check.query('PRAGMA integrity_check').get() as { integrity_check?: string } | null)
    check.close()
    if (ic?.integrity_check !== 'ok') {
      fs.rmSync(target, { force: true })
      log('❌ نسخهٔ پشتیبان سالم نبود و حذف شد')
      return
    }
    const mb = Math.round((fs.statSync(target).size / 1024 / 1024) * 100) / 100
    // آینهٔ بیرون از پروژه
    fs.copyFileSync(target, path.join(MIRROR_DIR, path.basename(target)))
    rotateDir(BACKUP_DIR, MAX_AUTO_BACKUPS)
    rotateDir(MIRROR_DIR, MAX_AUTO_BACKUPS)
    log(`💾 پشتیبان ${mb}MB → db/backups/auto + ~/sarresid-backups (سالم ✓)`)
  } catch (e) {
    if (db) { try { db.close() } catch { /* ignore */ } }
    log(`❌ خطای پشتیبان‌گیری: ${e instanceof Error ? e.message : e}`)
  }
}

/* ─────────────────── لایهٔ ۳: اسنپ‌شات گیت ─────────────────── */
function gitSnapshot() {
  try {
    const st = Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: ROOT })
    const out = st.stdout.toString().trim()
    if (!out) return
    Bun.spawnSync(['git', 'add', '-A'], { cwd: ROOT })
    const cm = Bun.spawnSync(
      ['git', 'commit', '-m', `auto-snapshot: watchdog ${new Date().toISOString()}`],
      { cwd: ROOT }
    )
    if (cm.exitCode === 0) log('📸 اسنپ‌شات گیت ثبت شد')
    else log(`· گیت: ${cm.stderr.toString().split('\n')[0]?.slice(0, 120) || 'بدون تغییر قابل commit'}`)
  } catch (e) {
    log(`⚠️ اسنپ‌شات گیت: ${e instanceof Error ? e.message : e}`)
  }
}

/* ─────────────────────────── حلقهٔ اصلی ─────────────────────────── */
log('🚀 نگهبان SarResid فعال شد — سلامت هر ۴۵s، پشتیبان هر ۱۰min، گیت هر ۳h')
setInterval(() => { void healthCheck() }, 45_000)
setInterval(backupDatabase, 10 * 60_000)
setInterval(gitSnapshot, 3 * 3600_000)

// اجرای فوری هنگام بوت
void healthCheck()
backupDatabase()

process.on('SIGTERM', () => { log('· نگهبان خاموش شد (SIGTERM)'); process.exit(0) })
