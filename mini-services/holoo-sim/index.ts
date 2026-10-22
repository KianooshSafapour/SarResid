/**
 * Holoo Simulator — dummy Holoo web service (SarResid task B2).
 *
 * شبیه‌ساز وب‌سرویس هلو — سرویس مستقل Bun روی پورت ۳۰۴۰.
 * دقیقاً همان قراردادِ سند webserviceHelp.pdf را پیاده می‌کند
 * (پیشوند /TncHoloo/api) تا سوییچ به هلو واقعی فقط با تغییر
 * holoo:useMock=false و holoo:baseUrl در تنظیمات سررسید ممکن باشد.
 *
 * اجرا:  cd mini-services/holoo-sim && bun run dev
 * دیتا:  seed.json (تولیدشده با scripts/gen-holoo-seed.ts) → data.json (ماندگاری)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = 3040 // hardcoded
const API_PREFIX = '/TncHoloo/api'
const DATA_FILE = join(HERE, 'data.json')
const SEED_FILE = join(HERE, 'seed.json')

const DBNAME_DEFAULT = 'Holoo1'
const LOGIN_USER = 'admin'
const LOGIN_PASS = 'admin' // ارسالی باید Base64 باشد: YWRtaW4=
const TOKEN_TTL_MS = 60 * 60 * 1000 // ۶۰ دقیقه

// ============ types ============

interface SimProduct {
  Code: string
  Name: string
  Few: number
  BuyPrice: number
  SellPrice: number
  LastBuyPrice: number
  SellPrice2: number
  SellPrice3: number
  CountInKarton: number
  CountInBasteh: number
  MainGroupName: string
  MainGroupErpCode: string
  SideGroupName: string
  SideGroupErpCode: string
  ErpCode: string
}

interface SimCustomer {
  Code: string
  Name: string
  NationalId: string
  EconomicId: string
  BedSarfasl: string
  BesSarfasl: string
  IsPurchaser: boolean
  IsSeller: boolean
  IsBlackList: boolean
  Mandeh: number
  Credit: number
  CustType: number
  IsVaseteh: boolean
  VasetehPorsant: number
  Tel: string
  Mobile: string
  Fax: string
  City: string
  Ostan: string
  Mantagheh: string
  ZipCode: string
  Address: string
  Job: string
  Email: string
  ErpCode: string
}

interface SimInvoice {
  Code: string
  Type: number
  SanadCode: string
  comment: string
  CustomerName: string
  CustomerErpCode: string
  Date: string
  Time: string
  SumNaghd: number
  SumNesiyeh: number
  SumDiscount: number
  SumCheck: number
  SumLevy: number
  SumScot: number
  SumPrice: number
  ErpCode: string
  Kind: 'PRE' | 'ORDER' | 'INVOICE'
}

interface SimPayment {
  Id: string
  ErpCode: string
  SanadCode: string
  Kind: 'HAVALEH' | 'RECEIVE'
  Date: string
  Time: string
  CustomerSarfasl: string
  BankSarfasl: string
  Bank: number
  CashSarfasl: string
  Cash: number
  Discount: number
  Comment: string
}

interface SimGroup {
  Name: string
  ErpCode: string
  MainGroupName?: string
  MainErpCode?: string
}

interface WebhookSub {
  url: string
  tablename: string
  apikey: string
}

interface SimState {
  seq: { product: number; customer: number; sarfasl: number; invoice: number; order: number; pre: number; sanad: number; payment: number }
  products: SimProduct[]
  customers: SimCustomer[]
  invoices: SimInvoice[]
  payments: SimPayment[]
  mainGroups: SimGroup[]
  sideGroups: SimGroup[]
  units: SimGroup[]
  webhookSubs: WebhookSub[]
  webhookActive: boolean
}

// ============ state & persistence ============

function emptyState(): SimState {
  return {
    seq: { product: 1, customer: 1, sarfasl: 1030000, invoice: 1, order: 1, pre: 1, sanad: 100, payment: 1 },
    products: [],
    customers: [],
    invoices: [],
    payments: [],
    mainGroups: [{ Name: 'متفرقه', ErpCode: genErp('bBAH') }],
    sideGroups: [{ Name: 'عمومی', ErpCode: genErp('bBAH'), MainGroupName: 'متفرقه', MainErpCode: '' }],
    units: [{ Name: 'عدد', ErpCode: genErp('bAV') }],
    webhookSubs: [],
    webhookActive: true,
  }
}

function migrateSeed(raw: Record<string, unknown>): SimState {
  const st = emptyState()
  const products = Array.isArray(raw.products) ? (raw.products as Partial<SimProduct>[]) : []
  st.products = products.map((p, i) => ({
    Code: String(p.Code ?? `S${String(i + 1).padStart(8, '0')}`),
    Name: String(p.Name ?? `کالای ${i + 1}`),
    Few: Number(p.Few ?? 0),
    BuyPrice: Number(p.BuyPrice ?? 0),
    SellPrice: Number(p.SellPrice ?? 0),
    LastBuyPrice: Number(p.LastBuyPrice ?? 0),
    SellPrice2: Number(p.SellPrice2 ?? 0),
    SellPrice3: Number(p.SellPrice3 ?? 0),
    CountInKarton: Number(p.CountInKarton ?? 0),
    CountInBasteh: Number(p.CountInBasteh ?? 0),
    MainGroupName: String(p.MainGroupName ?? 'متفرقه'),
    MainGroupErpCode: String(p.MainGroupErpCode ?? ''),
    SideGroupName: String(p.SideGroupName ?? 'عمومی'),
    SideGroupErpCode: String(p.SideGroupErpCode ?? genErp('bBAH')),
    ErpCode: String(p.ErpCode ?? genErp('bBAL')),
  }))
  const customers = Array.isArray(raw.customers) ? (raw.customers as Partial<SimCustomer>[]) : []
  st.customers = customers.map((c, i) => {
    const sar = 1030000 + (i + 1) * 7
    return {
      Code: String(c.Code ?? `1${String(i + 1).padStart(4, '0')}`),
      Name: String(c.Name ?? `طرف حساب ${i + 1}`),
      NationalId: String(c.NationalId ?? ''),
      EconomicId: String(c.EconomicId ?? ''),
      BedSarfasl: String(c.BedSarfasl ?? sar),
      BesSarfasl: String(c.BesSarfasl ?? sar),
      IsPurchaser: c.IsPurchaser === true,
      IsSeller: c.IsSeller !== false,
      IsBlackList: c.IsBlackList === true,
      Mandeh: Number(c.Mandeh ?? (i * 137000) % 9000000),
      Credit: Number(c.Credit ?? 0),
      CustType: Number(c.CustType ?? 0),
      IsVaseteh: c.IsVaseteh === true,
      VasetehPorsant: Number(c.VasetehPorsant ?? 0),
      Tel: String(c.Tel ?? ''),
      Mobile: String(c.Mobile ?? ''),
      Fax: String(c.Fax ?? ''),
      City: String(c.City ?? 'تهران'),
      Ostan: String(c.Ostan ?? 'تهران'),
      Mantagheh: String(c.Mantagheh ?? '3'),
      ZipCode: String(c.ZipCode ?? ''),
      Address: String(c.Address ?? ''),
      Job: String(c.Job ?? 'تأمین‌کننده'),
      Email: String(c.Email ?? ''),
      ErpCode: String(c.ErpCode ?? genErp('bBAP')),
    }
  })
  if (Array.isArray(raw.mainGroups)) st.mainGroups = raw.mainGroups as SimGroup[]
  if (Array.isArray(raw.sideGroups)) st.sideGroups = raw.sideGroups as SimGroup[]
  if (Array.isArray(raw.units)) st.units = raw.units as SimGroup[]
  st.seq.customer = st.customers.length + 1
  st.seq.sarfasl = 1030000 + st.customers.length * 7 + 7
  return st
}

function loadState(): SimState {
  for (const file of [DATA_FILE, SEED_FILE]) {
    try {
      if (!existsSync(file)) continue
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      if (file === DATA_FILE) return raw as unknown as SimState
      const st = migrateSeed(raw)
      saveState(st)
      console.log(`[holoo-sim] seeded from ${file === SEED_FILE ? 'seed.json' : 'data.json'} — ${st.products.length} کالا، ${st.customers.length} طرف حساب`)
      return st
    } catch (e) {
      console.error(`[holoo-sim] خطا در خواندن ${file}:`, e instanceof Error ? e.message : e)
    }
  }
  console.log('[holoo-sim] هیچ seed/data یافت نشد — سرویس با حالت خالی بالا می‌آید')
  return emptyState()
}

function saveState(st: SimState): void {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(st), 'utf8')
  } catch (e) {
    console.error('[holoo-sim] خطا در ذخیره data.json:', e instanceof Error ? e.message : e)
  }
}

const state = loadState()

// ============ helpers ============

function genErp(prefix: string): string {
  return prefix + randomBytes(10).toString('base64')
}

/** عدد به شکل رشته اعشاری هلو ('50000.0') */
function dec(n: number | undefined): string {
  const v = Number(n ?? 0)
  return Number.isInteger(v) ? `${v}.0` : String(v)
}

