import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "سررسید | SarResid — سامانه مدیریت عملیات فروشگاه",
  description:
    "سررسید (SarResid): دفتر حساب دیجیتال فروشگاه شما — مدیریت یکپارچه سفارش، انبار، بایگانی اسناد، حقوق و دستمزد و تیم فروش؛ محصول هایپر زیتون",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  applicationName: "SarResid",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b2e20",
};

const themeInit = `(function(){try{var t=localStorage.getItem('theme')||'light';if(t==='dark')document.documentElement.classList.add('dark');var l=localStorage.getItem('hz-lang')||'fa';var d=(l==='fa'||l==='ar')?'rtl':'ltr';document.documentElement.setAttribute('dir',d);document.documentElement.setAttribute('lang',l);var u=null;var raw=localStorage.getItem('hz-ui-prefs');if(raw){try{u=JSON.parse(raw)}catch(e){u=null}}if(u&&u.fontScale){document.documentElement.style.fontSize=(16*Math.min(1.3,Math.max(0.85,u.fontScale)))+'px';}if(u&&u.calFont){var m={sm:11,base:13,lg:15,xl:18};document.documentElement.style.setProperty('--cal-font',(m[u.calFont]||13)+'px');}document.documentElement.setAttribute('data-density',(u&&u.density==='compact')?'compact':'cozy');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          {/* dir ثابت نیست — sonner خودش جهت را از <html dir> (اسکریپت themeInit) می‌خواند و
              ThemeLangBar روی تغییر زبان آن را همگام نگه می‌دارد (LTR برای en/tr، RTL برای fa/ar) */}
          <Toaster
            position="top-center"
            richColors
            toastOptions={{ style: { fontFamily: "Vazirmatn, Tahoma, sans-serif" } }}
          />
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </body>
    </html>
  );
}
