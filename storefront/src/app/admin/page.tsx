'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const ALLOWED_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']
const ROLE_FA: Record<string, string> = { OWNER: 'مدیر عامل', GM: 'مدیر کل', ADMIN: 'مدیر عملیات و IT', EXEC: 'مدیر اجرایی' }

interface User { id: string; username: string; fullName: string; honorific: string; role: string }

/** ورود مدیران فروشگاه آنلاین — همان حساب «سر رسید» (نام کاربری + رمز یا انتخاب همکار) */
export default function AdminLoginPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[] | null>(null)
  const [mode, setMode] = useState<'username' | 'pick'>('username')
  const [userId, setUserId] = useState('')
  const [username, setUsername] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/auth/me').then((r) => r.json()).then((j) => {
      if (j?.ok && ALLOWED_ROLES.includes(j.data?.user?.role ?? j.data?.role)) router.replace('/admin/orders')
    }).catch(() => null)
    fetch('/api/admin/auth/roster').then((r) => r.json()).then((j) => {
      if (j?.ok) setUsers((j.data.users || []).filter((u: User) => ALLOWED_ROLES.includes(u.role)))
    }).catch(() => null)
  }, [router])

  const resolveUser = (): string | null => {
    if (mode === 'pick') return userId || null
    const u = (users || []).find((x) => x.username.toLowerCase() === username.trim().toLowerCase())
    return u ? u.id : null
  }

  const login = async (passwordMode: boolean) => {
    const uid = resolveUser()
    if (busy || !uid || value.length < 4) return
    setBusy(true)
    setError('')
    const res = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: uid, mode: passwordMode ? 'password' : 'pin', value }),
    })
    const j = await res.json().catch(() => ({ ok: false }))
    setBusy(false)
    if (!j.ok) { setError(j.error || 'ورود ناموفق بود'); return }
    const me = await fetch('/api/admin/auth/me').then((r) => r.json()).catch(() => ({ ok: false }))
    const role = me?.data?.user?.role ?? me?.data?.role
    if (!me?.ok || !ALLOWED_ROLES.includes(role)) { setError('این بخش فقط برای مدیران و مدیر سامانه است'); return }
    router.replace('/admin/orders')
  }

  return (
    <div className="adm-login">
      <h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" />
        مدیریت فروشگاه هایپر زیتون
      </h1>
      <p className="sub">ورود با همان حساب «سر رسید» — رمز، همان رمز ورود شما به sarresid.hyperzeytoon.com است</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="adm-btn sm" style={mode === 'username' ? { background: '#c8a24a', borderColor: '#c8a24a', color: '#241d08' } : {}} onClick={() => setMode('username')}>نام کاربری + رمز</button>
        <button className="adm-btn sm" style={mode === 'pick' ? { background: '#c8a24a', borderColor: '#c8a24a', color: '#241d08' } : {}} onClick={() => setMode('pick')}>انتخاب همکار</button>
      </div>

      {mode === 'username' ? (
        <label className="adm-field">
          <span>نام کاربری سر رسید (مثل kianoosh)</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" autoFocus />
        </label>
      ) : (
        <label className="adm-field">
          <span>همکار</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">انتخاب کنید…</option>
            {(users || []).map((u) => (
              <option key={u.id} value={u.id}>
                {`${u.honorific || ''} ${u.fullName}`.trim()} ({ROLE_FA[u.role] || u.role})
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="adm-field">
        <span>رمز عبور</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login(true)} type="password" dir="ltr" />
      </label>
      {error ? <p className="adm-note">{error}</p> : null}
      <button className="adm-btn" style={{ width: '100%' }} onClick={() => login(true)} disabled={busy || !resolveUser() || value.length < 4}>
        {busy ? 'در حال بررسی…' : 'ورود به پنل مدیریت'}
      </button>
      <button className="adm-btn sm ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => login(false)} disabled={busy || !resolveUser() || value.length !== 4}>
        ورود با کد ۴ رقمی
      </button>
      <p style={{ fontSize: 11.5, color: '#9db3a3', marginTop: 12, textAlign: 'center' }}>
        پنل داخلی کارکنان: sarresid.hyperzeytoon.com/shop-ops
      </p>
    </div>
  )
}
