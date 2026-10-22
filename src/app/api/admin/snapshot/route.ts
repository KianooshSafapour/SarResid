import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'
import { SNAPSHOT_TABLES, SUMMARY_TABLES, SNAPSHOT_KINDS } from '@/lib/snapshot-tables'

export const dynamic = 'force-dynamic'

type AnyDb = Record<string, any>

/** GET /api/admin/snapshot → {snapshots, summary} — list (without heavy payload) + current-state counts */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!isManager(me)) return fail('دسترسی به این بخش ندارید', 403)

  const rows = await db.dataSnapshot.findMany({ orderBy: { createdAt: 'desc' } })
  const dbAny = db as unknown as AnyDb

  const countEntries = await Promise.all(
    SUMMARY_TABLES.map(async (t) => {
      const n = await dbAny[t].count()
      return [t, typeof n === 'number' ? n : 0] as const
    }),
  )
  const users = await db.user.count()

  return ok({
    snapshots: rows.map((s) => ({
      id: s.id,
      name: s.name,
      note: s.note,
      kind: s.kind,
      tableCount: s.tableCount,
      rowCount: s.rowCount,
      sizeBytes: (s.tablesJson || '').length,
      createdBy: s.createdBy,
      createdAt: s.createdAt,
    })),
    summary: {
      counts: Object.fromEntries(countEntries) as Record<string, number>,
      userCount: users,
      totalRows: countEntries.reduce((sum, [, n]) => sum + n, 0),
    },
  })
}

/**
 * POST /api/admin/snapshot {name, note?, kind?}
 * — dump all covered tables into one DataSnapshot (MANUAL | BASELINE | PRE_IMPORT)
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند نسخه پشتیبان بسازند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')
  const name = String((body as Record<string, unknown>).name ?? '').trim()
  if (name.length < 2 || name.length > 80) return fail('نام نسخه را بین ۲ تا ۸۰ نویسه وارد کنید')
  const note = String((body as Record<string, unknown>).note ?? '').trim().slice(0, 400)
  const kindRaw = String((body as Record<string, unknown>).kind ?? 'MANUAL').trim().toUpperCase()
  const kind = (SNAPSHOT_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : 'MANUAL'

  const dbAny = db as unknown as AnyDb
  const dump: Record<string, unknown[]> = {}
  let rowCount = 0

  for (const t of SNAPSHOT_TABLES) {
    if (typeof dbAny[t]?.findMany !== 'function') continue // model missing → skip
    const rows = await dbAny[t].findMany()
    dump[t] = rows
    rowCount += rows.length
  }

  const tablesJson = JSON.stringify(dump)
  const tableCount = Object.keys(dump).length

  const created = await db.dataSnapshot.create({
    data: {
      name,
      note,
      kind,
      tablesJson,
      tableCount,
      rowCount,
      createdBy: me.fullName,
    },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'snapshot.create',
    actionLabel: 'پشتیبان داده',
    category: 'settings',
    detail: `${name} — ${toFaDigits(String(tableCount))} جدول، ${toFaDigits(String(rowCount))} ردیف، ${toFaDigits(String(Math.round(tablesJson.length / 1024)))} کیلوبایت`,
    entityId: created.id,
  })

  return ok({
    id: created.id,
    name: created.name,
    kind: created.kind,
    tableCount,
    rowCount,
    sizeBytes: tablesJson.length,
    createdAt: created.createdAt,
  })
}