function boolStr(v: boolean): string {
  return v ? 'true' : 'false'
}

interface HolooFailure {
  Header: string
  ErrorCode: number
  Error: string
}
const FA_ERRORS: Record<number, string> = {
  1: 'عدم برقراری ارتباط با بانک اطلاعاتی، ممکن است نام کاربری یا کلمه عبور نادرست باشد',
  7: 'نام طرف حساب خالی میباشد',
  8: 'نام طرف حساب تکراری میباشد',
  9: 'کد طرف حساب تکراری میباشد',
  10: 'شماره موبایل تکراری میباشد',
  11: 'پکیج ارسالی اشتباه میباشد',
  14: 'کد طرف حساب معتبر نمیباشد',
  15: 'کد کالا معتبر نمیباشد',
  17: 'تاریخ معتبر نمیباشد',
  18: 'ساعت معتبر نمیباشد',
  19: 'تعداد کالا معتبر نمیباشد',
  20: 'قیمت کالا معتبر نمیباشد',
  21: 'نوع (بدهکار / بستانکار) به درستی مشخص نشده است',
  26: 'مالیات وعوارض معتبر نمیباشد',
  29: 'سرفصل صندوق معتبر نمیباشد',
  30: 'مبلغ صندوق معتبر نمی باشد',
  31: 'نوع فاکتور معتبر نمی باشد',
  33: 'مبلغ کارتخوان معتبر نمیباشد',
  35: 'مبلغ تخفیف معتبر نمیباشد',
  36: 'مبلغ تسویه فاکتور با جمع فاکتور برابر نمیباشد',
  37: 'کد کالا تکراری میباشد',
  38: 'نام کالا تکراری میباشد',
  39: 'نام کالا خالی میباشد',
  40: 'شناسه ErpCode کالا معتبر نمیباشد',
  43: 'شناسه ErpCode گروه فرعی معتبر نمیباشد',
  44: 'شناسه معتبر نمیباشد',
  45: 'سرفصل طرف حساب معتبر نمیباشد',
  46: 'مبلغ مشخص نشده است',
}

