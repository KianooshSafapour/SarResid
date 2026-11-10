import { createHmac, randomBytes, randomInt, timingSafeEqual, createHash } from 'crypto'
import { db } from '@/lib/db'
import { safeJson } from '@/lib/api'
import { sendViaDefaultPanel } from '@/lib/sms'
import { notify } from '@/lib/notify'
import { todayJalaliDash, nowTehranTime, jalaliToDate, dateToJalali, pad2, jalaliWeekdayName } from '@/lib/jalali'
import { tokenizeQuery, rankFuzzy } from '@/lib/fuzzy'
import {
  getHolooConfig,
  getCustomers,
  getProducts as holooGetProducts,
  createCustomer as holooCreateCustomer,
  createInvoice as holooCreateInvoice,
  assertHolooWrite,
  dateToGregorian,
  dateToHm,
} from '@/lib/holoo'

/**
 * SHOP — منطق دامنهٔ فروشگاه آنلاین hyperzeytoon.com (docs/ECOMMERCE-HANDOFF.md).
 * ---------------------------------------------------------------------------
 * ویترین (storefront/) هیچ دسترسی DB و رازی ندارد؛ فقط از طریق /api/shop/* حرف
 * می‌زند. احراز هویت مشتری = موبایل + OTP؛ سبد = توکنِ کوکی؛ موجودیِ قابل‌فروش =
 * موجودی انبار − رزروِ سبدهای فعال (۱۵دقیقه) − رزروِ سفارش‌های در جریان − کف قفسه.
 * همهٔ مبالغ «ریال» و end-to-end یکدست می‌مانند.
 */

export const SHOP_TOKEN_HEADER = 'x-shop-token' // نشست مشتری (امضادار)
export const SHOP_CART_HEADER = 'x-shop-cart' // توکن سبد (رکورد DB)
export const SHOP_SERVICE_HEADER = 'x-shop-service' // توکن سرویس ویترین → API
export const SHOP_CUSTOMER_COOKIE = 'hz_shop'
export const SHOP_CART_COOKIE = 'hz_cart'

const SECRET = process.env.SESSION_SECRET || 'hz-sarresid-secret-6677-local'
const CUSTOMER_TTL_DAYS = 45
export const BASKET_RESERVE_MINUTES = 15

/** وضعیت‌هایی که سفارش را «رزروکنندهٔ موجودی» می‌دانیم (پیش از تحویل/لغو) */
export const RESERVING_STATUSES = ['AWAITING_PAYMENT', 'PAID', 'COD', 'PICKING', 'DELIVERING']

export const ORDER_STATUS_FA: Record<string, string> = {
  AWAITING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  COD: 'پرداخت در محل',
  PICKING: 'در حال جمع‌آوری',
  DELIVERING: 'در مسیر تحویل',
  DELIVERED: 'تحویل‌شده',
  INVOICED: 'فاکتور شده',
  CANCELLED: 'لغو شده',
}

export const PAY_METHOD_FA: Record<string, string> = { COD: 'پرداخت در محل', GATEWAY: 'پرداخت آنلاین' }

// ============ تنظیمات (جدول Setting با پیشوند shop:) ============

export interface ShopSettings {
  open: boolean // فروشگاه باز است؟
  devOtp: boolean // کد پشتیبان dev (11111) — فقط محیط تست
  apiToken: string // توکن سرویس ویترین → API (خالی = بدون الزام)
  storeName: string
  announcement: string // متن بنر بالای سایت ('' = خاموش)
  deliveryFee: number // ریال — هزینهٔ ثابت ارسال
  freeDeliveryMin: number // ریال — ارسال رایگان از این مبلغ (۰ = خاموش)
  shelfFloor: number // کف قفسه — حداقل موجودی که آنلاین فروخته نمی‌شود
  minOrder: number // حداقل مبلغ سبد (۰ = خاموش)
  slotsJson: string // {days, lead, cap, ranges:[[9,12],..], closed:[]}
  gateway: string // 'mock' | 'zarinpal'
  gatewayMerchant: string
  gatewaySandbox: boolean
  notifyRoles: string[] // نقش‌هایی که اعلان سفارش جدید می‌گیرند
  hotline: string // شمارهٔ تماس پشتیبانی
  hiddenGroups: string[] // دسته‌هایی که در ویترین نمایش داده نمی‌شوند (دسته‌های اداری هلو)
}

const DEFAULT_SLOTS = JSON.stringify({ days: 3, lead: 90, cap: 6, ranges: [[9, 12], [14, 18], [18, 22]], closed: [] })

function rawSetting(v: string | undefined, d: string): string {
  if (v === undefined) return d
  try {
    const p = JSON.parse(v)
    if (typeof p === 'string') return p
    if (typeof p === 'number' || typeof p === 'boolean') return String(p)
  } catch { /* متن خام JSON نیست */ }
  return v
}

export async function getShopSettings(): Promise<ShopSettings> {
  const keys = [
    'shop:open', 'shop:devOtp', 'shop:apiToken', 'shop:storeName', 'shop:announcement',
    'shop:deliveryFee', 'shop:freeDeliveryMin', 'shop:shelfFloor', 'shop:minOrder',
    'shop:slots', 'shop:gateway', 'shop:gatewayMerchant', 'shop:gatewaySandbox',
    'shop:notifyRoles', 'shop:hotline',
  ]
  const rows = await db.setting.findMany({ where: { key: { in: keys } } })
  const m = new Map(rows.map((r) => [r.key, r.value]))
  const s = (k: string, d = '') => rawSetting(m.get(k), d)
  const n = (k: string, d: number) => {
    const v = Number(s(k, String(d)).replace(/[^\d.-]/g, ''))
    return Number.isFinite(v) && v >= 0 ? v : d
  }
  let notifyRoles = ['SK', 'HC', 'GM', 'EXEC']
  try {
    const parsed = JSON.parse(s('shop:notifyRoles', ''))
    if (Array.isArray(parsed) && parsed.length) notifyRoles = parsed.map(String)
  } catch { /* پیش‌فرض */ }
  let hiddenGroups: string[] = []
  try {
    const parsed = JSON.parse(s('shop:hiddenGroups', ''))
    if (Array.isArray(parsed)) hiddenGroups = parsed.map((x) => String(x).trim()).filter(Boolean)
  } catch { /* پیش‌فرض */ }
  return {
    open: s('shop:open', 'true') === 'true',
    devOtp: s('shop:devOtp', 'false') === 'true',
    apiToken: s('shop:apiToken', '').trim(),
    storeName: s('shop:storeName', 'هایپر زیتون'),
    announcement: s('shop:announcement', ''),
    deliveryFee: n('shop:deliveryFee', 60000),
    freeDeliveryMin: n('shop:freeDeliveryMin', 50000000),
    shelfFloor: n('shop:shelfFloor', 2),
    minOrder: n('shop:minOrder', 0),
    slotsJson: s('shop:slots', DEFAULT_SLOTS),
    gateway: s('shop:gateway', 'mock'),
    gatewayMerchant: s('shop:gatewayMerchant', ''),
    gatewaySandbox: s('shop:gatewaySandbox', 'true') === 'true',
    notifyRoles,
    hotline: s('shop:hotline', '034-34220000'),
    hiddenGroups,
  }
}

