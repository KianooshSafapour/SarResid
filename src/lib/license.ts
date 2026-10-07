/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  سامانهٔ لایسنس ماژولار SarResid (round-16) — «هر بخش قابل خرید برای مدت مشخص»
 * ─────────────────────────────────────────────────────────────────────────────
 *  مدل: اشتراک پایه (هستهٔ عملیات روزانه) + ماژول‌های افزودنی قابل خرید برای
 *  مدت زمان مشخص (ماهانه/سالانه). مطابق الگوی بازار نرم‌افزار فروشگاهی ایران
 *  (سپیدار/هلو: لایسنس + ماژول افزودنی) و الگوی SaaS جهانی (Loyverse/Lightspeed:
 *  per-location + add-on modules).
 *
 *  • هسته (همیشه فعال): داشبورد، سفارش، دریافت، تأیید انبار، کالا، شمارش زون،
 *    تأمین‌کنندگان، فروش، وظایف و ارتباط تیمی، پرسنل، اعلان‌ها…
 *  • ماژول‌ها: accounting | cheques | archive | payroll | planogram | crm | analytics
 *  • پلن‌ها: BASE (هسته) / PRO (هسته + حسابداری + چک + CRM) / ENTERPRISE (همه)
 *  • `founder` = استقرار اختصاصی هایپر زیتون — هیچ قفلی ندارد.
 *  • سرور محور است: hasModule در canViewApi (rbac) اعمال می‌شود؛ نقش‌های اجرایی
 *    صاحب سامانه‌اند اما روی ماژول منقضی فقط «قفل تمدید» می‌بینند (جز founder).
 */

export type LicenseTier = 'BASE' | 'PRO' | 'ENTERPRISE'

export type ModuleEntry = { until: string; trial?: boolean } // iso yyyy-mm-dd

export type LicenseState = {
  tier: LicenseTier
  founder: boolean
  modules: Record<string, ModuleEntry>
  updatedAt: string
}

export const MODULE_LABELS: Record<string, string> = {
  accounting: 'حسابداری و کنترل قیمت',
  cheques: 'چک‌ها و پرداخت‌ها',
  archive: 'بایگانی اسناد و دفتر اشخاص',
  payroll: 'حقوق و دستمزد',
  planogram: 'چیدمان و پلان فروشگاه',
  crm: 'CRM مشتریان',
  analytics: 'تحلیل داده و پژوهش',
}

/** کدام view به کدام ماژول وابسته است — هستهٔ همیشه-فعال اینجا نیست (فقط ماژولی‌ها) */
export const MODULE_OF: Record<string, string> = {
  accounting: 'accounting',
  pricecheck: 'accounting',
  cheques: 'cheques',
  archive: 'archive',
  people: 'archive',
  payroll: 'payroll',
  planogram: 'planogram',
  floorplan: 'planogram',
  crm: 'crm',
  reports: 'analytics',
  research: 'analytics',
  science: 'analytics',
  briefing: 'analytics',
}

/** پلن‌ها شامل کدام ماژول‌ها هستند */
export const TIER_MODULES: Record<LicenseTier, string[]> = {
  BASE: [],
  PRO: ['accounting', 'cheques', 'crm'],
  ENTERPRISE: Object.keys(MODULE_LABELS),
}

export const DEFAULT_LICENSE: LicenseState = {
  tier: 'ENTERPRISE',
  founder: true,
  modules: {},
  updatedAt: '',
}

export const S_LICENSE = 'license.state'

export function parseLicense(raw: string | undefined | null): LicenseState {
  if (!raw) return { ...DEFAULT_LICENSE }
  try {
    const v = JSON.parse(raw) as Partial<LicenseState>
    const tier: LicenseTier = v.tier === 'PRO' || v.tier === 'BASE' ? v.tier : 'ENTERPRISE'
    const modules: Record<string, ModuleEntry> = {}
    for (const [k, e] of Object.entries(v.modules || {})) {
      if (e && typeof e.until === 'string' && /^\d{4}-\d{2}-\d{2}/.test(e.until)) {
        modules[k] = { until: e.until.slice(0, 10), trial: !!e.trial }
      }
    }
    return { tier, founder: v.founder !== false && !!v.founder, modules, updatedAt: String(v.updatedAt || '') }
  } catch {
    return { ...DEFAULT_LICENSE }
  }
}

/** آیا ماژول امروز فعال است؟ (founder → همیشه؛ ENTERPRISE → همه؛ در غیر اینصورت پلن/خرید) */
export function moduleActive(license: LicenseState, moduleName: string, todayIso: string): boolean {
  if (license.founder) return true
  if (license.tier === 'ENTERPRISE') return true
  if (TIER_MODULES[license.tier].includes(moduleName)) return true
  const m = license.modules[moduleName]
  if (!m) return false
  return m.until >= todayIso
}

/** آیا view مشخصی باز است؟ (نام view) — exec فعلن هم قفل می‌شود مگر founder */
export function viewLicensed(license: LicenseState, view: string, todayIso: string): { ok: boolean; module?: string; until?: string } {
  const mod = MODULE_OF[view]
  if (!mod) return { ok: true }
  const active = moduleActive(license, mod, todayIso)
  return { ok: active, module: mod, until: license.modules[mod]?.until }
}

/** آیا تغییر لایسنس مجاز است؟ — فقط OWNER/ADMIN روت (پس از setup) */
export function canEditLicense(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}
