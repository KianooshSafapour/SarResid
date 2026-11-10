'use client'

import { useCallback, useEffect, useState } from 'react'

const fa = (n: number) => n.toLocaleString('fa-IR')
const dt = (iso: string | null) => {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) } catch { return iso }
}

interface Config { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; fromName: string; imapHost: string; imapPort: number; imapUser: string; imapPass: string; configured: boolean }
interface Mail { uid: number; from: string; subject: string; date: string | null; seen: boolean }
interface OutRow { id: string; to: string; subject: string; status: string; error: string | null; createdAt: string; userName: string }

const TABS = [
  { key: 'inbox', label: '📥 صندوق ورودی' },
  { key: 'compose', label: '✉️ ارسال ایمیل' },
  { key: 'outbox', label: '📤 ارسالی‌ها' },
  { key: 'config', label: '⚙️ تنظیمات صندوق' },
] as const

export default function EmailClient({ fullName }: { fullName: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('inbox')
  const [cfg, setCfg] = useState<Config | null>(null)
  const [mails, setMails] = useState<Mail[] | null>(null)
  const [inboxErr, setInboxErr] = useState('')
  const [outbox, setOutbox] = useState<OutRow[] | null>(null)
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000) }
  const loadCfg = useCallback(async () => {
    const r = await fetch('/api/email/config', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (r?.ok) setCfg(r.data.config)
  }, [])
  const loadInbox = useCallback(async () => {
    setMails(null); setInboxErr('')
    const r = await fetch('/api/email/inbox', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (r?.ok) setMails(r.data.mails)
    else setInboxErr(r?.error || 'صندوق خوانده نشد')
  }, [])
  const loadOutbox = useCallback(async () => {
    const r = await fetch('/api/email/outbox', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (r?.ok) setOutbox(r.data.outbox)
  }, [])

  useEffect(() => { loadCfg() }, [loadCfg])
  useEffect(() => { if (tab === 'inbox') loadInbox() }, [tab, loadInbox])
  useEffect(() => { if (tab === 'outbox') loadOutbox() }, [tab, loadOutbox])

  const saveCfg = async () => {
    if (!cfg || busy) return
    setBusy(true)
    const r = await fetch('/api/email/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) })
    const j = await r.json()
    say(j.ok ? 'تنظیمات ایمیل ذخیره شد ✓' : j.error || 'ذخیره نشد')
    setBusy(false)
    loadCfg()
  }

  const send = async () => {
    if (busy) return
    setBusy(true)
    const r = await fetch('/api/email/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(compose) })
    const j = await r.json()
    say(j.ok ? 'ایمیل ارسال شد ✓' : j.error || 'ارسال ناموفق')
    setBusy(false)
    if (j.ok) { setCompose({ to: '', subject: '', body: '' }); setTab('outbox'); loadOutbox() }
  }

  return (
    <main className="email-wrap">
      <style>{css}</style>
      <header className="email-head">
        <div>
          <h1>✉️ ایمیل هایپر زیتون</h1>
          <p>{fullName} — صندوق hyperzeytoon.com در دل سررسید{cfg?.configured ? '' : ' (هنوز تنظیم نشده — از تب تنظیمات کامل کنید)'}</p>
        </div>
      </header>
      {toast && <div className="email-toast">{toast}</div>}

      <nav className="email-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'inbox' ? (
        mails === null ? <div className="email-skel" /> : inboxErr ? (
          <div className="email-card empty">{inboxErr}</div>
        ) : mails.length === 0 ? (
          <div className="email-card empty">صندوق خالی است</div>
        ) : (
          <div className="email-card">
            {mails.map((m) => (
              <div key={m.uid} className="mail-row">
                <span className="dot" data-seen={m.seen} />
                <div className="grow">
                  <div className="row1"><b>{m.subject}</b></div>
                  <div className="row2"><span className="from">{m.from}</span></div>
                </div>
                <time>{dt(m.date)}</time>
              </div>
            ))}
          </div>
        )
      ) : null}

      {tab === 'compose' ? (
        <div className="email-card">
          <label className="f"><span>به (ایمیل گیرنده)</span><input dir="ltr" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} placeholder="name@example.com" /></label>
          <label className="f"><span>موضوع</span><input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} /></label>
          <label className="f"><span>متن</span><textarea rows={7} value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} /></label>
          <button className="btn primary" onClick={send} disabled={busy || !compose.to || !compose.subject || !compose.body}>
            {busy ? 'در حال ارسال…' : 'ارسال ایمیل'}
          </button>
        </div>
      ) : null}

      {tab === 'outbox' ? (
        outbox === null ? <div className="email-skel" /> : outbox.length === 0 ? (
          <div className="email-card empty">هنوز ایمیلی از پلتفرم ارسال نشده</div>
        ) : (
          <div className="email-card">
            {outbox.map((o) => (
              <div key={o.id} className="mail-row">
                <span className="dot" data-status={o.status} />
                <div className="grow">
                  <div className="row1"><b>{o.subject || '(بی‌موضوع)'}</b> — <bdi dir="ltr">{o.to}</bdi></div>
                  <div className="row2">{o.status === 'SENT' ? 'ارسال شد' : o.status === 'PENDING' ? 'در صف' : `خطا: ${o.error || '—'}`} · {o.userName}</div>
                </div>
                <time>{dt(o.createdAt)}</time>
              </div>
            ))}
          </div>
        )
      ) : null}

      {tab === 'config' && cfg ? (
        <div className="email-card">
          <h3>SMTP — ارسال</h3>
          <div className="grid2">
            <label className="f"><span>هاست SMTP (مثلاً mail.hyperzeytoon.com)</span><input dir="ltr" value={cfg.smtpHost} onChange={(e) => setCfg({ ...cfg, smtpHost: e.target.value })} /></label>
            <label className="f"><span>پورت (۵۸۷ یا ۴۶۵)</span><input dir="ltr" value={cfg.smtpPort} inputMode="numeric" onChange={(e) => setCfg({ ...cfg, smtpPort: Number(e.target.value.replace(/\D/g, '')) || 587 })} /></label>
            <label className="f"><span>نام کاربری (info@hyperzeytoon.com)</span><input dir="ltr" value={cfg.smtpUser} onChange={(e) => setCfg({ ...cfg, smtpUser: e.target.value })} /></label>
            <label className="f"><span>رمز (خالی = بدون تغییر)</span><input dir="ltr" type="password" value={cfg.smtpPass.startsWith('•') ? '' : cfg.smtpPass} onChange={(e) => setCfg({ ...cfg, smtpPass: e.target.value })} /></label>
            <label className="f"><span>نام نمایشی فرستنده</span><input value={cfg.fromName} onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })} /></label>
          </div>
          <h3 style={{ marginTop: 14 }}>IMAP — صندوق ورودی</h3>
          <div className="grid2">
            <label className="f"><span>هاست IMAP</span><input dir="ltr" value={cfg.imapHost} onChange={(e) => setCfg({ ...cfg, imapHost: e.target.value })} /></label>
            <label className="f"><span>پورت (۹۹۳)</span><input dir="ltr" value={cfg.imapPort} inputMode="numeric" onChange={(e) => setCfg({ ...cfg, imapPort: Number(e.target.value.replace(/\D/g, '')) || 993 })} /></label>
            <label className="f"><span>نام کاربری</span><input dir="ltr" value={cfg.imapUser} onChange={(e) => setCfg({ ...cfg, imapUser: e.target.value })} /></label>
            <label className="f"><span>رمز (خالی = بدون تغییر)</span><input dir="ltr" type="password" value={cfg.imapPass.startsWith('•') ? '' : cfg.imapPass} onChange={(e) => setCfg({ ...cfg, imapPass: e.target.value })} /></label>
          </div>
          <p className="hint">
            راهنمای DNS (اگر صندوق را خودتان می‌سازید): رکورد MX دامنه را به سرور ایمیل‌تان بدهید و SPF بگذارید:
            <bdi dir="ltr"> v=spf1 mx a ~all</bdi> — اگر صندوق را نزد سرویس‌دهندهٔ میزبانی (پارس‌پک و…) ساختید، مقادیر SMTP/IMAP را از پنل همان سرویس بردارید.
          </p>
          <button className="btn primary" onClick={saveCfg} disabled={busy}>{busy ? '…' : '💾 ذخیرهٔ تنظیمات'}</button>
        </div>
      ) : null}
    </main>
  )
}

