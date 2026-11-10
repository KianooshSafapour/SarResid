'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { cfetch, cartChanged } from '@/lib/client'
import { faNum, faMoney } from '@/lib/format'
import type { BasketView } from '@/lib/api'

export default function CartPage() {
  const [basket, setBasket] = useState<BasketView | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const res = await cfetch<BasketView>('/basket')
    if (res.ok) {
      setBasket(res.data ?? null)
      setError('')
    } else setError(res.error || 'سبد بارگذاری نشد')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setQty = async (productId: string, qty: number) => {
    setBusy(productId)
    const res = await cfetch<BasketView>('/basket', 'POST', { productId, qty })
    if (res.ok) {
      setBasket(res.data ?? null)
      if (res.data?.trimmedTo !== undefined) setError(`موجودی کافی نبود — تعداد به ${faNum(res.data.trimmedTo)} عدد تنظیم شد`)
    } else setError(res.error || 'تغییر ناموفق بود')
    cartChanged()
    setBusy('')
  }

  const clear = async () => {
    if (!confirm('سبد را کاملاً خالی کنید؟')) return
    await cfetch('/basket', 'DELETE')
    cartChanged()
    load()
  }

  const items = basket?.items || []
  const hasWarning = items.some((i) => i.warning)

  return (
    <div className="container">
      <h1 style={{ fontSize: 21, margin: '16px 0 12px' }}>🧺 سبد خرید</h1>
      {error ? <p className="error-text">{error}</p> : null}

      {!basket ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : items.length === 0 ? (
        <div className="empty">
          <span className="e">🧺</span>
          سبد شما خالی است
          <div style={{ marginTop: 12 }}>
            <Link href="/categories" className="btn primary" style={{ display: 'inline-flex' }}>
              شروع خرید
            </Link>
          </div>
        </div>
      ) : (
        <div className="cart-grid">
          <div>
            {items.map((it) => (
              <div key={it.itemId} className="cart-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image || '/img/placeholder.svg'} alt={it.name} loading="lazy" referrerPolicy="no-referrer" />
                <div>
                  <Link href={`/p/${it.productId}`}>
                    <b style={{ fontSize: 14 }}>{it.name}</b>
                  </Link>
                  <div className="price-row" style={{ marginTop: 2 }}>
                    <span className="price" style={{ fontSize: 13.5 }}>
                      <bdi>{faNum(it.price)}</bdi> <small>ریال</small>
                    </span>
                    {it.discountPct >= 5 ? <span className="anchor">{faNum(it.printedPrice)}</span> : null}
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>هر {it.unit}</span>
                  </div>
                  {it.warning ? (
                    <div className="warn">⚠️ موجودی فعلی: <bdi>{faNum(it.available)}</bdi> — تعداد را کم کنید یا حذف کنید</div>
                  ) : null}
                </div>
                <div style={{ minWidth: 120 }}>
                  <div className="qty-stepper" style={{ margin: 0, height: 40 }}>
                    <button onClick={() => setQty(it.productId, it.qty - 1)} disabled={busy === it.productId} aria-label="کم">
                      −
                    </button>
                    <span className="q">
                      <bdi>{faNum(it.qty)}</bdi>
                    </span>
                    <button onClick={() => setQty(it.productId, it.qty + 1)} disabled={busy === it.productId || it.qty >= it.available} aria-label="زیاد">
                      +
                    </button>
                  </div>
                  <div style={{ fontSize: 12.5, textAlign: 'center', marginTop: 6, fontWeight: 700, color: 'var(--olive)' }}>
                    <bdi>{faNum(it.lineTotal)}</bdi> ریال
                  </div>
                </div>
              </div>
            ))}
            <button className="btn red" onClick={clear} style={{ marginTop: 4 }}>
              خالی‌کردن سبد
            </button>
          </div>

          <aside className="summary">
            {/* جمع کل شفاف از همان اول — پژوهش: هزینهٔ پنهان = علت اول رهاکردن سبد */}
            <div className="row">
              <span>قیمت اقلام</span>
              <bdi>{faMoney(basket.itemsTotal)}</bdi>
            </div>
            {basket.freeDeliveryMin > 0 && basket.itemsTotal < basket.freeDeliveryMin ? (
              <>
                <p className="freemsg">
                  <bdi>{faNum(basket.freeDeliveryGap)}</bdi> ریال تا ارسال رایگان
                </p>
                <div className="freebar">
                  <div style={{ width: `${Math.min(100, Math.round((basket.itemsTotal / basket.freeDeliveryMin) * 100))}%` }} />
                </div>
              </>
            ) : basket.freeDeliveryMin > 0 ? (
              <p className="freemsg">🎉 ارسال این سفارش رایگان است</p>
            ) : null}
            <div className="row">
              <span>هزینهٔ ارسال (رفسنجان)</span>
              <bdi>{basket.deliveryFee ? faMoney(basket.deliveryFee) : 'رایگان'}</bdi>
            </div>
            <div className="row total">
              <span>جمع قابل پرداخت</span>
              <bdi>{faMoney(basket.itemsTotal + basket.deliveryFee)}</bdi>
            </div>
            {basket.minOrder > 0 && basket.itemsTotal < basket.minOrder ? (
              <p className="error-text">حداقل مبلغ سفارش <bdi>{faMoney(basket.minOrder)}</bdi> است</p>
            ) : null}
            {hasWarning ? <p className="error-text">اول اقلام کم‌موجود را اصلاح کنید</p> : null}
            <Link
              href="/checkout"
              className={`btn primary block ${hasWarning || (basket.minOrder > 0 && basket.itemsTotal < basket.minOrder) ? 'disabled-link' : ''}`}
              style={{ marginTop: 10 }}
              onClick={(e) => {
                if (hasWarning || (basket.minOrder > 0 && basket.itemsTotal < basket.minOrder)) e.preventDefault()
              }}
            >
              ادامه و ثبت سفارش ←
            </Link>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0', textAlign: 'center' }}>
              💵 پرداخت در محل یا 💳 آنلاین — در گام آخر انتخاب می‌کنید
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}
