/** موتور اعلان‌های قاعده‌محور (visual workflow) — یک قاعده در DB، همهٔ بخش‌ها از همین منتشر می‌کنند.
 *  الگو: Camunda escalation boundary — notify (غیرقطع‌کننده) و reassign (قطع‌کننده)
 *  round-17: visibleToUser (فیلتر مخاطب واحد برای نشان‌ها و مرکز اعلان‌ها) + تولد تیم (T-7/T-3/T-0) */
import { db } from '@/lib/db'
import { safeParse } from '@/lib/api-helpers'
import { hasCap, userRoleKeys } from '@/lib/rbac'
import { daysBetween, faNum, jMonthLength, jalaliToIso, toJalaliParts, todayIso } from '@/lib/jalali'

export type NotifSeverity = 'critical' | 'important' | 'info'

export type EmitInput = {
  event: string // e.g. 'leave.requested'
  title: string
  detail?: string
  go?: string // hash route like '#/leaves'
  severity?: NotifSeverity
  icon?: string
  actor?: { id: string; name: string } | null
  /** مقصدهای پویا که قاعده ارجاع می‌دهد: submitter | approver | zoneOwner | oversight */
  fieldRefs?: Record<string, string[]> // name → user ids
  dedupeId?: string // شناسهٔ یکتا برای جلوگیری از اسپم (مثلاً leaveId)
  /** پنجرهٔ ضدتکرار — اگر داده نشود از قاعده (یا ۱۲ ساعت) استفاده می‌شود */
  dedupeHours?: number
  /** گیرندگان تضمینی مستقل از قاعده (مثلاً دارندگان cap) — همیشه به مقصدها اضافه می‌شوند */
  extraUsers?: string[]
  payload?: Record<string, unknown>
}

/** قاعدهٔ event را می‌خواند، مقصدها را حل می‌کند و NotifOutbox می‌سازد (با dedupe) */
export async function emitNotif(input: EmitInput): Promise<{ sent: boolean; ruleKey?: string }> {
  try {
    const rule = await db.notifRule.findUnique({ where: { key: input.event } })
    if (rule && !rule.enabled) return { sent: false }
    const targets = safeParse<{ roles?: string[]; users?: string[]; fieldRef?: string }>(rule?.targets || '{}', {})
    const severity = (input.severity || (rule?.severity as NotifSeverity) || 'important') as NotifSeverity
    const icon = input.icon || '🔔'

    const userIds = new Set<string>([...(targets.users || []), ...(input.extraUsers || [])])
    for (const ref of Object.keys(input.fieldRefs || {})) {
      if ((targets.fieldRef || '') === ref || targets.fieldRef === ref) {
        for (const id of input.fieldRefs?.[ref] || []) userIds.add(id)
      }
    }
    const roles = targets.roles || []

    const dedupeKey = input.dedupeId ? `${input.event}:${input.dedupeId}` : ''
    if (dedupeKey) {
      const hours = input.dedupeHours ?? rule?.dedupeHours ?? 12
      const since = new Date(Date.now() - hours * 3600_000)
      const dup = await db.notifOutbox.findFirst({ where: { dedupeKey, createdAt: { gte: since } } })
      if (dup) return { sent: false, ruleKey: input.event }
    }

    await db.notifOutbox.create({
      data: {
        ruleKey: input.event,
        severity,
        icon,
        title: input.title.slice(0, 180),
        detail: (input.detail || '').slice(0, 600),
        go: input.go || '',
        targetRoles: JSON.stringify(roles),
        targetUsers: JSON.stringify(Array.from(userIds)),
        dedupeKey,
      },
    })
    return { sent: true, ruleKey: input.event }
  } catch {
    return { sent: false } // never block business flow on notification failure
  }
}

/* ── مخاطب اعلان (round-17) — تابع واحد برای نشان‌ها و مرکز اعلان‌ها ──
 * یک ردیف NotifOutbox فقط وقتی به کاربر نمایش داده می‌شود که:
 *   مستقیم به او نشانه‌گذاری شده (targetUsers) یا به نقشی از نقش‌هایش (targetRoles ∩ نقش‌های من)
 *   یا همگانی است (هر دو فهرست خالی). */
export type AudienceUser = { id: string; role: string; secondaryRoles: string[]; roleIds?: string }
export type OutboxLike = { targetUsers: string; targetRoles: string }

export function visibleToUser(row: OutboxLike, me: AudienceUser): boolean {
  const tUsers = safeParse<string[]>(row.targetUsers, [])
  const tRoles = safeParse<string[]>(row.targetRoles, [])
  const targeted = tUsers.includes(me.id) || tRoles.some((x) => userRoleKeys(me).includes(x))
  const broadcast = tUsers.length === 0 && tRoles.length === 0
  return targeted || broadcast
}

/** کاربران دارای نقش‌های مشخص (برای مقصدهای نقش‌محور) */
export async function usersWithRoles(roles: string[]): Promise<string[]> {
  if (!roles.length) return []
  const users = await db.user.findMany({ where: { active: true, hidden: false }, select: { id: true, role: true, secondaryRoles: true, roleIds: true } })
  return users
    .filter((u) => roles.includes(u.role) || safeParse<string[]>(u.secondaryRoles, []).some((s) => roles.includes(s)) || safeParse<string[]>(u.roleIds || '[]', []).some((s) => roles.includes(s)))
    .map((u) => u.id)
}

