import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'

/* ═══════════════════════════════════════════════════════════════════════════
 * /api/admin/holoo — پل هلو آپکس: تنظیمات، اجرای همگام‌سازی، دفتر زمانی (SyncLedger)
 * با اسنپ‌شات پیش از همگام‌سازی (git-like timeline) و بازگردانی.
 * ═══════════════════════════════════════════════════════════════════════ */

const BRIDGE_DEFAULT = 'http://127.0.0.1:3020'
const SNAP_CAP = 2000 // سقف اسنپ‌شات (محافظت از حافظه)
const PAGE_CAP = 100  // حداکثر صفحه در هر اجرا (۱۰۰ × ۱۰۰ = ۱۰٬۰۰۰ کالا)

type Stats = { created: number; updated: number; skipped: number; errors: number }
type LogLine = { at: string; line: string }
type SnapshotRow = { productId: string; holooCode: string; stock: number; buyPrice: number; sellPrice: number }

const emptyStats = (): Stats => ({ created: 0, updated: 0, skipped: 0, errors: 0 })

function canManage(user: { role: string; secondaryRoles: string[] }): boolean {
  return ['GM', 'OM', 'OWNER'].includes(user.role) || user.secondaryRoles.includes('IT')
}

async function getSetting(key: string, dflt = ''): Promise<string> {
  try {
    const row = await db.setting.findUnique({ where: { key } })
    return row?.value ?? dflt
  } catch {
    return dflt
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

/* ───────────────────────── GET — config + ledger (آخرین ۳۰ ردیف) ───────────────────────── */

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!canManage(me)) return fail('دسترسی محدود', 403)

  const [url, tokenSet, bridgeUrlRaw] = await Promise.all([
    getSetting('holoo_apex_url'),
    getSetting('holoo_apex_token'),
    getSetting('holoo_bridge_url', BRIDGE_DEFAULT),
  ])
  const bridgeUrl = (bridgeUrlRaw || BRIDGE_DEFAULT).replace(/\/+$/, '')

  // سلامت پل — از سمت سرور با timeout ۳ ثانیه؛ خطا = null (هرگز throw نمی‌کند)
  let bridgeHealth: Record<string, unknown> | null = null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    const r = await fetch(`${bridgeUrl}/health`, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(timer)
    if (r.ok) bridgeHealth = (await r.json()) as Record<string, unknown>
  } catch {
    bridgeHealth = null
  }

  const rows = await db.syncLedger.findMany({ orderBy: { startedAt: 'desc' }, take: 30 })
  const ledger = rows.map((r) => {
    const snap = safeParse<SnapshotRow[]>(r.snapshot, [])
    return {
      id: r.id,
      kind: r.kind,
      source: r.source,
      status: r.status,
      stats: safeParse<Stats>(r.stats, emptyStats()),
      log: safeParse<LogLine[]>(r.log, []).slice(-12), // محتوا فقط در جزئیات — snapshot هرگز در لیست نمی‌آید
      snapshotCount: snap.length,
      startedById: r.startedById,
      startedByName: r.startedByName,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    }
  })

  return json({
    config: {
      url,
      tokenSet: Boolean(tokenSet),
      bridgeUrl: bridgeUrlRaw || BRIDGE_DEFAULT,
      bridgeHealth,
    },
    ledger,
  })
}