/** پاک‌سازی نام کالا برای نمایش مشتری — پیشوندهای اداری هلو («* »، «_ ») حذف می‌شوند */
export function cleanName(name: string): string {
  return String(name ?? '').replace(/^[\s*_\-•·]+/, '').replace(/\s{2,}/g, ' ').trim()
}

export interface SlotConfig { days: number; lead: number; cap: number; ranges: number[][]; closed: number[] }

export function parseSlots(json: string): SlotConfig {
  const d = safeJson<Partial<SlotConfig>>(json, {})
  return {
    days: Math.max(1, Math.min(7, Number(d.days) || 3)),
    lead: Math.max(30, Number(d.lead) || 90),
    cap: Math.max(1, Number(d.cap) || 6),
    ranges: Array.isArray(d.ranges) && d.ranges.length
      ? (d.ranges as unknown[]).filter((r): r is number[] => Array.isArray(r) && r.length === 2).slice(0, 4)
      : [[9, 12], [14, 18], [18, 22]],
    closed: Array.isArray(d.closed) ? d.closed.map(Number) : [],
  }
}

// ============ توکن‌ها ============

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

/** توکن نشست مشتری: {rnd}.{customerId}.{sig} — مثل نشست کارکنان ولی جدا */
export function createCustomerToken(customerId: string): string {
  const rnd = randomBytes(12).toString('base64url')
  const payload = `${rnd}.${customerId}`
  return `${payload}.${sign(payload)}`
}

export function verifyCustomerToken(token: string | null | undefined): string | null {
  if (!token) return null
  const idx = token.lastIndexOf('.')
  if (idx < 0) return null
  const payload = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = sign(payload)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const customerId = payload.slice(payload.indexOf('.') + 1)
  return customerId || null
}

export const customerCookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: CUSTOMER_TTL_DAYS * 24 * 3600,
}

export const cartCookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: CUSTOMER_TTL_DAYS * 24 * 3600,
}

// ============ موبایل و OTP ============

export function normalizeShopPhone(input: unknown): string | null {
  let s = String(input ?? '').trim()
  s = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  s = s.replace(/[^\d]/g, '')
  if (s.startsWith('0098')) s = '0' + s.slice(4)
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2)
  else if (s.startsWith('9') && s.length === 10) s = '0' + s
  return /^09\d{9}$/.test(s) ? s : null
}

function hashOtp(code: string): string {
  return createHash('sha256').update(`otp:${code}:${SECRET}`).digest('hex')
}

export const OTP_TTL_MINUTES = 3
export const OTP_MAX_TRIES = 5
const OTP_PER_HOUR = 3
const OTP_PER_DAY_IP = 12
export const DEV_OTP_CODE = '11111'

export type OtpSendResult = { ok: true; devCode?: string } | { ok: false; error: string; retryAfterSec?: number }

/** ارسال OTP — نرخ: ۳/ساعت به هر شماره، ۱۲/روز به هر IP. کد dev فقط وقتی shop:devOtp روشن است. */
export async function otpSend(phone: string, ip: string, devOtp: boolean): Promise<OtpSendResult> {
  const hourAgo = new Date(Date.now() - 3600_000)
  const dayAgo = new Date(Date.now() - 24 * 3600_000)
  const [perPhone, perIp, customer] = await Promise.all([
    db.shopOtpLog.count({ where: { phone, createdAt: { gt: hourAgo } } }),
    db.shopOtpLog.count({ where: { ip, createdAt: { gt: dayAgo } } }),
    db.shopCustomer.findUnique({ where: { phone } }),
  ])
  if (perPhone >= OTP_PER_HOUR) {
    return { ok: false, error: 'تا یک ساعت گذشته چند کد برای این شماره ارسال شده — کمی بعد دوباره تلاش کنید', retryAfterSec: 3600 }
  }
  // سقف روزانهٔ IP در حالت dev بالاتر است (بات‌ها چند مشتری می‌سازند؛ پیامکی واقعاً نمی‌رود)
  if (perIp >= (devOtp ? 60 : OTP_PER_DAY_IP)) {
    return { ok: false, error: 'تعداد درخواست‌های امروز از این دستگاه زیاد بوده — فردا دوباره تلاش کنید', retryAfterSec: 86400 }
  }
  if (customer?.isBlocked) return { ok: false, error: 'این شماره مسدود شده است — با پشتیبانی تماس بگیرید' }

  const code = String(randomInt(10000, 100000))
  await db.shopCustomer.upsert({
    where: { phone },
    create: { phone, otpHash: hashOtp(code), otpExpAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000), otpTryCount: 0, otpSentAt: new Date() },
    update: { otpHash: hashOtp(code), otpExpAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000), otpTryCount: 0, otpSentAt: new Date() },
  })
  await db.shopOtpLog.create({ data: { phone, ip, code: devOtp ? code : null } })
  // ارسال از پنل پیش‌فرض مرکز پیامک (mock/real) — در SmsOutbox ردیف ثبت می‌شود
  await sendViaDefaultPanel(phone, `هایپر زیتون\nکد ورود شما به فروشگاه آنلاین: ${code}`, { reason: 'SHOP_OTP', refId: phone }).catch(() => null)
  return { ok: true, ...(devOtp ? { devCode: code } : {}) }
}

/** تأیید OTP → توکن نشست. کد dev (۱۱۱۱۱) فقط با تنظیم shop:devOtp. */
export async function otpVerify(
  phone: string,
  code: string,
  devOtp: boolean,
): Promise<{ ok: true; token: string; customer: { id: string; phone: string; name: string } } | { ok: false; error: string }> {
  const c = await db.shopCustomer.findUnique({ where: { phone } })
  if (!c || !c.otpHash || !c.otpExpAt) return { ok: false, error: 'اول برای این شماره کد بگیرید' }
  if (c.isBlocked) return { ok: false, error: 'این شماره مسدود شده است' }
  if (c.otpTryCount >= OTP_MAX_TRIES) return { ok: false, error: 'تعداد تلاش‌ها زیاد شد — کد جدید بگیرید' }
  const okCode = devOtp && code === DEV_OTP_CODE ? true : hashOtp(code) === c.otpHash
  if (!okCode || c.otpExpAt < new Date()) {
    await db.shopCustomer.update({ where: { id: c.id }, data: { otpTryCount: { increment: 1 } } })
    return { ok: false, error: c.otpExpAt < new Date() ? 'کد منقضی شده — کد جدید بگیرید' : 'کد واردشده درست نیست' }
  }
  await db.shopCustomer.update({
    where: { id: c.id },
    data: { otpHash: null, otpExpAt: null, otpTryCount: 0, loginCount: { increment: 1 }, lastLoginAt: new Date() },
  })
  return { ok: true, token: createCustomerToken(c.id), customer: { id: c.id, phone: c.phone, name: c.name } }
}

// ============ موجودی قابل‌فروش ============

/**
 * نقشهٔ رزرو مجموع: سبدهای به‌روزشده در ۱۵ دقیقهٔ اخیر (غیر از excludeBasket)
 * + اقلام سفارش‌های در جریان. با Prisma (بدون SQL خام) تا مقایسهٔ تاریخ یکدست بماند.
 */
