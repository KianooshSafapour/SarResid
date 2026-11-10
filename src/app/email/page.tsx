import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import EmailClient from './email-client'

export const dynamic = 'force-dynamic'

/** /email — بخش ایمیل سررسید (SMTP/IMAP صندوق hyperzeytoon.com) */
export default async function EmailPage() {
  const user = await getSessionUser()
  if (!user) {
    return (
      <main className="email-wrap">
        <div className="email-card">
          <h1>ایمیل هایپر زیتون</h1>
          <p className="muted">اول وارد سررسید شوید، بعد به همین نشانی برگردید: <bdi dir="ltr">/email</bdi></p>
        </div>
      </main>
    )
  }
  if (!['OWNER', 'GM', 'ADMIN', 'ACC'].includes(user.role)) {
    return (
      <main className="email-wrap">
        <div className="email-card"><h1>ایمیل</h1><p className="muted">این بخش برای نقش شما باز نیست.</p></div>
      </main>
    )
  }
  return <EmailClient fullName={user.fullName} />
}
