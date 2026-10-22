import { db } from '@/lib/db'
import { parseJalaliDash, jalaliToDate, dateToJalali, pad2 } from '@/lib/jalali'

/**
 * Holoo accounting web-service client (SPEC-R3 §2.5 — task B2).
 * Contract source: /tmp/holoo-api.txt (extracted from upload/webserviceHelp.pdf).
 * Base URL shape: http://{ip}:8080/TncHoloo/api — mock simulator: mini-services/holoo-sim (port 3040).
 */

// ============ Settings / config ============

export const HOLOO_DEFAULT_MOCK_URL = 'http://127.0.0.1:3040/TncHoloo/api'
export const HOLOO_DEFAULT_BASE_URL = 'http://192.168.1.10:8080/TncHoloo/api'

export const HOLOO_SETTING_KEYS = {
  baseUrl: 'holoo:baseUrl',
  mockUrl: 'holoo:mockUrl',
  useMock: 'holoo:useMock',
  username: 'holoo:username',
  userpass: 'holoo:userpass',
  dbname: 'holoo:dbname',
  enabled: 'holoo:enabled',
} as const

export interface HolooConfig {
  baseUrl: string
  mockUrl: string
  useMock: boolean
  username: string
  userpass: string // base64 (raw input is normalized via ensureBase64Pass at send time)
  dbname: string
  enabled: boolean
}

async function readSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function getHolooConfig(): Promise<HolooConfig> {
  const [baseUrl, mockUrl, useMock, username, userpass, dbname, enabled] = await Promise.all([
    readSetting(HOLOO_SETTING_KEYS.baseUrl),
    readSetting(HOLOO_SETTING_KEYS.mockUrl),
    readSetting(HOLOO_SETTING_KEYS.useMock),
    readSetting(HOLOO_SETTING_KEYS.username),
    readSetting(HOLOO_SETTING_KEYS.userpass),
    readSetting(HOLOO_SETTING_KEYS.dbname),
    readSetting(HOLOO_SETTING_KEYS.enabled),
  ])
  return {
    baseUrl: (baseUrl || '').trim() || HOLOO_DEFAULT_BASE_URL,
    mockUrl: (mockUrl || '').trim() || HOLOO_DEFAULT_MOCK_URL,
    useMock: (useMock ?? 'true') === 'true',
    username: (username || '').trim(),
    userpass: (userpass || '').trim(),
    dbname: (dbname || '').trim(),
    enabled: (enabled ?? 'false') === 'true',
  }
}

export async function setHolooSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
}

export function holooTarget(cfg: HolooConfig): string {
  return (cfg.useMock ? cfg.mockUrl : cfg.baseUrl).trim().replace(/\/+$/, '')
}

export function isHolooConfigured(cfg: HolooConfig): boolean {
  return !!(cfg.username && cfg.userpass && cfg.dbname)
}

/** The Holoo Login sends userpass Base64-encoded; accept either raw or base64 input and normalize. */
export function ensureBase64Pass(v: string): string {
  const t = (v || '').trim()
  if (!t) return t
  try {
    const round = Buffer.from(Buffer.from(t, 'base64').toString('utf8'), 'utf8').toString('base64')
    if (round === t) return t // already a valid base64 fixed-point
  } catch {
    // fallthrough — not base64
  }
  return Buffer.from(t, 'utf8').toString('base64')
}

// ============ Errors (Persian mapping per the PDF error tables) ============

export class HolooError extends Error {
  code: number
  constructor(message: string, code = 0) {
    super(message)
    this.name = 'HolooError'
    this.code = code
  }
}

