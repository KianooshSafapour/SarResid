import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { guardCap } from '@/lib/rbac'
import { emitNotif } from '@/lib/notif-engine'

/* ═══════════════════════════════════════════════════════════════════════════
 * /api/import — ورود همگانی داده از اکسل/CSV با تطبیق ستون‌ها
 * قرارداد: کلاینت فایل را با SheetJS می‌خواند، ستون‌ها را به «فیلدهای پلتفرم»
 * تطبیق می‌دهد و آبجکت‌های تختِ {فیلد: مقدار} می‌فرستد؛ سرور اعتبارسنجی و ورود.
 *   GET  ?kind=products → {mappingHint:[{key,label,required}]}
 *   POST {kind, rows, mode:'dry-run'|'apply', strategy:'skip'|'merge'}
 * ═══════════════════════════════════════════════════════════════════════════ */

type FieldDef = { key: string; label: string; required: boolean }

const FIELDS: Record<string, FieldDef[]> = {
  products: [
    { key: 'name', label: 'نام کالا', required: true },
    { key: 'barcodes', label: 'بارکد', required: false },
    { key: 'holooCode', label: 'کد هلو', required: false },
    { key: 'unit', label: 'واحد', required: false },
    { key: 'brand', label: 'برند', required: false },
    { key: 'category', label: 'دسته', required: false },
    { key: 'buyPrice', label: 'قیمت خرید', required: false },
    { key: 'sellPrice', label: 'قیمت فروش', required: false },
    { key: 'sellPrice2', label: 'قیمت فروش ۲ (ویژه)', required: false },
    { key: 'stock', label: 'موجودی', required: false },
    { key: 'reorderLevel', label: 'نقطهٔ سفارش', required: false },
    { key: 'providerName', label: 'تأمین‌کننده (تطبیق یا ساخت)', required: false },
  ],
  providers: [
    { key: 'name', label: 'نام تأمین‌کننده', required: true },
    { key: 'personName', label: 'نام رابط', required: false },
    { key: 'phone', label: 'تلفن', required: false },
    { key: 'type', label: 'نوع (VISITOR | DISTRIBUTOR | DIRECT)', required: false },
    { key: 'companyNames', label: 'شرکت‌ها (جدا با ؛)', required: false },
  ],
  customers: [
    { key: 'name', label: 'نام مشتری', required: true },
    { key: 'phone', label: 'تلفن', required: false },
    { key: 'birthday', label: 'تاریخ تولد (شمسی، عیناً نگه داشته می‌شود)', required: false },
    { key: 'tier', label: 'تیئر (VIP | LOYAL | REGULAR | NEW | AT_RISK | DORMANT)', required: false },
    { key: 'tags', label: 'برچسب‌ها (جدا با ؛)', required: false },
  ],
}

const TIERS = ['VIP', 'LOYAL', 'REGULAR', 'NEW', 'AT_RISK', 'DORMANT']
const PROVIDER_TYPES = ['VISITOR', 'DISTRIBUTOR', 'DIRECT']
const APPLY_CAP = 5000   // سقف اجرای واقعی ورود
const HARD_CAP = 50_000  // سقف امنیت سرور برای هر درخواست

const KIND_LABELS: Record<string, string> = { products: 'کالاها', providers: 'تأمین‌کنندگان', customers: 'مشتریان' }

/** ارقام فارسی برای پیام‌ها */
const fa = (n: number | string): string => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

