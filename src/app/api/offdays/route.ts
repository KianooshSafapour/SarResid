import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { isFriday, jalaliToIso, jMonthLength, toJalaliParts, todayIso } from '@/lib/jalali'
import { hasCap } from '@/lib/rbac'

/* ─────────────────────────────────────────────────────────────────────────────
 *  19-c — روزهای غیرکاری اداری (Offday)
 *  GET  ?jy=&jm=  یا  ?from=&to=  (بازهٔ جلالی yyyy-mm-dd) → رکوردهای Offday در بازه
 *  POST { date, note? } → فقط مدیر: toggle — اگر رکورد باشد حذف، وگرنه ایجاد (kind=OFFDAY)
 *
 *  جمعه‌ها هرگز ذخیره نمی‌شوند: از خودِ تاریخ استنتاج می‌شوند (مادهٔ ۶۲ قانون کار —
 *  جمعه روز استراحت هفتگی با پرداخت کامل است) و در رابط فقط نشانگر مشتق‌شده دارند.
 * ────────────────────────────────────────────────────────────────────────────*/

const MANAGER_ROLES = ['OM', 'GM', 'OWNER', 'ADMIN']
const JALALI_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const pad2 = (n: number) => String(n).padStart(2, '0')

/** اعتبارسنجی تاریخ جلالی؛ خروجی: اجزای معتبر یا null */
function validJalaliDate(s: string): { jy: number; jm: number; jd: number } | null {
  const m = JALALI_DATE_RE.exec(String(s || '').trim())
  if (!m) return null
  const jy = Number(m[1])
  const jm = Number(m[2])
  const jd = Number(m[3])
  if (jy < 1380 || jy > 1460) return null
  if (!(jm >= 1 && jm <= 12)) return null
  if (!(jd >= 1 && jd <= jMonthLength(jy, jm))) return null
  return { jy, jm, jd }
}

/** GET /api/offdays — فهرست روزهای غیرکاری ثبت‌شده (برای همهٔ کاربران واردشده) */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { searchParams } = new URL(req.url)
  const cur = toJalaliParts(todayIso())
  const qjy = Math.round(Number(searchParams.get('jy')) || 0)
  const qjm = Math.round(Number(searchParams.get('jm')) || 0)
  const from = String(searchParams.get('from') || '')
  const to = String(searchParams.get('to') || '')

  let where
  if (from && to) {
    const f = validJalaliDate(from)
    const t = validJalaliDate(to)
    if (!f || !t) return fail('بازهٔ تاریخ نامعتبر است (جلالی yyyy-mm-dd)')
    where = { date: { gte: `${f.jy}-${pad2(f.jm)}-${pad2(f.jd)}`, lte: `${t.jy}-${pad2(t.jm)}-${pad2(t.jd)}` } }
  } else {
    const jy = qjy || cur.jy
    const jm = qjm || cur.jm
    if (!(jm >= 1 && jm <= 12) || !(jy >= 1380 && jy <= 1460)) return fail('ماه شمسی نامعتبر است')
    where = { date: { gte: `${jy}-${pad2(jm)}-01`, lte: `${jy}-${pad2(jm)}-${pad2(jMonthLength(jy, jm))}` } }
  }

  const offdays = await db.offday.findMany({ where, orderBy: { date: 'asc' } })
  return json({ offdays })
}

/** POST /api/offdays — toggle روز غیرکاری (فقط مدیران / دارندگان مجوز تأیید مرخصی) */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const canDecide = MANAGER_ROLES.includes(me.role) || (await hasCap(me, 'leaves.approve'))
  if (!canDecide) return fail('تعیین روز غیرکاری فقط با مدیران عملیات یا دارندگان مجوز تأیید مرخصی است', 403)

  const body = await req.json().catch(() => ({}))
  const parts = validJalaliDate(String(body.date || ''))
  if (!parts) return fail('تاریخ نامعتبر است (جلالی yyyy-mm-dd — مثلاً ۱۴۰۵-۰۶-۱۲)')
  const { jy, jm, jd } = parts
  const date = `${jy}-${pad2(jm)}-${pad2(jd)}`

  // جمعه: استنتاج خودکار از تاریخ — رکورد ذخیره نمی‌شود
  if (isFriday(jalaliToIso(jy, jm, jd))) {
    return fail('جمعه به‌صورت خودکار از تاریخ استنتاج می‌شود (روز استراحت هفتگی) — نیازی به ثبت ندارد')
  }

  const existing = await db.offday.findUnique({ where: { date } })
  if (existing) {
    await db.offday.delete({ where: { id: existing.id } })
    await logActivity(me, 'لغو روز غیرکاری اداری', 'offday', existing.id, `${date}${existing.note ? ` — ${existing.note}` : ''}`)
    return json({ created: false, offday: null, removed: existing, date })
  }

  const note = String(body.note || '').slice(0, 120)
  const created = await db.offday.create({
    data: { date, kind: 'OFFDAY', note, createdById: me.id, createdByName: me.name },
  })
  await logActivity(me, 'ثبت روز غیرکاری اداری', 'offday', created.id, `${date}${note ? ` — ${note}` : ''}`)
  return json({ created: true, offday: created, removed: null, date }, 201)
}
