import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { broadcastSms, normalizeMobile, sendViaPanelDetailed, getDefaultPanel, type SmsOutboxRow } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const MAX_MANUAL = 50

function rowOut(r: SmsOutboxRow) {
  return {
    id: r.id,
    to: r.to,
    toName: r.toName,
    text: r.text,
    reason: r.reason,
    status: r.status,
    provider: r.provider,
    messageId: r.messageId,
    error: r.error,
    createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
  }
}

/**
 * POST /api/sms/send {text, to?: string[], audience?: 'ALL'|'ROLE:xx', reason?} — managers only.
 * - manual numbers (to[]) → sent through the default panel (invalid ones → FAILED rows)
 * - audience broadcast ('ALL' | 'ROLE:xxx') → deduped recipients with phone
 * Returns the outbox rows created (SENT / FAILED / SKIPPED).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند پیامک ارسال کنند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const text = String(body.text ?? '').trim()
  if (!text) return fail('متن پیامک را وارد کنید')
  if (text.length > 700) return fail('متن پیامک بیش از حد طولانی است (حداکثر ۷۰۰ نویسه)')

  const reason = /^[A-Z_]{2,40}$/.test(String(body.reason ?? '')) ? String(body.reason) : 'MANUAL'

  const manualRaw: string[] = Array.isArray(body.to) ? body.to.map((t) => String(t ?? '').trim()).filter(Boolean) : []
  const audience = String(body.audience ?? '').trim()
  if (!manualRaw.length && !audience) return fail('گیرندگان را انتخاب کنید یا شماره وارد کنید')

  const rows: SmsOutboxRow[] = []

  // ---- manual numbers ----
  if (manualRaw.length) {
    if (manualRaw.length > MAX_MANUAL) return fail(`حداکثر ${MAX_MANUAL} شماره در هر ارسال مجاز است`)
    // resolve display names by phone (users + personnel)
    const nameByPhone = new Map<string, string>()
    const [users, personnel] = await Promise.all([
      db.user.findMany({ where: { active: true }, select: { fullName: true, phone: true } }),
      db.personnel.findMany({ where: { active: true }, select: { fullName: true, phone: true } }),
    ])
    for (const p of [...users, ...personnel]) {
      const n = normalizeMobile(p.phone)
      if (n && !nameByPhone.has(n)) nameByPhone.set(n, p.fullName)
    }

    const panel = await getDefaultPanel()
    for (const raw of manualRaw) {
      const to = normalizeMobile(raw) ?? raw
      const toName = nameByPhone.get(normalizeMobile(raw) ?? '') ?? ''
      if (panel) {
        const outcome = await sendViaPanelDetailed(panel, to, text, { reason, toName })
        rows.push(outcome.row)
      } else {
        const row = await db.smsOutbox.create({
          data: {
            to,
            toName,
            text,
            reason,
            status: 'SKIPPED',
            provider: '',
            error: 'پنل پیامک پیش‌فرض فعالی تنظیم نشده است',
          },
        })
        rows.push(row as SmsOutboxRow)
      }
    }
  }

  // ---- audience broadcast ----
  if (audience) {
    if (audience !== 'ALL' && !audience.startsWith('ROLE:')) {
      return fail('مخاطبان ارسال نامعتبر است (همه کاربران یا نقش مشخص)')
    }
    const broadcastRows = await broadcastSms(reason, text, audience)
    rows.push(...broadcastRows)
  }

  const sent = rows.filter((r) => r.status === 'SENT').length
  const failed = rows.filter((r) => r.status === 'FAILED').length
  const skipped = rows.filter((r) => r.status === 'SKIPPED').length

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'sms.send',
    actionLabel: 'مرکز پیامک',
    category: 'settings',
    detail: `ارسال به ${sent + failed + skipped} گیرنده (ارسال‌شده: ${sent}، ناموفق: ${failed}، صرف‌نظر: ${skipped})`,
  })

  return ok({ rows: rows.map(rowOut), sent, failed, skipped })
}