export async function reservedMap(productIds: string[], excludeBasketId?: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!productIds.length) return map
  const cutoff = new Date(Date.now() - BASKET_RESERVE_MINUTES * 60_000)

  const activeBaskets = await db.shopBasket.findMany({
    where: { updatedAt: { gt: cutoff }, ...(excludeBasketId ? { id: { not: excludeBasketId } } : {}) },
    select: { id: true },
  })
  if (activeBaskets.length) {
    const rows = await db.shopBasketItem.groupBy({
      by: ['productId'],
      where: { basketId: { in: activeBaskets.map((b) => b.id) }, productId: { in: productIds } },
      _sum: { qty: true },
    })
    for (const r of rows) map.set(r.productId, (map.get(r.productId) || 0) + (r._sum.qty || 0))
  }

  const activeOrders = await db.shopOrder.findMany({
    where: { status: { in: RESERVING_STATUSES } },
    select: { id: true },
  })
  if (activeOrders.length) {
    const rows = await db.shopCartItem.groupBy({
      by: ['productId'],
      where: { orderId: { in: activeOrders.map((o) => o.id) }, productId: { in: productIds } },
      _sum: { qty: true },
    })
    for (const r of rows) map.set(r.productId, (map.get(r.productId) || 0) + (r._sum.qty || 0))
  }
  return map
}

const CATALOG_SELECT = {
  id: true, name: true, code: true, unit: true, mainGroup: true, subGroup: true,
  barcodesJson: true, sellPrice: true, sellPrice2: true, stock: true, monthlySold: true, imported: true,
} as const

type ProductLite = {
  id: string
  name: string
  code: string | null
  unit: string
  mainGroup: string | null
  subGroup: string | null
  barcodesJson: string
  sellPrice: number
  sellPrice2: number
  stock: number
  monthlySold: number
  imported: boolean
  updatedAt?: Date
}

export function priceOf(p: { sellPrice: number; sellPrice2: number }): number {
  return p.sellPrice > 0 ? p.sellPrice : p.sellPrice2
}

export function discountPct(p: { sellPrice: number; sellPrice2: number }): number {
  const price = priceOf(p)
  if (!p.sellPrice2 || p.sellPrice2 <= price || price <= 0) return 0
  return Math.round(((p.sellPrice2 - price) / p.sellPrice2) * 100)
}

/** available = موجودی − رزرو − کف قفسه (هرگز منفی نمی‌شود) */
export function availableOf(stock: number, reserved: number, shelfFloor: number): number {
  return Math.max(0, Math.floor(stock - reserved - shelfFloor))
}

// ============ کاتالوگ ============

export interface CatalogItem {
  id: string
  name: string
  unit: string
  group: string | null
  subGroup: string | null
  price: number
  printedPrice: number
  discountPct: number
  stock: number
  available: number
  barcode: string | null
  image: string | null
  sold: number
}

/** ETag کاتالوگ — با هر تغییر کالا/قیمت (updatedAt می‌پرد) عوض می‌شود */
export async function catalogEtag(): Promise<string> {
  const agg = await db.product.aggregate({ _max: { updatedAt: true }, _count: { _all: true }, where: { active: true } })
  const stamp = `${agg._count._all}:${agg._max.updatedAt?.getTime() ?? 0}`
  return `W/"${createHash('sha1').update(stamp).digest('base64url')}"`
}

export type CatalogSort = 'popular' | 'newest' | 'cheap' | 'expensive' | 'discount'

export interface CatalogQuery {
  q?: string
  group?: string
  subGroup?: string
  sort?: CatalogSort
  page?: number
  pageSize?: number
  onlyAvailable?: boolean
}

/** همهٔ کالاهای قابل‌فروش (قیمت > ۰) — فیلتر/جست‌وجو/مرتب‌سازی/صفحه‌بندی سمت JS */
export async function catalogLoad(): Promise<ProductLite[]> {
  return db.product.findMany({
    where: { active: true, status: 'فعال', OR: [{ sellPrice: { gt: 0 } }, { sellPrice2: { gt: 0 } }] },
    select: { ...CATALOG_SELECT, updatedAt: true },
  })
}

/** گروه‌های ساختاری هلو (فروشگاه/انبار/شرکت…) هرگز دستهٔ مشتری نیستند */
const JUNK_GROUP_RE = /^\s*(فروشگاه|انبار|شرکت|دفتر|مغازه|آقای|خانم|مهندس)(\s|$)/

function isHiddenGroup(group: string | null | undefined, hiddenList: string[]): boolean {
  if (!group) return false
  const g = group.trim()
  return hiddenList.includes(g) || JUNK_GROUP_RE.test(g)
}

export async function decorateCatalog(
  rows: ProductLite[],
  opts: { sort?: CatalogSort; q?: string; group?: string; subGroup?: string; page?: number; pageSize?: number; onlyAvailable?: boolean; images?: boolean; shelfFloor: number; hiddenGroups?: string[]; categories?: boolean },
) {
  let list = rows
  const catMap = opts.categories ? await shopCategoriesMap() : null
  if (opts.group) list = list.filter((p) => groupMatches(p.mainGroup, opts.group, catMap ?? new Map()))
  if (opts.subGroup) list = list.filter((p) => (p.subGroup || '').trim() === opts.subGroup)
  if (opts.q && opts.q.trim()) {
    const tokens = tokenizeQuery(opts.q)
    const candidates = list.filter(
      (p) => tokens.some((t) => p.name.includes(t) || (p.code || '').includes(t) || p.barcodesJson.includes(t)),
    )
    const ranked = rankFuzzy(opts.q, candidates)
    list = ranked.matched.length ? ranked.matched : ranked.partial
  }
  // رزرو فقط برای ۴۰۰ کالای برترِ مرتب‌شدهٔ اولیه محاسبه می‌شود (بازدهی) — کافی است چون
  // بعد از مرتب‌سازی فقط یک صفحه بریده می‌شود؛ کالای نمایش‌داده‌شده همیشه داخل این مجموعه است.
  const preSort = [...list].sort((a, b) => b.monthlySold - a.monthlySold)
  const reserved = await reservedMap(preSort.slice(0, 400).map((p) => p.id))
  const sort = opts.sort || 'popular'
  const decoratedPairs = list.map((p) => {
    const price = priceOf(p)
    const item: CatalogItem = {
      id: p.id, name: cleanName(p.name), unit: p.unit, group: p.mainGroup?.trim() || null, subGroup: p.subGroup?.trim() || null,
      price, printedPrice: p.sellPrice2 || price, discountPct: discountPct(p),
      stock: p.stock, available: availableOf(p.stock, reserved.get(p.id) || 0, opts.shelfFloor),
      barcode: p.code, image: null, sold: p.monthlySold,
    }
    return { item, u: p.updatedAt?.getTime() || 0 }
  })
  const filtered = opts.onlyAvailable ? decoratedPairs.filter((d) => d.item.available > 0) : decoratedPairs
  let sorted = filtered.map((d) => d.item)
  if (sort === 'cheap') sorted = [...filtered].sort((a, b) => a.item.price - b.item.price || b.item.sold - a.item.sold).map((d) => d.item)
  else if (sort === 'expensive') sorted = [...filtered].sort((a, b) => b.item.price - a.item.price || b.item.sold - a.item.sold).map((d) => d.item)
  else if (sort === 'newest') sorted = [...filtered].sort((a, b) => b.u - a.u).map((d) => d.item)
  else if (sort === 'discount') sorted = [...filtered].sort((a, b) => b.item.discountPct - a.item.discountPct || b.item.sold - a.item.sold).map((d) => d.item)
  else sorted = [...filtered].sort((a, b) => b.item.sold - a.item.sold || a.item.name.localeCompare(b.item.name, 'fa')).map((d) => d.item)
  const page = Math.max(1, opts.page || 1)
  const pageSize = Math.max(1, Math.min(60, opts.pageSize || 24))
  const slice = sorted.slice((page - 1) * pageSize, page * pageSize)
  if (opts.images !== false && slice.length) {
    const byKey = await primaryImageMap(slice.map((s) => s.id))
    for (const s of slice) s.image = byKey.get(s.id) ?? null
  }
  return { items: slice, total: sorted.length, page, pageSize }
}

