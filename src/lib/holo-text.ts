/**
 * R22 — نرمال‌سازی دوطرفهٔ متن فارسی/عربی بین سررسید و هلو.
 * ---------------------------------------------------------------------------
 * هلو از صفحه‌کلید «فارسی/عربی» قدیمی استفاده می‌کند: «ي» و «ك» عربی به‌جای
 * «ی» و «ک» فارسی. این کلاس در هر مرزِ داده (خواندن از هلو / نوشتن به هلو)
 * متن را به الفبای درست تبدیل می‌کند.
 *
 * جهت‌ها:
 *   holoIn  : عربی → فارسی (وقتی از هلو می‌خوانیم — نمایش به کاربر)
 *   holoOut : فارسی → عربی (وقتی به هلو می‌فرستیم — ثبت در دیتابیس هلو)
 *
 * نکته: holoOut فقط برای نام‌هایی که از قبل در هلو با حروف عربی ثبت شده‌اند
 * لازم است — کدها/ErpCode هیچ‌وقت تبدیل نمی‌شوند.
 */

// ── نگاشت حروف عربی → فارسی (استاندارد فارسی ایران) ──
const AR_TO_FA: Record<string, string> = {
  'ي': 'ی',  // Arabic Yeh → Farsi Yeh
  'ك': 'ک',  // Arabic Kaf → Keheh
  'ة': 'ه',  // Teh Marbuta → Heh
  'د\u200c': 'د', // KASHIDA removal handled by regex below
  'أ': 'ا',  // Alef with Hamza above → Alef
  'إ': 'ا',  // Alef with Hamza below → Alef
  'آ': 'آ',  // Alef with Madda — same, no change
  'ؤ': 'و',  // Waw with Hamza → Waw
  'ئ': 'ی',  // Yeh with Hamza → Yarsi Yeh
  'ۀ': 'ه',  // Heh with Yeh above → Heh
  'ٔ': '',   // Hamza above (combining) → remove
  'ٕ': '',   // Hamza below (combining) → remove
  'ً': '',   // Fathatan → remove
  'ٌ': '',   // Dammatan → remove
  'ٍ': '',   // Kasratan → remove
  'َ': '',   // Fatha → remove (گذاشته نشود چون در نام‌ها اعراب نمی‌گذاریم)
  'ُ': '',   // Damma → remove
  'ِ': '',   // Kasra → remove
  'ْ': '',   // Sukun → remove
  'ٰ': '',   // Superscript Alef → remove
  'ﻻ': 'لا', // Arabic Ligature Lam with Alef
  '\u0640': '', // TATWEEL (KASHIDA) → remove
  '\u200f': '', // RLM → remove
  '\u200e': '', // LRM → remove
  '\u200d': '', // ZWNJ → remove (در نام‌های هلو ZWNJ نیست)
}

// ── نگاشت معکوس: فارسی → عربی (برای نوشتن به هلو) ──
const FA_TO_AR: Record<string, string> = {
  'ی': 'ي',  // Farsi Yeh → Arabic Yeh
  'ک': 'ك',  // Keheh → Arabic Kaf
  'گی': 'گی', // نگه داشتن ترکیب‌های خاص اگر لازم بود
}

// حروف فارسی که در عربی همهن معادل دارند — تبدیل نمی‌شوند
const NO_CHANGE = new Set(['ا', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ل', 'م', 'ن', 'و', 'ه', 'آ', ' ', '۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])

/**
 * holoIn — نرمال‌سازی متن از هلو (عربی → فارسی)
 * برای: نام کالا، نام مشتری/تأمین‌کننده، نام گروه، توضیحات
 */
export function holoIn(text: string | null | undefined): string {
  if (!text) return ''
  let s = String(text)

  // ۱) حروف عربی → فارسی
  for (const [ar, fa] of Object.entries(AR_TO_FA)) {
    s = s.split(ar).join(fa)
  }

  // ۲) کاشیدا و ZWNJ/RLM/LRM حذف شد در AR_TO_FA — فضاهای تکراری پاک شوند
  s = s.replace(/\s+/g, ' ').trim()

  return s
}

/**
 * holoOut — نرمال‌سازی متن به هلو (فارسی → عربی)
 * فقط برای فیلدهایی که در دیتابیس هلو با حروف عربی ثبت شده‌اند.
 * کدها/ErpCode/بارکد هرگز تبدیل نمی‌شوند.
 */
export function holoOut(text: string | null | undefined): string {
  if (!text) return ''
  let s = String(text)

  // فقط ی و ک تبدیل می‌شوند (بقیهٔ حروف عربی و فارسی هم‌شکل‌اند)
  s = s.replace(/ی/g, 'ي').replace(/ک/g, 'ك')

  return s.trim()
}

/**
 * holoInDeep — نرمال‌سازی بازگشتی تمام فیلدهای رشته‌ای یک آبجکت/آرایه
 * برای پاسخ‌های JSON از هلو
 */
export function holoInDeep<T>(obj: T): T {
  if (typeof obj === 'string') return holoIn(obj) as unknown as T
  if (Array.isArray(obj)) return obj.map(holoInDeep) as unknown as T
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // کلیدها و کدها تبدیل نمی‌شوند
      if (/^(Code|ErpCode|code|erpcode|Barcode|barcode|Few|few|Price|price)$/i.test(k)) {
        out[k] = v
      } else {
        out[k] = holoInDeep(v)
      }
    }
    return out as unknown as T
  }
  return obj
}

/**
 * holoOutDeep — نرمال‌سازی بازگشتی قبل از ارسال به هلو
 * فقط فیلدهای name/title/address/description تبدیل می‌شوند
 */
export function holoOutDeep<T>(obj: T): T {
  if (typeof obj === 'string') return holoOut(obj) as unknown as T
  if (Array.isArray(obj)) return obj.map(holoOutDeep) as unknown as T
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // فقط فیلدهای متنی نام‌دار تبدیل می‌شوند
      if (/^(name|Name|title|Title|address|Address|description|Description|comment|Comment)$/i.test(k)) {
        out[k] = holoOut(String(v))
      } else {
        out[k] = holoOutDeep(v)
      }
    }
    return out as unknown as T
  }
  return obj
}
