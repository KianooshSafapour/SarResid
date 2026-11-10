import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'
import { SNAPSHOT_TABLES, RESTORE_CHUNK } from '@/lib/snapshot-tables'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }
type AnyDb = Record<string, any>

/**
 * POST /api/admin/snapshot/[id]/restore — «بازنشانی به آخرین وضعیت داده»
 *
 * Transaction, in this order:
 *   1) DELETE all rows of every table present in the snapshot (children first —
 *      reverse of SNAPSHOT_TABLES parent→child order)
 *   2) INSERT the snapshot rows back (parents first), ids preserved, chunked
 *      createMany batches of RESTORE_CHUNK rows.
 *
 * Tables NOT captured in the snapshot (User, ActivityLog, Notification,
 * DataSnapshot itself, …) are left untouched.
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند داده‌ها را بازنشانی کنند', 403)

  const { id } = await ctx.params
  const snap = await db.dataSnapshot.findUnique({ where: { id } })
  if (!snap) return fail('نسخه پشتیبان یافت نشد', 404)

  let dump: Record<string, unknown[]>
  try {
    dump = JSON.parse(snap.tablesJson || '{}')
    if (!dump || typeof dump !== 'object' || Array.isArray(dump)) throw new Error('bad shape')
  } catch {
    return fail('محتوای نسخه پشتیبان قابل خواندن نیست')
  }

  // فقط جدول‌های مجاز و موجود در مدل فعلی
  const tables = SNAPSHOT_TABLES.filter(
    (t) => Array.isArray(dump[t]) && typeof (db as unknown as AnyDb)[t]?.createMany === 'function',
  )
  if (tables.length === 0) return fail('این نسخه پشتیبان جدول قابل بازیابی ندارد')

  const dbAny = db as unknown as AnyDb
  const restored: Record<string, number> = {}
  const skipped = Object.keys(dump).filter((t) => !tables.includes(t))

  try {
    await db.$transaction(
      async (tx) => {
        const txAny = tx as unknown as AnyDb
        // ۱) حذف — فرزندان اول (ترتیب معکوس درج)
        for (let i = tables.length - 1; i >= 0; i--) {
          await txAny[tables[i]].deleteMany({})
        }
        // ۲) درج — والدین اول، با حفظ شناسه‌ها
        for (const t of tables) {
          const rows = dump[t] as Record<string, unknown>[]
          for (let i = 0; i < rows.length; i += RESTORE_CHUNK) {
            const chunk = rows.slice(i, i + RESTORE_CHUNK)
            await txAny[t].createMany({ data: chunk })
          }
          restored[t] = rows.length
        }
      },
      { timeout: 180_000, maxWait: 15_000 },
    )
  } catch (e) {
    return fail(`بازنشانی ناموفق بود: ${String((e as Error)?.message || e).slice(0, 200)}`)
  }

  const rowCount = Object.values(restored).reduce((s, n) => s + n, 0)
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'snapshot.restore',
    actionLabel: 'بازنشانی داده',
    category: 'settings',
    detail: `${snap.name} — ${toFaDigits(String(tables.length))} جدول، ${toFaDigits(String(rowCount))} ردیف بازیابی شد`,
    entityId: id,
  })

  return ok({ id, name: snap.name, tables: tables.length, rowCount, restored, skipped })
}