class ApiError extends Error {
  code: number
  header: string
  constructor(header: string, code: number) {
    super(FA_ERRORS[code] || `خطای ${code}`)
    this.header = header
    this.code = code
  }
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function nowTime(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function validDate(v: unknown): boolean {
  const m = String(v ?? '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!m) return false
  const [, y, mo, d] = m
  return +y > 1900 && +mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31
}
function validTime(v: unknown): boolean {
  const m = String(v ?? '').match(/^(\d{1,2}):(\d{1,2})(:(\d{1,2}))?$/)
  if (!m) return false
  return +m[1] <= 23 && +m[2] <= 59
}

/** نرمال‌سازی سبک متن فارسی برای جستجو */
function normTxt(s: string): string {
  return s
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * جستجوی نام کالا مطابق سند هلو:
 *  - بدون گیومه، چند کلمه: نام باید شامل «تمام» کلمات باشد (چیپ مز → چیپس مزمز ساده)
 *  - "چیپس" با گیومه: فقط تطابق دقیق
 *  - "کالای1,کالای2": اولی دقیق + بقیه شامل (اجتماع)
 */
function matchName(name: string, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  const n = normTxt(name)
  if (q.length >= 2 && q.startsWith('"') && q.endsWith('"')) {
    const inner = q.slice(1, -1).trim()
    if (!inner) return true
    if (inner.includes(',') || inner.includes('،')) {
      const parts = inner.split(/[,،]/).map((s) => normTxt(s)).filter(Boolean)
      if (!parts.length) return true
      const [first, ...rest] = parts
      if (n === first) return true
      return rest.some((w) => n.includes(w))
    }
    return n === normTxt(inner)
  }
  if (q.includes(',') || q.includes('،')) {
    const parts = q.split(/[,،]/).map((s) => normTxt(s)).filter(Boolean)
    return parts.every((w) => n.includes(w))
  }
  const words = q.split(/\s+/).filter(Boolean).map(normTxt)
  return words.every((w) => n.includes(w))
}

// ============ auth ============

const tokens = new Map<string, number>() // token → issuedAt

function issueToken(): string {
  const token = `Bearer sim-token-${randomBytes(12).toString('hex')}`
  tokens.set(token, Date.now())
  return token
}

function checkAuth(req: IncomingMessage): boolean {
  const h = String(req.headers.authorization || '')
  if (!h) return false
  const token = h.startsWith('Bearer ') ? h : `Bearer ${h}`
  const at = tokens.get(token)
  if (!at) return false
  if (Date.now() - at > TOKEN_TTL_MS) {
    tokens.delete(token)
    return false
  }
  return true
}

/** رمز ارسالی ممکن است Base64 باشد (طبق سند) — هر دو حالت خام/کدشده پذیرفته می‌شود */
function decodePass(p: string): string {
  const t = (p || '').trim()
  try {
    const round = Buffer.from(Buffer.from(t, 'base64').toString('utf8'), 'utf8').toString('base64')
    if (round === t) return Buffer.from(t, 'base64').toString('utf8')
  } catch {
    // not base64
  }
  return t
}

// ============ webhook ============

const WEBHOOK_TABLES = ['customer', 'product', 'mainGroup', 'sideGroup', 'resInvoice']

function fireWebhook(table: string, operation: string, changedfields: string[]): void {
  if (!state.webhookActive) return
  for (const sub of state.webhookSubs.filter((s) => s.tablename === table)) {
    fetch(sub.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sub.apikey || '' },
      body: JSON.stringify({ Dbname: DBNAME_DEFAULT, Table: table, operation, changedfields }),
    })
      .then(() => console.log(`[webhook] ارسال شد → ${sub.url} (${table}/${operation})`))
      .catch((e) => console.log(`[webhook] خطا در ارسال به ${sub.url}: ${e instanceof Error ? e.message : e}`))
  }
}

// ============ serialization (exact PDF shapes) ============

function customerOut(c: SimCustomer): Record<string, string> {
  return {
    Code: c.Code,
    Name: c.Name,
    NationalId: c.NationalId,
    EconomicId: c.EconomicId,
    BedSarfasl: c.BedSarfasl,
    BesSarfasl: c.BesSarfasl,
    IsPurchaser: boolStr(c.IsPurchaser),
    IsSeller: boolStr(c.IsSeller),
    IsBlackList: boolStr(c.IsBlackList),
    Mandeh: dec(c.Mandeh),
    Credit: dec(c.Credit),
    CustType: String(c.CustType),
    IsVaseteh: boolStr(c.IsVaseteh),
    VasetehPorsant: dec(c.VasetehPorsant),
    Tel: c.Tel,
    Mobile: c.Mobile,
    Fax: c.Fax,
    City: c.City,
    Ostan: c.Ostan,
    Mantagheh: c.Mantagheh,
    ZipCode: c.ZipCode,
    Address: c.Address,
    Job: c.Job,
    Email: c.Email,
    ErpCode: c.ErpCode,
  }
}

function productOut(p: SimProduct, withImage = false): Record<string, unknown> {
  return {
    Code: p.Code,
    Name: p.Name,
    Few: dec(p.Few),
    fewkarton: String(p.CountInKarton > 0 ? Math.floor(p.Few / p.CountInKarton) : 0),
    BuyPrice: dec(p.BuyPrice),
    SellPrice: dec(p.SellPrice),
    LastBuyPrice: dec(p.LastBuyPrice),
    SellPrice2: dec(p.SellPrice2),
    SellPrice3: dec(p.SellPrice3),
    SellPrice4: dec(0),
    SellPrice5: dec(0),
    SellPrice6: dec(0),
    SellPrice7: dec(0),
    SellPrice8: dec(0),
    SellPrice9: dec(0),
    SellPrice10: dec(0),
    selpricekarton: String(p.CountInKarton > 0 ? Math.round(p.SellPrice * p.CountInKarton) : 0),
    CountInKarton: dec(p.CountInKarton),
    CountInBasteh: dec(p.CountInBasteh),
    MainGroupName: p.MainGroupName,
    MainGroupErpCode: p.MainGroupErpCode,
    SideGroupName: p.SideGroupName,
    SideGroupErpCode: p.SideGroupErpCode,
    ErpCode: p.ErpCode,
    image: withImage ? 'iVBORw0KGgoAAAANSUhEUg==sim' : '',
    serials: [] as string[],
  }
}

function invoiceOut(v: SimInvoice): Record<string, string> {
  return {
    Code: v.Code,
    Type: String(v.Type),
    SanadCode: v.SanadCode,
    comment: v.comment,
    CustomerName: v.CustomerName,
    CustomerErpCode: v.CustomerErpCode,
    Date: v.Date.replace(/-/g, '/'),
    Time: v.Time,
    SumNaghd: dec(v.SumNaghd),
    SumNesiyeh: dec(v.SumNesiyeh),
    SumDiscount: dec(v.SumDiscount),
    SumCheck: dec(v.SumCheck),
    SumLevy: dec(v.SumLevy),
    SumScot: dec(v.SumScot),
    SumPrice: dec(v.SumPrice),
    ErpCode: v.ErpCode,
  }
}

// ============ request plumbing ============

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(json)
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new ApiError('Request', 11)
  }
}

/** اولین عنصر xxxinfo (آرایه یا شیء) */
function infoOf<T extends Record<string, unknown>>(body: Record<string, unknown>, key: string): T {
  const v = body[key]
  if (Array.isArray(v)) {
    if (!v.length) throw new ApiError('Request', 11)
    return v[0] as T
  }
  if (v && typeof v === 'object') return v as T
  throw new ApiError('Request', 11)
}

function detailsOf(h: Record<string, unknown>): Record<string, unknown>[] {
  const d = h.detailinfo
  if (Array.isArray(d)) return d as Record<string, unknown>[]
  if (d && typeof d === 'object') return [d as Record<string, unknown>]
  throw new ApiError('Invoice', 11)
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : NaN
}
function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim()
}

// ============ endpoint handlers ============

function handleLogin(body: Record<string, unknown>): Record<string, unknown> {
  const ui = (body.userinfo && typeof body.userinfo === 'object' ? body.userinfo : {}) as Record<string, unknown>
  const username = str(ui.username).toLowerCase()
  const userpass = decodePass(str(ui.userpass))
  const dbname = str(ui.dbname)
  if (username === LOGIN_USER && userpass === LOGIN_PASS && dbname === DBNAME_DEFAULT) {
    return { Login: { State: 'True', Token: issueToken(), ErrorCode: 0, Error: '' } }
  }
  return { Login: { State: 'False', Token: '', ErrorCode: 1, Error: FA_ERRORS[1] } }
}

