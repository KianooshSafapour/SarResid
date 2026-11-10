import Link from 'next/link'

export default function OfflinePage() {
  return (
    <div className="container">
      <div className="empty" style={{ padding: '80px 16px' }}>
        <span className="e">📴</span>
        اینترنت شما قطع است — صفحاتی که دیده‌اید آفلاین در دسترس‌اند
        <div style={{ marginTop: 14 }}>
          <Link href="/" className="btn primary" style={{ display: 'inline-flex' }}>
            تلاش دوباره
          </Link>
        </div>
      </div>
    </div>
  )
}