/** کدهای خطای وب‌سرویس هلو — جدول انتهای سند webserviceHelp */
export const HOLOO_ERROR_FA: Record<number, string> = {
  1: 'عدم برقراری ارتباط با بانک اطلاعاتی هلو — ممکن است نام کاربری یا کلمه عبور نادرست باشد',
  3: 'فایل Config وب‌سرویس هلو در مسیر مورد نظر کپی نشده است',
  4: 'لطفاً ابتدا نسخه هلو را اجرا نمایید',
  5: 'ارتباط با اینترنت برقرار نمی‌باشد — اتصال شبکه را بررسی کنید',
  6: 'کاربر گرامی، شما دسترسی استفاده از وب‌سرویس هلو را ندارید',
  7: 'نام طرف حساب خالی می‌باشد',
  8: 'نام طرف حساب تکراری می‌باشد',
  9: 'کد طرف حساب تکراری میباشد',
  10: 'شماره موبایل تکراری میباشد',
  11: 'پکیج ارسالی اشتباه میباشد',
  12: 'کد حساب تکراری میباشد',
  13: 'کد حساب معتبر نمیباشد',
  14: 'کد طرف حساب معتبر نمیباشد',
  15: 'کد کالا معتبر نمیباشد',
  16: 'کد واحد معتبر نمیباشد',
  17: 'تاریخ معتبر نمیباشد',
  18: 'ساعت معتبر نمیباشد',
  19: 'تعداد کالا معتبر نمیباشد',
  20: 'قیمت کالا معتبر نمیباشد',
  21: 'نوع (بدهکار / بستانکار) به درستی مشخص نشده است',
  22: 'کد واسطه معتبر نمیباشد',
  23: 'کد ملی تکراری میباشد',
  24: 'کد اقتصادی تکراری میباشد',
  25: 'کدپستی معتبر نمیباشد',
  26: 'مالیات و عوارض معتبر نمیباشد',
  27: 'کاربر گرامی، شما دسترسی استفاده از وب‌سرویس هلو را ندارید',
  28: 'کالاهای زیر فاقد موجودی میباشند',
  29: 'سرفصل صندوق معتبر نمیباشد',
  30: 'مبلغ صندوق معتبر نمی‌باشد',
  31: 'نوع فاکتور معتبر نمی‌باشد',
  32: 'سرفصل کارتخوان معتبر نمیباشد',
  33: 'مبلغ کارتخوان معتبر نمیباشد',
  34: 'مبلغ نسیه معتبر نمیباشد',
  35: 'مبلغ تخفیف معتبر نمیباشد',
  36: 'مبلغ تسویه فاکتور با جمع فاکتور برابر نمی‌باشد',
  37: 'کد کالا تکراری میباشد',
  38: 'نام کالا تکراری میباشد',
  39: 'نام کالا خالی میباشد',
  40: 'شناسه (ErpCode) کالا معتبر نمیباشد',
  41: 'ظرفیت این طبقه جهت اضافه نمودن کالا تکمیل شده است',
  42: 'شناسه گروه اصلی معتبر نمیباشد',
  43: 'شناسه گروه فرعی معتبر نمیباشد',
  44: 'شناسه معتبر نمیباشد',
  45: 'سرفصل طرف حساب معتبر نمیباشد',
  46: 'مبلغ مشخص نشده است',
}

// ============ Transport ============

const HOLOO_TIMEOUT_MS = 15_000

/** cached login tokens, keyed by target|user|db — auto-refreshed once on 401 */
const tokenCache = new Map<string, { token: string; at: number }>()

function tokenKey(cfg: HolooConfig): string {
  return `${holooTarget(cfg)}|${cfg.username}|${cfg.dbname}`
}

function connError(cfg: HolooConfig): HolooError {
  if (cfg.useMock) {
    return new HolooError(
      'اتصال به شبیه‌ساز هلو برقرار نشد — ابتدا آن را اجرا کنید: cd mini-services/holoo-sim && bun run dev'
    )
  }
  return new HolooError('اتصال به هلو برقرار نشد — آدرس وب‌سرویس و اتصال شبکه را بررسی کنید')
}

export interface HolooFetchOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  noAuth?: boolean
}

function buildUrl(cfg: HolooConfig, path: string, query?: HolooFetchOpts['query']): string {
  const base = holooTarget(cfg)
  const p = path.startsWith('/') ? path : `/${path}`
  const url = new URL(base + p)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

async function rawRequest(url: string, method: string, body: unknown, token: string): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), HOLOO_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
      cache: 'no-store',
    })
  } finally {
    clearTimeout(timer)
  }
}