export interface CategoryView { id: string; name: string; emoji: string; count: number }

/** دسته‌های هلوِ نگاشت‌شده به یک دستهٔ نمایشی (ShopCategory) — نام دسته → گروه‌ها */
export async function shopCategoriesMap(): Promise<Map<string, { id: string; emoji: string; groups: string[] }>> {
  const rows = await db.shopCategory.findMany({ where: { active: true } })
  const map = new Map<string, { id: string; emoji: string; groups: string[] }>()
  for (const r of rows) {
    const groups = safeJson<string[]>(r.groupsJson, []).map((g) => g.trim()).filter(Boolean)
    map.set(r.name.trim(), { id: r.id, emoji: r.emoji, groups })
  }
  return map
}

/** فیلتر گروه: اگر نام با یک دستهٔ نمایشی بخورد → هر گروه نگاشت‌شده می‌خورد؛ وگرنه گروه خام */
function groupMatches(group: string | null, filter: string | undefined, catMap: Map<string, { groups: string[] }>): boolean {
  const g = (group || '').trim()
  if (!g || !filter) return false
  const cat = catMap.get(filter)
  if (cat) return cat.groups.includes(g)
  return g === filter
}

/** گروه‌های اصلی + شمار کالا — برای صفحهٔ دسته‌بندی‌ها (بدون گروه‌های اداری هلو) */
export async function catalogGroups(): Promise<CategoryView[]> {
  const settings = await getShopSettings()
  const rows = await db.product.groupBy({
    by: ['mainGroup'],
    where: { active: true, status: 'فعال', OR: [{ sellPrice: { gt: 0 } }, { sellPrice2: { gt: 0 } }] },
    _count: { _all: true },
  })
  const countByGroup = new Map<string, number>()
  for (const r of rows) {
    const name = (r.mainGroup || '').trim()
    if (!name || isHiddenGroup(name, settings.hiddenGroups)) continue
    countByGroup.set(name, (countByGroup.get(name) || 0) + r._count._all)
  }
  const cats = await db.shopCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
  if (cats.length) {
    const out: CategoryView[] = []
    for (const c of cats) {
      const groups = safeJson<string[]>(c.groupsJson, []).map((g) => g.trim()).filter(Boolean)
      const count = groups.reduce((sum, g) => sum + (countByGroup.get(g) || 0), 0)
      if (count > 0) out.push({ id: c.id, name: c.name.trim(), emoji: c.emoji, count })
    }
    return out
  }
  // فالبک: گروه‌های خام (بدون دستهٔ تعریف‌شده)
  return [...countByGroup.entries()].map(([name, count]) => ({ id: name, name, emoji: '🛒', count })).sort((a, b) => b.count - a.count)
}

// ============ تصاویر چندگانهٔ کالا ============

/** primary رسانهٔ فروشگاه → فالبک ProductImage داخلی */
export async function primaryImageOf(productId: string): Promise<string | null> {
  const media = await db.shopProductMedia.findFirst({ where: { productId, isPrimary: true }, orderBy: { sortOrder: 'asc' } })
    ?? await db.shopProductMedia.findFirst({ where: { productId }, orderBy: { sortOrder: 'asc' } })
  if (media) return media.url
  const legacy = await db.productImage.findUnique({ where: { key: productId } })
  return legacy?.url ?? null
}

export async function primaryImageMap(productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!productIds.length) return out
  const media = await db.shopProductMedia.findMany({ where: { productId: { in: productIds } }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] })
  for (const m of media) if (!out.has(m.productId)) out.set(m.productId, m.url)
  const missing = productIds.filter((id) => !out.has(id))
  if (missing.length) {
    const legacy = await db.productImage.findMany({ where: { key: { in: missing } }, select: { key: true, url: true } })
    for (const l of legacy) out.set(l.key, l.url)
  }
  return out
}

// ============ سبد ============

export async function basketIdByToken(token: string | null | undefined): Promise<string | null> {
  if (!token || token.length < 8 || token.length > 80) return null
  const existing = await db.shopBasket.findUnique({ where: { token } })
  if (existing) return existing.id
  const row = await db.shopBasket.create({ data: { token } })
  return row.id
}

export function newBasketToken(): string {
  return randomBytes(18).toString('base64url')
}

/** متصل‌کردن سبد به مشتری پس از ورود (سبد مهمان حفظ می‌شود) */
export async function basketAttachCustomer(basketId: string, customerId: string): Promise<void> {
  await db.shopBasket.update({ where: { id: basketId }, data: { customerId } }).catch(() => null)
}

export interface BasketItemView {
  itemId: string
  productId: string
  name: string
  unit: string
  qty: number
  price: number
  printedPrice: number
  discountPct: number
  lineTotal: number
  available: number
  warning: boolean // موجودین下单时变了 — qty بیش از available
  image: string | null
}

export interface BasketView {
  items: BasketItemView[]
  itemsTotal: number
  count: number
  deliveryFee: number
  freeDeliveryMin: number
  freeDeliveryGap: number
  minOrder: number
}

export async function basketView(basketId: string): Promise<BasketView> {
  const [basket, settings] = await Promise.all([
    db.shopBasket.findUnique({ where: { id: basketId }, include: { items: true } }),
    getShopSettings(),
  ])
  const items = basket?.items ?? []
  const productIds = items.map((i) => i.productId)
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { ...CATALOG_SELECT, active: true } })
    : []
  const byId = new Map(products.map((p) => [p.id, p]))
  const reserved = await reservedMap(productIds, basketId)
  const imgById = await primaryImageMap(productIds)
  const view: BasketItemView[] = []
  for (const it of items) {
    const p = byId.get(it.productId)
    if (!p || !p.active) continue // کالای حذف‌شده/غیرفعال نمایش داده نمی‌شود
    const price = priceOf(p)
    const avail = availableOf(p.stock, reserved.get(p.id) || 0, settings.shelfFloor)
    const buyableQty = Math.min(it.qty, Math.max(0, avail))
    view.push({
      itemId: it.id, productId: p.id, name: cleanName(p.name), unit: p.unit, qty: it.qty,
      price, printedPrice: p.sellPrice2 || price, discountPct: discountPct(p),
      lineTotal: buyableQty * price,
      available: avail, warning: avail < it.qty,
      image: imgById.get(p.id) ?? null,
    })
  }
  const itemsTotal = view.reduce((s, v) => s + v.lineTotal, 0)
  const count = view.reduce((s, v) => s + v.qty, 0)
  const freeDelivery = settings.freeDeliveryMin > 0 && itemsTotal >= settings.freeDeliveryMin
  return {
    items: view,
    itemsTotal,
    count,
    deliveryFee: freeDelivery || itemsTotal === 0 ? 0 : settings.deliveryFee,
    freeDeliveryMin: settings.freeDeliveryMin,
    freeDeliveryGap: settings.freeDeliveryMin > 0 ? Math.max(0, settings.freeDeliveryMin - itemsTotal) : 0,
    minOrder: settings.minOrder,
  }
}

