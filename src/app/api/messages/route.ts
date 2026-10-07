import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'

/** پیوست امن: فقط تصویر/PDF/متن — سقف ۵۱۲ کیلوبایت پس از decode */
const MAX_ATTACH_BYTES = 512 * 1024
const ALLOWED_KINDS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain']
// پسوندهای خطرناک — هیچ‌وقت مجاز نیست (حتی اگر mime جعل شده باشد)
const DENY_EXT = ['.exe', '.bat', '.cmd', '.sh', '.js', '.mjs', '.jar', '.ps1', '.msi', '.com', '.scr', '.vbs', '.wsf', '.hta']

type Attachment = { name: string; kind: string; size: number; dataUrl: string }

function parseAttachment(raw: string): Attachment | null {
  if (!raw) return null
  const a = safeParse<Attachment | null>(raw, null)
  if (!a || !a.dataUrl) return null
  return { name: a.name || 'فایل', kind: a.kind || '', size: Number(a.size) || 0, dataUrl: a.dataUrl }
}

function serialize(m: {
  id: string; fromId: string; fromName: string; toId: string; body: string
  attachment: string; scheduledFor: string; status: string; readAt: Date | null; createdAt: Date
}) {
  return { ...m, attachment: parseAttachment(m.attachment) }
}

function validateAttachment(input: { name?: string; kind?: string; size?: number; dataBase64?: string }): { error?: string; att?: Attachment } {
  const name = String(input?.name || '').trim() || 'فایل'
  // path traversal — نام فایل هرگز نباید مسیر باشد
  if (/[\\/]/.test(name) || name.includes('..')) return { error: 'نام فایل نامعتبر است' }
  if (name.length > 120) return { error: 'نام فایل بیش از حد بلند است' }
  const lower = name.toLowerCase()
  if (DENY_EXT.some((ext) => lower.endsWith(ext))) return { error: 'این نوع فایل برای امنیت سامانه مجاز نیست' }
  const kind = String(input?.kind || '')
  if (!ALLOWED_KINDS.includes(kind)) return { error: 'فقط تصویر، PDF یا متن ساده مجاز است (حداکثر ۵۱۲ کیلوبایت)' }
  const b64 = String(input?.dataBase64 || '').replace(/^data:[^;]*;base64,/, '')
  if (!b64) return { error: 'محتوای فایل خالی است' }
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)
  if (bytes <= 0) return { error: 'محتوای فایل خالی است' }
  if (bytes > MAX_ATTACH_BYTES) return { error: 'حجم فایل بیش از سقف مجاز است — حداکثر ۵۱۲ کیلوبایت' }
  return { att: { name, kind, size: bytes, dataUrl: `data:${kind};base64,${b64}` } }
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const withUser = searchParams.get('with')

  const allUsers = await db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  const myMsgs = await db.message.findMany({
    where: { OR: [{ fromId: me.id }, { toId: me.id }] },
    orderBy: { createdAt: 'asc' },
  })

  // پیام‌های زمان‌بندی‌شده فقط برای خود فرستنده نمایان است تا وقت ارسال
  const visible = myMsgs.filter((m) => m.status === 'SENT' || (m.status === 'SCHEDULED' && m.fromId === me.id))

  // conversation list
  const conversations = allUsers
    .filter((u) => u.id !== me.id)
    .map((u) => {
      const msgs = visible.filter((m) => m.fromId === u.id || m.toId === u.id)
      const last = msgs[msgs.length - 1]
      const lastAtt = last ? parseAttachment(last.attachment) : null
      const unread = msgs.filter((m) => m.toId === me.id && !m.readAt && m.status === 'SENT').length
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        color: u.color,
        lastAt: last?.createdAt || null,
        lastBody: last ? last.body || (lastAtt ? `📎 ${lastAtt.name}` : '') : '',
        unread,
      }
    })
    .sort((a, b) => {
      if (!a.lastAt && !b.lastAt) return a.name.localeCompare(b.name)
      if (!a.lastAt) return 1
      if (!b.lastAt) return -1
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    })

  let messages: unknown[] = []
  if (withUser) {
    messages = visible.filter((m) => m.fromId === withUser || m.toId === withUser).map(serialize)
    // mark incoming as read (only delivered ones)
    await db.message.updateMany({
      where: { fromId: withUser, toId: me.id, readAt: null, status: 'SENT' },
      data: { readAt: new Date() },
    })
  }

  const scheduled = myMsgs.filter((m) => m.status === 'SCHEDULED' && m.fromId === me.id).map(serialize)
  const unreadTotal = visible.filter((m) => m.toId === me.id && !m.readAt && m.status === 'SENT').length
  return json({ conversations, messages, unreadTotal, scheduled })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const payload = await req.json().catch(() => null)

  // ارسال همهٔ پیام‌های زمان‌رسیده (بدون cron — کلاینت در بارگذاری و هر ۶۰ ثانیه صدا می‌زند)
  if (payload?.action === 'send-scheduled') {
    const pend = await db.message.findMany({ where: { status: 'SCHEDULED' } })
    const now = Date.now()
    const due = pend.filter((m) => {
      const t = new Date(m.scheduledFor)
      return !isNaN(t.getTime()) && t.getTime() <= now
    })
    if (due.length) {
      await db.message.updateMany({ where: { id: { in: due.map((m) => m.id) } }, data: { status: 'SENT' } })
    }
    return json({ sent: due.length })
  }

  const { toId, body: text, attachment, scheduledFor } = payload || {}
  let att: Attachment | null = null
  if (attachment) {
    const v = validateAttachment(attachment)
    if (v.error) return fail(v.error)
    att = v.att || null
  }
  if (!toId || (!text?.trim() && !att)) return fail('متن پیام یا فایل پیوست الزامی است')
  const to = await db.user.findUnique({ where: { id: toId } })
  if (!to) return fail('گیرنده یافت نشد', 404)

  // زمان‌بندی ارسال — فقط آینده معنا دارد؛ در غیر این صورت فوراً ارسال می‌شود
  let status = 'SENT'
  let scheduledAt = ''
  if (scheduledFor) {
    const t = new Date(String(scheduledFor))
    if (!isNaN(t.getTime()) && t.getTime() > Date.now() + 15_000) {
      status = 'SCHEDULED'
      scheduledAt = t.toISOString()
    }
  }

  const msg = await db.message.create({
    data: {
      fromId: me.id,
      fromName: me.name,
      toId,
      body: text?.trim() || '',
      attachment: att ? JSON.stringify(att) : '',
      scheduledFor: scheduledAt,
      status,
    },
  })
  await logActivity(
    me,
    status === 'SCHEDULED' ? 'زمان‌بندی پیام' : 'ارسال پیام',
    'message',
    msg.id,
    `به ${to.name}${att ? ` — پیوست: ${att.name}` : ''}${status === 'SCHEDULED' ? ' — زمان‌بندی‌شده' : ''}`
  )
  return json({ message: serialize(msg) }, 201)
}

/** لغو پیام زمان‌بندی‌شدهٔ خودم */
export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسه پیام الزامی است')
  const msg = await db.message.findUnique({ where: { id } })
  if (!msg || msg.fromId !== me.id) return fail('پیام یافت نشد', 404)
  if (msg.status !== 'SCHEDULED') return fail('فقط پیام زمان‌بندی‌شده قابل لغو است')
  await db.message.delete({ where: { id } })
  await logActivity(me, 'لغو پیام زمان‌بندی‌شده', 'message', id, msg.body.slice(0, 60))
  return json({ ok: true })
}
