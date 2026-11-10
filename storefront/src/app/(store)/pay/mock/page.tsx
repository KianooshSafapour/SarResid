'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cfetch, toast } from '@/lib/client'
import { faNum } from '@/lib/format'

/** شبیه‌ساز درگاه پرداخت — فقط وقتی درگاه روی mock است (dev/تست) */
function MockPayInner() {
  const search = useSearchParams()
  const router = useRouter()
  const ref = search.get('ref') || ''
  const amount = Number(search.get('amount') || 0)
  const [busy, setBusy] = useState(false)

  const finish = async (ok: boolean) => {
    setBusy(true)
    const res = await cfetch<{ orderCode?: string }>('/payment/callback', 'POST', { ref, ok })
    setBusy(false)
    if (res.ok) {
      toast(`پرداخت سفارش ${res.data?.orderCode || ''} تأیید شد`)
      router.push('/orders')
    } else {
      toast(res.error || 'تسویه ناموفق')
      router.push('/orders')
    }
  }

  useEffect(() => {
    if (!ref) router.replace('/cart')
  }, [ref, router])

  return (
    <div className="container" style={{ maxWidth: 430 }}>
      <div className="form-card" style={{ marginTop: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 17, margin: '0 0 6px' }}>🧪 شبیه‌ساز پرداخت (تست)</h1>
        <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
          مبلغ: <bdi>{faNum(amount)}</bdi> ریال — مرجع: <bdi dir="ltr">{ref.slice(0, 14)}</bdi>
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          این صفحه فقط در حالت تست نمایش داده می‌شود؛ با درگاه واقعی (زرین‌پال) به صفحهٔ بانک می‌روید.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={() => finish(true)}>
            ✅ پرداخت موفق
          </button>
          <button className="btn red" style={{ flex: 1 }} disabled={busy} onClick={() => finish(false)}>
            ✖ پرداخت ناموفق
          </button>
        </div>
        <p style={{ marginTop: 12, fontSize: 12.5 }}>
          <Link href="/orders" style={{ color: 'var(--olive-2)' }}>
            بازگشت به سفارش‌ها
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function MockPayPage() {
  return (
    <Suspense fallback={<div className="container"><div className="skeleton" style={{ height: 180, marginTop: 20 }} /></div>}>
      <MockPayInner />
    </Suspense>
  )
}