// ============ اسلات‌های تحویل ============

export interface Slot { date: string; from: string; to: string; left: number }

function jalaliWeekdayIndex(jy: number, jm: number, jd: number): number {
  const dt = jalaliToDate(jy, jm, jd)
  // getDay: یکشنبه=۰ … شنبه=۶ — شمارهٔ هفتهٔ ایران (شنبه=۰): (getDay+1)%7
  return (dt.getDay() + 1) % 7
}

export async function slotsAvailable(): Promise<Slot[]> {
  const settings = await getShopSettings()
  const cfg = parseSlots(settings.slotsJson)
  const today = todayJalaliDash()
  const nowHm = nowTehranTime()

  const dates: string[] = []
  const [ty, tm, td] = today.split('-').map(Number)
  for (let i = 0; i < cfg.days; i++) {
    const dt = jalaliToDate(ty, tm, td)
    dt.setDate(dt.getDate() + i)
    const j = dateToJalali(dt)
    dates.push(`${j.jy}-${pad2(j.jm)}-${pad2(j.jd)}`)
  }
  const busy = await db.shopOrder.groupBy({
    by: ['slotDate', 'slotFrom'],
    where: { slotDate: { in: dates }, status: { in: RESERVING_STATUSES } },
    _count: { _all: true },
  })
  const busyMap = new Map(busy.map((b) => [`${b.slotDate}|${b.slotFrom}`, b._count._all]))

  const out: Slot[] = []
  for (const date of dates) {
    const [y, m, d] = date.split('-').map(Number)
    if (cfg.closed.includes(jalaliWeekdayIndex(y, m, d))) continue
    for (const [from, to] of cfg.ranges) {
      if (date === today) {
        const [nh, nm] = nowHm.split(':').map(Number)
        if (from * 60 < nh * 60 + nm + cfg.lead) continue // اسلات امروز فقط با پیش‌ notice
      }
      const slotFrom = `${pad2(from)}:00`
      const slotTo = `${pad2(to)}:00`
      const left = cfg.cap - (busyMap.get(`${date}|${slotFrom}`) || 0)
      if (left > 0) out.push({ date, from: slotFrom, to: slotTo, left })
    }
  }
  return out.slice(0, 12)
}

export function slotLabelFa(s: { date: string; from: string; to: string }): string {
  return `${jalaliWeekdayName(s.date)} ${s.date} — ${s.from} تا ${s.to}`
}

// ============ تاریخچه ============

function pushHistory(json: string, entry: { by: string; action: string; detail?: string }): string {
  const arr = safeJson<{ at: string; by: string; action: string; detail?: string }[]>(json, [])
  arr.push({ at: new Date().toISOString(), ...entry })
  return JSON.stringify(arr)
}

export function historyOf(json: string): { at: string; by: string; action: string; detail?: string }[] {
  return safeJson<{ at: string; by: string; action: string; detail?: string }[]>(json, [])
}

// ============ سفارش ============

export interface CreateOrderInput {
  addressId: string
  slotDate: string
  slotFrom: string
  slotTo: string
  payMethod: 'COD' | 'GATEWAY'
  note?: string
}

export type CreateOrderResult =
  | { ok: true; order: { id: string; code: string; status: string; total: number; payUrl?: string } }
  | { ok: false; error: string; adjusted?: { productId: string; name: string; available: number }[]; status?: number }

/** ثبت سفارش — راستی‌آزمایی صادقانهٔ موجودی؛ در صورت کسری سبد بریده و ۴۰۹ برمی‌گردد */
export async function orderCreate(customerId: string, basketId: string, input: CreateOrderInput): Promise<CreateOrderResult> {
  const settings = await getShopSettings()
  if (!settings.open) return { ok: false, error: 'فروشگاه فعلاً بسته است — به‌زودی برمی‌گردیم', status: 503 }

  const customer = await db.shopCustomer.findUnique({ where: { id: customerId } })
  if (!customer || customer.isBlocked) return { ok: false, error: 'حساب مشتری معتبر نیست', status: 401 }

  const address = await db.shopAddress.findFirst({ where: { id: input.addressId, customerId } })
  if (!address) return { ok: false, error: 'آدرس تحویل را انتخاب کنید', status: 400 }

  const slotOk = (await slotsAvailable()).some((s) => s.date === input.slotDate && s.from === input.slotFrom && s.to === input.slotTo)
  if (!slotOk) return { ok: false, error: 'این بازهٔ تحویل دیگر آزاد نیست — بازهٔ دیگری انتخاب کنید', status: 409 }

  const basket = await db.shopBasket.findUnique({ where: { id: basketId }, include: { items: true } })
  if (!basket || !basket.items.length) return { ok: false, error: 'سبد خرید خالی است', status: 400 }

  const products = await db.product.findMany({
    where: { id: { in: basket.items.map((i) => i.productId) } },
    select: { ...CATALOG_SELECT, active: true },
  })
  const byId = new Map(products.map((p) => [p.id, p]))
  const reserved = await reservedMap(basket.items.map((i) => i.productId), basketId)

  const adjusted: { productId: string; name: string; available: number }[] = []
  for (const it of basket.items) {
    const p = byId.get(it.productId)
    const avail = !p || !p.active ? 0 : availableOf(p.stock, reserved.get(p.id) || 0, settings.shelfFloor)
    if (avail < it.qty) {
      adjusted.push({ productId: it.productId, name: p?.name || 'کالا', available: avail })
      if (avail <= 0) await db.shopBasketItem.delete({ where: { id: it.id } }).catch(() => null)
      else await db.shopBasketItem.update({ where: { id: it.id }, data: { qty: avail } }).catch(() => null)
    }
  }
  if (adjusted.length) {
    return { ok: false, error: 'موجودی برخی کالاها هنگام ثبت تغییر کرد — سبد به‌روز شد؛ دوباره تأیید کنید', adjusted, status: 409 }
  }

  const liveItems = basket.items.map((it) => ({ it, p: byId.get(it.productId)! })).filter((x) => x.p && x.p.active)
  if (!liveItems.length) return { ok: false, error: 'سبد خرید خالی است', status: 400 }

  const itemsTotal = liveItems.reduce((s, { it, p }) => s + priceOf(p) * it.qty, 0)
  if (settings.minOrder > 0 && itemsTotal < settings.minOrder) {
    return { ok: false, error: `حداقل مبلغ سفارش ${settings.minOrder.toLocaleString('fa-IR')} ریال است`, status: 400 }
  }
  const freeDelivery = settings.freeDeliveryMin > 0 && itemsTotal >= settings.freeDeliveryMin
  const deliveryFee = freeDelivery ? 0 : settings.deliveryFee
  const total = itemsTotal + deliveryFee

  const seq = (await db.shopOrder.count()) + 1
  const code = `HZ-WEB-${String(seq).padStart(4, '0')}`

  const order = await db.shopOrder.create({
    data: {
      code, customerId, status: input.payMethod === 'COD' ? 'COD' : 'AWAITING_PAYMENT', payMethod: input.payMethod,
      addressJson: JSON.stringify({
        label: address.label, receiver: address.receiver, phone: address.phone || customer.phone,
        city: address.city, address: address.address, postalCode: address.postalCode, note: address.note,
      }),
      slotDate: input.slotDate, slotFrom: input.slotFrom, slotTo: input.slotTo,
      deliveryFee, itemsTotal, total, note: input.note?.slice(0, 300) || null,
      historyJson: pushHistory('[]', { by: 'customer', action: 'create', detail: input.payMethod === 'COD' ? 'پرداخت در محل' : 'در انتظار پرداخت آنلاین' }),
      items: {
        create: liveItems.map(({ it, p }) => ({
          productId: p.id, name: cleanName(p.name), barcode: p.code, unit: p.unit, qty: it.qty,
          unitPrice: priceOf(p), printedPrice: p.sellPrice2 || priceOf(p), lineTotal: priceOf(p) * it.qty,
        })),
      },
    },
  })
  await db.shopBasketItem.deleteMany({ where: { basketId } })
  await db.shopBasket.update({ where: { id: basketId }, data: { updatedAt: new Date() } }).catch(() => null)

  // اعلان به کارکنان — انبار/صندوق + مدیران (پنل: /shop-ops)
  const units = liveItems.reduce((s, x) => s + x.it.qty, 0)
  const bodyNew = `سفارش آنلاین ${code} — ${units} عدد در ${liveItems.length} قلم — ${total.toLocaleString('fa-IR')} ریال — تحویل ${input.slotDate} ساعت ${input.slotFrom}-${input.slotTo} — پنل: /shop-ops`
  await Promise.all(
    settings.notifyRoles.map((role) =>
      notify({ role, kind: 'shop', severity: 'important', title: `سفارش آنلاین ${code}`, body: bodyNew, go: null }),
    ),
  )

  let payUrl: string | undefined
  if (input.payMethod === 'GATEWAY') {
    const gw = await startGatewayPayment(order.id, total, code)
    if (gw.ok) payUrl = gw.url
  }
  return { ok: true, order: { id: order.id, code: order.code, status: order.status, total, payUrl } }
}

