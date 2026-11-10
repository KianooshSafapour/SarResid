'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const ALLOWED_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']
const TABS: { href: string; label: string; roles: string[] }[] = [
  { href: '/admin/orders', label: '🧾 سفارش‌ها', roles: ALLOWED_ROLES },
  { href: '/admin/categories', label: '🗂️ دسته‌بندی‌ها', roles: ['OWNER', 'GM', 'ADMIN'] },
  { href: '/admin/products', label: '🖼️ کالاها و تصاویر', roles: ['OWNER', 'GM', 'ADMIN'] },
  { href: '/admin/customers', label: '👥 مشتریان', roles: ['OWNER', 'GM', 'ADMIN', 'EXEC'] },
  { href: '/admin/settings', label: '⚙️ تنظیمات', roles: ['OWNER', 'GM', 'ADMIN'] },
]

/** قاب مشترک صفحات مدیریت — gating نقش + نوار کناری */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [me, setMe] = useState<{ fullName: string; role: string } | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    fetch('/api/admin/auth/me').then((r) => r.json()).then((j) => {
      if (!j?.ok || !ALLOWED_ROLES.includes(j.data?.user?.role ?? j.data?.role)) {
        router.replace('/admin')
      } else {
        setMe({ fullName: j.data?.user?.fullName ?? j.data?.fullName ?? '', role: j.data?.user?.role ?? j.data?.role })
      }
    }).catch(() => setDenied(true))
  }, [router])

  if (!me) {
    return <div className="adm-main"><div className="adm-skel" /></div>
  }

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" />
          <div>
            <b>پنل مدیریت</b>
            <small>فروشگاه آنلاین</small>
          </div>
        </div>
        {TABS.filter((t) => t.roles.includes(me.role)).map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? 'on' : ''}>
            {t.label}
          </Link>
        ))}
        <div className="who">
          <b>{me.fullName}</b>
          {me.role}
        </div>
        <Link href="/" style={{ color: '#c8a24a' }}>← فروشگاه</Link>
      </aside>
      <main className="adm-main">{children}</main>
    </div>
  )
}
