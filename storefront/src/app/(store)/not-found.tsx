import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="container">
      <div className="empty" style={{ padding: '80px 16px' }}>
        <span className="e">🫒</span>
        این صفحه پیدا نشد — شاید کالا حذف شده یا نشانی اشتباه است
        <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link href="/" className="btn primary" style={{ display: 'inline-flex' }}>
            خانه
          </Link>
          <Link href="/categories" className="btn ghost" style={{ display: 'inline-flex' }}>
            دسته‌بندی‌ها
          </Link>
        </div>
      </div>
    </div>
  )
}
