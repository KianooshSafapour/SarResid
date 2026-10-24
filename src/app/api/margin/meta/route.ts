import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'
import {
  MARGIN_THRESHOLDS_KEY,
  DEFAULT_MARGIN_THRESHOLDS,
  getMarginThresholds,
  parseMarginThresholds,
} from '../route'

export const dynamic = 'force-dynamic'

const THRESHOLD_ROLES = ['OWNER', 'GM', 'ADMIN']

/** GET /api/margin/meta → {thresholds:{alert,ok}, defaults:{alert,ok}, canSet} */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const thresholds = await getMarginThresholds()
  return ok({
    thresholds,
    defaults: DEFAULT_MARGIN_THRESHOLDS,
    canSet: THRESHOLD_ROLES.includes(me.role),
  })
}

/** PUT /api/margin/meta — {alert, ok} (OWNER/GM/ADMIN) → Setting margin:thresholds */
export async function PUT(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!THRESHOLD_ROLES.includes(me.role)) {
    return fail('تنظیم آستانه‌های سود فقط برای مدیران ارشد (مالک/مدیر کل/مدیر سامانه) مجاز است', 403)
  }

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const alert = Math.round((Number(body.alert) || 0) * 100) / 100
  const okTh = Math.round((Number(body.ok) || 0) * 100) / 100
  if (!(alert >= 0) || !(okTh > alert)) {
    return fail('آستانه‌ها نامعتبرند — آستانهٔ اول باید ≥ ۰ و آستانهٔ دوم بزرگ‌تر از آن باشد')
  }
  if (okTh > 500) return fail('آستانهٔ سقف سبز حداکثر ۵۰۰٪ می‌تواند باشد')

  const value = JSON.stringify({ alert, ok: okTh })
  await db.setting.upsert({
    where: { key: MARGIN_THRESHOLDS_KEY },
    create: { key: MARGIN_THRESHOLDS_KEY, value },
    update: { value },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'margin.thresholds',
    actionLabel: 'آستانه‌های سودسنج',
    category: 'profit',
    detail: `قرمز < ${toFaDigits(String(alert))}٪ · کهربایی < ${toFaDigits(String(okTh))}٪ · سبز ≥ ${toFaDigits(String(okTh))}٪`,
    entityId: MARGIN_THRESHOLDS_KEY,
  })

  return ok({ thresholds: parseMarginThresholds(value) })
}
