# -*- coding: utf-8 -*-
"""افزودن جداکنندهٔ هزارگان به ورودی‌های قیمت در سودسنج"""
import io, re

p = 'hz-ext/src/views/profit.tsx'
s = io.open(p, encoding='utf-8').read()

# تابع کمکی: عدد ← نمایش با جداکنندهٔ فارسی
# در جاهایی که value={toFaDigits(x)} است برای قیمت‌ها، تبدیل به فرمت جداکننده‌دار
fa_money = """/* جداکنندهٔ هزارگان برای نمایش قیمت: 1250000 → ۱٬۲۵۰٬۰۰۰ */
function faMoneyFmt(v: string | number): string {
  const raw = toEnDigits(String(v ?? '')).replace(/[^\\d.]/g, '')
  if (!raw) return ''
  const [int, dec] = raw.split('.')
  const intFmt = Number(int || 0).toLocaleString('en-US')
  let out = toFaDigits(intFmt).replace(/,/g, '\\u066c')
  if (dec !== undefined) out += '\\u066b' + toFaDigits(dec)
  return out
}
function stripMoneyFmt(v: string): string {
  return toEnDigits(v).replace(/[^\\d.]/g, '')
}
"""

# اضافه کردن توابع بعد از آخرین import
import_end = s.index('\n', s.rindex('import '))
s = s[:import_end + 1] + '\n' + fa_money + s[import_end + 1:]

# پیدا کردن input های قیمت و value را با faMoneyFmt جایگزین کردن
# printedPrice input
s = s.replace(
  'value={toFaDigits(printedPrice)}',
  'value={faMoneyFmt(printedPrice)}'
)
# salePrice input
s = s.replace(
  'value={toFaDigits(salePrice)}',
  'value={faMoneyFmt(salePrice)}'
)
# totalCost — پیدا کردن
s = s.replace(
  'value={toFaDigits(totalCost)}',
  'value={faMoneyFmt(totalCost)}'
)

# onChange handlerها هم stripMoneyFmt استفاده کنند
s = s.replace(
  'onPrintedChange(toEnDigits(e.target.value).replace(/\u066b/g, \'.\').replace(/[^\\d.]/g, \'\'))',
  'onPrintedChange(stripMoneyFmt(e.target.value))'
)
s = s.replace(
  'onSaleChange(toEnDigits(e.target.value).replace(/\u066b/g, \'.\').replace(/[^\\d.]/g, \'\'))',
  'onSaleChange(stripMoneyFmt(e.target.value))'
)
s = s.replace(
  'onTotalChange(toEnDigits(e.target.value).replace(/\u066b/g, \'.\').replace(/[^\\d.]/g, \'\'))',
  'onTotalChange(stripMoneyFmt(e.target.value))'
)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('price separators added to سودسنج')