function listCustomers(q: URLSearchParams): Record<string, unknown> {
  const code = str(q.get('code'))
  const from = str(q.get('code.from'))
  const to = str(q.get('code.to'))
  const purchaser = q.get('purchaser')
  const seller = q.get('seller')
  const vaseteh = q.get('vaseteh')
  const nationalid = str(q.get('nationalid'))
  let rows = state.customers
  if (code) rows = rows.filter((c) => c.Code === code)
  if (from) rows = rows.filter((c) => c.Code >= from)
  if (to) rows = rows.filter((c) => c.Code <= to)
  if (purchaser !== null && purchaser !== '') rows = rows.filter((c) => c.IsPurchaser === (purchaser === 'true' || purchaser === '1'))
  if (seller !== null && seller !== '') rows = rows.filter((c) => c.IsSeller === (seller === 'true' || seller === '1'))
  if (vaseteh !== null && vaseteh !== '') rows = rows.filter((c) => c.IsVaseteh === (vaseteh === 'true' || vaseteh === '1'))
  if (nationalid) rows = rows.filter((c) => c.NationalId === nationalid)
  return { customer: rows.map(customerOut) }
}

function createCustomerHandler(body: Record<string, unknown>): Record<string, unknown> {
  const c = infoOf<Record<string, unknown>>(body, 'custinfo')
  const name = str(c.name)
  if (!name) throw new ApiError('Customer', 7)
  if (state.customers.some((x) => normTxt(x.Name) === normTxt(name))) throw new ApiError('Customer', 8)
  const code = str(c.code)
  if (code && state.customers.some((x) => x.Code === code)) throw new ApiError('Customer', 9)
  const mobile = str(c.mobile)
  if (mobile && state.customers.some((x) => x.Mobile === mobile)) throw new ApiError('Customer', 10)
  const ispurchaser = c.ispurchaser
  const isseller = c.isseller
  if (ispurchaser === undefined && isseller === undefined) throw new ApiError('Customer', 21)
  if (c.custtype === undefined || c.custtype === null || str(c.custtype) === '') throw new ApiError('Customer', 21)

  const newCode = code || `1${String(state.seq.customer).padStart(4, '0')}`
  const bed = String(state.seq.sarfasl++)
  const bes = String(state.seq.sarfasl++)
  const cust: SimCustomer = {
    Code: newCode,
    Name: name,
    NationalId: str(c.nationalid),
    EconomicId: str(c.economicid),
    BedSarfasl: bed,
    BesSarfasl: bes,
    IsPurchaser: ispurchaser === true || ispurchaser === 'true',
    IsSeller: isseller === true || isseller === 'true',
    IsBlackList: c.isblacklist === true || c.isblacklist === 'true',
    Mandeh: 0,
    Credit: num(c.Credit) || 0,
    CustType: Math.trunc(num(c.custtype)) || 0,
    IsVaseteh: c.isvaseteh === true || c.isvaseteh === 'true',
    VasetehPorsant: 0,
    Tel: str(c.tel),
    Mobile: mobile,
    Fax: str(c.fax),
    City: str(c.city) || 'تهران',
    Ostan: str(c.ostan) || 'تهران',
    Mantagheh: str(c.mantagheh) || '3',
    ZipCode: str(c.zipcode),
    Address: str(c.address),
    Job: str(c.job) || 'تأمین‌کننده',
    Email: str(c.email),
    ErpCode: genErp('bBAP'),
  }
  state.customers.push(cust)
  state.seq.customer++
  saveState(state)
  fireWebhook('customer', 'CREATE', [cust.Code, cust.Name])
  return {
    Header: 'Customer',
    Success: { Id: str(c.id) || '0', ErpCode: cust.ErpCode, ReturnParam1: cust.Code, ReturnParam2: bed, ReturnParam3: bes },
  }
}

function updateCustomerHandler(body: Record<string, unknown>): Record<string, unknown> {
  const c = infoOf<Record<string, unknown>>(body, 'custinfo')
  const erp = str(c.erpcode)
  const byCode = str(c.code)
  const cust = state.customers.find((x) => (erp && x.ErpCode === erp) || (!erp && byCode && x.Code === byCode))
  if (!cust) throw new ApiError('Customer', 14)
  if (c.name !== undefined && str(c.name)) {
    const n = str(c.name)
    if (state.customers.some((x) => x !== cust && normTxt(x.Name) === normTxt(n))) throw new ApiError('Customer', 8)
    cust.Name = n
  }
  if (c.isblacklist !== undefined) cust.IsBlackList = c.isblacklist === true || c.isblacklist === 'true'
  if (c.ispurchaser !== undefined) cust.IsPurchaser = c.ispurchaser === true || c.ispurchaser === 'true'
  if (c.isseller !== undefined) cust.IsSeller = c.isseller === true || c.isseller === 'true'
  if (c.nationalid !== undefined) cust.NationalId = str(c.nationalid)
  if (c.economicid !== undefined) cust.EconomicId = str(c.economicid)
  if (c.Credit !== undefined) cust.Credit = num(c.Credit) || 0
  if (c.tel !== undefined) cust.Tel = str(c.tel)
  if (c.mobile !== undefined) cust.Mobile = str(c.mobile)
  if (c.fax !== undefined) cust.Fax = str(c.fax)
  if (c.city !== undefined) cust.City = str(c.city)
  if (c.ostan !== undefined) cust.Ostan = str(c.ostan)
  if (c.mantagheh !== undefined) cust.Mantagheh = str(c.mantagheh)
  if (c.email !== undefined) cust.Email = str(c.email)
  if (c.zipcode !== undefined) cust.ZipCode = str(c.zipcode)
  if (c.address !== undefined) cust.Address = str(c.address)
  saveState(state)
  fireWebhook('customer', 'UPDATE', [cust.Code, cust.Name])
  return { Header: 'Customer', Success: { ErpCode: cust.ErpCode } }
}

function listProducts(q: URLSearchParams): Record<string, unknown> {
  const code = str(q.get('code'))
  const main = str(q.get('maingrouperpcode'))
  const side = str(q.get('sidegrouperpcode'))
  const name = str(q.get('name'))
  const getimage = q.get('getimage') === 'true' || q.get('getimage') === '1'
  let rows = state.products
  if (code) rows = rows.filter((p) => p.Code === code)
  if (main) rows = rows.filter((p) => p.MainGroupErpCode === main)
  if (side) rows = rows.filter((p) => p.SideGroupErpCode === side)
  if (name) rows = rows.filter((p) => matchName(p.Name, name))
  return { product: rows.map((p) => productOut(p, getimage)) }
}

