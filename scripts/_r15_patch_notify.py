# R15 — notify via realtime lib + orders gm-approve notification + history times
import io

# ── 1) margin/[id]/route.ts: notifyRoles → shared notify() (realtime) ──
p = 'src/app/api/margin/[id]/route.ts'
s = io.open(p, encoding='utf-8').read()
orig = s

old = """/** اعلان درون‌برنامه‌ای برای نقش‌ها — مثل R10 سفارش‌ها */
async function notifyRoles(roles: string[], data: { kind: string; severity: string; title: string; body: string; go: string }) {
  for (const role of roles) {
    await db.notification
      .create({
        data: {
          role,
          kind: data.kind,
          severity: data.severity,
          title: data.title,
          body: data.body,
          go: data.go,
        },
      })
      .catch(() => {})
  }
}"""
new = """/** اعلان درون‌برنامه‌ای برای نقش‌ها — R15: با کتابخانهٔ مشترک notify() تا
    هم ردیف زنگ ایجاد شود و هم رویداد لحظه‌ای (realtime) به نقش‌ها برسد. */
import { notify } from '@/lib/notify'
async function notifyRoles(roles: string[], data: { kind: string; severity: string; title: string; body: string; go: string }) {
  for (const role of roles) {
    await notify({ role, kind: data.kind, severity: data.severity, title: data.title, body: data.body, go: data.go }).catch(() => {})
  }
}"""
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('margin notify ok')

# ── 2) orders/[id]/route.ts: gm-approve → notify ACC+managers (realtime) ──
p2 = 'src/app/api/orders/[id]/route.ts'
s2 = io.open(p2, encoding='utf-8').read()
orig2 = s2

old2 = """      const dGm = await detail(o.id)
      return ok(dGm ? { ...dGm, prices } : { prices })"""
new2 = """      /* R15: اعلان لحظه‌ای به حسابدار و مدیران — تأیید مدیر کل انجام شد، سفارش قابل بستن است */
      for (const role of ['ACC', 'OWNER', 'ADMIN', 'EXEC']) {
        await notify({
          role,
          kind: `order:gm-done:${o.id}`,
          severity: 'success',
          title: 'سفارش تأیید مدیر کل شد — قابل بستن',
          body: `سفارش ${o.code} (${o.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${by} تأیید مدیر کل شد${prices ? ` و قیمت ${toFaDigits(String(prices.updatedLocal))} کالا منتشر گردید` : ''}. حسابدار/مدیر می‌توانند سفارش را ببندند.`,
          go: `#/supply/receiving?open=${o.id}`,
        }).catch(() => {})
      }
      const dGm = await detail(o.id)
      return ok(dGm ? { ...dGm, prices } : { prices })"""
assert old2 in s2
s2 = s2.replace(old2, new2)

# import notify if missing
if "from '@/lib/notify'" not in s2:
    s2 = s2.replace("import { canApproveOrdersUser } from '@/lib/access'", "import { canApproveOrdersUser } from '@/lib/access'\nimport { notify } from '@/lib/notify'")
io.open(p2, 'w', encoding='utf-8').write(s2)
print('orders gm notify ok')