/** Core Holoo request: base URL by useMock, cached Bearer token, auto re-Login once on 401, 15s timeout. */
export async function holooFetch<T = unknown>(cfg: HolooConfig, path: string, opts: HolooFetchOpts = {}): Promise<T> {
  const url = buildUrl(cfg, path, opts.query)
  const key = tokenKey(cfg)

  if (!opts.noAuth && !tokenCache.has(key)) {
    await holooLogin(cfg) // throws Persian HolooError on failure
  }
  const token = opts.noAuth ? '' : tokenCache.get(key)?.token ?? ''

  let res: Response
  try {
    res = await rawRequest(url, opts.method ?? 'GET', opts.body, token)
  } catch {
    throw connError(cfg)
  }

  // 401 → token expired: re-login once and retry
  if (res.status === 401 && !opts.noAuth) {
    tokenCache.delete(key)
    await holooLogin(cfg)
    const fresh = tokenCache.get(key)?.token ?? ''
    try {
      res = await rawRequest(url, opts.method ?? 'GET', opts.body, fresh)
    } catch {
      throw connError(cfg)
    }
    if (res.status === 401) {
      throw new HolooError('احراز هویت هلو ناموفق بود — توکن نامعتبر است', 2)
    }
  }

  const text = await res.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }
  const obj = (json ?? {}) as Record<string, unknown>

  if (!res.ok) {
    const code = typeof obj.ErrorCode === 'number' ? obj.ErrorCode : res.status
    const msg =
      (typeof obj.Error === 'string' && obj.Error) ||
      HOLOO_ERROR_FA[code] ||
      `خطای وب‌سرویس هلو (کد HTTP ${res.status})`
    throw new HolooError(msg, code)
  }
  // Holoo signals logical failures with HTTP 200 + {ErrorCode, Error}
  if (typeof obj.ErrorCode === 'number' && obj.ErrorCode !== 0) {
    throw new HolooError(HOLOO_ERROR_FA[obj.ErrorCode] || String(obj.Error || `خطای هلو (کد ${obj.ErrorCode})`), obj.ErrorCode)
  }
  return json as T
}

// ============ Login ============

export interface HolooLoginResponse {
  Login?: { State?: string; Token?: string; ErrorCode?: number; Error?: string }
}

/** POST /Login {userinfo:{username,userpass(base64),dbname}} → token (cached) */
export async function holooLogin(cfg: HolooConfig): Promise<string> {
  if (!isHolooConfigured(cfg)) {
    throw new HolooError('تنظیمات اتصال هلو کامل نیست — نام کاربری، رمز و نام بانک را از تنظیمات هلو وارد کنید')
  }
  let res: Response
  try {
    res = await rawRequest(
      buildUrl(cfg, '/Login'),
      'POST',
      { userinfo: { username: cfg.username, userpass: ensureBase64Pass(cfg.userpass), dbname: cfg.dbname } },
      ''
    )
  } catch {
    throw connError(cfg)
  }
  const text = await res.text()
  let json: HolooLoginResponse | null = null
  try {
    json = text ? (JSON.parse(text) as HolooLoginResponse) : null
  } catch {
    json = null
  }
  const login = json?.Login
  if (!res.ok && !login) throw connError(cfg)
  if (!login || login.State !== 'True') {
    const code = login?.ErrorCode ?? 1
    if (code === 1) throw new HolooError('نام کاربری یا رمز هلو اشتباه است', 1)
    throw new HolooError(HOLOO_ERROR_FA[code] || login?.Error || 'ورود به هلو ناموفق بود', code)
  }
  const token = (login.Token || '').trim()
  if (!token) throw new HolooError('توکن هلو دریافت نشد')
  tokenCache.set(tokenKey(cfg), { token, at: Date.now() })
  return token
}

