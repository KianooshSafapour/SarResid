# R15 — CRM wiring: CrmEvent per return + enriched notebook API
import io

# ── 1) returns POST: CrmEvent ──
p = 'src/app/api/returns/route.ts'
s = io.open(p, encoding='utf-8').read()
orig = s
old = """  // auto-upsert CRM customer (per-phone stats, live behaviour)
  if (customerPhone) {
    await db.customer.upsert({
      where: { phone: customerPhone },
      create: {
        phone: customerPhone,
        name: customerName,
        returnsCount: 1,
        totalAmount,
        firstAt: now,
        lastVisitAt: now,
      },
      update: {
        returnsCount: { increment: 1 },
        totalAmount: { increment: totalAmount },
        lastVisitAt: now,
      },
    })
  }"""
new = """  // auto-upsert CRM customer (per-phone stats, live behaviour)
  if (customerPhone) {
    const cust = await db.customer.upsert({
      where: { phone: customerPhone },
      create: {
        phone: customerPhone,
        name: customerName,
        returnsCount: 1,
        totalAmount,
        firstAt: now,
        lastVisitAt: now,
      },
      update: {
        returnsCount: { increment: 1 },
        totalAmount: { increment: totalAmount },
        lastVisitAt: now,
      },
    })
    /* R15: هر مرجوعی یک رویداد CRM است — خط زمانی تجربهٔ مشتری */
    await db.crmEvent
      .create({
        data: {
          customerId: cust.id,
          kind: 'return',
          content: `مرجوعی ${code} — ${items.length} قلم · ${Math.round(totalAmount).toLocaleString('en-US')} ریال · علت: ${reason || '—'}${body.exchangeValue ? ' · کارت بانکی' : ''}`,
          userId: me.id,
        },
      })
      .catch(() => {})
  }"""
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('returns crm ok')
