import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

/* ── پروندهٔ پرسنل — ویرایش/حذف + آپلود و حذف مدرک (تصویر/PDF تا ۱٫۵ مگابایت) + اتصال حساب کاربری ──
 * مدارک روی دیسک در public/personnel-docs ذخیره می‌شوند و متادیتا در JSON فیلد documents می‌ماند. */

type Child = { name: string; birthday: string; gender: string }
type Emergency = { name: string; phone: string; relation: string }
type Doc = { name: string; kind: string; url: string; size: number; addedAt: string; addedByName: string }

const DOCS_DIR = path.join(process.cwd(), 'public', 'personnel-docs')
const MAX_DOC_BYTES = 1_500_000 // ۱٫۵ مگابایت
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
}

type PersonnelLike = {
  id: string; firstName: string; lastName: string; nationalId: string; phone: string; address: string
  birthday: string; hireDate: string; jobTitle: string; department: string; bankCard: string; shaba: string
  baseSalary: number; childSupport: number; children: string; emergencyContact: string; documents: string
  notes: string; userId: string; active: boolean; createdAt: Date; updatedAt: Date
}

function parsePersonnel(p: PersonnelLike) {
  return {
    ...p,
    children: safeParse<Child[]>(p.children, []),
    emergencyContact: safeParse<Emergency>(p.emergencyContact, { name: '', phone: '', relation: '' }),
    documents: safeParse<Doc[]>(p.documents, []),
  }
}

async function canManage(me: Awaited<ReturnType<typeof getSessionUser>>): Promise<boolean> {
  if (!me) return false
  if (['HC', 'ACC', 'OM', 'GM', 'OWNER', 'ADMIN'].includes(me.role)) return true
  return hasCap(me, 'personnel.manage')
}

/** فقط مسیرهای داخل public/personnel-docs و بدون .. مجازند */
function isSafeDocUrl(url: string): boolean {
  if (!url.startsWith('/personnel-docs/')) return false
  if (url.includes('..')) return false
  const base = url.slice('/personnel-docs/'.length)
  return !!base && !base.includes('/') && !base.startsWith('.')
}

function removeDocFile(url: string) {
  if (!isSafeDocUrl(url)) return
  try {
    fs.unlinkSync(path.join(DOCS_DIR, path.basename(url)))
  } catch {
    /* فایل از قبل نبود — مهم نیست */
  }
}

/* ── PATCH — ویرایش همهٔ فیلدها (+ تغییر اتصال حساب با userId) ── */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!(await canManage(me))) return fail('دسترسی غیرمجاز', 403)
  const p = await db.personnel.findUnique({ where: { id } })
  if (!p) return fail('پرونده یافت نشد', 404)
  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.firstName !== undefined) data.firstName = String(body.firstName).trim()
  if (body.lastName !== undefined) data.lastName = String(body.lastName).trim()
  if (body.nationalId !== undefined) data.nationalId = body.nationalId
  if (body.phone !== undefined) data.phone = body.phone
  if (body.address !== undefined) data.address = body.address
  if (body.birthday !== undefined) data.birthday = body.birthday
  if (body.hireDate !== undefined) data.hireDate = body.hireDate
  if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle
  if (body.department !== undefined) data.department = body.department
  if (body.bankCard !== undefined) data.bankCard = body.bankCard
  if (body.shaba !== undefined) data.shaba = body.shaba
  if (body.baseSalary !== undefined) data.baseSalary = Number(body.baseSalary) || 0
  if (body.childSupport !== undefined) data.childSupport = Number(body.childSupport) || 0
  if (body.children !== undefined) data.children = JSON.stringify(Array.isArray(body.children) ? body.children : [])
  if (body.emergencyContact !== undefined)
    data.emergencyContact = JSON.stringify(body.emergencyContact || { name: '', phone: '', relation: '' })
  if (body.notes !== undefined) data.notes = body.notes
  if (body.active !== undefined) data.active = !!body.active

  // اتصال/تغییر حساب کاربری — وجود حساب بررسی می‌شود و personnelId هر دو طرف همگام می‌ماند
  if (body.userId !== undefined) {
    const newUserId = typeof body.userId === 'string' ? body.userId : ''
    if (newUserId && newUserId !== p.userId) {
      const u = await db.user.findUnique({ where: { id: newUserId } })
      if (!u) return fail('حساب کاربری انتخاب‌شده یافت نشد', 404)
      if (u.personnelId && u.personnelId !== p.id) return fail('این حساب کاربری به پروندهٔ دیگری متصل است')
    }
    data.userId = newUserId
    if (newUserId) await db.user.update({ where: { id: newUserId }, data: { personnelId: p.id } })
    if (p.userId && p.userId !== newUserId) {
      await db.user.update({ where: { id: p.userId }, data: { personnelId: '' } }).catch(() => {})
    }
  }

  const updated = await db.personnel.update({ where: { id: p.id }, data })
  await logActivity(me, 'ویرایش پروندهٔ پرسنل', 'personnel', p.id, `${updated.firstName} ${updated.lastName}`)
  return json({ personnel: parsePersonnel(updated) })
}

