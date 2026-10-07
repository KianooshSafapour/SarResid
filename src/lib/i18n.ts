'use client'

/**
 * زیرساخت چندزبانه (fa پیش‌فرض | en | ar | tr)
 * معماری: دیکشنری تخت + تابع t() با fallback به فارسی؛ زبان در localStorage.
 * توجه: در فاز اول پوسته (نوار کنار، نوار بالا، ورود، پاصفحه، عناوین) ترجمه می‌شود؛
 * متن‌های تخصصی ویوها به‌مرور با کلیدهای تازه اضافه می‌شوند — fallback فارسی امن است.
 */
import { useCallback, useSyncExternalStore } from 'react'

export const LANGS = [
  { code: 'fa', label: 'فارسی', flag: '🇮🇷', dir: 'rtl' },
  { code: 'en', label: 'English', flag: '🌐', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🌍', dir: 'rtl' },
  { code: 'tr', label: 'Türkçe', flag: '🌐', dir: 'ltr' },
] as const

export type Lang = (typeof LANGS)[number]['code']

type Dict = Record<string, string>

const en: Dict = {
  'app.name': 'Hyper Zeytoon',
  'app.sub': 'Operations Management System',
  'app.version': 'v0.1 alpha',
  'app.codename': 'Codename: Peste',
  'nav.daily': 'Daily Operations',
  'nav.inventory': 'Inventory & Sales',
  'nav.finance': 'Finance',
  'nav.group.science': 'Science & Research',
  'nav.team': 'Team & Communication',
  'nav.system': 'System',
  'nav.store': 'Store & Inventory',
  'nav.workforce': 'Workforce',
  'nav.peoplenet': 'People Network',
  'nav.collab': 'Team Collaboration',
  'nav.dashboard': 'Dashboard',
  'nav.orders': 'Orders',
  'nav.receiving': 'Receiving',
  'nav.verify': 'Warehouse Verify',
  'nav.accounting': 'Accounting & Holoo',
  'nav.products': 'Products',
  'nav.providers': 'Suppliers',
  'nav.zonecount': 'Daily Zone Count',
  'nav.planogram': 'Shelf Planogram',
  'nav.sales': 'Sales & Customers',
  'nav.pricecheck': 'Daily Price Control',
  'nav.cheques': 'Cheques & Payments',
  'nav.archive': 'Document Archive',
  'nav.reports': 'Reports & Excel',
  'nav.science': 'Science Toolkit',
  'nav.research': 'Research Center',
  'nav.demo': 'Demo Studio',
  'nav.tasks': 'My Tasks',
  'nav.sop': 'SOPs',
  'nav.wall': 'Digital Wall',
  'nav.messages': 'Messages',
  'nav.notes': 'My Notes',
  'nav.feedback': 'Feedback & Ideas',
  'nav.leaves': 'Leave & Team Schedule',
  'nav.perf': 'Performance & Points',
  'nav.notifs': 'Notification Center',
  'nav.briefing': 'Today Briefing',
  'nav.admin': 'System Admin',
  'nav.help': 'Help & Training',
  'top.search': 'Where to go?',
  'top.notifications': 'Notifications',
  'top.newOrder': 'New Order',
  'login.title': 'Welcome to Hyper Zeytoon',
  'login.pick': 'Pick your avatar and enter your PIN',
  'login.pin': 'PIN',
  'login.enter': 'Enter',
  'login.pinGroup': 'PIN progress',
  'login.pinDigit1': 'PIN digit 1',
  'login.pinDigit2': 'PIN digit 2',
  'login.pinDigit3': 'PIN digit 3',
  'login.pinDigit4': 'PIN digit 4',
  'login.pinPad': 'PIN keypad',
  'login.pinClear': 'Clear',
  'footer.tag': 'Hyper Zeytoon Kerman • Unified Operations Management',
  'footer.sub': 'Jalali calendar • Holoo support • Built for your team',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.today': 'Today',
  'common.loading': 'Loading…',
}

const ar: Dict = {
  'app.name': 'هايبر زيتون',
  'app.sub': 'نظام إدارة العمليات',
  'app.version': 'الإصدار ٠٫١ ألفا',
  'app.codename': 'الاسم الرمزي: بسته (Peste)',
  'nav.daily': 'العمليات اليومية',
  'nav.inventory': 'المخزون والمبيعات',
  'nav.finance': 'المالية',
  'nav.group.science': 'العلم والبحث',
  'nav.team': 'الفريق والتواصل',
  'nav.system': 'النظام',
  'nav.store': 'المتجر والمخزون',
  'nav.workforce': 'القوى العاملة',
  'nav.peoplenet': 'شبكة الأشخاص',
  'nav.collab': 'التعاون الجماعي',
  'nav.dashboard': 'لوحة المعلومات',
  'nav.orders': 'الطلبات',
  'nav.receiving': 'الاستلام',
  'nav.verify': 'تدقيق المستودع',
  'nav.accounting': 'المحاسبة و Holoo',
  'nav.products': 'المنتجات',
  'nav.providers': 'الموردون',
  'nav.zonecount': 'جرد المنطقة اليومي',
  'nav.planogram': 'خطة الرفوف',
  'nav.sales': 'المبيعات والعملاء',
  'nav.pricecheck': 'مراقبة الأسعار اليومية',
  'nav.cheques': 'الشيكات والمدفوعات',
  'nav.archive': 'أرشيف المستندات',
  'nav.reports': 'التقارير وإكسل',
  'nav.science': 'علبة الأدوات العلمية',
  'nav.research': 'مركز البحث',
  'nav.demo': 'استوديو العرض',
  'nav.tasks': 'مهامي',
  'nav.sop': 'الإجراءات المعيارية',
  'nav.wall': 'الحائط الرقمي',
  'nav.messages': 'الرسائل',
  'nav.notes': 'ملاحظاتي',
  'nav.feedback': 'الملاحظات والأفكار',
  'nav.leaves': 'الإجازات وجدول الفريق',
  'nav.perf': 'الأداء والنقاط',
  'nav.notifs': 'مركز الإشعارات',
  'nav.briefing': 'إحاطة اليوم',
  'nav.admin': 'إدارة النظام',
  'nav.help': 'المساعدة والتدريب',
  'top.search': 'إلى أين نذهب؟',
  'top.notifications': 'الإشعارات',
  'top.newOrder': 'طلب جديد',
  'login.title': 'مرحباً بك في هايبر زيتون',
  'login.pick': 'اختر صورتك الرمزية وأدخل الرمز',
  'login.pin': 'الرمز',
  'login.enter': 'دخول',
  'login.pinGroup': 'حالة الرمز',
  'login.pinDigit1': 'الرقم الأول من الرمز',
  'login.pinDigit2': 'الرقم الثاني من الرمز',
  'login.pinDigit3': 'الرقم الثالث من الرمز',
  'login.pinDigit4': 'الرقم الرابع من الرمز',
  'login.pinPad': 'لوحة أرقام الرمز',
  'login.pinClear': 'مسح',
  'footer.tag': 'هايبر زيتون كرمان • إدارة عمليات موحدة',
  'footer.sub': 'تقويم شمسي • دعم Holoo • مصمم لفريقك',
  'common.save': 'حفظ',
  'common.cancel': 'إلغاء',
  'common.close': 'إغلاق',
  'common.search': 'بحث',
  'common.today': 'اليوم',
  'common.loading': 'جارٍ التحميل…',
}

const tr: Dict = {
  'app.name': 'Hyper Zeytoon',
  'app.sub': 'Operasyon Yönetim Sistemi',
  'app.version': 'v0.1 alfa',
  'app.codename': 'Kod adı: Peste',
  'nav.daily': 'Günlük Operasyonlar',
  'nav.inventory': 'Stok ve Satış',
  'nav.finance': 'Finans',
  'nav.group.science': 'Bilim ve Araştırma',
  'nav.team': 'Ekip ve İletişim',
  'nav.system': 'Sistem',
  'nav.store': 'Mağaza ve Depo',
  'nav.workforce': 'İşgücü',
  'nav.peoplenet': 'Kişi Ağı',
  'nav.collab': 'Ekip İşbirliği',
  'nav.dashboard': 'Panel',
  'nav.orders': 'Siparişler',
  'nav.receiving': 'Mal Kabul',
  'nav.verify': 'Depo Onayı',
  'nav.accounting': 'Muhasebe ve Holoo',
  'nav.products': 'Ürünler',
  'nav.providers': 'Tedarikçiler',
  'nav.zonecount': 'Günlük Bölge Sayımı',
  'nav.planogram': 'Raf Planogramı',
  'nav.sales': 'Satış ve Müşteriler',
  'nav.pricecheck': 'Günlük Fiyat Kontrolü',
  'nav.cheques': 'Çekler ve Ödemeler',
  'nav.archive': 'Evrak Arşivi',
  'nav.reports': 'Raporlar ve Excel',
  'nav.science': 'Bilim Araç Kutusu',
  'nav.research': 'Araştırma Merkezi',
  'nav.demo': 'Demo Stüdyosu',
  'nav.tasks': 'Görevlerim',
  'nav.sop': 'Standart Prosedürler',
  'nav.wall': 'Dijital Duvar',
  'nav.messages': 'Mesajlar',
  'nav.notes': 'Notlarım',
  'nav.feedback': 'Geri Bildirim',
  'nav.leaves': 'İzin ve Ekip Planı',
  'nav.perf': 'Performans ve Puanlar',
  'nav.notifs': 'Bildirim Merkezi',
  'nav.briefing': 'Günlük Brifing',
  'nav.admin': 'Sistem Yönetimi',
  'nav.help': 'Yardım ve Eğitim',
  'top.search': 'Nereye gidelim?',
  'top.notifications': 'Bildirimler',
  'top.newOrder': 'Yeni Sipariş',
  'login.title': "Hyper Zeytoon'a Hoş Geldiniz",
  'login.pick': 'Avatarınızı seçin ve PIN girin',
  'login.pin': 'PIN',
  'login.enter': 'Giriş',
  'login.pinGroup': 'PIN durumu',
  'login.pinDigit1': 'PIN rakamı 1',
  'login.pinDigit2': 'PIN rakamı 2',
  'login.pinDigit3': 'PIN rakamı 3',
  'login.pinDigit4': 'PIN rakamı 4',
  'login.pinPad': 'PIN tuş takımı',
  'login.pinClear': 'Temizle',
  'footer.tag': 'Hyper Zeytoon Kerman • Birleşik Operasyon Yönetimi',
  'footer.sub': 'Celali takvim • Holoo desteği • Ekibiniz için tasarlandı',
  'common.save': 'Kaydet',
  'common.cancel': 'İptal',
  'common.close': 'Kapat',
  'common.search': 'Ara',
  'common.today': 'Bugün',
  'common.loading': 'Yükleniyor…',
}

const DICTS: Record<Lang, Dict> = {
  fa: {
    // کلیدهای فارسی — چون fallback تابع t() خودِ کلید است، مقادیر فارسی صریح‌اند
    'login.pinGroup': 'وضعیت رمز ورود',
    'login.pinDigit1': 'رقم اول رمز',
    'login.pinDigit2': 'رقم دوم رمز',
    'login.pinDigit3': 'رقم سوم رمز',
    'login.pinDigit4': 'رقم چهارم رمز',
    'login.pinPad': 'صفحه‌کلید رمز',
    'login.pinClear': 'پاک‌کردن',
  },
  en,
  ar,
  tr,
}

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'fa'
  return (localStorage.getItem('hz-lang') as Lang) || 'fa'
}

