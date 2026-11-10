import nodemailer from 'nodemailer'
import { db } from '@/lib/db'

/**
 * R20 — بخش ایمیل سررسید: ارسال SMTP + صندوق IMAP برای صندوقِ hyperzeytoon.com.
 * پیکربندی از Setting (مثل مرکز پیامک) — بدون راز در کد؛ هر سرویس‌دهندهٔ ایمیل
 * (پارس‌پک/مای‌سایت/…) که SMTP/IMAP بدهد پشتیبانی می‌شود.
 */

export const EMAIL_SETTING_KEYS = ['email:smtpHost', 'email:smtpPort', 'email:smtpUser', 'email:smtpPass', 'email:fromName', 'email:imapHost', 'email:imapPort', 'email:imapUser', 'email:imapPass'] as const

export interface EmailConfig {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  fromName: string
  imapHost: string
  imapPort: number
  imapUser: string
  imapPass: string
}

function rawSetting(v: string | undefined, d = ''): string {
  if (v === undefined) return d
  try {
    const p = JSON.parse(v)
    if (typeof p === 'string') return p
    if (typeof p === 'number') return String(p)
  } catch { /* خام */ }
  return v
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const rows = await db.setting.findMany({ where: { key: { in: EMAIL_SETTING_KEYS as unknown as string[] } } })
  const m = new Map(rows.map((r) => [r.key, r.value]))
  const g = (k: string, d = '') => rawSetting(m.get(k), d)
  return {
    smtpHost: g('email:smtpHost'),
    smtpPort: Number(g('email:smtpPort', '587')) || 587,
    smtpUser: g('email:smtpUser'),
    smtpPass: g('email:smtpPass'),
    fromName: g('email:fromName', 'هایپر زیتون'),
    imapHost: g('email:imapHost'),
    imapPort: Number(g('email:imapPort', '993')) || 993,
    imapUser: g('email:imapUser'),
    imapPass: g('email:imapPass'),
  }
}

export function isEmailConfigured(c: EmailConfig): boolean {
  return !!(c.smtpHost && c.smtpUser && c.smtpPass)
}

export interface EmailSendResult { ok: boolean; messageId?: string; error?: string }

/** ارسال ایمیل SMTP + ثبت در EmailOutbox */
export async function sendEmail(opts: {
  to: string
  subject: string
  body: string
  user?: { id: string; fullName: string } | null
}): Promise<EmailSendResult> {
  const cfg = await getEmailConfig()
  const row = await db.emailOutbox.create({
    data: {
      to: opts.to, subject: opts.subject.slice(0, 200), body: opts.body.slice(0, 20000),
      status: 'PENDING', userId: opts.user?.id ?? null, userName: opts.user?.fullName ?? '',
    },
  })
  if (!isEmailConfigured(cfg)) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', error: 'ایمیل تنظیم نشده — SMTP را از تنظیمات ایمیل کامل کنید' } })
    return { ok: false, error: 'ایمیل تنظیم نشده — SMTP را از تنظیمات ایمیل کامل کنید' }
  }
  try {
    const transport = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpPort === 465,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      connectionTimeout: 15000,
    })
    const info = await transport.sendMail({
      from: `"${cfg.fromName}" <${cfg.smtpUser}>`,
      to: opts.to,
      subject: opts.subject,
      html: `<div style="font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;white-space:pre-wrap">${opts.body.replace(/</g, '&lt;')}</div>`,
      text: opts.body,
    })
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'SENT', messageId: info.messageId || null, sentAt: new Date() } })
    return { ok: true, messageId: info.messageId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', error: msg.slice(0, 400) } })
    return { ok: false, error: msg }
  }
}

export interface InboxMail {
  uid: number
  from: string
  subject: string
  date: string | null
  snippet: string
  seen: boolean
}

/** خواندن صندوق ورودی IMAP (۳۰ ایمیل آخر) — هرگز throw نمی‌کند */
export async function readInbox(limit = 30): Promise<{ ok: boolean; mails?: InboxMail[]; error?: string }> {
  const cfg = await getEmailConfig()
  if (!cfg.imapHost || !cfg.imapUser || !cfg.imapPass) {
    return { ok: false, error: 'IMAP تنظیم نشده — از تنظیمات ایمیل کامل کنید' }
  }
  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: cfg.imapHost,
      port: cfg.imapPort,
      secure: cfg.imapPort === 993,
      auth: { user: cfg.imapUser, pass: cfg.imapPass },
      logger: false as unknown as undefined,
    })
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    const mails: InboxMail[] = []
    try {
      const mb = client.mailbox
      const total = (mb && typeof mb === 'object' ? (mb as { exists?: number }).exists : 0) || 0
      const start = Math.max(1, total - limit + 1)
      if (total > 0) {
        for await (const msg of client.fetch(`${start}:${total}` as unknown as Parameters<typeof client.fetch>[0], { envelope: true, flags: true }, { uid: false })) {
          const env = msg.envelope
          if (!env) continue
          const flags = msg.flags as unknown as Set<string> | undefined
          const seen = flags ? [...flags].includes('\Seen') : false
          mails.push({
            uid: Number(msg.uid) || 0,
            from: env.from?.map((a) => a.name ? `${a.name} <${a.address ?? ''}>` : a.address ?? '').join('، ') || '—',
            subject: env.subject || '(بی‌موضوع)',
            date: env.date ? new Date(env.date).toISOString() : null,
            snippet: '',
            seen,
          })
        }
      }
    } finally {
      lock.release()
    }
    await client.logout()
    return { ok: true, mails: mails.reverse() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'اتصال IMAP برقرار نشد' }
  }
}