/* ── DELETE — حذف پرونده + پاک‌سازی فایل مدارک + قطع اتصال حساب ── */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!(await canManage(me))) return fail('دسترسی غیرمجاز', 403)
  const p = await db.personnel.findUnique({ where: { id } })
  if (!p) return fail('پرونده یافت نشد', 404)

  const docs = safeParse<Doc[]>(p.documents, [])
  for (const d of docs) removeDocFile(d.url)
  if (p.userId) await db.user.update({ where: { id: p.userId }, data: { personnelId: '' } }).catch(() => {})
  await db.personnel.delete({ where: { id: p.id } })
  await logActivity(me, 'حذف پروندهٔ پرسنل', 'personnel', p.id, `${p.firstName} ${p.lastName}`)
  return json({ ok: true })
}

/* ── POST — اقدام‌ها: add-doc | remove-doc | link-user | unlink-user ── */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!(await canManage(me))) return fail('دسترسی غیرمجاز', 403)
  const p = await db.personnel.findUnique({ where: { id } })
  if (!p) return fail('پرونده یافت نشد', 404)
  const body = await req.json()
  const docs = safeParse<Doc[]>(p.documents, [])

  /* ثبت مدرک جدید — فقط تصویر یا PDF، حداکثر ۱٫۵ مگابایت */
  if (body.action === 'add-doc') {
    const { name, kind, dataBase64 } = body
    if (!name || !kind || !dataBase64) return fail('نام، نوع و محتوای فایل الزامی است')
    const mime = String(kind)
    if (!mime.startsWith('image/') && mime !== 'application/pdf')
      return fail('فقط تصویر (image) یا فایل PDF قابل ثبت است')
    const raw = String(dataBase64)
    const b64 = raw.includes(',') ? raw.split(',')[1] : raw
    const buf = Buffer.from(b64 || '', 'base64')
    if (!buf.length) return fail('فایل خالی است')
    if (buf.length > MAX_DOC_BYTES) return fail('حجم فایل بیش از سقف مجاز است — حداکثر ۱٫۵ مگابایت')

    const ext = MIME_EXT[mime] || (String(name).split('.').pop() || 'bin').toLowerCase().slice(0, 5)
    fs.mkdirSync(DOCS_DIR, { recursive: true })
    const filename = `${p.id}-${Date.now()}.${ext}`
    fs.writeFileSync(path.join(DOCS_DIR, filename), buf)

    const doc: Doc = {
      name: String(name).slice(0, 160),
      kind: mime,
      url: `/personnel-docs/${filename}`,
      size: buf.length,
      addedAt: new Date().toISOString(),
      addedByName: me!.name,
    }
    const updated = await db.personnel.update({
      where: { id: p.id },
      data: { documents: JSON.stringify([...docs, doc]) },
    })
    await logActivity(me, 'ثبت مدرک پرسنل', 'personnel', p.id, `${doc.name} (${p.firstName} ${p.lastName})`)
    return json({ ok: true, doc, documents: safeParse<Doc[]>(updated.documents, []) }, 201)
  }

  /* حذف مدرک — فایل دیسک + متادیتا */
  if (body.action === 'remove-doc') {
    const url = String(body.url || '')
    if (!isSafeDocUrl(url)) return fail('آدرس مدرک نامعتبر است')
    const doc = docs.find((d) => d.url === url)
    removeDocFile(url)
    const updated = await db.personnel.update({
      where: { id: p.id },
      data: { documents: JSON.stringify(docs.filter((d) => d.url !== url)) },
    })
    await logActivity(me, 'حذف مدرک پرسنل', 'personnel', p.id, `${doc?.name || url} (${p.firstName} ${p.lastName})`)
    return json({ ok: true, documents: safeParse<Doc[]>(updated.documents, []) })
  }

  /* اتصال حساب کاربری به پرونده */
  if (body.action === 'link-user') {
    const userId = String(body.userId || '')
    if (!userId) return fail('حساب کاربری الزامی است')
    const u = await db.user.findUnique({ where: { id: userId } })
    if (!u) return fail('حساب کاربری یافت نشد', 404)
    if (u.personnelId && u.personnelId !== p.id) return fail('این حساب کاربری به پروندهٔ دیگری متصل است')
    if (p.userId && p.userId !== userId) {
      await db.user.update({ where: { id: p.userId }, data: { personnelId: '' } }).catch(() => {})
    }
    await db.user.update({ where: { id: userId }, data: { personnelId: p.id } })
    const updated = await db.personnel.update({ where: { id: p.id }, data: { userId } })
    await logActivity(me, 'اتصال حساب کاربری به پرونده', 'personnel', p.id, `${u.name} → ${p.firstName} ${p.lastName}`)
    return json({ ok: true, personnel: parsePersonnel(updated) })
  }

  /* قطع اتصال حساب کاربری */
  if (body.action === 'unlink-user') {
    if (p.userId) await db.user.update({ where: { id: p.userId }, data: { personnelId: '' } }).catch(() => {})
    const updated = await db.personnel.update({ where: { id: p.id }, data: { userId: '' } })
    await logActivity(me, 'قطع اتصال حساب از پرونده', 'personnel', p.id, `${p.firstName} ${p.lastName}`)
    return json({ ok: true, personnel: parsePersonnel(updated) })
  }

  return fail('اقدام ناشناخته است')
}