const css = `
.email-wrap { max-width: 860px; margin: 0 auto; padding: 18px 14px 60px; font-family: Vazirmatn, Tahoma, sans-serif }
.email-head { background: linear-gradient(135deg,#14311f,#0e7a4a); color: #fff; border-radius: 14px; padding: 14px 18px; margin-bottom: 12px }
.email-head h1 { margin: 0; font-size: 18px } .email-head p { margin: 4px 0 0; font-size: 12.5px; opacity: .85 }
.email-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap }
.email-tabs button { border: 1.5px solid #dbe5dc; background: #fff; border-radius: 999px; padding: 7px 14px; font-family: inherit; font-size: 13px; cursor: pointer }
.email-tabs button.on { background: #1f4d33; color: #fff; border-color: #1f4d33; font-weight: 700 }
.email-card { background: #fff; border: 1px solid #e4e7e1; border-radius: 14px; padding: 14px 16px; margin-bottom: 12px }
.email-card h3 { margin: 0 0 10px; font-size: 14.5px }
.email-card.empty { text-align: center; color: #71807a; padding: 34px 10px }
.grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px }
.f { display: block; margin-bottom: 10px } .f > span { display: block; font-size: 12px; color: #71807a; margin-bottom: 4px }
.f input, .f textarea { width: 100%; padding: 9px 12px; border: 1.5px solid #e4e7e1; border-radius: 10px; font-family: inherit; font-size: 14px; min-height: 42px; box-sizing: border-box }
.f input:focus, .f textarea:focus { outline: 0; border-color: #0e7a4a }
.btn { border: 1.5px solid #0e7a4a; background: #fff; color: #0e7a4a; border-radius: 10px; padding: 9px 18px; font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; min-height: 42px }
.btn.primary { background: #0e7a4a; color: #fff } .btn:disabled { opacity: .5; cursor: not-allowed }
.mail-row { display: flex; gap: 10px; align-items: center; padding: 9px 4px; border-bottom: 1px solid #f0f2ec }
.mail-row:last-child { border-bottom: 0 }
.mail-row .dot { width: 9px; height: 9px; border-radius: 50%; background: #c8a24a; flex: none }
.mail-row .dot[data-seen="true"] { background: #cbd5d0 }
.mail-row .dot[data-status="SENT"] { background: #0e7a4a } .mail-row .dot[data-status="FAILED"] { background: #b3382c }
.mail-row .grow { flex: 1; min-width: 0 }
.mail-row .row1 { font-size: 13.5px } .mail-row .row2 { font-size: 12px; color: #71807a }
.mail-row .from { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block }
.mail-row time { font-size: 11.5px; color: #9aa8a0; white-space: nowrap }
.hint { background: #f6f8f4; border: 1px dashed #dbe5dc; border-radius: 10px; padding: 8px 12px; font-size: 12.5px; color: #52604f }
.email-toast { position: fixed; bottom: 16px; inset-inline-start: 16px; background: #14311f; color: #fff; padding: 10px 16px; border-radius: 10px; font-size: 13.5px; z-index: 50 }
.email-skel { background: linear-gradient(90deg,#eef0ea 25%,#f7f9f4 50%,#eef0ea 75%); background-size: 200% 100%; animation: emsk 1.1s infinite; border-radius: 12px; height: 160px }
@keyframes emsk { to { background-position: -200% 0 } }
`
