'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS: { href: string; label: string; roles: string[] }[] = [
  { href: '/shop-ops', label: '🧾 سفارش‌ها', roles: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'SK', 'HC', 'CASHIER', 'SALES'] },
  { href: '/shop-ops/categories', label: '🗂️ دسته‌بندی‌ها', roles: ['OWNER', 'GM', 'ADMIN'] },
  { href: '/shop-ops/products', label: '🖼️ کالاها و تصاویر', roles: ['OWNER', 'GM', 'ADMIN', 'PM', 'MERCH'] },
  { href: '/shop-ops/customers', label: '👥 مشتریان', roles: ['OWNER', 'GM', 'ADMIN', 'ACC'] },
  { href: '/shop-ops/settings', label: '⚙️ تنظیمات فروشگاه', roles: ['OWNER', 'GM', 'ADMIN'] },
]

export default function ShopOpsNav({ role, fullName }: { role: string; fullName: string }) {
  const pathname = usePathname()
  return (
    <nav className="ops-nav" aria-label="پنل فروشگاه آنلاین">
      <span className="who">🫒 فروشگاه آنلاین — {fullName}</span>
      {TABS.filter((t) => t.roles.includes(role)).map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? 'on' : ''}>
          {t.label}
        </Link>
      ))}
      <Link href="/" style={{ padding: '11px 13px', fontSize: 13.5, color: '#c8a24a' }}>
        ← سررسید
      </Link>
    </nav>
  )
}
