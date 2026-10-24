import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { toFaDigits } from '@/lib/jalali'
import {
  DEFAULT_LIMITS,
  DEFAULT_SPLIT,
  posInt,
  readLimits,
  readSplit,
  type ChequeLimits,
  type ChequeSplit,
} from '@/lib/cheque-settings'

export const dynamic = 'force-dynamic'

const LIMITS_KEY = 'cheque:limits'
const SPLIT_KEY = 'cheque:split'

/** فقط مدیران ارشد می‌توانند سقف‌ها را عوض کنند (مالک + مدیر کل + مدیر سامانه) */
const WRITE_ROLES = ['OWNER', 'GM', 'ADMIN']

/** GET /api/cheques/settings → {limits, split} (خواندن: مالی + حسابدار) */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(me, 'finance/cheques')
  if (!gate.ok) return fail(gate.deny, 403)
  return ok({ limits: await readLimits(), split: await readSplit() })
}

/** POST/PUT /api/cheques/settings {limits?, split?} — مدیران ارشد */
async function saveSettings(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(me, 'finance/cheques')
  if (!gate.ok) return fail(gate.deny, 403)
  if (!WRITE_ROLES.includes(me.role)) return fail('تنظیم سقف‌ها و پارامترهای چک فقط توسط مالک، مدیر کل یا مدیر سامانه مجاز است', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const detail: string[] = []
  if (body.limits && typeof body.limits === 'object') {
    const limits: ChequeLimits = {
      day: posInt((body.limits as Record<string, unknown>).day, DEFAULT_LIMITS.day),
      week: posInt((body.limits as Record<string, unknown>).week, DEFAULT_LIMITS.week),
      month: posInt((body.limits as Record<string, unknown>).month, DEFAULT_LIMITS.month),
    }
    await db.setting.upsert({
      where: { key: LIMITS_KEY },
      create: { key: LIMITS_KEY, value: JSON.stringify(limits) },
      update: { value: JSON.stringify(limits) },
    })
    detail.push(`سقف‌ها: روزانه ${toFaDigits(String(limits.day))} · هفتگی ${toFaDigits(String(limits.week))} · ماهانه ${toFaDigits(String(limits.month))}`)
  }
  if (body.split && typeof body.split === 'object') {
    const s = body.split as Record<string, unknown>
    const split: ChequeSplit = {
      mediumMax: Math.max(2, Math.min(10, posInt(s.mediumMax, DEFAULT_SPLIT.mediumMax, 10))),
      heavyMax: Math.max(2, Math.min(10, posInt(s.heavyMax, DEFAULT_SPLIT.heavyMax, 10))),
      mediumThreshold: Math.max(0, posInt(s.mediumThreshold, DEFAULT_SPLIT.mediumThreshold)),
      heavyThreshold: Math.max(0, posInt(s.heavyThreshold, DEFAULT_SPLIT.heavyThreshold)),
      roundTo: Math.max(1000, posInt(s.roundTo, DEFAULT_SPLIT.roundTo, 100_000_000)),
    }
    if (split.heavyMax < split.mediumMax) split.heavyMax = split.mediumMax
    await db.setting.upsert({
      where: { key: SPLIT_KEY },
      create: { key: SPLIT_KEY, value: JSON.stringify(split) },
      update: { value: JSON.stringify(split) },
    })
    detail.push(`پارامترها: ${toFaDigits(String(split.mediumMax))}/${toFaDigits(String(split.heavyMax))} چک · رند ${toFaDigits(String(split.roundTo))}`)
  }
  if (!detail.length) return fail('چیزی برای ذخیره ارسال نشده است')

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'cheque.settings',
    actionLabel: 'تنظیمات چک',
    category: 'finance',
    detail: detail.join(' — '),
  })
  return ok({ limits: await readLimits(), split: await readSplit() })
}

export async function POST(req: NextRequest) { return saveSettings(req) }
export async function PUT(req: NextRequest) { return saveSettings(req) }