/** drop cached token (e.g. after credentials change) */
export function holooLogout(cfg: HolooConfig): void {
  tokenCache.delete(tokenKey(cfg))
}

// ============ DTOs (exact shapes from the PDF) ============

export interface HolooCustomer {
  Code?: string
  Name?: string
  NationalId?: string
  EconomicId?: string
  BedSarfasl?: string
  BesSarfasl?: string
  IsPurchaser?: string | boolean
  IsSeller?: string | boolean
  IsBlackList?: string | boolean
  Mandeh?: string
  Credit?: string
  CustType?: string
  IsVaseteh?: string | boolean
  VasetehPorsant?: string
  Tel?: string
  Mobile?: string
  Fax?: string
  City?: string
  Ostan?: string
  Mantagheh?: string
  ZipCode?: string
  Address?: string
  Job?: string
  Email?: string
  ErpCode?: string
  Type?: string
}

export interface HolooProduct {
  Code?: string
  Name?: string
  Few?: string
  fewkarton?: string
  BuyPrice?: string
  SellPrice?: string
  LastBuyPrice?: string
  SellPrice2?: string
  SellPrice3?: string
  SellPrice4?: string
  SellPrice5?: string
  SellPrice6?: string
  SellPrice7?: string
  SellPrice8?: string
  SellPrice9?: string
  SellPrice10?: string
  selpricekarton?: string
  CountInKarton?: string
  CountInBasteh?: string
  MainGroupName?: string
  MainGroupErpCode?: string
  SideGroupName?: string
  SideGroupErpCode?: string
  ErpCode?: string
  image?: string
  serials?: string[]
}

export interface HolooGroup { Name?: string; ErpCode?: string }
export interface HolooSideGroup extends HolooGroup { MainGroupName?: string; MainErpCode?: string }
export interface HolooUnit { Name?: string; ErpCode?: string }

export interface HolooInvoiceRow {
  Code?: string
  Type?: string
  SanadCode?: string
  comment?: string
  CustomerName?: string
  CustomerErpCode?: string
  Date?: string
  Time?: string
  SumNaghd?: string
  SumNesiyeh?: string
  SumDiscount?: string
  SumCheck?: string
  SumLevy?: string
  SumScot?: string
  SumPrice?: string
  ErpCode?: string
}

export interface HolooWriteSuccess {
  Id?: string
  ErpCode?: string
  ReturnParam1?: string
  ReturnParam2?: string
  ReturnParam3?: string
}

export interface HolooWriteResult {
  Header?: string
  Success?: HolooWriteSuccess
  ErrorCode?: number
  Error?: string
}

/** throws a Persian HolooError when the write did not succeed */
export function assertHolooWrite(res: HolooWriteResult | null | undefined, what: string): HolooWriteSuccess {
  if (res && res.Success && res.Success.ErpCode) return res.Success
  const code = res?.ErrorCode ?? 0
  throw new HolooError(res?.Error || HOLOO_ERROR_FA[code] || `ثبت ${what} در هلو ناموفق بود`, code)
}

// ============ Value coercion helpers ============

export function holooBool(v: string | boolean | undefined | null): boolean {
  return v === true || v === 'true' || v === 'True' || v === '1'
}

export function holooNum(v: string | number | undefined | null, dflt = 0): number {
  if (v === undefined || v === null || v === '') return dflt
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : dflt
}

// ============ Jalali ⇄ Gregorian (Holoo uses Gregorian 'YYYY-MM-DD') ============

/** "1405-07-28" → "2026-10-20" */
export function jalaliDashToGregorian(jalali: string): string {
  const j = parseJalaliDash(jalali)
  const d = jalaliToDate(j.jy, j.jm, j.jd)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** "2026-10-20" (or "2026/10/20") → "1405-07-28" */
export function gregorianToJalaliDash(g: string): string {
  const m = String(g || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!m) return ''
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0)
  const j = dateToJalali(d)
  return `${j.jy}-${pad2(j.jm)}-${pad2(j.jd)}`
}

