'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cfetch, toast } from '@/lib/client'
import { faNum } from '@/lib/format'

interface Me { id: string; phone: string; name: string; ordersCount: number }

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)

  useEffect(() => {
    cfetch<Me>('/auth/me').then((res) => {
      if (res.status === 401) setNeedLogin(true)
      else if (res.ok) {
        setMe(res.data!)
        setName(res.data!.name || '')
      }
    })
  }, [])

  const save = async () => {
    setBusy(true)
    const res = await cfetch('/auth/me', 'PATCH', { name })
    setBusy(false)
    toast(res.ok ? 'نام ذخیره شد ✓' : res.error || 'ذخیره نشد')
  }

  const logout = () => {
    document.cookie = 'hz_shop=; path=/; max-age=0'
    window.location.href = '/'
  }

  if (needLogin) {
    return (
      <div className="container">
        <div className="empty">
          <span className="e">🔑</span>
          برای دیدن حساب خود وارد شوید
          <div style={{ marginTop: 12 }}>
            <Link href="/login?next=/account" className="btn primary" style={{ display: 'inline-flex' }}>
              ورود با موبایل
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container" style={{ maxWidth: 460 }}>
      <div className="form-card" style={{ marginTop: 20 }}>
        <h1 style={{ fontSize: 19, margin: '0 0 12px' }}>👤 حساب من</h1>
        {me ? (
          <>
            <p style={{ fontSize: 14 }}>
              موبایل: <bdi dir="ltr">{me.phone}</bdi>
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              <bdi>{faNum(me.ordersCount)}</bdi> سفارش تا امروز
            </p>
            <label className="field" style={{ marginTop: 8 }}>
              <span>نام نمایشی (روی فاکتور و پیامک‌ها)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: خانم احمدی" />
            </label>
            <button className="btn primary block" onClick={save} disabled={busy || name.trim().length < 2}>
              ذخیرهٔ نام
            </button>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Link href="/orders" className="btn ghost" style={{ flex: 1 }}>
                سفارش‌های من
              </Link>
              <button className="btn red" onClick={logout}>
                خروج
              </button>
            </div>
          </>
        ) : (
          <div className="skeleton" style={{ height: 120 }} />
        )}
      </div>
    </div>
  )
}
