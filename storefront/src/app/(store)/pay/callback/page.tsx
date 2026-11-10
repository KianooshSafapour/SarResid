'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cfetch } from '@/lib/client'

/**
 * بازگشت از درگاه (زرین‌پال): Authority/Status از URL خوانده و به سررسید برای
 * verify سمت سرور پشت می‌شود. در حالت mock این صفحه استفاده نمی‌شود.
 */
function CallbackInner() {
  const search = useSearchParams()
  const [state, setState] = useState<'working' | 'ok' | 'fail'>('working')
  const [msg, setMsg] = useState('در حال تأیید پرداخت…')

  useEffect(() => {
    const authority = search.get('Authority') || search.get('ref') || ''
    const status = (search.get('Status') || search.get('ok') || '').toUpperCase()
    if (!authority) {
      setState('fail')
      setMsg('مرجع پرداخت نامعتبر است')
      return
    }
    cfetch<{ orderCode?: string }>('/payment/callback', 'POST', { ref: authority, ok: status === 'OK' }).then((res) => {
      if (res.ok) {
        setState('ok')
        setMsg(`پرداخت سفارش ${res.data?.orderCode || ''} تأیید شد`)
      } else {
        setState('fail')
        setMsg(res.error || 'تأیید پرداخت ناموفق بود')
      }
    })
  }, [search])

  return (
    <div className="container" style={{ maxWidth: 430 }}>
      <div className="form-card" style={{ marginTop: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>{state === 'ok' ? '✅' : state === 'fail' ? '❌' : '⏳'}</div>
        <p style={{ fontSize: 15 }}>{msg}</p>
        <Link href="/orders" className="btn primary" style={{ marginTop: 12, display: 'inline-flex' }}>
          سفارش‌های من
        </Link>
      </div>
    </div>
  )
}

export default function PayCallbackPage() {
  return (
    <Suspense fallback={<div className="container"><div className="skeleton" style={{ height: 180, marginTop: 20 }} /></div>}>
      <CallbackInner />
    </Suspense>
  )
}