/** Date → Holoo date 'YYYY-MM-DD' (Gregorian) */
export function dateToGregorian(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Date → Holoo time 'HH:MM' */
export function dateToHm(d: Date = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// ============ Typed endpoint helpers ============

export interface HolooPage { page?: number; size?: number }

/** GET /Customer (+filters, pagination /Customer/{page}/{size}) */
export async function getCustomers(
  cfg: HolooConfig,
  q: { code?: string; from?: string; to?: string; purchaser?: boolean; seller?: boolean; vaseteh?: boolean; nationalid?: string } & HolooPage = {}
): Promise<{ customer: HolooCustomer[] }> {
  const path = q.page && q.size ? `/Customer/${q.page}/${q.size}` : '/Customer'
  return holooFetch<{ customer: HolooCustomer[] }>(cfg, path, {
    query: {
      code: q.code,
      'code.from': q.from,
      'code.to': q.to,
      purchaser: q.purchaser,
      seller: q.seller,
      vaseteh: q.vaseteh,
      nationalid: q.nationalid,
    },
  })
}

/** GET /Product (code / date-range / group filters, ?name= search rules, pagination) */
export async function getProducts(
  cfg: HolooConfig,
  q: { code?: string; name?: string; mainGroup?: string; sideGroup?: string; getImage?: boolean } & HolooPage = {}
): Promise<{ product: HolooProduct[] }> {
  const path = q.page && q.size ? `/Product/${q.page}/${q.size}` : '/Product'
  return holooFetch<{ product: HolooProduct[] }>(cfg, path, {
    query: {
      code: q.code,
      name: q.name,
      maingrouperpcode: q.mainGroup,
      sidegrouperpcode: q.sideGroup,
      getimage: q.getImage,
    },
  })
}

export async function getMainGroups(cfg: HolooConfig): Promise<{ mainGroup: HolooGroup[] }> {
  return holooFetch<{ mainGroup: HolooGroup[] }>(cfg, '/MainGroup')
}

export async function getSideGroups(cfg: HolooConfig): Promise<{ sideGroup: HolooSideGroup[] }> {
  return holooFetch<{ sideGroup: HolooSideGroup[] }>(cfg, '/SideGroup')
}

export async function getUnits(cfg: HolooConfig): Promise<{ unit: HolooUnit[] }> {
  return holooFetch<{ unit: HolooUnit[] }>(cfg, '/Unit')
}

export async function getInvoices(
  cfg: HolooConfig,
  q: { code?: string; from?: string; to?: string; type?: string; sanadcode?: string; customererpcode?: string } = {}
): Promise<{ invoice: HolooInvoiceRow[] }> {
  return holooFetch<{ invoice: HolooInvoiceRow[] }>(cfg, '/Invoice', {
    query: {
      Code: q.code,
      'code.from': q.from,
      'code.to': q.to,
      Type: q.type,
      Sanadcode: q.sanadcode,
      customererpcode: q.customererpcode,
    },
  })
}

export interface HolooSettingsResponse {
  CurrencyUnit?: { name?: string; string?: string }[]
}

export async function getHolooSettings(cfg: HolooConfig): Promise<HolooSettingsResponse> {
  return holooFetch<HolooSettingsResponse>(cfg, '/Settings')
}

// ---- writes ----

export interface HolooProductInput {
  id?: string
  sidegrouperpcode?: string
  code?: string
  name?: string
  few?: number | string
  buyprice?: number
  sellprice?: number
  sellprice2?: number
  sellprice3?: number
  sellprice4?: number
  sellprice5?: number
  sellprice6?: number
  sellprice7?: number
  sellprice8?: number
  sellprice9?: number
  sellprice10?: number
  countinkarton?: number | string
  countinbasteh?: number | string
  uniterpcode?: string
}

/** POST /api/Product — ثبت کالا */
export async function createProduct(cfg: HolooConfig, data: HolooProductInput): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/api/Product', { method: 'POST', body: { productinfo: [data] } })
}

/** PUT /api/Product — اصلاح کالا */
export async function updateProduct(cfg: HolooConfig, erpcode: string, data: HolooProductInput): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/api/Product', {
    method: 'PUT',
    body: { productinfo: [{ ...data, erpcode }] },
  })
}

