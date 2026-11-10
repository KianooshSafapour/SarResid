'use client'

import { useState } from 'react'
import { faMoney, faDateTime } from '@/lib/format'

interface TrackResult {
  ok: boolean
  order?: { code: string; statusFa: string; total: number; slotDate: string | null; slotFrom: string | null; slotTo: string | null; createdAt: string }
  error?: string
}

/** پیگیری سفارش فقط با کد + شمارهٔ موبایل (بدون ورود) */
export default function TrackPage() {
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [res, setRes] = useState<TrackResult | null>(null)
  const [busy, setBusy] = useState(false)

  const track = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !code.trim() || phone.trim().length < 10) return
    setBusy(true)
    setRes(null)
    const r = await fetch(`/api/shop/track?code=${encodeURIComponent(code.trim())}&phone=${encodeURIComponent(phone.trim())}`).then((x) => x.json()).catch(() => ({ ok: false, error: 'ارتباط برقرار نشد' }))
    setRes(r)
    setBusy(false)
  }

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 20, margin: '22px 0 4px' }}>🚚 پیگیری سفارش</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 14px' }}>کد سفارش و شمارهٔ موبایلی که با آن سفارش ثبت کردید را وارد کنید.</p>
      <form className="form-card" onSubmit={track}>
        <label className="field">
          <span>کد سفارش (مثل HZ-WEB-0017)</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" placeholder="HZ-WEB-…" />
        </label>
        <label className="field">
          <span>شمارهٔ موبایل</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" dir="ltr" placeholder="۰۹…" />
        </label>
        <button className="btn primary block" type="submit" disabled={busy || !code.trim() || phone.trim().length < 10}>
          {busy ? 'در حال جست‌وجو…' : 'پیگیری'}
        </button>
      </form>

      {res ? res.ok && res.order ? (
        <div className="order-card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <b><bdi>{res.order.code}</bdi></b>
            <span className="status-pill">{res.order.statusFa}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 4px' }}>ثبت: {faDateTime(res.order.createdAt)}</p>
          {res.order.slotDate ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 4px' }}>تحویل: {res.order.slotDate} ساعت {res.order.slotFrom}–{res.order.slotTo}</p> : null}
          <p style={{ margin: '6px 0 0', fontSize: 14.5 }}><bdi>{faMoney(res.order.total)}</bdi></p>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>
            برای جزئیات کامل و تاریخچهٔ وضعیت، از همان شماره وارد حساب خود شوید: <a href="/orders" style={{ color: 'var(--olive-2)', textDecoration: 'underline' }}>سفارش‌های من</a>
          </p>
        </div>
      ) : (
        <p className="error-text" style={{ marginTop: 12 }}>{res.error || 'سفارشی با این کد و شماره پیدا نشد'}</p>
      ) : null}
    </div>
  )
}