function createProductHandler(body: Record<string, unknown>): Record<string, unknown> {
  const p = infoOf<Record<string, unknown>>(body, 'productinfo')
  const name = str(p.name)
  if (!name) throw new ApiError('Product', 39)
  if (state.products.some((x) => normTxt(x.Name) === normTxt(name))) throw new ApiError('Product', 38)
  const sideErp = str(p.sidegrouperpcode)
  const side = state.sideGroups.find((g) => g.ErpCode === sideErp)
  if (!side) throw new ApiError('Product', 43)
  const main = state.mainGroups.find((g) => g.Name === side.MainGroupName)
  const code = str(p.code)
  if (code && state.products.some((x) => x.Code === code)) throw new ApiError('Product', 37)

  const prod: SimProduct = {
    Code: code || `S${String(state.seq.product++).padStart(8, '0')}`,
    Name: name,
    Few: num(p.few) || 0,
    BuyPrice: num(p.buyprice) || 0,
    SellPrice: num(p.sellprice) || 0,
    LastBuyPrice: num(p.buyprice) || 0,
    SellPrice2: num(p.sellprice2) || 0,
    SellPrice3: num(p.sellprice3) || 0,
    CountInKarton: num(p.countinkarton) || 0,
    CountInBasteh: num(p.countinbasteh) || 0,
    MainGroupName: side.MainGroupName || main?.Name || 'متفرقه',
    MainGroupErpCode: side.MainErpCode || main?.ErpCode || '',
    SideGroupName: side.Name,
    SideGroupErpCode: side.ErpCode,
    ErpCode: genErp('bBAL'),
  }
  state.products.push(prod)
  saveState(state)
  fireWebhook('product', 'CREATE', [prod.Code, prod.Name])
  return { Header: 'Product', Success: { Id: str(p.id) || '0', ErpCode: prod.ErpCode } }
}

function updateProductHandler(body: Record<string, unknown>): Record<string, unknown> {
  const p = infoOf<Record<string, unknown>>(body, 'productinfo')
  const erp = str(p.erpcode)
  const prod = state.products.find((x) => x.ErpCode === erp)
  if (!prod) throw new ApiError('Product', 40)
  if (p.name !== undefined && str(p.name)) {
    const n = str(p.name)
    if (state.products.some((x) => x !== prod && normTxt(x.Name) === normTxt(n))) throw new ApiError('Product', 38)
    prod.Name = n
  }
  if (p.sellprice !== undefined) prod.SellPrice = num(p.sellprice) || 0
  if (p.sellprice2 !== undefined) prod.SellPrice2 = num(p.sellprice2) || 0
  if (p.sellprice3 !== undefined) prod.SellPrice3 = num(p.sellprice3) || 0
  if (p.buyprice !== undefined) prod.BuyPrice = num(p.buyprice) || 0
  if (p.countinkarton !== undefined) prod.CountInKarton = num(p.countinkarton) || 0
  if (p.countinbasteh !== undefined) prod.CountInBasteh = num(p.countinbasteh) || 0
  saveState(state)
  fireWebhook('product', 'UPDATE', [prod.Code, prod.Name])
  return { Header: 'Product', Success: { Id: str(p.id) || '0', ErpCode: prod.ErpCode } }
}

function validateDetails(rows: Record<string, unknown>[]): { erp: string; few: number; price: number; karton: number; levy: number; scot: number }[] {
  if (!rows.length) throw new ApiError('Invoice', 11)
  return rows.map((d) => {
    const prod = state.products.find((x) => x.ErpCode === str(d.ProductErpCode))
    if (!prod) throw new ApiError('Invoice', 15)
    const few = num(d.few ?? d.Few)
    if (!Number.isFinite(few) || few <= 0) throw new ApiError('Invoice', 19)
    const price = num(d.price ?? d.Price)
    if (!Number.isFinite(price) || price < 0) throw new ApiError('Invoice', 20)
    const karton = num(d.karton) || 0
    const levy = num(d.levy)
    const scot = num(d.scot)
    if ((d.levy !== undefined && !Number.isFinite(levy)) || (d.scot !== undefined && !Number.isFinite(scot))) throw new ApiError('Invoice', 26)
    return { erp: prod.ErpCode, few, price, karton, levy: levy || 0, scot: scot || 0 }
  })
}

function nextSeq(kind: 'invoice' | 'order' | 'pre'): string {
  const n = state.seq[kind]++
  return String(n)
}
function nextSanad(): string {
  return String(state.seq.sanad++)
}

