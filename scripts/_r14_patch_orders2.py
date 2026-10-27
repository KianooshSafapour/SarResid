# R14 — orders route: off-schedule note on start-receive + scan-barcode action
import io

p = 'src/app/api/orders/[id]/route.ts'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) start-receive: off-schedule note
old = """      /* R10: دریافت کالا برای همهٔ کارکنان باز است (مالک: «همه باید بتوانند دریافت کنند») —
         فقط کاربر لاگین‌شده لازم است؛ کنترل دو‌نفره در مرحلهٔ راستی‌آزمایی اعمال می‌شود. */
      await pushHistory(extras, { at: now, by, action: 'start-receive', detail: 'شروع دریافت کالا در انبار' })"""
new = """      /* R10: دریافت کالا برای همهٔ کارکنان باز است (مالک: «همه باید بتوانند دریافت کنند») —
         فقط کاربر لاگین‌شده لازم است؛ کنترل دو‌نفره در مرحلهٔ راستی‌آزمایی اعمال می‌شود. */
      /* R14: دریافت خارج از تاریخ تحویل — کاربر هشدار را تأیید و توضیح نوشته است */
      const offNote = String(body.offScheduleNote ?? '').trim().slice(0, 300)
      const offDays = Number(body.offScheduleDays)
      if (offNote) {
        extras.offScheduleNote = offNote
        extras.offScheduleDays = Number.isFinite(offDays) ? offDays : null
        await pushHistory(extras, {
          at: now,
          by,
          action: 'off-schedule',
          detail: `دریافت ${offDays > 0 ? `${toFaDigits(String(offDays))} روز زودتر` : offDays < 0 ? `${toFaDigits(String(Math.abs(offDays)))} روز دیرتر` : 'خارج از تاریخ'} از تاریخ تحویل (${toFaDigits(o.deliveryDate ?? '—')}) — توضیح کاربر: ${offNote}`,
        })
      }
      await pushHistory(extras, { at: now, by, action: 'start-receive', detail: 'شروع دریافت کالا در انبار' })"""
assert old in s
s = s.replace(old, new)

# 2) scan-barcode action — insert before case 'verify'
old_v = """    case 'verify': {"""
new_v = """    /* ── R14: اسکن بارکد در فرم دریافت — بارکد جدیدِ کالا در بانک بارکد ثبت می‌شود ── */
    case 'scan-barcode': {
      if (!['RECEIVING', 'RECEIVED'].includes(o.status)) return fail('اسکن فقط در حین دریافت ممکن است')
      const itemId = String(body.itemId ?? '')
      const code = toFaDigits(String(body.barcode ?? '')).replace(/[^0-9]/g, '')
      if (!itemId) return fail('قلم سفارش مشخص نیست')
      if (!/^\\d{4,20}$/.test(code)) return fail('قالب بارکد نامعتبر است (۴ تا ۲۰ رقم)')
      const it = o.items.find((x) => x.id === itemId)
      if (!it) return fail('این قلم در سفارش نیست')
      if (!it.productId) return fail('این قلم به کالای بانک متصل نیست — بارکد فقط برای اقلام متصل ثبت می‌شود')
      const prod = await db.product.findUnique({ where: { id: it.productId }, select: { id: true, name: true, code: true, barcodesJson: true, holooErp: true } })
      if (!prod) return fail('کالای این قلم یافت نشد')
      const bank = safeJson<string[]>(prod.barcodesJson, [])
      if (code === prod.code || bank.includes(code)) return ok({ known: true, added: false, barcode: code })
      bank.push(code)
      await db.product.update({ where: { id: prod.id }, data: { barcodesJson: JSON.stringify(bank.slice(0, 60)) } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_scan_barcode',
        actionLabel: 'بارکد جدید از فرم دریافت',
        category: 'orders',
        detail: `${code} → ${prod.name} (سفارش ${o.code})`,
        entityId: prod.id,
      })
      /* هلو: سرویس Apex (PDF) برای افزودن بارکد/Morecodes اندپوینت نوشتاری ندارد؛
         ثبت در بانک خودمان + لاگ برای پیگیری دستی/آتی */
      await db.holooSyncLog
        .create({
          data: {
            kind: 'BARCODE_ADD',
            status: 'FAIL',
            statsJson: JSON.stringify({ orderCode: o.code, productCode: prod.code, barcode: code, holooErp: prod.holooErp ?? null }),
            error: 'سرویس وب Apex هلو بارکد افزوردن را پشتیبانی نمی‌کند (PDF فاقد اندپوینت Morecodes نوشتاری) — در خود هلو ثبت شود',
          },
        })
        .catch(() => {})
      return ok({ known: false, added: true, barcode: code })
    }

    case 'verify': {"""
assert old_v in s
s = s.replace(old_v, new_v, 1)

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
print('ok — scan-barcode refs:', s.count('scan-barcode'))