/** نرمال‌سازی ارقام فارسی/عربی → لاتین (دفاعی سمت سرور) */
function enDigits(s: string): string {
  return String(s)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

/** هر رشتهٔ قیمتی ('۱۲٬۵۰۰'، '12,500'، ' ۱۲۵۰۰ ') → عدد؛ نامعتبر = ۰ */
function toNum(v: unknown): number {
  const cleaned = enDigits(String(v ?? '')).replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

/** 'الف؛ب ؛ ج' → ['الف','ب','ج'] */
function splitList(v: unknown): string[] {
  return str(v)
    .split(/[؛;]| ,|،/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/* ───────────────────────────── GET — راهنمای تطبیق ستون‌ها ───────────────────────────── */

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind') || 'products'
  if (!FIELDS[kind]) return fail('نوع داده نامعتبر است — products | providers | customers')
  return json({ kind, mappingHint: FIELDS[kind] })
}

/* ───────────────────────────── POST — dry-run / apply ───────────────────────────── */

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const guard = await guardCap(me, 'db.import')
  if (guard) return fail(guard, 403)

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const kind = String(body.kind || '')
  if (!FIELDS[kind]) return fail('نوع داده نامعتبر است — products | providers | customers')
  const rows = body.rows
  if (!Array.isArray(rows) || rows.length === 0) return fail('ردیفی برای پردازش نیست')
  if (rows.length > HARD_CAP) return fail(`سقف هر درخواست ${fa(HARD_CAP)} ردیف است — فایل را بخش‌بخش وارد کنید`, 413)
  const mode = body.mode === 'apply' ? 'apply' : 'dry-run'
  if (mode === 'apply' && rows.length > APPLY_CAP) {
    return fail(`سقف اجرای ورود ${fa(APPLY_CAP)} ردیف است — فایل را بخش‌بخش وارد کنید`, 413)
  }
  const strategy = body.strategy === 'skip' ? 'skip' : 'merge'

  const invalid: { row: number; error: string }[] = []
  const sample: Record<string, unknown>[] = []
  let valid = 0
  let willCreate = 0
  let willUpdate = 0
  let created = 0
  let updated = 0
  let skipped = 0

  if (kind === 'products') {
    const existing = await db.product.findMany({ select: { id: true, name: true, barcodes: true, holooCode: true, stock: true } })
    const byHoloo = new Map<string, (typeof existing)[number]>()
    const byBarcode = new Map<string, (typeof existing)[number]>()
    const byName = new Map<string, (typeof existing)[number]>()
    for (const p of existing) {
      if (p.holooCode) byHoloo.set(p.holooCode.trim(), p)
      for (const b of safeArr(p.barcodes)) if (b) byBarcode.set(String(b).trim(), p)
      byName.set(p.name.trim().toLowerCase(), p)
    }
    const providers = await db.provider.findMany({ select: { id: true, name: true } })
    const providerByName = new Map<string, string>()
    for (const pv of providers) providerByName.set(pv.name.trim(), pv.id)

    /** تطبیق یا ساخت تأمین‌کننده بر اساس نام */
    const resolveProvider = async (name: string): Promise<string | null> => {
      const key = name.trim()
      if (!key) return null
      const hit = providerByName.get(key)
      if (hit) return hit
      const pv = await db.provider.create({ data: { name: key } })
      providerByName.set(key, pv.id)
      return pv.id
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>
      const name = str(row.name)
      if (!name) {
        invalid.push({ row: i + 1, error: 'نام کالا خالی است' })
        continue
      }
      const barcode = Array.isArray(row.barcodes) ? str(row.barcodes[0]) : str(row.barcodes)
      const holoo = str(row.holooCode)
      const match = (holoo && byHoloo.get(holoo)) || (barcode && byBarcode.get(barcode)) || byName.get(name.toLowerCase())
      valid++
      if (sample.length < 10) {
        sample.push({
          name,
          barcode: barcode || '—',
          holooCode: holoo || '—',
          buyPrice: row.buyPrice !== undefined ? toNum(row.buyPrice) : null,
          sellPrice: row.sellPrice !== undefined ? toNum(row.sellPrice) : null,
          stock: row.stock !== undefined ? toNum(row.stock) : null,
          category: str(row.category) || 'عمومی',
          providerName: str(row.providerName) || '—',
          result: match ? (strategy === 'merge' ? 'بروزرسانی' : 'ردشدن (موجود)') : 'ایجاد',
        })
      }

      if (mode === 'dry-run') {
        if (!match) willCreate++
        else if (strategy === 'merge') willUpdate++
        continue
      }

      if (match) {
        if (strategy === 'skip') { skipped++; continue }
        const data: Record<string, unknown> = {}
        if (holoo && holoo !== match.holooCode) data.holooCode = holoo
        if (barcode) {
          const list = safeArr(match.barcodes)
          if (!list.includes(barcode)) data.barcodes = JSON.stringify([...list, barcode])
        }
        if (str(row.unit)) data.unit = str(row.unit)
        if (str(row.brand)) data.brand = str(row.brand)
        if (str(row.category)) data.category = str(row.category)
        if (row.buyPrice !== undefined && toNum(row.buyPrice) > 0) data.buyPrice = toNum(row.buyPrice)
        if (row.sellPrice !== undefined && toNum(row.sellPrice) > 0) data.sellPrice = toNum(row.sellPrice)
        if (row.sellPrice2 !== undefined && toNum(row.sellPrice2) > 0) data.sellPrice2 = toNum(row.sellPrice2)
        if (row.stock !== undefined) data.stock = Math.round(toNum(row.stock)) // موجودی فقط وقتی ستون ارائه شده
        if (row.reorderLevel !== undefined && toNum(row.reorderLevel) > 0) data.reorderLevel = Math.round(toNum(row.reorderLevel))
        if (str(row.providerName)) data.providerId = await resolveProvider(str(row.providerName))
        if (Object.keys(data).length) {
          await db.product.update({ where: { id: match.id }, data })
          updated++
        } else skipped++
      } else {
        const providerId = str(row.providerName) ? await resolveProvider(str(row.providerName)) : null
        const p = await db.product.create({
          data: {
            name,
            barcodes: JSON.stringify(barcode ? [barcode] : []),
            holooCode: holoo,
            unit: str(row.unit) || 'عدد',
            brand: str(row.brand),
            category: str(row.category) || 'عمومی',
            providerId,
            buyPrice: toNum(row.buyPrice),
            sellPrice: toNum(row.sellPrice),
            sellPrice2: toNum(row.sellPrice2),
            stock: Math.round(toNum(row.stock)),
            reorderLevel: Math.round(toNum(row.reorderLevel)) || 12,
          },
        })
        const rec = { id: p.id, name: p.name, barcodes: p.barcodes, holooCode: p.holooCode, stock: p.stock }
        byName.set(p.name.trim().toLowerCase(), rec)
        if (holoo) byHoloo.set(holoo, rec)
        if (barcode) byBarcode.set(barcode, rec)
        created++
      }
    }
  } else if (kind === 'providers') {
    const existing = await db.provider.findMany()
    const byName = new Map<string, (typeof existing)[number]>()
    for (const p of existing) byName.set(p.name.trim().toLowerCase(), p)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>
      const name = str(row.name)
      if (!name) {
        invalid.push({ row: i + 1, error: 'نام تأمین‌کننده خالی است' })
        continue
      }
      const match = byName.get(name.toLowerCase())
      valid++
      if (sample.length < 10) {
        sample.push({
          name,
          personName: str(row.personName) || '—',
          phone: str(row.phone) || '—',
          type: str(row.type) || 'DISTRIBUTOR',
          companyNames: splitList(row.companyNames).join('، ') || '—',
          result: match ? (strategy === 'merge' ? 'بروزرسانی' : 'ردشدن (موجود)') : 'ایجاد',
        })
      }

      if (mode === 'dry-run') {
        if (!match) willCreate++
        else if (strategy === 'merge') willUpdate++
        continue
      }

      if (match) {
        if (strategy === 'skip') { skipped++; continue }
        const data: Record<string, unknown> = {}
        if (str(row.personName)) data.personName = str(row.personName)
        if (str(row.phone)) data.phone = enDigits(str(row.phone))
        const t = str(row.type).toUpperCase()
        if (PROVIDER_TYPES.includes(t)) data.type = t
        const companies = splitList(row.companyNames)
        if (companies.length) {
          const prev = safeArr(match.companyNames)
          data.companyNames = JSON.stringify(Array.from(new Set([...prev, ...companies])))
        }
        if (Object.keys(data).length) {
          await db.provider.update({ where: { id: match.id }, data })
          updated++
        } else skipped++
      } else {
        const t = str(row.type).toUpperCase()
        const p = await db.provider.create({
          data: {
            name,
            personName: str(row.personName),
            phone: enDigits(str(row.phone)),
            type: PROVIDER_TYPES.includes(t) ? t : 'DISTRIBUTOR',
            companyNames: JSON.stringify(splitList(row.companyNames)),
          },
        })
        byName.set(p.name.trim().toLowerCase(), p)
        created++
      }
    }
  } else {
    // customers — تطبیق با تلفن، وگرنه با نام
    const existing = await db.customer.findMany()
    const byPhone = new Map<string, (typeof existing)[number]>()
    const byName = new Map<string, (typeof existing)[number]>()
    for (const c of existing) {
      if (c.phone) byPhone.set(enDigits(c.phone).trim(), c)
      byName.set(c.name.trim().toLowerCase(), c)
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>
      const name = str(row.name)
      const phone = enDigits(str(row.phone))
      if (!name) {
        invalid.push({ row: i + 1, error: 'نام مشتری خالی است' })
        continue
      }
      const match = (phone && byPhone.get(phone)) || byName.get(name.toLowerCase())
      valid++
      if (sample.length < 10) {
        sample.push({
          name,
          phone: phone || '—',
          birthday: str(row.birthday) || '—',
          tier: str(row.tier) || 'REGULAR',
          tags: splitList(row.tags).join('، ') || '—',
          result: match ? (strategy === 'merge' ? 'بروزرسانی' : 'ردشدن (موجود)') : 'ایجاد',
        })
      }

      if (mode === 'dry-run') {
        if (!match) willCreate++
        else if (strategy === 'merge') willUpdate++
        continue
      }

      if (match) {
        if (strategy === 'skip') { skipped++; continue }
        const data: Record<string, unknown> = {}
        if (phone && phone !== enDigits(match.phone).trim()) data.phone = phone
        if (str(row.birthday)) data.birthday = str(row.birthday) // شمسی — عیناً نگه داشته می‌شود
        const tier = str(row.tier).toUpperCase().replace(/\s+/g, '_')
        if (TIERS.includes(tier)) data.tier = tier
        const tags = splitList(row.tags)
        if (tags.length) data.tags = JSON.stringify(tags)
        if (Object.keys(data).length) {
          await db.customer.update({ where: { id: match.id }, data })
          updated++
        } else skipped++
      } else {
        const tier = str(row.tier).toUpperCase().replace(/\s+/g, '_')
        const c = await db.customer.create({
          data: {
            name,
            phone,
            birthday: str(row.birthday),
            tier: TIERS.includes(tier) ? tier : 'REGULAR',
            tags: JSON.stringify(splitList(row.tags)),
            joinedAt: new Date().toISOString().slice(0, 10),
          },
        })
        if (phone) byPhone.set(phone, c)
        byName.set(c.name.trim().toLowerCase(), c)
        created++
      }
    }
  }

  if (mode === 'dry-run') {
    return json({ valid, invalid, willCreate, willUpdate, willSkip: valid - willCreate - willUpdate, sample })
  }

  await logActivity(
    me, 'ورود داده از فایل', kind,
    '',
    `ورود داده از فایل — ${fa(rows.length)} ردیف، ${fa(created)} جدید، ${fa(updated)} بروزرسانی، ${fa(skipped)} ردشدن، ${fa(invalid.length)} خطا (${KIND_LABELS[kind]})`
  )
  await emitNotif({
    event: 'db.reset',
    title: 'ورود داده از فایل اکسل انجام شد',
    detail: `${me.name} — ${KIND_LABELS[kind]}: ${fa(created)} جدید، ${fa(updated)} بروزرسانی، ${fa(skipped)} ردشدن`,
    go: '#/data',
    severity: 'info',
    icon: '📥',
    actor: me,
  })

  return json({
    ok: true,
    created,
    updated,
    skipped,
    errors: invalid.slice(0, 20),
    totalInvalid: invalid.length,
  })
}

/** JSON-array field reader — defensive */
function safeArr(json: string): string[] {
  try {
    const v = JSON.parse(json || '[]')
    return Array.isArray(v) ? v.map((x) => String(x)) : []
  } catch {
    return []
  }
}