function makeInvoice(
  body: Record<string, unknown>,
  kind: 'PRE' | 'ORDER' | 'INVOICE',
  type: number
): Record<string, unknown> {
  const h = infoOf<Record<string, unknown>>(body, 'invoiceinfo')
  const custErp = str(h.customererpcode)
  let cust: SimCustomer | undefined
  if (custErp) {
    cust = state.customers.find((x) => x.ErpCode === custErp)
    if (!cust) throw new ApiError('Invoice', 14)
  } else if (kind === 'INVOICE' || kind === 'PRE') {
    throw new ApiError('Invoice', 14)
  }
  const date = str(h.date) || todayStr()
  if (!validDate(date)) throw new ApiError('Invoice', 17)
  const time = str(h.time) || nowTime().slice(0, 5)
  if (!validTime(time)) throw new ApiError('Invoice', 18)

  const details = validateDetails(detailsOf(h))
  const itemsTotal = details.reduce((s, d) => s + d.few * d.price, 0)
  const levyPct = num(h.Levy ?? h.levy) || 0
  const scotPct = num(h.Scot ?? h.scot) || 0
  if ((h.Levy !== undefined || h.levy !== undefined) && !Number.isFinite(levyPct)) throw new ApiError('Invoice', 26)
  const levyAmt = Math.round((itemsTotal * levyPct) / 100)
  const scotAmt = Math.round((itemsTotal * scotPct) / 100)
  const total = itemsTotal + levyAmt + scotAmt

  const cash = h.Cash !== undefined ? num(h.Cash) : NaN
  const bank = h.Bank !== undefined ? num(h.Bank) : NaN
  const nesiyeh = h.Nesiyeh !== undefined ? num(h.Nesiyeh) : NaN
  const discount = h.Discount !== undefined ? num(h.Discount) : NaN
  if (kind === 'INVOICE') {
    const provided = [cash, bank, nesiyeh, discount].filter((v) => Number.isFinite(v))
    if (provided.length) {
      const settled = provided.reduce((s, v) => s + (v > 0 ? v : 0), 0) - (Number.isFinite(discount) && discount > 0 ? discount : 0)
      if (Math.abs(settled - total) > 1) throw new ApiError('Invoice', 36)
    }
  }

  const code = nextSeq(kind === 'INVOICE' ? 'invoice' : kind === 'ORDER' ? 'order' : 'pre')
  const sanad = kind === 'INVOICE' ? nextSanad() : '0'
  const inv: SimInvoice = {
    Code: code,
    Type: type,
    SanadCode: sanad,
    comment: str(h.comment),
    CustomerName: cust?.Name || '',
    CustomerErpCode: custErp,
    Date: date,
    Time: time.includes(':') && time.split(':').length === 2 ? `${time}:00` : time,
    SumNaghd: Number.isFinite(cash) ? cash : 0,
    SumNesiyeh: Number.isFinite(nesiyeh) ? nesiyeh : total,
    SumDiscount: Number.isFinite(discount) ? discount : 0,
    SumCheck: 0,
    SumLevy: levyAmt,
    SumScot: scotAmt,
    SumPrice: total,
    ErpCode: genErp('bDN'),
    Kind: kind,
  }
  state.invoices.push(inv)
  // اثر انبار/مالی: کاهش/افزایش موجودی + مانده طرف حساب
  for (const d of details) {
    const prod = state.products.find((x) => x.ErpCode === d.erp)
    if (prod) {
      const qty = d.few + d.karton * (prod.CountInKarton || 0)
      if (type === 1) prod.Few = Math.max(0, prod.Few - qty) // فروش
      else if (type === 3) prod.Few += qty // خرید
      // برگشت‌ها موجودی را برمی‌گردانند فقط برای فاکتور واقعی
      else if (type === 2 && kind === 'INVOICE') prod.Few += qty
      else if (type === 4 && kind === 'INVOICE') prod.Few = Math.max(0, prod.Few - qty)
    }
  }
  if (cust && kind === 'INVOICE') {
    if (type === 1) cust.Mandeh += total // فروش نسیه به مشتری
    else if (type === 3) cust.Mandeh += total // بدهی ما به تأمین‌کننده
    else if (type === 2) cust.Mandeh -= total
    else if (type === 4) cust.Mandeh -= total
    if (Number.isFinite(cash) && cash > 0) cust.Mandeh -= cash
  }
  saveState(state)
  return {
    Header: 'Invoice',
    Success: {
      Id: str(h.id) || '0',
      ErpCode: inv.ErpCode,
      ReturnParam1: code,
      ...(kind === 'INVOICE' ? { ReturnParam2: sanad } : {}),
    },
  }
}

function paymentHandler(body: Record<string, unknown>, kind: 'HAVALEH' | 'RECEIVE'): Record<string, unknown> {
  const p = infoOf<Record<string, unknown>>(body, 'payinfo')
  const date = str(p.date)
  if (!validDate(date)) throw new ApiError('Payment', 17)
  const time = str(p.time)
  if (!validTime(time)) throw new ApiError('Payment', 18)
  const customersarfasl = str(p.customersarfasl)
  if (!customersarfasl) throw new ApiError('Payment', 45)
  const banksarfasl = str(p.banksarfasl)
  if (!banksarfasl) throw new ApiError('Payment', 29)
  const bank = num(p.bank)
  if (!Number.isFinite(bank) || bank <= 0) throw new ApiError('Payment', 33)
  let cash = 0
  if (kind === 'RECEIVE') {
    const cashsarfasl = str(p.cashsarfasl)
    if (!cashsarfasl) throw new ApiError('Payment', 29)
    cash = num(p.cash)
    if (!Number.isFinite(cash) || cash < 0) throw new ApiError('Payment', 30)
    if (cash === 0 && bank === 0) throw new ApiError('Payment', 46)
  }
  const cust = state.customers.find((x) => x.BedSarfasl === customersarfasl || x.BesSarfasl === customersarfasl)
  if (cust) {
    // حواله = پرداخت ما به طرف حساب (بستانکار می‌شود) · دریافت = بدهکار می‌شود
    cust.Mandeh -= bank + cash
  }
  const sanad = nextSanad()
  const pay: SimPayment = {
    Id: str(p.id) || '0',
    ErpCode: genErp('b'),
    SanadCode: sanad,
    Kind: kind,
    Date: date,
    Time: time,
    CustomerSarfasl: customersarfasl,
    BankSarfasl: banksarfasl,
    Bank: bank,
    CashSarfasl: str(p.cashsarfasl),
    Cash: cash,
    Discount: num(p.discount) || 0,
    Comment: str(p.comment),
  }
  state.payments.push(pay)
  state.seq.payment++
  saveState(state)
  return { Header: 'Payment', Success: { Id: pay.Id, ErpCode: pay.ErpCode, ReturnParam1: sanad, ReturnParam2: sanad } }
}

function listInvoices(q: URLSearchParams): Record<string, unknown> {
  const code = str(q.get('Code') || q.get('code'))
  const from = str(q.get('code.from'))
  const to = str(q.get('code.to'))
  const type = str(q.get('Type') || q.get('type'))
  const sanad = str(q.get('Sanadcode') || q.get('sanadcode'))
  const custErp = str(q.get('customererpcode'))
  let rows = state.invoices
  if (code) rows = rows.filter((v) => v.Code === code)
  if (from) rows = rows.filter((v) => v.Code >= from)
  if (to) rows = rows.filter((v) => v.Code <= to)
  if (type) rows = rows.filter((v) => String(v.Type) === type)
  if (sanad) rows = rows.filter((v) => v.SanadCode === sanad)
  if (custErp) rows = rows.filter((v) => v.CustomerErpCode === custErp)
  return { invoice: rows.map(invoiceOut) }
}

// ---- reports ----

function reportSarfasl(q: URLSearchParams): Record<string, unknown> {
  const code = str(q.get('code'))
  let rows = state.customers.map((c) => ({ Code: c.BedSarfasl, Name: c.Name, Price: dec(c.Mandeh) }))
  rows.push({ Code: '10100010001', Name: 'صندوق فروشگاه', Price: dec(cashBalance()) })
  rows.push({ Code: '10200010001', Name: 'بانک ملت (کارتخوان)', Price: dec(bankBalance()) })
  if (code) rows = rows.filter((r) => r.Code.startsWith(code))
  return { report: rows }
}

