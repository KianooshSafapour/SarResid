# R14 — auto-archiving: per-supplier binder map + auto-archive on gm-approve
import io

p = 'src/app/api/margin/[id]/route.ts'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) helpers after notifyRoles (module level)
old_tail = """/** اعلان درون‌برنامه‌ای برای نقش‌ها — مثل R10 سفارش‌ها */
async function notifyRoles(roles: string[], data: { kind: string; severity: string; title: string; body: string; go: string }) {"""
new_tail = """/* ── R14: بایگانی خودکار — نگاشت شرکت → زون‌بند (Setting archive.autoBind) ── */
const AUTO_BIND_KEY = 'archive.autoBind'
type AutoBindMap = Record<string, string> // "id:<supplierId>" یا "name:<supplierName>" → binderId

async function readAutoBind(): Promise<AutoBindMap> {
  const row = await db.setting.findUnique({ where: { key: AUTO_BIND_KEY } })
  const parsed = safeJson<Record<string, unknown>>(row?.value, {})
  const out: AutoBindMap = {}
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      const key = String(k ?? '').trim()
      const val = String(v ?? '').trim()
      if (/^(id|name):.+/.test(key) && val) out[key] = val
    }
  }
  return out
}

async function writeAutoBind(map: AutoBindMap) {
  if (!Object.keys(map).length) {
    await db.setting.deleteMany({ where: { key: AUTO_BIND_KEY } })
    return
  }
  const value = JSON.stringify(map)
  await db.setting.upsert({ where: { key: AUTO_BIND_KEY }, create: { key: AUTO_BIND_KEY, value }, update: { value } })
}

function supplierKeysOf(inv: { supplierId: string | null; supplierName: string | null }): string[] {
  const keys: string[] = []
  if (inv.supplierId) keys.push(`id:${inv.supplierId}`)
  if (inv.supplierName && inv.supplierName.trim()) keys.push(`name:${inv.supplierName.trim()}`)
  return keys
}

async function resolveAutoBinder(inv: { supplierId: string | null; supplierName: string | null }) {
  const map = await readAutoBind()
  for (const k of supplierKeysOf(inv)) {
    const binderId = map[k]
    if (!binderId) continue
    const binder = await db.archiveBinder
      .findUnique({ where: { id: binderId }, include: { shelf: { include: { cabinet: true } } } })
      .catch(() => null)
    if (binder) return binder
  }
  return null
}

/** برگهٔ بعدی زون‌بند — بیشینهٔ عددی برگه‌های موجود + ۱ */
async function nextFolioOf(binderId: string): Promise<number> {
  const docs = await db.archiveDocument.findMany({ where: { binderId }, select: { folio: true } })
  let max = 0
  for (const d of docs) {
    const n = parseInt(String(d.folio ?? '').replace(/[^0-9]/g, ''), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

/** اعلان درون‌برنامه‌ای برای نقش‌ها — مثل R10 سفارش‌ها */
async function notifyRoles(roles: string[], data: { kind: string; severity: string; title: string; body: string; go: string }) {"""
assert old_tail in s
s = s.replace(old_tail, new_tail)

# 2) GET: expose autoArchiveBinder
old_get = """      history: readHistory(inv.historyJson).map((h) => ({ ...h, label: HISTORY_LABEL[h.action] ?? h.action })),
      archive: archiveOut,
      items,"""
new_get = """      history: readHistory(inv.historyJson).map((h) => ({ ...h, label: HISTORY_LABEL[h.action] ?? h.action })),
      archive: archiveOut,
      /* R14: زون‌بندِ خودکارِ این شرکت (اگر تعیین شده باشد) */
      autoArchiveBinder: await resolveAutoBinder(inv).then((b) =>
        b ? { id: b.id, name: b.name, code: b.code, shelf: b.shelf?.name ?? null, cabinet: b.shelf?.cabinet?.name ?? null } : null,
      ),
      items,"""
assert old_get in s
s = s.replace(old_get, new_get)

