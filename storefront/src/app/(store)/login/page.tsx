'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { cfetch, cartChanged } from '@/lib/client'

/** ورود با موبایل + کد یک‌بارمصرف — مهمان‌دوست (بدون رمز/ثبت‌نام جدا) */
function LoginInner() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') || '/checkout'

  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const sendCode = async () => {
    setError('')
    setBusy(true)
    const res = await cfetch<{ devCode?: string }>('/auth/otp', 'POST', { phone })
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'ارسال کد ناموفق بود')
      return
    }
    setStep('code')
    setCountdown(120)
    codeRef.current?.focus()
    setInfo(res.data?.devCode ? `کد تست: ${res.data.devCode}` : 'کد ۵ رقمی پیامک شد')
  }

  const verify = async () => {
    setError('')
    setBusy(true)
    const res = await cfetch('/auth/verify', 'POST', { phone, code })
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'کد تأیید نشد')
      return
    }
    cartChanged()
    router.push(next)
  }

  return (
    <div className="container" style={{ maxWidth: 430 }}>
      <div className="form-card" style={{ marginTop: 24 }}>
        <h1 style={{ fontSize: 19, margin: '0 0 4px' }}>🔑 ورود / ثبت‌نام</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
          فقط با شمارهٔ موبایل — بدون رمز. کد تأیید برای شما پیامک می‌شود.
        </p>

        <div className="steps">
          <div className={step === 'phone' ? 'on' : 'done'}>۱. شمارهٔ موبایل</div>
          <div className={step === 'code' ? 'on' : ''}>۲. کد تأیید</div>
        </div>

        {step === 'phone' ? (
          <>
            <label className="field">
              <span>شمارهٔ موبایل</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d۰-۹]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && phone.length >= 10 && sendCode()}
                inputMode="numeric"
                placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                dir="ltr"
                style={{ textAlign: 'end' }}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="btn primary block" disabled={busy || phone.replace(/\D/g, '').length < 10} onClick={sendCode}>
              {busy ? 'در حال ارسال…' : 'دریافت کد تأیید'}
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span>
                کد ۵ رقمی پیامک‌شده به <bdi dir="ltr">{phone}</bdi>
              </span>
              <input
                ref={codeRef}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 5 && verify()}
                inputMode="numeric"
                placeholder="ـــــ"
                dir="ltr"
                style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20 }}
              />
            </label>
            {info ? <p className="ok-text">{info}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
            <button className="btn primary block" disabled={busy || code.length !== 5} onClick={verify}>
              {busy ? 'در حال بررسی…' : 'ورود'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13 }}>
              <button className="btn ghost" style={{ minHeight: 40, padding: '6px 14px', fontSize: 13 }} onClick={() => { setStep('phone'); setError(''); setInfo('') }}>
                ← تغییر شماره
              </button>
              {countdown > 0 ? (
                <span style={{ color: 'var(--muted)', alignSelf: 'center' }}>
                  ارسال دوباره تا <bdi>{countdown.toLocaleString('fa-IR')}</bdi> ثانیه
                </span>
              ) : (
                <button className="btn ghost" style={{ minHeight: 40, padding: '6px 14px', fontSize: 13 }} onClick={sendCode} disabled={busy}>
                  ارسال دوبارهٔ کد
                </button>
              )}
            </div>
          </>
        )}

        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
          با ورود، <Link href="/" style={{ textDecoration: 'underline'}}>شرایط خرید</Link> هایپر زیتون را می‌پذیرید. شمارهٔ شما فقط برای تحویل سفارش و اطلاع‌رسانی استفاده می‌شود.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container"><div className="skeleton" style={{ height: 300, marginTop: 24 }} /></div>}>
      <LoginInner />
    </Suspense>
  )
}
