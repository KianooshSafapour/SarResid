import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** سقف حجم فایل: ۲٫۵ مگابایت */
const MAX_SIZE = 2.5 * 1024 * 1024

export const DOC_KINDS = ['NATIONAL_CARD', 'ID_BOOK', 'CONTRACT', 'PHOTO', 'CERT', 'PAYSLIP', 'OTHER'] as const

/** mime مجاز: تصویر یا PDF */
function allowedMime(mime: string): boolean {
  return /^image\//i.test(mime) || mime === 'application/pdf'
}

/** GET /api/hr/documents?userId= → فهرست مدارک (فقط متادیتا، بدون dataUrl)
 *  مدیران: هر پرسنلی — سایر کاربران: فقط مدارک خودشان */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  let userId = req.nextUrl.searchParams.get('userId') || ''
  if (!isManager(user)) userId = user.id // غیرمدیر فقط پروندهٔ خودش
  if (!userId) return fail('شناسه پرسنل مشخص نشده است')

  const docs = await db.staffDocument.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      kind: true,
      title: true,
      mimeType: true,
      size: true,
      note: true,
      uploadedBy: true,
      createdAt: true,
    },
  })

  return ok({ items: docs })
}

/** POST /api/hr/documents (multipart: file + userId + kind + title + note) — فقط مدیران */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند مدرک بارگذاری کنند', 403)

  let form: FormData
  try { form = await req.formData() } catch { return fail('فایل ارسال نشده است') }

  const userId = String(form.get('userId') || '')
  if (!userId) return fail('شناسه پرسنل مشخص نشده است')
  const target = await db.user.findUnique({ where: { id: userId } })
  if (!target) return fail('کاربر مورد نظر یافت نشد', 404)

  const kind = String(form.get('kind') || '')
  if (!(DOC_KINDS as readonly string[]).includes(kind)) return fail('نوع مدرک نامعتبر است')

  const file = form.get('file')
  if (!file || typeof file === 'string') return fail('فایلی انتخاب نشده است')
  const blob = file as File

  if (!allowedMime(blob.type || '')) return fail('فقط تصویر (JPG/PNG/…) یا PDF مجاز است')
  if (blob.size <= 0) return fail('فایل خالی است')
  if (blob.size > MAX_SIZE) return fail('حجم فایل نباید از ۲٫۵ مگابایت بیشتر باشد')

  const buf = Buffer.from(await blob.arrayBuffer())
  const b64 = buf.toString('base64')
  const dataUrl = `data:${blob.type};base64,${b64}`

  const title = String(form.get('title') || '').trim().slice(0, 120)
  const note = String(form.get('note') || '').trim().slice(0, 400)

  const doc = await db.staffDocument.create({
    data: {
      userId,
      kind,
      title,
      mimeType: blob.type,
      size: blob.size,
      dataUrl,
      note,
      uploadedBy: user.fullName,
    },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'staffdoc.upload',
    actionLabel: 'مدارک پرسنل',
    category: 'personnel',
    detail: `${kind} برای ${target.fullName}${title ? ` — ${title}` : ''}`,
    entityId: doc.id,
  })

  return ok({ id: doc.id, kind: doc.kind, title: doc.title, size: doc.size, mimeType: doc.mimeType })
}
