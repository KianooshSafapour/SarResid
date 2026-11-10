import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'هایپر زیتون — فروشگاه آنلاین رفسنجان',
  description: 'خرید آنلاین از هایپر زیتون رفسنجان — میوه و سبزی تازه، خواربار لوکس، ارسال سریع در رفسنجان',
  manifest: '/manifest.webmanifest',
  applicationName: 'هایپر زیتون',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'هایپر زیتون' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#1d3a2a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

/** ریشهٔ مشترک — فقط html/body؛ چیدمان فروشگاه در (store) و پنل مدیریت در /admin جدا است */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preload" href="/fonts/Vazirmatn-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Vazirmatn-Bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="prefetch" href="/img/placeholder.svg" />
      </head>
      <body>{children}</body>
    </html>
  )
}
