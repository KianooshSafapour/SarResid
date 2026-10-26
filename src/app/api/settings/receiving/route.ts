import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * R11 — تنظیمات نمای دریافت کالا (مدیر سیستم).
 * «آخرین رویدادها» و «یادداشت سفارش» در صفحهٔ دریافت کالا به‌طور پیش‌فرض پنهان‌اند؛
 * مدیر (OWNER/GM/ADMIN/EXEC) می‌تواند نمایششان را روشن/خاموش کند — برای همهٔ کاربران اعمال می‌شود.
 * KV: Setting(key='receiving:visibility') → JSON {showHistory:boolean, showNote:boolean}
 */

const KEY = 'receiving:visibility'
const ADMIN_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']

type ReceivingVisibility = { showHistory: boolean; showNote: boolean }

function readFlags(raw: string | null): ReceivingVisibility {
  if (!raw) return { showHistory: false, showNote: false }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        showHistory: parsed.showHistory === true,
        showNote: parsed.showNote === true,
      }
    }
  } catch {
    /* مقدار خراب → پیش‌فرض‌ها */
  }
  return { showHistory: false, showNote: false }
}

/** GET /api/settings/receiving → {showHistory, showNote} — هر کاربرِ لاگین‌شده (نمایش شرطی در صفحه) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const row = await db.setting.findUnique({ where: { key: KEY } })
  return ok(readFlags(row?.value ?? null))
}

/** PUT /api/settings/receiving {showHistory?, showNote?} — فقط مدیران (OWNER/GM/ADMIN/EXEC) */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!ADMIN_ROLES.includes(user.role)) return fail('تنظیم نمایش دریافت کالا فقط برای مدیران ممکن است', 403)

  const body = await req.json().catch(() => ({})) as { showHistory?: boolean; showNote?: boolean }
  if (typeof body.showHistory !== 'boolean' && typeof body.showNote !== 'boolean') {
    return fail('showHistory یا showNote را با مقدار بولی بفرستید')
  }

  const row = await db.setting.findUnique({ where: { key: KEY } })
  const current = readFlags(row?.value ?? null)
  const next: ReceivingVisibility = {
    showHistory: typeof body.showHistory === 'boolean' ? body.showHistory : current.showHistory,
    showNote: typeof body.showNote === 'boolean' ? body.showNote : current.showNote,
  }

  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'settings.receiving',
    actionLabel: 'تنظیم نمایش دریافت کالا',
    category: 'system',
    detail: `آخرین رویدادها: ${next.showHistory ? 'نمایش' : 'پنهان'} · یادداشت سفارش: ${next.showNote ? 'نمایش' : 'پنهان'}`,
  })

  return ok(next)
}