export function setLang(l: Lang) {
  if (typeof window === 'undefined') return
  localStorage.setItem('hz-lang', l)
  const dir = LANGS.find((x) => x.code === l)?.dir || 'rtl'
  document.documentElement.setAttribute('dir', dir)
  document.documentElement.setAttribute('lang', l)
}

/** t('nav.orders') — کلیدهای ترجمه‌نشده به فارسی برمی‌گردند */
export function t(key: string, lang?: Lang): string {
  const l = lang || getLang()
  return DICTS[l]?.[key] || key
}

export function langDir(l?: Lang): 'rtl' | 'ltr' {
  const code = l || getLang()
  return (LANGS.find((x) => x.code === code)?.dir || 'rtl') as 'rtl' | 'ltr'
}

/** hook واکنش‌گرا — تغییر زبان باعث رندر مجدد می‌شود (useSyncExternalStore برای سازگاری با lint) */
let langListeners: (() => void)[] = []
function notifyLangChange() {
  langListeners.forEach((l) => l())
}
function subscribeLang(cb: () => void) {
  langListeners.push(cb)
  return () => {
    langListeners = langListeners.filter((l) => l !== cb)
  }
}
function getLangSnapshot(): Lang {
  return getLang()
}
function getLangServerSnapshot(): Lang {
  return 'fa'
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; dir: 'rtl' | 'ltr' } {
  const lang = useSyncExternalStore(subscribeLang, getLangSnapshot, getLangServerSnapshot)
  const change = useCallback((l: Lang) => {
    setLang(l)
    notifyLangChange()
  }, [])
  return { lang, setLang: change, t: (k: string) => t(k, lang), dir: langDir(lang) }
}

/* همگام‌سازی اولیه پس از بارگذاری (سمت کلاینت):
 * ۱) تضمین دوبارهٔ dir/lang روی <html> (اسکریپت themeInit در layout هم همین کار را می‌کند)
 * ۲) یک notifyLangChange پس از سوارشدن اجزا — تا اجزایی که با اسنپ‌شات سرور ('fa') هیدریت شده‌اند
 *    یک‌بار دیگر با زبان واقعی localStorage رندر شوند. */
if (typeof window !== 'undefined') {
  const bootLangSync = () => {
    try {
      const l = getLang()
      document.documentElement.setAttribute('dir', langDir(l))
      document.documentElement.setAttribute('lang', l)
      notifyLangChange()
    } catch {
      /* silent */
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLangSync, { once: true })
  else setTimeout(bootLangSync, 0)
}