function cashBalance(): number {
  const inv = state.invoices.reduce((s, v) => s + (v.Kind === 'INVOICE' ? v.SumNaghd * (v.Type === 3 ? -1 : 1) : 0), 0)
  const pay = state.payments.reduce((s, p) => s + p.Cash, 0)
  return 50_000_000 + inv + pay
}
function bankBalance(): number {
  const inv = state.invoices.reduce((s, v) => s + (v.Kind === 'INVOICE' ? (v.SumPrice - v.SumNaghd - v.SumDiscount) * (v.Type === 3 ? -1 : 1) : 0), 0)
  const pay = state.payments.reduce((s, p) => s + p.Bank, 0)
  return 120_000_000 + inv + pay
}

function fewProductReport(desc: boolean, q: URLSearchParams): Record<string, unknown> {
  const count = Math.max(1, Math.min(100, num(q.get('count')) || 10))
  const rows = [...state.products].sort((a, b) => (desc ? b.Few - a.Few : a.Few - b.Few)).slice(0, count)
  return { report: rows.map((p) => ({ Code: p.Code, Name: p.Name, Few: dec(p.Few), Price: dec(p.SellPrice) })) }
}

function mandehCustomerReport(desc: boolean, q: URLSearchParams): Record<string, unknown> {
  const count = Math.max(1, Math.min(100, num(q.get('count')) || 10))
  const rows = [...state.customers]
    .filter((c) => (desc ? c.Mandeh > 0 : c.Mandeh < 0))
    .sort((a, b) => (desc ? b.Mandeh - a.Mandeh : a.Mandeh - b.Mandeh))
    .slice(0, count)
  return { report: rows.map((c) => ({ Code: c.BedSarfasl, Name: c.Name, Price: dec(Math.abs(c.Mandeh)) })) }
}

// ---- webhook endpoints ----

function webhookSubscribe(body: Record<string, unknown>): Record<string, unknown> {
  const subs = body.subscriptions
  if (!Array.isArray(subs) || !subs.length) throw new ApiError('Webhook', 11)
  for (const s of subs as Record<string, unknown>[]) {
    const url = str(s.url)
    const tablename = str(s.tablename)
    if (!url) throw new ApiError('Webhook', 11)
    if (!WEBHOOK_TABLES.includes(tablename)) throw new ApiError('Webhook', 11)
    if (!state.webhookSubs.some((x) => x.url === url && x.tablename === tablename)) {
      state.webhookSubs.push({ url, tablename, apikey: str(s.apikey) })
    }
  }
  saveState(state)
  return { Header: 'Webhook', Success: { Id: '1', ErpCode: 'bWVzfg==' } }
}

// ============ HTTP server ============