export interface HolooCustomerInput {
  id?: string
  code?: string
  name?: string
  ispurchaser?: boolean
  isseller?: boolean
  isblacklist?: boolean
  isvaseteh?: boolean
  custtype?: number
  bedsarfasl?: string
  nationalid?: string
  economicid?: string
  Credit?: number | string
  tel?: string
  mobile?: string
  fax?: string
  city?: string
  ostan?: string
  mantagheh?: string
  email?: string
  zipcode?: string
  address?: string
  type?: number
}

/** POST /Customer — درج طرف حساب */
export async function createCustomer(cfg: HolooConfig, data: HolooCustomerInput): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/Customer', { method: 'POST', body: { custinfo: [data] } })
}

/** PUT /Customer — اصلاح طرف حساب */
export async function updateCustomer(cfg: HolooConfig, erpcode: string, data: HolooCustomerInput): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/Customer', { method: 'PUT', body: { custinfo: [{ ...data, erpcode }] } })
}

export interface HolooInvoiceDetail {
  id?: string
  ProductErpCode: string
  few: number
  karton?: number
  price: number
  discountprice?: number
  discountpercent?: number
  levy?: number
  scot?: number
  uniterpcode?: string
  comment?: string
  serials?: string[]
}

export interface HolooHazineRow {
  customererpcode: string
  hazinehsarfaslcode: string
  hazinehamount: number
}

export interface HolooIncomeRow {
  customererpcode: string
  sarfaslcode: string
  amount: number
}

/** POST /Invoice/PreInvoice — درج پیش‌فاکتور */
export async function createPreInvoice(
  cfg: HolooConfig,
  data: { customererpcode: string; date: string; time: string; discount?: number; details: HolooInvoiceDetail[] }
): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/Invoice/PreInvoice', {
    method: 'POST',
    body: { invoiceinfo: [{ customererpcode: data.customererpcode, date: data.date, time: data.time, discount: data.discount, detailinfo: data.details }] },
  })
}

/** POST /Invoice/Order — درج سفارش (type: 1=فروش، 3=خرید) */
export async function createOrder(
  cfg: HolooConfig,
  data: { type: number; customererpcode?: string; date?: string; time?: string; details: HolooInvoiceDetail[] }
): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/Invoice/Order', {
    method: 'POST',
    body: {
      invoiceinfo: [
        {
          type: data.type,
          ...(data.customererpcode ? { customererpcode: data.customererpcode } : {}),
          ...(data.date ? { date: data.date } : {}),
          ...(data.time ? { time: data.time } : {}),
          detailinfo: data.details,
        },
      ],
    },
  })
}

/** POST /Invoice/Invoice — درج فاکتور (type: 1=فروش، 2=برگشت از فروش، 3=خرید، 4=برگشت از خرید) */
export async function createInvoice(
  cfg: HolooConfig,
  data: {
    type: number
    customererpcode: string
    date: string
    time: string
    cash?: number
    bank?: number
    nesiyeh?: number
    discount?: number
    levy?: number
    scot?: number
    details: HolooInvoiceDetail[]
    hazineinfo?: HolooHazineRow[]
    incomeinfo?: HolooIncomeRow[]
  }
): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/Invoice/Invoice', {
    method: 'POST',
    body: {
      invoiceinfo: [
        {
          type: data.type,
          customererpcode: data.customererpcode,
          date: data.date,
          time: data.time,
          ...(data.cash !== undefined ? { Cash: data.cash } : {}),
          ...(data.bank !== undefined ? { Bank: data.bank } : {}),
          ...(data.nesiyeh !== undefined ? { Nesiyeh: data.nesiyeh } : {}),
          ...(data.discount !== undefined ? { Discount: data.discount } : {}),
          ...(data.levy !== undefined ? { Levy: data.levy } : {}),
          ...(data.scot !== undefined ? { Scot: data.scot } : {}),
          ...(data.hazineinfo?.length ? { hazineinfo: data.hazineinfo } : {}),
          ...(data.incomeinfo?.length ? { incomeinfo: data.incomeinfo } : {}),
          detailinfo: data.details,
        },
      ],
    },
  })
}