// ============ درگاه پرداخت (آداپتور mock/zarinpal — انتخاب نهایی با مالک) ============

export async function startGatewayPayment(orderId: string, amount: number, code: string): Promise<{ ok: true; url: string; ref: string } | { ok: false; error: string }> {
  const settings = await getShopSettings()
  const ref = `GW-${randomBytes(8).toString('hex')}`
  await db.shopOrder.update({ where: { id: orderId }, data: { paymentRef: ref } })
  if (settings.gateway === 'zarinpal' && settings.gatewayMerchant) {
    const reqUrl = settings.gatewaySandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
      : 'https://payment.zarinpal.com/pg/v4/payment/request.json'
    try {
      const res = await fetch(reqUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: settings.gatewayMerchant, amount, callback_url: `https://hyperzeytoon.com/pay/callback?ref=${ref}`, description: `سفارش ${code} هایپر زیتون` }),
        signal: AbortSignal.timeout(15000),
      })
      const j = (await res.json()) as { data?: { authority?: string } }
      const authority = j?.data?.authority
      if (!authority) return { ok: false, error: 'درگاه پرداخت پاسخ معتبر نداد — پرداخت در محل را انتخاب کنید' }
      await db.shopOrder.update({ where: { id: orderId }, data: { paymentRef: authority } })
      const base = settings.gatewaySandbox ? 'https://sandbox.zarinpal.com/pg/StartPay/' : 'https://payment.zarinpal.com/pg/StartPay/'
      return { ok: true, url: `${base}${authority}`, ref: authority }
    } catch {
      return { ok: false, error: 'ارتباط با درگاه برقرار نشد — پرداخت در محل را انتخاب کنید' }
    }
  }
  // mock — صفحهٔ شبیه‌ساز پرداخت ویترین (فقط dev/تست)
  return { ok: true, url: `/pay/mock?ref=${ref}&amount=${amount}`, ref }
}

/** تأیید پرداخت — mock (شبیه‌ساز) یا بازگشت درگاه */
export async function settleGatewayPayment(ref: string, okFromGateway: boolean): Promise<{ ok: boolean; orderCode?: string; error?: string }> {
  const order = await db.shopOrder.findFirst({ where: { paymentRef: ref, status: 'AWAITING_PAYMENT' } })
  if (!order) return { ok: false, error: 'سفارشی با این مرجع پیدا نشد یا قبلاً تسویه شده' }
  if (!okFromGateway) {
    await db.shopOrder.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'پرداخت ناموفق',
        historyJson: pushHistory(order.historyJson, { by: 'gateway', action: 'payment-failed', detail: ref }) },
    })
    return { ok: false, orderCode: order.code, error: 'پرداخت ناموفق بود — سفارش لغو شد؛ می‌توانید دوباره سفارش بدهید' }
  }
  await db.shopOrder.update({
    where: { id: order.id },
    data: { status: 'PAID', paidAt: new Date(),
      historyJson: pushHistory(order.historyJson, { by: 'gateway', action: 'paid', detail: `مرجع ${ref}` }) },
  })
  const settings = await getShopSettings()
  await Promise.all(
    settings.notifyRoles.map((role) =>
      notify({ role, kind: 'shop', title: `پرداخت آنلاین ${order.code}`, body: `سفارش ${order.code} پرداخت شد (${order.total.toLocaleString('fa-IR')} ریال) — آمادهٔ جمع‌آوری — پنل: /shop-ops`, go: null }),
    ),
  )
  return { ok: true, orderCode: order.code }
}

// ============ گردش‌کار کارکنان ============

export type StaffAction = 'start-pick' | 'picked' | 'start-deliver' | 'deliver' | 'cancel' | 'retry-holoo'

export interface StaffUser { id: string; fullName: string; honorific: string; role: string }

