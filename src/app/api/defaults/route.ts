import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { parseSetting, maskKey } from '@/lib/sms'

export const dynamic = 'force-dynamic'

/** Whitelisted key prefixes manageable through this route */
const ALLOWED_PREFIXES = ['defaults:', 'sms:']

/** Persian labels for the known keys (drives the settings UI) */
const KEY_LABELS: Record<string, string> = {
  'defaults:order.qty': 'تعداد پیش‌فرض سفارش (عدد)',
  'defaults:order.carton': 'تعداد پیش‌فرض سفارش (کارتن)',
  'defaults:cheque.periodDays': 'دوره پیش‌فرض چک (روز)',
  'defaults:lowstock.leadBuffer': 'حاشیه ایمنی زمان تأمین (روز)',
  'defaults:lowstock.minMonthlySold': 'حداقل فروش ماهانه برای تحلیل موجودی',
  'sms:enabled': 'فعال‌سازی پنل پیامک',
  'sms:provider': 'سرویس‌دهنده پیامک',
  'sms:apiKey': 'کلید API پنل پیامک',
  'sms:sender': 'شماره ارسال‌کننده',
  'sms:recipients': 'شماره‌های گیرنده هشدارها',
  'sms:lowstockTemplate': 'قالب پیامک اتمام موجودی',
}

const PER_PRODUCT_NOTE =
  'پیش‌فرض‌های اختصاصی هر کالا (تعداد سفارش، کارتن، حد سفارش مجدد، هشدار پیامکی و زمان تأمین) از طریق صفحه کالاها و بخش تحلیل موجودی ویرایش می‌شود.'

function isAllowedKey(key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p))
}

/** GET /api/defaults → {defaults, raw, labels, perProductNote} */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const rows = await db.setting.findMany({ where: { OR: [{ key: { startsWith: 'defaults:' } }, { key: { startsWith: 'sms:' } }] }, orderBy: { key: 'asc' } })

  const defaults: Record<string, unknown> = {}
  const raw: Array<{ key: string; value: unknown }> = []
  for (const row of rows) {
    let parsed: unknown = parseSetting(row.value, '')
    if (row.key === 'sms:enabled') parsed = parsed === 'true' || parsed === '1'
    else if (row.key.startsWith('defaults:') && parsed !== '' && Number.isFinite(Number(parsed))) parsed = Number(parsed)
    // never leak the raw API key — masked like the sms route
    if (row.key === 'sms:apiKey') parsed = maskKey(String(parsed))
    defaults[row.key] = parsed
    raw.push({ key: row.key, value: parsed })
  }

  return ok({ defaults, raw, labels: KEY_LABELS, perProductNote: PER_PRODUCT_NOTE })
}

/** POST /api/defaults {key, value} → upsert a defaults:/sms: setting (managers only) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند پیش‌فرض‌های سامانه را تغییر دهند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const key = String((body as Record<string, unknown>).key ?? '').trim()
  if (!key) return fail('کلید تنظیم را وارد کنید')
  if (!isAllowedKey(key)) return fail('فقط کلیدهای با پیشوند defaults: یا sms: قابل مدیریت هستند')

  const rawValue = (body as Record<string, unknown>).value
  let stored: string
  if (typeof rawValue === 'boolean') stored = rawValue ? 'true' : 'false'
  else if (rawValue === null || rawValue === undefined) stored = ''
  else stored = String(rawValue).trim()
  if (key === 'sms:enabled') stored = stored === 'true' || stored === '1' ? 'true' : 'false'
  if (key.startsWith('defaults:') && stored !== '' && !Number.isFinite(Number(stored))) {
    return fail('مقدار این کلید باید عددی باشد')
  }

  await db.setting.upsert({ where: { key }, create: { key, value: stored }, update: { value: stored } })

  const label = KEY_LABELS[key] ?? key
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'defaults.update',
    actionLabel: 'پیش‌فرض‌های سامانه',
    category: 'settings',
    detail: `${label} ← «${key === 'sms:apiKey' ? '••••••' : stored}»`,
    entityId: key,
  })

  let parsed: unknown = parseSetting(stored, '')
  if (key === 'sms:enabled') parsed = stored === 'true'
  else if (key.startsWith('defaults:') && stored !== '') parsed = Number(stored)
  if (key === 'sms:apiKey') parsed = maskKey(stored)
  return ok({ key, value: parsed, perProductNote: PER_PRODUCT_NOTE })
}