export interface HolooPaymentInput {
  id?: string
  date: string
  time: string
  customersarfasl: string
  banksarfasl: string
  bank: number
  cashsarfasl?: string
  cash?: number
  discount?: number
  comment?: string
}

/** POST /api/Payment/Havaleh — سند حواله طرف حساب */
export async function createPaymentHavaleh(cfg: HolooConfig, data: HolooPaymentInput): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/api/Payment/Havaleh', { method: 'POST', body: { payinfo: [data] } })
}

/** POST /api/Payment/ReciveFromCustomer — سند دریافت از طرف حساب */
export async function createPaymentReceive(cfg: HolooConfig, data: HolooPaymentInput): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/api/Payment/ReciveFromCustomer', { method: 'POST', body: { payinfo: [data] } })
}

// ---- reports ----

export interface HolooReportRow {
  Code?: string
  Name?: string
  Price?: string
  Few?: string
  Date?: string
  Bed?: string
  Bes?: string
  Comment?: string
  Mandeh?: string
}

export async function reportGetSarfasl(cfg: HolooConfig, q: { code?: string; from?: string; to?: string } = {}): Promise<{ report: HolooReportRow[] }> {
  return holooFetch<{ report: HolooReportRow[] }>(cfg, '/Report/GetSarfasl', { query: { code: q.code, 'date.from': q.from, 'date.to': q.to } })
}

export async function reportGetCash(cfg: HolooConfig, q: { from?: string; to?: string } = {}): Promise<{ report: HolooReportRow | HolooReportRow[] }> {
  return holooFetch<{ report: HolooReportRow | HolooReportRow[] }>(cfg, '/Report/GetCash', { query: { 'date.from': q.from, 'date.to': q.to } })
}

export async function reportGetAccound(cfg: HolooConfig, q: { from?: string; to?: string } = {}): Promise<{ report: HolooReportRow[] }> {
  return holooFetch<{ report: HolooReportRow[] }>(cfg, '/Report/GetAccound', { query: { 'date.from': q.from, 'date.to': q.to } })
}

export async function reportGetMaxFewProduct(cfg: HolooConfig, count = 10): Promise<{ report: HolooReportRow[] }> {
  return holooFetch<{ report: HolooReportRow[] }>(cfg, '/Report/GetMaxFewProduct', { query: { count } })
}

export async function reportGetMinFewProduct(cfg: HolooConfig, count = 10): Promise<{ report: HolooReportRow[] }> {
  return holooFetch<{ report: HolooReportRow[] }>(cfg, '/Report/GetMinFewProduct', { query: { count } })
}

export async function reportGetMaxBedCustomer(cfg: HolooConfig, count = 10): Promise<{ report: HolooReportRow[] }> {
  return holooFetch<{ report: HolooReportRow[] }>(cfg, '/Report/GetMaxBedCustomer', { query: { count } })
}

export async function reportGetMaxBesCustomer(cfg: HolooConfig, count = 10): Promise<{ report: HolooReportRow[] }> {
  return holooFetch<{ report: HolooReportRow[] }>(cfg, '/Report/GetMaxBesCustomer', { query: { count } })
}

// ---- webhook ----

export const HOLOO_WEBHOOK_TABLES = ['customer', 'product', 'mainGroup', 'sideGroup', 'resInvoice'] as const

/** POST /webhook/subscribe {subscriptions:[{url,tablename,apikey}]} */
export async function subscribeWebhook(cfg: HolooConfig, url: string, tablename: string, apikey?: string): Promise<HolooWriteResult> {
  return holooFetch<HolooWriteResult>(cfg, '/webhook/subscribe', {
    method: 'POST',
    body: { subscriptions: [{ url, tablename, apikey: apikey || '' }] },
  })
}