/* ───────────────────────── POST — actions ───────────────────────── */

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!canManage(me)) return fail('دسترسی محدود — فقط مدیران یا نقش فرعی IT', 403)

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail('بدنه درخواست نامعتبر است')
  }
  const action = String(body.action || '')

  /* ذخیره تنظیمات اتصال */
  if (action === 'config') {
    try {
      if (typeof body.url === 'string' && body.url.trim()) await setSetting('holoo_apex_url', body.url.trim())
      if (typeof body.bridgeUrl === 'string' && body.bridgeUrl.trim()) await setSetting('holoo_bridge_url', body.bridgeUrl.trim())
      if (typeof body.token === 'string' && body.token.trim()) await setSetting('holoo_apex_token', body.token.trim())
      await logActivity(me, 'holoo.config', 'setting', 'holoo_apex', 'تنظیمات اتصال هلو آپکس ذخیره شد')
      return json({ ok: true })
    } catch (e: any) {
      return fail(`ذخیره تنظیمات ناموفق بود: ${e?.message || e}`, 500)
    }
  }

  /* اجرای همگام‌سازی — PRODUCTS | SUPPLIERS | FULL */
  if (action === 'run') {
    const kind = ['PRODUCTS', 'SUPPLIERS', 'FULL'].includes(String(body.kind)) ? String(body.kind) : null
    if (!kind) return fail('نوع همگام‌سازی نامعتبر است (PRODUCTS | SUPPLIERS | FULL)')

    const running = await db.syncLedger.findFirst({ where: { status: 'RUNNING' } })
    if (running) return fail('یک همگام‌سازی دیگر در حال اجراست؛ تا پایان آن صبر کنید یا ردیف آن را بررسی کنید', 409)

    const kindLabel = kind === 'FULL' ? 'کامل (کالا + تأمین‌کننده)' : kind === 'PRODUCTS' ? 'کالاها' : 'تأمین‌کنندگان'
    const ledger = await db.syncLedger.create({
      data: {
        kind,
        status: 'RUNNING',
        startedById: me.id,
        startedByName: me.name,
        stats: JSON.stringify(emptyStats()),
        log: JSON.stringify([{ at: new Date().toISOString(), line: `شروع همگام‌سازی ${kindLabel} توسط ${me.name}` }]),
        snapshot: '[]',
      },
    })

    const stats = emptyStats()
    let logs: LogLine[] = []
    let snapshot: SnapshotRow[] = []
    let status: 'SUCCESS' | 'FAILED' = 'SUCCESS'
    let errMsg = ''

    const appendLog = (line: string) => {
      logs.push({ at: new Date().toISOString(), line })
      if (logs.length > 500) logs = logs.slice(-500) // دفتر تراکمی — خطاها حفظ، حجم کنترل شود
    }
    const persist = () =>
      db.syncLedger.update({
        where: { id: ledger.id },
        data: { stats: JSON.stringify(stats), log: JSON.stringify(logs), snapshot: JSON.stringify(snapshot) },
      })

    try {
      const bridgeUrl = ((await getSetting('holoo_bridge_url', BRIDGE_DEFAULT)) || BRIDGE_DEFAULT).replace(/\/+$/, '')

      /* اسنپ‌شات پیش از همگام‌سازی — نقطهٔ بازیابی (فقط کالا) */
      if (kind === 'PRODUCTS' || kind === 'FULL') {
        const prods = await db.product.findMany({
          select: { id: true, holooCode: true, stock: true, buyPrice: true, sellPrice: true },
          take: SNAP_CAP,
        })
        snapshot = prods.map((p) => ({ productId: p.id, holooCode: p.holooCode, stock: p.stock, buyPrice: p.buyPrice, sellPrice: p.sellPrice }))
        appendLog(`نقطهٔ بازیابی ثبت شد: ${snapshot.length} کالا (موجودی/قیمت‌های پیش از همگام‌سازی)`)
      }

      /* همگام‌سازی کالاها — صفحه‌به‌صفحه از پل */
      if (kind === 'PRODUCTS' || kind === 'FULL') {
        // نقشهٔ تأمین‌کنندگان موجود برای اتصال کالای جدید به پارتنر
        const providers = await db.provider.findMany({ select: { id: true, name: true, companyNames: true } })
        const matchProvider = (supplierName: string): string | null => {
          const s = supplierName.trim()
          if (!s) return null
          const byName = providers.find((p) => p.name === s)
          if (byName) return byName.id
          const byCompany = providers.find((p) => safeParse<string[]>(p.companyNames, []).includes(s))
          return byCompany?.id ?? null
        }

        const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
        let cursor: number | null = 0
        for (let page = 0; page < PAGE_CAP && cursor !== null; page++) {
          const r = await fetch(`${bridgeUrl}/api/products?cursor=${cursor}&limit=100`, {
            signal: AbortSignal.timeout(20000),
            cache: 'no-store',
          })
          if (!r.ok) throw new Error(`پل کالاها را با کد ${r.status} برگرداند`)
          const data = (await r.json()) as { items?: any[]; nextCursor?: number | null }
          const items = Array.isArray(data.items) ? data.items : []
          if (items.length === 0) break

          for (const it of items) {
            const holooCode = String(it?.holooCode ?? '').trim()
            const name = String(it?.name ?? '').trim()
            if (!holooCode || !name) { stats.skipped++; continue }
            try {
              const existing = await db.product.findFirst({ where: { holooCode }, select: { id: true, unit: true, category: true } })
              if (existing) {
                // موجودی (stock) عمداً دست‌نخورده می‌ماند — موجودی سمت سامانه است، نه هلو
                await db.product.update({
                  where: { id: existing.id },
                  data: {
                    name,
                    buyPrice: num(it.buyPrice),
                    sellPrice: num(it.sellPrice),
                    unit: String(it.unit || existing.unit),
                    category: String(it.category || existing.category),
                    inHoloo: true,
                  },
                })
                stats.updated++
              } else {
                await db.product.create({
                  data: {
                    name,
                    holooCode,
                    unit: String(it.unit || 'عدد'),
                    category: String(it.category || 'عمومی'),
                    buyPrice: num(it.buyPrice),
                    sellPrice: num(it.sellPrice),
                    stock: Math.max(0, Math.round(num(it.stock))),
                    inHoloo: true,
                    barcodes: JSON.stringify(it.barcode ? [String(it.barcode)] : []),
                    providerId: matchProvider(String(it.supplierName || '')),
                  },
                })
                stats.created++
              }
            } catch (ie: any) {
              stats.errors++
              appendLog(`خطا در کالای ${holooCode}: ${ie?.message || ie}`)
            }
          }

          appendLog(`صفحه ${page + 1}: ${items.length} کالا از پل دریافت شد — تا این لحظه ${stats.created} جدید، ${stats.updated} بروزرسانی، ${stats.skipped} صرف‌نظر، ${stats.errors} خطا`)
          await persist() // ذخیرهٔ تدریجی — حتی با قطع برق، دفتر تا همین صفحه محفوظ است
          cursor = data.nextCursor ?? null
        }
        appendLog(`همگام‌سازی کالاها پایان یافت: ${stats.created} جدید، ${stats.updated} بروزرسانی، ${stats.skipped} صرف‌نظر، ${stats.errors} خطا`)
      }

      /* همگام‌سازی تأمین‌کنندگان */
      if (kind === 'SUPPLIERS' || kind === 'FULL') {
        const r = await fetch(`${bridgeUrl}/api/suppliers`, { signal: AbortSignal.timeout(20000), cache: 'no-store' })
        if (!r.ok) throw new Error(`پل تأمین‌کنندگان را با کد ${r.status} برگرداند`)
        const data = (await r.json()) as { items?: any[] }
        const items = Array.isArray(data.items) ? data.items : []

        let supCreated = 0
        let supUpdated = 0
        for (const it of items) {
          const name = String(it?.name ?? '').trim()
          if (!name) { stats.skipped++; continue }
          try {
            const existing = await db.provider.findFirst({ where: { name } })
            const cats: string[] = Array.isArray(it?.categories) ? it.categories.map(String) : []
            if (existing) {
              const merged = Array.from(new Set([...safeParse<string[]>(existing.companyNames, []), ...cats]))
              await db.provider.update({
                where: { id: existing.id },
                data: { personName: String(it.personName || existing.personName), phone: String(it.phone || existing.phone), companyNames: JSON.stringify(merged) },
              })
              supUpdated++
            } else {
              await db.provider.create({
                data: {
                  name,
                  personName: String(it.personName || ''),
                  phone: String(it.phone || ''),
                  type: 'DISTRIBUTOR',
                  companyNames: JSON.stringify(cats),
                  active: true,
                },
              })
              supCreated++
            }
          } catch (ie: any) {
            stats.errors++
            appendLog(`خطا در تأمین‌کنندهٔ ${name}: ${ie?.message || ie}`)
          }
        }
        stats.created += supCreated
        stats.updated += supUpdated
        appendLog(`همگام‌سازی تأمین‌کنندگان پایان یافت: ${supCreated} جدید، ${supUpdated} بروزرسانی، ${stats.errors} خطا`)
      }

      await logActivity(me, 'holoo.sync', 'syncLedger', ledger.id, `همگام‌سازی ${kindLabel}: ${stats.created} جدید، ${stats.updated} بروزرسانی، ${stats.errors} خطا`)
    } catch (e: any) {
      status = 'FAILED'
      errMsg = String(e?.message || e)
      stats.errors++
      appendLog(`همگام‌سازی ناموفق: ${errMsg}`)
      await logActivity(me, 'holoo.sync.failed', 'syncLedger', ledger.id, errMsg)
    } finally {
      // موفق یا ناموفق — ردیف دفتر هرگز حذف نمی‌شود (سند شواهد)
      await db.syncLedger
        .update({
          where: { id: ledger.id },
          data: { status, stats: JSON.stringify(stats), log: JSON.stringify(logs), snapshot: JSON.stringify(snapshot), finishedAt: new Date() },
        })
        .catch(() => {})
    }

    const final = await db.syncLedger.findUnique({ where: { id: ledger.id } })
    return json({
      ok: true,
      run: {
        id: ledger.id,
        status: final?.status ?? status,
        stats: safeParse<Stats>(final?.stats || '{}', emptyStats()),
        error: errMsg || null,
      },
    })
  }

  /* بازگردانی از اسنپ‌شات — فقط مدیران ارشد */
  if (action === 'rollback') {
    if (!['GM', 'OM', 'OWNER'].includes(me.role)) return fail('بازگردانی فقط برای مدیران ارشد مجاز است', 403)
    const id = String(body.id || '')
    const row = await db.syncLedger.findUnique({ where: { id } })
    if (!row) return fail('ردیف دفتر یافت نشد', 404)
    const snap = safeParse<SnapshotRow[]>(row.snapshot, [])
    if (snap.length === 0) return fail('این نقطهٔ زمانی اسنپ‌شات بازیابی ندارد')

    let restored = 0
    let missing = 0
    const logs: LogLine[] = safeParse<LogLine[]>(row.log, [])
    logs.push({ at: new Date().toISOString(), line: `درخواست بازگردانی از این نقطه توسط ${me.name} — ${snap.length} ردیف اسنپ‌شات` })
    for (const s of snap) {
      try {
        const p = await db.product.findUnique({ where: { id: s.productId }, select: { id: true } })
        if (!p) { missing++; continue }
        await db.product.update({
          where: { id: s.productId },
          data: { stock: s.stock, buyPrice: s.buyPrice, sellPrice: s.sellPrice, holooCode: s.holooCode },
        })
        restored++
      } catch {
        missing++
      }
    }
    logs.push({ at: new Date().toISOString(), line: `بازگردانی انجام شد: ${restored} کالا احیا، ${missing} یافت‌نشد` })

    await db.syncLedger.update({
      where: { id },
      data: { status: 'ROLLED_BACK', log: JSON.stringify(logs.slice(-500)), finishedAt: new Date() },
    })
    await logActivity(me, 'holoo.rollback', 'syncLedger', id, `بازگردانی: ${restored} کالا از اسنپ‌شات احیا شد`)
    return json({ ok: true, restored, missing })
  }

  /* حذف ردیف ناموفق — SUCCESS دائمی است */
  if (action === 'purge') {
    if (!['GM', 'OM', 'OWNER'].includes(me.role)) return fail('حذف فقط برای مدیران ارشد مجاز است', 403)
    const id = String(body.id || '')
    const row = await db.syncLedger.findUnique({ where: { id } })
    if (!row) return fail('ردیف دفتر یافت نشد', 404)
    if (row.status !== 'FAILED') return fail('فقط ردیف‌های ناموفق (FAILED) قابل حذف‌اند؛ ردیف‌های موفق سابقهٔ دائمی‌اند', 400)
    await db.syncLedger.delete({ where: { id } })
    await logActivity(me, 'holoo.purge', 'syncLedger', id, 'ردیف ناموفق دفتر حذف شد')
    return json({ ok: true })
  }

  return fail('عملیات ناشناخته است')
}
