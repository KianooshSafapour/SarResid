'use client'

import AdminShell from '@/components/admin/AdminShell'

import { useCallback, useEffect, useState } from 'react'

interface Customer {
  id: string; phone: string; name: string; isBlocked: boolean; loginCount: number
  lastLoginAt: string | null; createdAt: string; holooErp: string | null
  orders: { count: number; total: number }
}
const fa = (n: number) => (n || 0).toLocaleString('fa-IR')
const dt = (iso: string | null) => {
  if (!iso) return '—'
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) } catch { return iso }
}

function CustomersInner() {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [toast, setToast] = useState('')

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3500)
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/shop-admin/customers', { cache: 'no-store' })
    const j = await r.json()
    if (j.ok) setCustomers(j.data.customers)
    else say(j.error || 'بارگذاری ناموفق')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleBlock = async (c: Customer) => {
    const next = !c.isBlocked
    if (next && !confirm(`شمارهٔ ${c.phone} مسدود شود؟ دیگر نمی‌تواند وارد شود یا سفارش بدهد.`)) return
    const r = await fetch('/api/admin/shop-admin/customers', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerId: c.id, isBlocked: next }) })
    const j = await r.json()
    say(j.ok ? (next ? 'مسدود شد' : 'آزاد شد') : j.error || 'ناموفق')
    load()
  }

  if (!customers) return <div className="adm-skel" />

  return (
    <>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>👥 مشتریان فروشگاه آنلاین</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>{fa(customers.length)} مشتری — هویت = شمارهٔ موبایل تأییدشده</p>
      {toast && <div className="adm-toast">{toast}</div>}
      <div className="adm-card" style={{ overflowX: 'auto' }}>
        {customers.length === 0 ? (
          <div className="adm-empty">هنوز مشتری‌ای ثبت‌نام نکرده</div>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>مشتری</th>
                <th>موبایل</th>
                <th>سفارش‌ها</th>
                <th>مجموع خرید</th>
                <th>ورودها</th>
                <th>آخرین ورود</th>
                <th>هلو</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.name || <span style={{ color: 'var(--muted)' }}>بی‌نام</span>}</td>
                  <td><bdi dir="ltr">{c.phone}</bdi></td>
                  <td>{fa(c.orders.count)}</td>
                  <td>{fa(c.orders.total)} ریال</td>
                  <td>{fa(c.loginCount)}</td>
                  <td>{dt(c.lastLoginAt)}</td>
                  <td>{c.holooErp ? '✓ متصل' : '—'}</td>
                  <td>{c.isBlocked ? <b style={{ color: 'var(--red)' }}>مسدود</b> : 'فعال'}</td>
                  <td>
                    <button className={`adm-btn sm ${c.isBlocked ? '' : 'danger'}`} onClick={() => toggleBlock(c)}>
                      {c.isBlocked ? 'آزادسازی' : 'مسدود'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default function customers() {
  return <AdminShell><CustomersInner /></AdminShell>
}
