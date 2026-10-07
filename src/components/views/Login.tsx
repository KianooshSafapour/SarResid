'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client'
import { Avatar } from '@/components/app/ui-bits'
import { faNum } from '@/lib/jalali'
import { ROLE_LABELS, SECONDARY_LABELS } from '@/lib/constants'
import { useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type UserLite = { id: string; name: string; role: string; secondaryRoles: string[]; color: string; active: boolean }

export default function LoginView({ onLogin }: { onLogin: (user: any, token?: string) => void }) {
  const { t } = useLang()
  const [users, setUsers] = useState<UserLite[]>([])
  const [selected, setSelected] = useState<UserLite | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adminMode, setAdminMode] = useState(false)
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')

  useEffect(() => {
    api<{ users: UserLite[] }>('/api/users')
      .then((d) => setUsers(d.users.filter((u) => u.active)))
      .catch(() => setError('خطا در دریافت فهرست کاربران'))
  }, [])

  const adminSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api<{ user: any; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: { username: adminUser, password: adminPass },
      })
      onLogin(res.user, res.token)
    } catch (err: any) {
      setError(err.message || 'ورود ناموفق بود')
      setAdminPass('')
    } finally {
      setBusy(false)
    }
  }

  const press = (d: string) => {
    setError('')
    if (d === 'del') { setPin((p) => p.slice(0, -1)); return }
    if (d === 'ok' || pin.length >= 6) return
    const next = pin + d
    setPin(next)
    if (next.length >= 4 && selected) submit(next)
  }

  const submit = async (code?: string) => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const res = await api<{ user: any; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: { userId: selected.id, pin: code || pin },
      })
      onLogin(res.user, res.token)
    } catch (e: any) {
      setError(e.message || 'ورود ناموفق بود')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pattern-girih flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Brand */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#c9a227] to-[#0e7a4a] shadow-2xl shadow-[#c9a227]/30">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fffdf6" strokeWidth="1.8">
              <path d="M12 22c4-2 8-5.5 8-11V5l-8-3-8 3v6c0 5.5 4 9 8 11Z" />
              <path d="M12 8c-2 1.5-3 3.5-3 6 2-1 3.5-2 4.5-4" />
            </svg>
          </div>
          <h1 className="brand-shine text-3xl font-black sm:text-4xl">هایپر زیتون</h1>
          <p className="mt-2 text-sm font-medium text-[#e9f0e4]/80">
            سامانه هوشمند مدیریت عملیات، سفارش و تیم — کرمان
          </p>
        </div>

        <div className="toranj-divider my-4">
          <span className="text-xs">🫒</span>
        </div>

        <div className="pattern-pistachio glow-card rounded-3xl bg-card/95 p-5 shadow-2xl sm:p-7">
          {adminMode ? (
            <form onSubmit={adminSubmit} className="mx-auto max-w-sm py-2">
              <div className="mb-4 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#334155] shadow-lg">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fffdf6" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
                </div>
                <h2 className="text-lg font-black">ورود مدیر سامانه</h2>
                <p className="mt-1 text-xs text-muted-foreground">این حساب با نام کاربری و رمز عبور وارد می‌شود</p>
              </div>
              <input
                dir="ltr"
                className="mb-3 w-full rounded-xl border border-input bg-white px-4 py-3 text-sm font-bold text-left shadow-sm outline-none focus:ring-2 focus:ring-[#c9a227]/50"
                placeholder="username"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                autoComplete="username"
              />
              <input
                dir="ltr"
                type="password"
                className="mb-4 w-full rounded-xl border border-input bg-white px-4 py-3 text-sm font-bold text-left shadow-sm outline-none focus:ring-2 focus:ring-[#c9a227]/50"
                placeholder="password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                autoComplete="current-password"
              />
              {error && (
                <p className="mb-3 rounded-lg bg-[#fee2e2] px-4 py-1.5 text-center text-xs font-bold text-[#b3372f]">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy || !adminUser || !adminPass}
                className="w-full rounded-xl bg-[#334155] py-3 text-sm font-black text-white shadow-lg transition-all hover:bg-[#1e293b] disabled:opacity-50"
              >
                {busy ? 'در حال ورود…' : 'ورود امن'}
              </button>
              <button
                type="button"
                onClick={() => { setAdminMode(false); setError('') }}
                className="mt-3 w-full text-xs font-bold text-muted-foreground hover:text-primary"
              >
                → بازگشت به ورود تیم
              </button>
            </form>
          ) : !selected ? (
            <>
              <h2 className="mb-1 text-center text-lg font-extrabold">خوش آمدید 👋</h2>
              <p className="mb-5 text-center text-xs text-muted-foreground">
                برای شروع، عکس خودتان را لمس کنید
              </p>
              <div className="scroll-gold grid max-h-[46vh] grid-cols-3 gap-3 overflow-y-auto px-1 py-2 sm:grid-cols-4">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setPin(''); setError('') }}
                    className="group flex flex-col items-center gap-2 rounded-2xl border border-transparent p-3 transition-all hover:border-[#c9a227]/50 hover:bg-secondary hover:shadow-lg"
                  >
                    <Avatar name={u.name} color={u.color} size={56} />
                    <span className="text-center text-xs font-extrabold leading-4">{u.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <button
                onClick={() => { setSelected(null); setPin(''); setError('') }}
                className="mb-3 text-xs font-bold text-muted-foreground hover:text-primary"
              >
                → تغییر کاربر
              </button>
              <Avatar name={selected.name} color={selected.color} size={72} />
              <h2 className="mt-2 text-lg font-extrabold">{selected.name}</h2>
              <p className="mb-1 text-xs font-bold text-primary">{ROLE_LABELS[selected.role]}</p>
              {selected.secondaryRoles.length > 0 && (
                <p className="mb-2 text-[10px] text-muted-foreground">
                  {selected.secondaryRoles.map((s) => SECONDARY_LABELS[s] || s).join(' • ')}
                </p>
              )}
              {/* PIN dots — جهت پرشدن از زبان فعال پیروی می‌کند (فارسی: راست→چپ، انگلیسی: چپ→راست) */}
              <div className="my-4 flex gap-3" role="group" aria-label={t('login.pinGroup')}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <span
                    key={i}
                    aria-label={t(`login.pinDigit${i + 1}`)}
                    aria-current={pin.length === i ? 'step' : undefined}
                    className={cn(
                      'h-4 w-4 rounded-full border-2 transition-all',
                      pin.length > i ? 'border-primary bg-primary shadow-md shadow-primary/40' : 'border-input bg-white'
                    )}
                  />
                ))}
              </div>
              {error && (
                <p className="mb-3 rounded-lg bg-[#fee2e2] px-4 py-1.5 text-xs font-bold text-[#b3372f]">{error}</p>
              )}
              {/* PIN pad — چیدمان ۱-۲-۳ استاندارد جهانی است؛ جزیرهٔ عمدی LTR (در هر دو جهت ثابت می‌ماند:
                  ردیف پایانی: پاک‌کردن | ۰ | ⌫ ) */}
              <div className="grid grid-cols-3 gap-3" dir="ltr" role="group" aria-label={t('login.pinPad')}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    onClick={() => press(d)}
                    disabled={busy}
                    className="stepper-btn !h-14 !w-16 text-xl hover:!bg-[#c9a227]/15"
                  >
                    {faNum(d)}
                  </button>
                ))}
                <button onClick={() => setPin('')} disabled={busy} aria-label={t('login.pinClear')} className="stepper-btn !h-14 !w-16 text-xs">{t('login.pinClear')}</button>
                <button onClick={() => press('0')} disabled={busy} className="stepper-btn !h-14 !w-16 text-xl">{faNum(0)}</button>
                <button onClick={() => press('del')} disabled={busy} className="stepper-btn !h-14 !w-16">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" /><path d="m12 9 6 6M18 9l-6 6" /></svg>
                </button>
              </div>
              <p className="mt-4 text-[10px] text-muted-foreground">رمز نمایشی: {faNum('1234')}</p>
            </div>
          )}
          {!adminMode && (
            <button
              onClick={() => { setAdminMode(true); setError('') }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-[11px] font-bold text-muted-foreground transition-all hover:border-[#334155]/40 hover:text-[#334155]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
              ورود مدیر سامانه (نام کاربری و رمز)
            </button>
          )}
        </div>

        <p className="mt-5 text-center text-[10px] text-[#e9f0e4]/60">
          طراحی‌شده برای تیم هایپر زیتون — نسخه ۰٫۱ آلفا «پِسته» • تمام تاریخ‌ها شمسی (جلالی) و قمری دقیق است
        </p>
      </div>
    </div>
  )
}
