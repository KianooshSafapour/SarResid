'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cfetch, cartChanged, toast } from '@/lib/client'
import { faNum, faMoney, faJalaliShort, faJalaliWeekday, dayRelativeLabel, todayJalaliDash } from '@/lib/format'
import type { Address, BasketView, Slot } from '@/lib/api'

/** چک‌اوت ۳ گام: آدرس → بازهٔ تحویل → پرداخت (پژوهش: تفکیک گام‌ها > فشرده‌سازی فیلدها) */
export default function CheckoutPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [basket, setBasket] = useState<BasketView | null>(null)
  const [addresses, setAddresses] = useState<Address[] | null>(null)
  const [addressId, setAddressId] = useState('')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [pay, setPay] = useState<'COD' | 'GATEWAY'>('COD')
  const [gatewayOk, setGatewayOk] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = todayJalaliDash()

  // فرم آدرس جدید
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState({ receiver: '', phone: '', address: '', label: 'خانه', postalCode: '', note: '' })

  const loadAuth = useCallback(async () => {
    const me = await cfetch('/auth/me')
    if (!me.ok) {
      router.replace('/login?next=/checkout')
      return
    }
    const [a, b, s, cfg] = await Promise.all([
      cfetch<{ addresses: Address[] }>('/addresses'),
      cfetch<BasketView>('/basket'),
      cfetch<{ slots: Slot[] }>('/slots'),
      cfetch<{ gatewayAvailable?: boolean }>(`/config?_=${Date.now()}`),
    ])
    if (a.ok) {
      setAddresses(a.data!.addresses)
      const def = a.data!.addresses.find((x) => x.isDefault) || a.data!.addresses[0]
      if (def) setAddressId(def.id)
      else setShowForm(true)
    }
    if (b.ok) setBasket(b.data ?? null)
    if (s.ok) setSlots(s.data!.slots)
    if (cfg.ok) setGatewayOk(!!cfg.data?.gatewayAvailable)
    if (b.ok && b.data!.items.length === 0) router.replace('/cart')
  }, [router])

  useEffect(() => {
    loadAuth()
  }, [loadAuth])

  const saveAddress = async () => {
    setError('')
    setBusy(true)
    const res = await cfetch<{ address: Address }>('/addresses', 'POST', f)
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'ذخیرهٔ آدرس ناموفق بود')
      return
    }
    setAddresses((cur) => [res.data!.address, ...(cur || [])])
    setAddressId(res.data!.address.id)
    setShowForm(false)
  }

  const placeOrder = async () => {
    if (!slot) return
    setBusy(true)
    setError('')
    const res = await cfetch<{ order: { id: string; code: string; status: string; total: number; payUrl?: string } }>('/orders', 'POST', {
      addressId, slotDate: slot.date, slotFrom: slot.from, slotTo: slot.to, payMethod: pay, note: note || undefined,
    })
    setBusy(false)
    if (!res.ok) {
      if (res.status === 409 && (res as { adjusted?: unknown }).adjusted) {
        setError('موجودی برخی کالاها تغییر کرد — سبد به‌روز شد. اینجا صبر کنید و بعد دوباره تأیید کنید.')
        const b = await cfetch<BasketView>('/basket')
        if (b.ok) setBasket(b.data ?? null)
        cartChanged()
      } else if (res.status === 401) {
        router.replace('/login?next=/checkout')
      } else {
        setError(res.error || 'ثبت سفارش ناموفق بود')
      }
      return
    }
    cartChanged()
    const order = res.data!.order
    if (order.payUrl) {
      window.location.href = order.payUrl // درگاه (mock صفحهٔ تست / زرین‌پال واقعی)
      return
    }
    toast(`سفارش ${order.code} ثبت شد ✓`)
    router.push(`/orders/${order.id}?new=1`)
  }

  const days = slots ? [...new Set(slots.map((s) => s.date))] : []

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, margin: '16px 0 4px' }}>ثبت سفارش</h1>

      <div className="steps">
        <div className={step === 1 ? 'on' : step > 1 ? 'done' : ''}>۱. آدرس تحویل</div>
        <div className={step === 2 ? 'on' : step > 2 ? 'done' : ''}>۲. زمان تحویل</div>
        <div className={step === 3 ? 'on' : ''}>۳. پرداخت</div>
      </div>

      {step === 1 ? (
        <section className="form-card">
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>آدرس تحویل سفارش</h2>
          {addresses === null ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (
            <>
              {addresses.map((a) => (
                <label key={a.id} className={`pay-opt ${addressId === a.id ? 'on' : ''}`}>
                  <input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                  <span>
                    <b>
                      {a.label} — {a.receiver}
                    </b>
                    <p>
                      {a.city} — {a.address}
                      {a.postalCode ? ` (کدپستی <bdi>${a.postalCode}</bdi>)` : ''}
                    </p>
                  </span>
                </label>
              ))}
              {!showForm ? (
                <button className="btn ghost" onClick={() => setShowForm(true)} style={{ marginTop: 6 }}>
                  + افزودن آدرس جدید
                </button>
              ) : (
                <div style={{ marginTop: 12, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="field">
                      <span>نام گیرنده *</span>
                      <input value={f.receiver} onChange={(e) => setF({ ...f, receiver: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>شمارهٔ تماس جایگزین</span>
                      <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" placeholder="09…" />
                    </label>
                  </div>
                  <label className="field">
                    <span>نشانی کامل *</span>
                    <textarea value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} rows={2} placeholder="خیابان، کوچه، پلاک، واحد…" style={{ minHeight: 70 }} />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="field">
                      <span>برچسب</span>
                      <select value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })}>
                        <option value="خانه">خانه</option>
                        <option value="محل کار">محل کار</option>
                        <option value="سایر">سایر</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>کد پستی</span>
                      <input value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value })} dir="ltr" inputMode="numeric" />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn primary" onClick={saveAddress} disabled={busy || f.receiver.length < 2 || f.address.length < 10}>
                      ذخیرهٔ آدرس
                    </button>
                    {addresses.length ? (
                      <button className="btn ghost" onClick={() => setShowForm(false)}>
                        انصراف
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
              {error ? <p className="error-text">{error}</p> : null}
              <button className="btn primary block" style={{ marginTop: 10 }} disabled={!addressId} onClick={() => setStep(2)}>
                ادامه ← انتخاب زمان تحویل
              </button>
            </>
          )}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="form-card">
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>بازهٔ تحویل</h2>
          {slots === null ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : slots.length === 0 ? (
            <div className="empty">
              <span className="e">🕒</span>
              فعلاً بازهٔ آزادی برای امروز و روزهای بعد نیست — کمی بعد دوباره سر بزنید
            </div>
          ) : (
            days.map((d) => (
              <div key={d} style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>
                  {dayRelativeLabel(d, today)} — {faJalaliWeekday(d)} {faJalaliShort(d)}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {slots!.filter((s) => s.date === d).map((s) => (
                    <button key={`${s.date}-${s.from}`} className={`slot-chip ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}>
                      <bdi>
                        {s.from} تا {s.to}
                      </bdi>
                      <small>{s.left <= 2 ? <span className="left">آخرین ظرفیت‌ها</span> : 'ظرفیت آزاد'}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          {error ? <p className="error-text">{error}</p> : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setStep(1)}>
              → بازگشت
            </button>
            <button className="btn primary" style={{ flex: 1 }} disabled={!slot} onClick={() => setStep(3)}>
              ادامه ← پرداخت
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="form-card">
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>روش پرداخت</h2>
          <label className={`pay-opt ${pay === 'COD' ? 'on' : ''}`}>
            <input type="radio" name="pay" checked={pay === 'COD'} onChange={() => setPay('COD')} />
            <span>
              <b>💵 پرداخت در محل</b>
              <p>هنگام تحویل به پیک بپردازید (نقدی یا کارتخوان)</p>
            </span>
          </label>
          <label className={`pay-opt ${pay === 'GATEWAY' ? 'on' : ''}`} style={gatewayOk ? undefined : { opacity: 0.55 }}>
            <input type="radio" name="pay" checked={pay === 'GATEWAY'} disabled={!gatewayOk} onChange={() => setPay('GATEWAY')} />
            <span>
              <b>💳 پرداخت آنلاین {gatewayOk ? '' : '(به‌زودی)'}</b>
              <p>درگاه امن بانکی — پرداخت قبل از ارسال</p>
            </span>
          </label>

          <label className="field" style={{ marginTop: 8 }}>
            <span>یادداشت سفارش (اختیاری) — مثلاً «زنگ دوم»</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} style={{ minHeight: 60 }} />
          </label>

          {basket ? (
            <div className="summary" style={{ position: 'static', marginTop: 6 }}>
              <div className="row">
                <span>اقلام (<bdi>{faNum(basket.count)}</bdi> عدد)</span>
                <bdi>{faMoney(basket.itemsTotal)}</bdi>
              </div>
              <div className="row">
                <span>ارسال — {slot ? `${dayRelativeLabel(slot.date, today)} ${slot.from}-${slot.to}` : ''}</span>
                <bdi>{basket.deliveryFee ? faMoney(basket.deliveryFee) : 'رایگان'}</bdi>
              </div>
              <div className="row total">
                <span>جمع پرداختی</span>
                <bdi>{faMoney(basket.itemsTotal + basket.deliveryFee)}</bdi>
              </div>
            </div>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn ghost" onClick={() => setStep(2)}>
              → بازگشت
            </button>
            <button className="btn gold" style={{ flex: 1 }} disabled={busy || !addressId || !slot} onClick={placeOrder}>
              {busy ? 'در حال ثبت…' : pay === 'COD' ? 'ثبت نهایی سفارش (پرداخت در محل)' : 'پرداخت آنلاین و ثبت سفارش'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            🌿 ضمانت تازگی کالا · ↩️ مرجوعی تا ۲۴ ساعت · 🔒 پرداخت امن
          </p>
        </section>
      ) : null}

      <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
        <Link href="/cart" style={{ color: 'var(--olive-2)' }}>
          → بازگشت به سبد خرید
        </Link>
      </p>
    </div>
  )
}