# 3) gm-approve: autoArchive support — after the update block, before notifyRoles call
old_gm = """    const updated = await db.marginInvoice.update({
      where: { id },
      data: {
        gmApprovedAt: now,
        gmApprovedById: me.id,
        gmApprovedByName: me.fullName,
        historyJson: withEvent(inv.historyJson, {
          at: nowIso,
          by: me.fullName,
          action: 'gm-approve',
          detail: `مدیر کل سود و قیمت‌های فاکتور را تأیید کرد${priceDetail} — آمادهٔ بایگانی سند کاغذی`,
        }),
      },
    })
"""
new_gm = """    const updated = await db.marginInvoice.update({
      where: { id },
      data: {
        gmApprovedAt: now,
        gmApprovedById: me.id,
        gmApprovedByName: me.fullName,
        historyJson: withEvent(inv.historyJson, {
          at: nowIso,
          by: me.fullName,
          action: 'gm-approve',
          detail: `مدیر کل سود و قیمت‌های فاکتور را تأیید کرد${priceDetail} — آمادهٔ بایگانی سند کاغذی`,
        }),
      },
    })

    /* R14: بایگانی خودکار — اگر فعال باشد و شرکتِ فاکتور زون‌بندِ تعیین‌شده داشته باشد،
       سند همان‌جا (با برگهٔ خودکارِ بعدی) بایگانی می‌شود؛ دیگر نیازی به گام دستی نیست. */
    let autoArchived: { docId: string; binder: string; folio: string; location: string } | null = null
    if (body?.autoArchive === true && !inv.archived) {
      const binder = await resolveAutoBinder(inv)
      if (binder) {
        const folio = String(await nextFolioOf(binder.id))
        const rejectedAuto = inv.items.filter((it) => it.accepted === false)
        const totalAcceptedAuto = inv.items.filter((it) => it.accepted !== false).reduce((sm, it) => sm + it.totalCost, 0)
        const doc = await db.archiveDocument.create({
          data: {
            kind: 'INVOICE',
            title: `فاکتور خرید #${numFa}${inv.supplierName ? ` — ${inv.supplierName}` : ''}`,
            dateJalali: inv.dateJalali || todayJalaliDash(),
            supplierId: inv.supplierId,
            supplierName: inv.supplierName,
            holooInvoiceNo: inv.holooInvoiceNo,
            holooReceiptNo: inv.holooReceiptNo,
            binderId: binder.id,
            folio,
            amount: totalAcceptedAuto,
            status: 'ARCHIVED',
            returnedJson: JSON.stringify(rejectedAuto.map((it) => ({ name: it.productName, qty: it.quantity, reason: it.rejectReason ?? 'دیگر' }))),
            note: [
              inv.providerDocNumber ? `سند تأمین‌کننده: ${inv.providerDocNumber}` : null,
              inv.purchaseOrderId ? 'سند خرید این فاکتور در «انبار و سفارش» ثبت شده است' : null,
              'بایگانی خودکار پس از تأیید مدیر کل',
            ].filter(Boolean).join(' · ') || null,
            createdById: me.id,
            createdByName: me.fullName,
          },
        })
        await db.marginInvoice.update({
          where: { id },
          data: {
            status: 'archived',
            archived: true,
            archivedAt: now,
            archiveDocId: doc.id,
            historyJson: withEvent(
              (
                await db.marginInvoice.findUnique({ where: { id }, select: { historyJson: true } })
              )?.historyJson ?? '[]',
              {
                at: nowIso,
                by: me.fullName,
                action: 'archive',
                detail: `بایگانی خودکار — ${binder.shelf?.cabinet?.name ?? 'کابینت؟'} ‹ ${binder.shelf?.name ?? 'قفسه؟'} ‹ زون‌بند «${binder.name}» · برگه ${toFaDigits(folio)}`,
              },
            ),
          },
        })
        autoArchived = {
          docId: doc.id,
          binder: binder.name,
          folio,
          location: `${binder.shelf?.cabinet?.name ? `${binder.shelf.cabinet.name} ‹ ` : ''}${binder.shelf?.name ? `${binder.shelf.name} ‹ ` : ''}زون‌بند «${binder.name}»`,
        }
      }
    }
"""
assert old_gm in s
s = s.replace(old_gm, new_gm)