const server = createServer((req, res) => {
  void handle(req, res).catch((e) => {
    if (e instanceof ApiError) {
      send(res, 200, { Header: e.header, ErrorCode: e.code, Error: e.message })
      return
    }
    console.error('[holoo-sim] خطای غیرمنتظره:', e)
    send(res, 500, { Error: 'خطای داخلی شبیه‌ساز هلو' })
  })
})

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = (req.method || 'GET').toUpperCase()
  const u = new URL(req.url || '/', 'http://127.0.0.1')
  const path = u.pathname.replace(/\/+$/, '') || '/'

  // سلامت سرویس
  if (path === '/' || path === '/health' || path === API_PREFIX || path === `${API_PREFIX}/`) {
    send(res, 200, {
      service: 'Holoo Simulator',
      status: 'ok',
      port: PORT,
      prefix: API_PREFIX,
      defaults: { username: LOGIN_USER, userpass: Buffer.from(LOGIN_PASS).toString('base64'), dbname: DBNAME_DEFAULT },
      counts: { products: state.products.length, customers: state.customers.length, invoices: state.invoices.length },
      endpoints: [
        'POST /TncHoloo/api/Login',
        'GET  /TncHoloo/api/Customer[/{page}/{size}]',
        'POST|PUT /TncHoloo/api/Customer',
        'GET  /TncHoloo/api/Product[/{page}/{size}] (query: name, code, maingrouperpcode, sidegrouperpcode, getimage)',
        'POST|PUT /TncHoloo/api/api/Product',
        'GET  /TncHoloo/api/MainGroup · /SideGroup · /Unit',
        'GET  /TncHoloo/api/Invoice',
        'POST /TncHoloo/api/Invoice/PreInvoice · /Invoice/Order · /Invoice/Invoice',
        'POST /TncHoloo/api/api/Payment/Havaleh · /api/Payment/ReciveFromCustomer',
        'GET  /TncHoloo/api/Settings',
        'GET  /TncHoloo/api/Report/GetSarfasl · GetCash · GetAccound · GetMaxFewProduct · GetMinFewProduct · GetMaxBedCustomer · GetMaxBesCustomer',
        'POST /TncHoloo/api/webhook/subscribe · GET /webhook/subscriptions · GET /webhook/stop · /webhook/start · DELETE /webhook/subscribe?table=',
      ],
    })
    return
  }

  if (!path.startsWith(API_PREFIX + '/')) {
    send(res, 404, { Error: 'مسیر یافت نشد — پیشوند صحیح: /TncHoloo/api' })
    return
  }

  const sub = path.slice(API_PREFIX.length) // مثل '/Login' یا '/Customer/2/10'

  try {
    // ---- Login (بدون توکن) ----
    if (sub === '/Login' && method === 'POST') {
      const body = await readBody(req)
      send(res, 200, handleLogin(body))
      return
    }

    // ---- بقیه مسیرها نیاز به توکن دارند ----
    if (!checkAuth(req)) {
      send(res, 401, { Login: { State: 'False', ErrorCode: 2, Error: 'توکن نامعتبر' } })
      return
    }

    // /Customer/{page}/{size}
    const pageMatch = sub.match(/^\/(Customer|Product)\/(\d+)\/(\d+)$/)
    if (pageMatch && method === 'GET') {
      const page = Math.max(1, parseInt(pageMatch[2], 10))
      const size = Math.max(1, Math.min(500, parseInt(pageMatch[3], 10)))
      const all =
        pageMatch[1] === 'Customer'
          ? listCustomers(u.searchParams)
          : listProducts(u.searchParams)
      const key = pageMatch[1] === 'Customer' ? 'customer' : 'product'
      const rows = (all[key] as unknown[]) || []
      const slice = rows.slice((page - 1) * size, page * size)
      send(res, 200, { [key]: slice })
      return
    }

    switch (`${method} ${sub}`) {
      // ---- Customer ----
      case 'GET /Customer':
        send(res, 200, listCustomers(u.searchParams))
        return
      case 'POST /Customer':
        send(res, 200, createCustomerHandler(await readBody(req)))
        return
      case 'PUT /Customer':
        send(res, 200, updateCustomerHandler(await readBody(req)))
        return
      // ---- Product ----
      case 'GET /Product':
        send(res, 200, listProducts(u.searchParams))
        return
      case 'POST /api/Product':
        send(res, 200, createProductHandler(await readBody(req)))
        return
      case 'PUT /api/Product':
        send(res, 200, updateProductHandler(await readBody(req)))
        return
      // ---- Groups / Units ----
      case 'GET /MainGroup':
        send(res, 200, { mainGroup: state.mainGroups.map((g) => ({ Name: g.Name, ErpCode: g.ErpCode })) })
        return
      case 'GET /SideGroup':
        send(res, 200, {
          sideGroup: state.sideGroups.map((g) => ({ Name: g.Name, ErpCode: g.ErpCode, MainGroupName: g.MainGroupName || '', MainErpCode: g.MainErpCode || '' })),
        })
        return
      case 'GET /Unit':
        send(res, 200, { unit: state.units.map((g) => ({ Name: g.Name, ErpCode: g.ErpCode })) })
        return
      // ---- Invoices ----
      case 'GET /Invoice':
        send(res, 200, listInvoices(u.searchParams))
        return
      case 'POST /Invoice/PreInvoice': {
        send(res, 200, makeInvoice(await readBody(req), 'PRE', 1))
        return
      }
      case 'POST /Invoice/Order': {
        const body = await readBody(req)
        send(res, 200, makeInvoice(body, 'ORDER', orderTypeOf(body)))
        return
      }
      case 'POST /Invoice/Invoice': {
        const body = await readBody(req)
        send(res, 200, makeInvoice(body, 'INVOICE', invoiceTypeOf(body)))
        return
      }
      // ---- Payments ----
      case 'POST /api/Payment/Havaleh':
        send(res, 200, paymentHandler(await readBody(req), 'HAVALEH'))
        return
      case 'POST /api/Payment/ReciveFromCustomer':
        send(res, 200, paymentHandler(await readBody(req), 'RECEIVE'))
        return
      // ---- Settings ----
      case 'GET /Settings':
        send(res, 200, { CurrencyUnit: [{ name: 'RepVahedPooli', string: 'ریال' }] })
        return
      // ---- Reports ----
      case 'GET /Report/GetSarfasl':
        send(res, 200, reportSarfasl(u.searchParams))
        return
      case 'GET /Report/GetCash':
        send(res, 200, { report: { Code: '10100010001', Name: 'صندوق فروشگاه', Price: dec(cashBalance()) } })
        return
      case 'GET /Report/GetAccound':
        send(res, 200, { report: [{ Code: '10200010001', Name: 'بانک ملت (کارتخوان)', Price: dec(bankBalance()) }] })
        return
      case 'GET /Report/GetMaxFewProduct':
        send(res, 200, fewProductReport(true, u.searchParams))
        return
      case 'GET /Report/GetMinFewProduct':
        send(res, 200, fewProductReport(false, u.searchParams))
        return
      case 'GET /Report/GetMaxBedCustomer':
        send(res, 200, mandehCustomerReport(true, u.searchParams))
        return
      case 'GET /Report/GetMaxBesCustomer':
        send(res, 200, mandehCustomerReport(false, u.searchParams))
        return
      // ---- Webhook ----
      case 'POST /webhook/subscribe':
        send(res, 200, webhookSubscribe(await readBody(req)))
        return
      case 'GET /webhook/subscribe':
      case 'GET /webhook/subscriptions':
        send(res, 200, { subscriptions: state.webhookSubs, active: state.webhookActive })
        return
      case 'DELETE /webhook/subscribe': {
        const table = str(u.searchParams.get('table'))
        if (table) state.webhookSubs = state.webhookSubs.filter((s) => s.tablename !== table)
        else state.webhookSubs = []
        saveState(state)
        send(res, 200, { Header: 'Webhook', Success: { ErpCode: 'bWVzfg==' } })
        return
      }
      case 'GET /webhook/stop':
        state.webhookActive = false
        saveState(state)
        send(res, 200, { webhook: 'stopped' })
        return
      case 'GET /webhook/start':
        state.webhookActive = true
        saveState(state)
        send(res, 200, { webhook: 'started' })
        return
      default:
        break
    }

    // سایر گزارش‌های سند — داده خالی قابل‌قبول
    if (method === 'GET' && /^\/Report\/Get[A-Za-z]+$/.test(sub)) {
      send(res, 200, { report: [] })
      return
    }

    send(res, 404, { Error: `مسیر ${method} ${sub} در شبیه‌ساز هلو پیاده‌سازی نشده است` })
  } catch (e) {
    if (e instanceof ApiError) {
      send(res, 200, { Header: e.header, ErrorCode: e.code, Error: e.message })
      return
    }
    throw e
  }
}

/** نوع سفارش باید ۱ (فروش) یا ۳ (خرید) باشد */
function orderTypeOf(body: Record<string, unknown>): number {
  const h = infoOf<Record<string, unknown>>(body, 'invoiceinfo')
  const t = Math.trunc(num(h.type))
  if (t !== 1 && t !== 3) throw new ApiError('Invoice', 31)
  return t
}

/** نوع فاکتور: ۱=فروش ۲=برگشت از فروش ۳=خرید ۴=برگشت از خرید */
function invoiceTypeOf(body: Record<string, unknown>): number {
  const h = infoOf<Record<string, unknown>>(body, 'invoiceinfo')
  const t = Math.trunc(num(h.type))
  if (t < 1 || t > 4) throw new ApiError('Invoice', 31)
  return t
}

// ============ boot ============

server.listen(PORT, () => {
  console.log(`[holoo-sim] شبیه‌ساز هلو روی پورت ${PORT} بالا آمد → http://127.0.0.1:${PORT}${API_PREFIX}`)
  console.log(`[holoo-sim] ورود پیش‌فرض: admin / ${Buffer.from(LOGIN_PASS).toString('base64')} (admin) / ${DBNAME_DEFAULT}`)
  console.log(`[holoo-sim] دیتا: ${DATA_FILE} (بازتولید: bun run scripts/gen-holoo-seed.ts از ریشه پروژه و حذف data.json)`)
})

process.on('SIGINT', () => {
  console.log('\n[holoo-sim] خاموش شدن…')
  server.close(() => process.exit(0))
})