/** ناظران یک دامنه (مدل Oversight — ادمین تعیین می‌کند چه کسی تأیید کند) */
export async function oversightUsers(domain: string): Promise<string[]> {
  const o = await db.oversight.findUnique({ where: { domain } })
  return o ? safeParse<string[]>(o.userIds, []) : []
}

/* ───────────────── تولد همکاران (round-17) ─────────────────
 * T-7 / T-3 / T-0 — فقط پرسنل (نه نمایندگان فروش). سال‌مستقل: ماه/روز شمسی تکرار می‌شود؛
 * اسفند ۳۰ به‌آرامی به ۲۹ می‌چسبد. هر شخص × آستانه × سال فقط یک اعلان (dedupeKey با تاریخ مقصد).
 * گیرندگان: OWNER/GM/HC/PM + هر کاربر با cap «personnel.manage». */

const BIRTHDAY_THRESHOLDS = [7, 3, 0] as const
const THRESHOLD_LABEL: Record<number, string> = { 7: '۷ روز مانده', 3: '۳ روز مانده', 0: 'امروز تولد است 🎂' }

async function personnelManageUsers(): Promise<string[]> {
  const users = await db.user.findMany({ where: { active: true, hidden: false }, select: { id: true, role: true, secondaryRoles: true, roleIds: true } })
  const out: string[] = []
  for (const u of users) {
    const su = { role: u.role, secondaryRoles: safeParse<string[]>(u.secondaryRoles, []), roleIds: u.roleIds }
    if (await hasCap(su, 'personnel.manage')) out.push(u.id)
  }
  return out
}

/** بررسی روزانهٔ تولدها — از GET /api/notifications صدا زده می‌شود؛ روزی یک‌بار (قفل درون‌پردازشی + قفل اتمیک روی Setting) */
let birthdayRun: Promise<void> | null = null
export function runBirthdayCheck(): Promise<void> {
  if (!birthdayRun) {
    birthdayRun = runBirthdayCheckInner().finally(() => {
      birthdayRun = null
    })
  }
  return birthdayRun
}

async function runBirthdayCheckInner(): Promise<void> {
  const today = todayIso()
  const key = 'notif.birthday.lastRun'
  try {
    // قفل اتمیک: فقط اولین درخواستِ هر روز جلو می‌رود (کلاینت‌ها هر ۴۵ ثانیه poll می‌زنند)
    const existing = await db.setting.findUnique({ where: { key } })
    if (existing) {
      if (existing.value === today) return
      const claimed = await db.$executeRawUnsafe(`UPDATE "Setting" SET "value" = ? WHERE "key" = ? AND "value" <> ?`, today, key, today)
      if (claimed === 0) return // پردازش دیگری همین حالا امروز را برد
    } else {
      try {
        await db.setting.create({ data: { key, value: today } })
      } catch {
        return // رکورد همزمان ساخته شد — رقابت را باخته‌ایم
      }
    }
  } catch {
    return // جدول Setting در دسترس نیست — کلید نمی‌زنیم
  }

  const { jy } = toJalaliParts(new Date())
  const people = await db.personnel.findMany({ where: { active: true }, select: { id: true, firstName: true, lastName: true, birthday: true } })

  const targets = Array.from(new Set([...(await usersWithRoles(['OWNER', 'GM', 'HC', 'PM'])), ...(await personnelManageUsers())]))

  for (const p of people) {
    const raw = (p.birthday || '').trim()
    if (!raw) continue
    const m = raw.match(/(\d{3,4})\D(\d{1,2})\D(\d{1,2})/)
    if (!m) continue
    const bm = Number(m[2])
    let bd = Number(m[3])
    if (!(bm >= 1 && bm <= 12) || !(bd >= 1 && bd <= 31)) continue
    // اسفند ۳۰ در سال غیر کبیسه → ۲۹ (پرداخت آرام سال‌های ۳۶۵ روزه)
    const monthLen = jMonthLength(jy, bm)
    if (bd > monthLen) bd = monthLen

    const targetIso = jalaliToIso(jy, bm, bd)
    const daysUntil = daysBetween(targetIso, today)
    const threshold = BIRTHDAY_THRESHOLDS.find((t) => t === daysUntil)
    if (threshold === undefined) continue

    const fullName = `${p.firstName} ${p.lastName}`.trim()
    const title = threshold === 0 ? `امروز تولد ${fullName} است — تبریک فراموش نشود!` : `🎂 تولد ${fullName} ${faNum(threshold)} روز دیگر است`
    const detail =
      threshold === 0
        ? `تولد ${fullName} است — برای کیک و جشن آماده شوید — تبریک فراموش نشود! (${THRESHOLD_LABEL[threshold]})`
        : `تولد ${fullName} ${faNum(threshold)} روز دیگر است — برای کیک و جشن آماده شوید (${THRESHOLD_LABEL[threshold]})`

    await emitNotif({
      event: 'birthday.upcoming',
      title,
      detail,
      go: '#/personnel',
      severity: 'info',
      icon: '🎂',
      dedupeId: `${p.id}:${targetIso}:t${threshold}`,
      dedupeHours: 24 * 8, // هر آستانه سالی یک‌بار — پنجره از تکرار در همان هفته جلوگیری می‌کند
      extraUsers: targets,
    })
  }
}