# 4) gm-approve response + notification mention auto-archive
old_resp = """    await notifyRoles(['ACC', 'OWNER', 'ADMIN', 'EXEC'], {
      kind: `margin:gm:${inv.id}`,
      severity: 'success',
      title: 'تأیید مدیر کل انجام شد — آمادهٔ بایگانی',
      body: `فاکتور #${numFa} (${inv.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${me.fullName} تأیید شد.${prices.holooEnabled && prices.pushedHoloo ? ` قیمت ${toFaDigits(String(prices.pushedHoloo))} کالا در هلو به‌روز شد.` : ''} سند کاغذی را در زون‌بند آرشیو بایگانی کنید.`,
      go: `#/finance/invoices?open=${inv.id}`,
    })"""
new_resp = """    await notifyRoles(['ACC', 'OWNER', 'ADMIN', 'EXEC'], {
      kind: `margin:gm:${inv.id}`,
      severity: 'success',
      title: autoArchived ? 'تأیید مدیر کل انجام شد — سند خودکار بایگانی شد' : 'تأیید مدیر کل انجام شد — آمادهٔ بایگانی',
      body: `فاکتور #${numFa} (${inv.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${me.fullName} تأیید شد.${prices.holooEnabled && prices.pushedHoloo ? ` قیمت ${toFaDigits(String(prices.pushedHoloo))} کالا در هلو به‌روز شد.` : ''}${autoArchived ? ` بایگانی خودکار: ${autoArchived.location} · برگه ${toFaDigits(autoArchived.folio)}.` : ' سند کاغذی را در زون‌بند آرشیو بایگانی کنید.'}`,
      go: `#/finance/invoices?open=${inv.id}`,
    })"""
assert old_resp in s
s = s.replace(old_resp, new_resp)

old_ret = """    return ok({ id, status: updated.status, gmApprovedAt: nowIso, gmApprovedByName: me.fullName, prices })"""
new_ret = """    return ok({ id, status: autoArchived ? 'archived' : updated.status, gmApprovedAt: nowIso, gmApprovedByName: me.fullName, prices, autoArchived })"""
assert old_ret in s
s = s.replace(old_ret, new_ret)

# 5) archive action: saveBinder flag
old_save = """    const binderId = String(body?.binderId ?? '').trim() || null
    if (!binderId) return fail('زون‌بند (جایگاه فیزیکی سند کاغذی) را انتخاب کنید')"""
new_save = """    const binderId = String(body?.binderId ?? '').trim() || null
    if (!binderId) return fail('زون‌بند (جایگاه فیزیکی سند کاغذی) را انتخاب کنید')"""
assert old_save in s

# add mapping save after binder validation in archive action
old_binder = """    const binder = await db.archiveBinder.findUnique({
      where: { id: binderId },
      include: { shelf: { include: { cabinet: true } } },
    })
    if (!binder) return fail('زون‌بند یافت نشد')
"""
new_binder = """    const binder = await db.archiveBinder.findUnique({
      where: { id: binderId },
      include: { shelf: { include: { cabinet: true } } },
    })
    if (!binder) return fail('زون‌بند یافت نشد')

    /* R14: «این زون‌بند را برای این شرکت ذخیره کن» — بایگانی خودکارِ فاکتورهای بعدی */
    if (body?.saveBinder === true) {
      const map = await readAutoBind()
      for (const k of supplierKeysOf(inv)) map[k] = binderId
      await writeAutoBind(map)
    }
"""
assert old_binder in s
s = s.replace(old_binder, new_binder)

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
print('auto-archive server ok')