export async function orderStaffAction(
  staff: StaffUser,
  orderId: string,
  action: StaffAction,
  extra: { delivererName?: string; delivererPhone?: string; reason?: string } = {},
): Promise<{ ok: boolean; error?: string; status?: string; invoiceNo?: string }> {
  const order = await db.shopOrder.findUnique({ where: { id: orderId }, include: { items: true, customer: true } })
  if (!order) return { ok: false, error: 'سفارش پیدا نشد' }
  const by = `${staff.honorific || ''} ${staff.fullName}`.trim()
  const manager = ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(staff.role)

  if (action === 'start-pick') {
    if (!manager && !['SK', 'HC', 'ACC', 'CASHIER'].includes(staff.role)) return { ok: false, error: 'دسترسی ندارید' }
    if (!['COD', 'PAID'].includes(order.status)) return { ok: false, error: 'جمع‌آوری فقط برای سفارش تأییدشده ممکن است' }
    await db.shopOrder.update({
      where: { id: order.id },
      data: { status: 'PICKING', pickerId: staff.id, pickerName: by, historyJson: pushHistory(order.historyJson, { by, action: 'start-pick' }) },
    })
    await customerSms(order.customerId, `سفارش ${order.code} در حال جمع‌آوری است`)
    return { ok: true, status: 'PICKING' }
  }

  if (action === 'picked') {
    if (!manager && !['SK', 'HC', 'ACC', 'CASHIER'].includes(staff.role)) return { ok: false, error: 'دسترسی ندارید' }
    if (order.status !== 'PICKING') return { ok: false, error: 'سفارش در حالت جمع‌آوری نیست' }
    await db.shopOrder.update({
      where: { id: order.id },
      data: { pickedAt: new Date(), historyJson: pushHistory(order.historyJson, { by, action: 'picked', detail: 'جمع‌آوری کامل شد' }) },
    })
    return { ok: true, status: 'PICKING' }
  }

  if (action === 'start-deliver') {
    if (!manager && !['SK', 'HC', 'CASHIER', 'SALES'].includes(staff.role)) return { ok: false, error: 'دسترسی ندارید' }
    if (order.status !== 'PICKING' || !order.pickedAt) return { ok: false, error: 'اول جمع‌آوری را تمام کنید' }
    if (!extra.delivererName?.trim()) return { ok: false, error: 'نام پیک/تحویل‌دهنده را وارد کنید' }
    await db.shopOrder.update({
      where: { id: order.id },
      data: { status: 'DELIVERING', delivererName: extra.delivererName.trim(), delivererPhone: extra.delivererPhone?.trim() || null,
        historyJson: pushHistory(order.historyJson, { by, action: 'start-deliver', detail: `پیک: ${extra.delivererName.trim()}` }) },
    })
    const addr = safeJson<{ receiver?: string }>(order.addressJson, {})
    await customerSms(order.customerId, `${addr.receiver || 'مشتری گرامی'}، سفارش ${order.code} در مسیر تحویل است — پیک: ${extra.delivererName.trim()}`)
    return { ok: true, status: 'DELIVERING' }
  }

  if (action === 'deliver') {
    if (!manager && !['SK', 'HC', 'CASHIER', 'SALES'].includes(staff.role)) return { ok: false, error: 'دسترسی ندارید' }
    if (order.status !== 'DELIVERING') return { ok: false, error: 'سفارش در مسیر تحویل نیست' }
    await db.shopOrder.update({
      where: { id: order.id },
      data: { status: 'DELIVERED', deliveredAt: new Date(),
        historyJson: pushHistory(order.historyJson, { by, action: 'deliver', detail: 'تحویل به مشتری' }) },
    })
    // کاهش موجودی انبار سررسید (رزرو آزاد می‌شود؛ هلو موجودی خودش را کم می‌کند)
    for (const it of order.items) {
      await db.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.qty } } }).catch(() => null)
    }
    await shopSyncTouch('STOCK', order.items.map((i) => i.productId))
    await customerSms(order.customerId, `سفارش ${order.code} تحویل شد — سپاس از خرید شما`)
    // فاکتور فروش هلو (نوع ۱) — بهترین تلاش؛ از /shop-ops بازمیری دارد
    const push = await holooPushInvoice(order.id)
    return { ok: true, status: push.ok ? 'INVOICED' : 'DELIVERED', error: push.ok ? undefined : push.error, invoiceNo: push.invoiceNo }
  }

  if (action === 'cancel') {
    if (!manager && staff.role !== 'ACC') return { ok: false, error: 'فقط مدیران می‌توانند لغو کنند' }
    if (['DELIVERED', 'INVOICED'].includes(order.status)) return { ok: false, error: 'سفارش تحویل‌شده قابل لغو نیست — مرجوعی ثبت کنید' }
    if (order.status === 'CANCELLED') return { ok: false, error: 'قبلاً لغو شده' }
    await db.shopOrder.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED', cancelledAt: new Date(), cancelReason: extra.reason?.trim() || 'لغو توسط فروشگاه',
        historyJson: pushHistory(order.historyJson, { by, action: 'cancel', detail: extra.reason || '' }),
      },
    })
    await customerSms(order.customerId, `سفارش ${order.code} لغو شد${extra.reason ? ` — ${extra.reason}` : ''}${order.payMethod === 'GATEWAY' && order.paidAt ? '. مبلغ پرداختی تا ۷۲ ساعت آینده برگشت داده می‌شود.' : ''}`)
    return { ok: true, status: 'CANCELLED' }
  }

  if (action === 'retry-holoo') {
    if (!manager && staff.role !== 'ACC') return { ok: false, error: 'دسترسی ندارید' }
    const push = await holooPushInvoice(order.id)
    return { ok: push.ok, error: push.error, status: push.ok ? 'INVOICED' : undefined, invoiceNo: push.invoiceNo }
  }

  return { ok: false, error: 'عملیات ناشناخته' }
}

async function customerSms(customerId: string, text: string) {
  try {
    const c = await db.shopCustomer.findUnique({ where: { id: customerId } })
    if (c) await sendViaDefaultPanel(c.phone, `هایپر زیتون | ${text}`, { reason: 'SHOP_ORDER', refId: customerId })
  } catch {
    /* پیامک هرگز جریان اصلی را نمی‌شکند */
  }
}

// ============ هلو — فاکتور فروش نوع ۱ ============

/** find-or-create طرف حساب هلو با کدِ W{موبایل} → ErpCode (idempotent) */
export async function holooEnsureCustomer(
  cfg: Awaited<ReturnType<typeof getHolooConfig>>,
  phone: string,
  name: string,
): Promise<{ erp: string } | { error: string }> {
  const code = `W${phone}`
  const byCode = await getCustomers(cfg, { code }).catch(() => null)
  const found = byCode?.customer?.[0]
  if (found?.ErpCode) return { erp: found.ErpCode }
  // شاید قبلاً با همین موبایل ثبت شده باشد (کد دیگر) — جست‌وجوی فهرست خریداران
  const list = await getCustomers(cfg, { purchaser: true }).catch(() => null)
  const byMobile = list?.customer?.find((c) => c.Mobile === phone)
  if (byMobile?.ErpCode) return { erp: byMobile.ErpCode }
  // هلو نام تکراری طرف حساب را رد می‌کند (کد ۸) — پس نامِ مشتری آنلاین همیشه با موبایل یکتا می‌شود
  const baseName = (name || '').trim() || `مشتری آنلاین ${phone}`
  const custName = `${baseName} (${phone})`
  try {
    const res = await holooCreateCustomer(cfg, {
      code, name: custName, ispurchaser: true, custtype: 0,
      mobile: phone,
      city: 'رفسنجان', ostan: 'کرمان',
    })
    const wr = assertHolooWrite(res, 'طرف حساب آنلاین')
    return { erp: wr.ErpCode! }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('موبایل') || msg.includes('تکراری')) {
      const again = await getCustomers(cfg, { purchaser: true }).catch(() => null)
      const dup = again?.customer?.find((c) => c.Mobile === phone)
      if (dup?.ErpCode) return { erp: dup.ErpCode }
      if (msg.includes('نام') && !msg.includes('موبایل')) {
        // نام هم‌سانِ دیگری (بدون این موبایل) — بازگشت به نام پیش‌فرض یکتا
        try {
          const res = await holooCreateCustomer(cfg, {
            code, name: `مشتری آنلاین ${phone}`, ispurchaser: true, custtype: 0,
            mobile: phone, city: 'رفسنجان', ostan: 'کرمان',
          })
          const wr = assertHolooWrite(res, 'طرف حساب آنلاین')
          return { erp: wr.ErpCode! }
        } catch (e2) {
          return { error: `ثبت مشتری در هلو: ${e2 instanceof Error ? e2.message : String(e2)}` }
        }
      }
    }
    return { error: `ثبت مشتری در هلو: ${msg}` }
  }
}

