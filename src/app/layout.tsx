import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'هایپر زیتون — سررسید',
  description: 'سامانهٔ مدیریت هایپر زیتون رفسنجان',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}>{children}</body>
    </html>
  )
}
