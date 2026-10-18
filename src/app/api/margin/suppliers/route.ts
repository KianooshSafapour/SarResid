import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/margin/suppliers → {suppliers:[{id,name,code}]} — full Holoo catalogue */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const rows = await db.supplier.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  })
  return ok({ suppliers: rows })
}