/** ErpCode کالا — اول از Product.holooErp؛ نبود با بارکد از هلو پرسیده و کش می‌شود
 *  (فقط ۴۰۶ کالا از سینک نامِ هلو ErpCode دارند؛ بقیه با بارکد = Code هلو پیدا می‌شوند) */
async function holooEnsureProductErps(cfg: Awaited<ReturnType<typeof getHolooConfig>>, items: { productId: string; name: string }[], products: { id: string; holooErp: string | null }[]): Promise<Map<string, string | null>> {
  const erpById = new Map(products.map((p) => [p.id, p.holooErp]))
  const missing = items.filter((i) => !erpById.get(i.productId))
  if (!missing.length) return erpById
  // بارکد هر کالای بی‌ErpCode را از DB بخوان و یک‌به‌یک از هلو بپرس (سقف ۱۵ قلم در هر سفارش)
  const withCode = await db.product.findMany({ where: { id: { in: missing.map((m) => m.productId) } }, select: { id: true, code: true } })
  const codeById = new Map(withCode.filter((c) => c.code).map((c) => [c.id, c.code!]))
  for (const m of missing.slice(0, 15)) {
    const code = codeById.get(m.productId)
    if (!code) continue
    try {
      const res = await holooGetProducts(cfg, { code })
      const hit = res?.product?.find((pp) => pp.Code === code)
      if (hit?.ErpCode) {
        erpById.set(m.productId, hit.ErpCode)
        await db.product.update({ where: { id: m.productId }, data: { holooErp: hit.ErpCode } }).catch(() => null)
      }
    } catch {
      /* offline → این قلم مثل بقیهٔ بی‌کدها گزارش می‌شود */
    }
  }
  return erpById
}

/** ثبت فاکتور فروش (نوع ۱) در هلو برای سفارش تحویل‌شده — idempotent با holooInvoiceNo */
export async function holooPushInvoice(orderId: string): Promise<{ ok: boolean; error?: string; invoiceNo?: string }> {
  const order = await db.shopOrder.findUnique({ where: { id: orderId }, include: { items: true, customer: true } })
  if (!order) return { ok: false, error: 'سفارش پیدا نشد' }
  if (order.status !== 'DELIVERED' && order.status !== 'INVOICED') return { ok: false, error: 'فاکتور فقط برای سفارش تحویل‌شده ثبت می‌شود' }
  if (order.holooInvoiceNo) return { ok: true, invoiceNo: order.holooInvoiceNo }

  const cfg = await getHolooConfig()
  if (!cfg.enabled) return { ok: false, error: 'اتصال هلو فعال نیست (تنظیمات هلو)' }

  let custErp = order.holooCustomerErp || order.customer.holooErp || ''
  if (!custErp) {
    const found = await holooEnsureCustomer(cfg, order.customer.phone, order.customer.name)
    if ('error' in found) {
      await markHolooError(orderId, found.error)
      await holooLog('SHOP_INVOICE', 'FAIL', order.code, found.error)
      return { ok: false, error: found.error }
    }
    custErp = found.erp
    await db.shopCustomer.update({ where: { id: order.customerId }, data: { holooErp: custErp } }).catch(() => null)
  }

  // ErpCode کالاها — Product.holooErp یا غنی‌سازی با بارکد از هلو
  const products = await db.product.findMany({ where: { id: { in: order.items.map((i) => i.productId) } }, select: { id: true, holooErp: true } })
  const erpById = await holooEnsureProductErps(cfg, order.items, products)
  const noErp = order.items.filter((i) => !erpById.get(i.productId))
  if (noErp.length) {
    const err = `${noErp.length} قلم کد هلو ندارد: ${noErp.slice(0, 3).map((i) => i.name).join('،')}`
    await markHolooError(orderId, err)
    await holooLog('SHOP_INVOICE', 'FAIL', order.code, err)
    return { ok: false, error: err }
  }

  try {
    const cashSarfaslRow = await db.setting.findUnique({ where: { key: 'holoo:cashSarfasl' } })
    const cashSarfasl = (cashSarfaslRow?.value || '10100010001').replace(/^"|"$/g, '')
    const res = await holooCreateInvoice(cfg, {
      type: 1,
      customererpcode: custErp,
      date: dateToGregorian(new Date()),
      time: dateToHm(new Date()),
      cash: Math.round(order.itemsTotal),
      cashsarfasl: cashSarfasl, // صندوق فروش — سرویس واقعی بدون آن فاکتور را رد می‌کند (کد ۲۹)
      details: order.items.map((i) => ({
        ProductErpCode: erpById.get(i.productId)!,
        few: i.qty,
        price: Math.round(i.unitPrice),
        comment: order.code,
      })),
    })
    const wr = assertHolooWrite(res, 'فاکتور فروش آنلاین')
    const invoiceNo = wr.ReturnParam1 || wr.ErpCode || ''
    await db.shopOrder.update({
      where: { id: orderId },
      data: {
        status: 'INVOICED', holooInvoiceNo: invoiceNo, holooSanadNo: wr.ReturnParam2 || null,
        holooPushAt: new Date(), holooError: null, holooCustomerErp: custErp,
        historyJson: pushHistory(order.historyJson, { by: 'system', action: 'holoo-invoice', detail: `فاکتور فروش ${invoiceNo}` }),
      },
    })
    await holooLog('SHOP_INVOICE', 'OK', order.code, null, invoiceNo)
    return { ok: true, invoiceNo }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markHolooError(orderId, msg)
    await holooLog('SHOP_INVOICE', 'FAIL', order.code, msg)
    return { ok: false, error: msg }
  }
}

async function markHolooError(orderId: string, error: string) {
  await db.shopOrder.update({ where: { id: orderId }, data: { holooError: error.slice(0, 500) } }).catch(() => null)
}

async function holooLog(kind: string, status: 'OK' | 'FAIL', orderCode: string, error: string | null, invoiceNo?: string) {
  await db.holooSyncLog.create({
    data: { kind, status, error: error || null,
      statsJson: JSON.stringify({ order: orderCode, invoiceNo: invoiceNo || null }) },
  }).catch(() => null)
}

// ============ outbox رویدادها ============

/** ثبت رویداد قیمت/موجودی برای ژورنال ویترین (بهترین تلاش — ETag مرجع اصلی است) */
export async function shopSyncTouch(kind: 'PRICE' | 'STOCK' | 'PRODUCT' | 'SYNC', productIds: string[]): Promise<void> {
  if (!productIds.length) return
  const minute = Math.floor(Date.now() / 60_000)
  try {
    const keys = productIds.slice(0, 500).map((id) => ({
      kind, productId: id,
      idempotencyKey: `${kind}:${id}:${minute}`,
      payloadJson: JSON.stringify({ at: new Date().toISOString() }),
    }))
    const existing = await db.shopSyncEvent.findMany({ where: { idempotencyKey: { in: keys.map((k) => k.idempotencyKey) } }, select: { idempotencyKey: true } })
    const seen = new Set(existing.map((e) => e.idempotencyKey))
    const fresh = keys.filter((k) => !seen.has(k.idempotencyKey))
    if (fresh.length) await db.shopSyncEvent.createMany({ data: fresh })
  } catch {
    /* ژورنال — هرگز جریان اصلی را نمی‌شکند */
  }
}
