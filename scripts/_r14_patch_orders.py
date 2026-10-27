# R14 — GM (مدیر کل) approval in orders flow
import io

p = 'src/app/api/orders/[id]/route.ts'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) detail(): expose gm approval + linked margin invoice gm state
old = """    receivedById: extras.receivedById ?? null,
    verifiedById: extras.verifiedById ?? null,
    historyJson,"""
new = """    receivedById: extras.receivedById ?? null,
    verifiedById: extras.verifiedById ?? null,
    /* R14: تأیید مدیر کل پس از ثبت حسابداری */
    gmApprovedAt: o.gmApprovedAt ? o.gmApprovedAt.toISOString() : null,
    gmApprovedByName: o.gmApprovedByName ?? null,
    historyJson,"""
assert old in s
s = s.replace(old, new)

# 2) new case gm-approve before final-approve + gate final-approve
old_fa = """    case 'final-approve': {
      if (o.status !== 'ACCOUNTED') return fail('فقط سفارش ثبت‌شده در حسابداری قابل بستن است')
      if (!manager) return fail('تأیید نهایی فقط با دسترسی مدیران ممکن است', 403)"""
new_fa = """    /* ── R14: تأیید مدیر کل (خانم لطفی) — پس از ثبت حسابداری، پیش از بستن سفارش.
       هم‌زمان قیمت‌های فاکتور سودسنجِ متصل (sellPrice=نهایی، sellPrice2=قیمت چاپی)
       روی کالا و در هلو منتشر می‌شود. ── */
    case 'gm-approve': {
      if (o.status !== 'ACCOUNTED') return fail('تأیید مدیر کل فقط برای سفارشِ ثبت‌شده در حسابداری ممکن است')
      if (!['GM', 'OWNER', 'ADMIN'].includes(user.role)) return fail('تأیید مدیر کل فقط برای مدیر کل (خانم لطفی) یا مالک/ادمین ممکن است', 403)
      if (o.gmApprovedAt) return fail('این سفارش قبلاً تأیید مدیر کل شده است')

      let prices: { updatedLocal: number; pushedHoloo: number; reason?: string } | null = null
      const linkedInv = await db.marginInvoice.findFirst({ where: { purchaseOrderId: o.id }, include: { items: true } })
      if (linkedInv && !linkedInv.gmApprovedAt) {
        const { publishPricesToHoloo } = await import('@/lib/margin-purchase')
        prices = await publishPricesToHoloo({
          items: linkedInv.items.filter((it) => it.accepted !== false),
          marginInvoiceNumber: linkedInv.number,
        })
        await db.marginInvoice.update({
          where: { id: linkedInv.id },
          data: {
            gmApprovedAt: new Date(),
            gmApprovedById: user.id,
            gmApprovedByName: by,
            historyJson: linkedInvoiceHistory(linkedInv, by),
          },
        })
      }

      await pushHistory(extras, {
        at: now,
        by,
        action: 'gm-approve',
        detail: `تأیید مدیر کل (خانم لطفی) — ${by}${prices ? ` · قیمت ${toFaDigits(String(prices.updatedLocal))} کالا به‌روز شد${prices.pushedHoloo ? ` و ${toFaDigits(String(prices.pushedHoloo))} قلم در هلو منتشر شد` : ''}` : ''} — آمادهٔ بستن سفارش`,
      })
      await saveExtras(o.id, extras)
      await db.order.update({
        where: { id: o.id },
        data: { gmApprovedAt: new Date(), gmApprovedById: user.id, gmApprovedByName: by },
      })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_gm_approve',
        actionLabel: 'تأیید مدیر کل سفارش',
        category: 'orders',
        detail: `${o.code}${prices ? ` — ${toFaDigits(String(prices.updatedLocal))} قیمت به‌روز / ${toFaDigits(String(prices.pushedHoloo))} در هلو` : ''}`,
        entityId: o.id,
      })
      const dGm = await detail(o.id)
      return ok(dGm ? { ...dGm, prices } : { prices })
    }

    case 'final-approve': {
      if (o.status !== 'ACCOUNTED') return fail('فقط سفارش ثبت‌شده در حسابداری قابل بستن است')
      if (!manager) return fail('تأیید نهایی فقط با دسترسی مدیران ممکن است', 403)
      if (!o.gmApprovedAt) return fail('پیش از بستن سفارش، تأیید مدیر کل (خانم لطفی) لازم است')"""
assert old_fa in s
s = s.replace(old_fa, new_fa)

# 3) helper for linked invoice historyJson (append gm event) — place before PATCH
old_patch = "export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {"
new_patch = """/** R14 — ردپای «تأیید مدیر کل» روی فاکتور سودسنجِ متصلِ سفارش */
function linkedInvoiceHistory(
  inv: { historyJson: string },
  by: string,
): string {
  try {
    const list = JSON.parse(inv.historyJson || '[]') as { at?: string; by?: string; action?: string; detail?: string }[]
    list.push({
      at: new Date().toISOString(),
      by,
      action: 'gm-approve',
      detail: 'مدیر کل از مسیر سفارش‌ها تأیید کرد — قیمت‌ها در سر رسید و هلو به‌روز شد',
    })
    return JSON.stringify(list.slice(-80))
  } catch {
    return inv.historyJson
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {"""
assert old_patch in s
s = s.replace(old_patch, new_patch)

# 4) account(): اعلان به مدیر کل برای تأیید — append after account logActivity
old_acc = """      const dAcc = await detail(o.id)
      return ok(dAcc ? { ...dAcc, archiveDocId, marginInvoiceId, marginInvoiceNumber, holoo } : { archiveDocId, marginInvoiceId, marginInvoiceNumber, holoo })"""
new_acc = """      /* R14: اعلان به مدیر کل — سفارش در انتظار تأیید ایشان است */
      for (const role of ['GM', 'OWNER', 'ADMIN']) {
        await db.notification.create({
          data: {
            role,
            kind: `order:gm:${o.id}`,
            severity: 'warning',
            title: 'سفارش در انتظار تأیید مدیر کل',
            body: `سفارش ${o.code} (${o.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${by} در حسابداری ثبت شد — پس از تأیید مدیر کل (خانم لطفی)، قیمت‌ها منتشر و سفارش قابل بستن است.`,
            go: `#/supply/receiving?open=${o.id}`,
          },
        }).catch(() => {})
      }
      const dAcc = await detail(o.id)
      return ok(dAcc ? { ...dAcc, archiveDocId, marginInvoiceId, marginInvoiceNumber, holoo } : { archiveDocId, marginInvoiceId, marginInvoiceNumber, holoo })"""
assert old_acc in s
s = s.replace(old_acc, new_acc)

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
print('orders route patched:', s.count('gm-approve'), 'gm refs')
