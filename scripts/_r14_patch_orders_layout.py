# R14 — سفارش جدید layout: side-by-side top cards + tighter tables
import io

p = 'hz-ext/src/views/orders.tsx'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) open a grid wrapper before طرف حساب card; supplier card = 5 cols
old_open = """          {/* طرف حساب (تأمین‌کننده) — نخستین کارت سربرگ سفارش */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.handshake size={18} /> طرف حساب (تأمین‌کننده)
                {supplierId && supplierId !== 'none' && <Badge variant="secondary" className="text-[11px]">انتخاب‌شده</Badge>}
              </CardTitle>
              <p className="text-xs leading-5 text-stone-500">
                تأمین‌کنندهٔ این سفارش را همین ابتدا مشخص کنید (اختیاری) — در کادر زیر همان‌جا تایپ کنید (نام / کد / تلفن) و از فهرست بازشو انتخاب کنید؛ کلیدهای ↑↓ و Enter هم کار می‌کند.
              </p>
              <SupplierCombo suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
            </CardHeader>"""
new_open = """          {/* R14: طرف حساب و ضایعاتِ همان تأمین‌کننده کنار هم — به‌جای دو نوار تمام‌عرض */}
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          {/* طرف حساب (تأمین‌کننده) — نخستین کارت سربرگ سفارش */}
          <Card className="xl:col-span-5">
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.handshake size={18} /> طرف حساب (تأمین‌کننده)
                {supplierId && supplierId !== 'none' && <Badge variant="secondary" className="text-[11px]">انتخاب‌شده</Badge>}
              </CardTitle>
              <p className="text-xs leading-5 text-stone-500">
                تأمین‌کنندهٔ این سفارش را مشخص کنید (اختیاری) — تایپ کنید (نام / کد / تلفن) و از فهرست بازشو انتخاب کنید؛ کلیدهای ↑↓ و Enter هم کار می‌کند.
              </p>
              <SupplierCombo suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
            </CardHeader>"""
assert old_open in s
s = s.replace(old_open, new_open)

# 2) waste card: 7 cols + close wrapper grid after it; if no waste, close after supplier
old_waste_open = """          {waste && (waste.items ?? []).length > 0 && (
            <Card className="border-amber-300">
              <CardHeader className="space-y-2 pb-2">"""
new_waste_open = """          {waste && (waste.items ?? []).length > 0 && (
            <Card className="border-amber-300 xl:col-span-7">
              <CardHeader className="space-y-2 pb-2">"""
assert old_waste_open in s
s = s.replace(old_waste_open, new_waste_open)

old_waste_close = """              </CardContent>
            </Card>
          )}

          {/* جست‌وجوی سریع کالا */}"""
new_waste_close = """              </CardContent>
            </Card>
          )}
          </div>

          {/* جست‌وجوی سریع کالا */}"""
assert old_waste_close in s
s = s.replace(old_waste_close, new_waste_close)

# 3) tighten the results table: min-width 1000→900 and cap row height
s = s.replace('<table dir="rtl" className="w-full min-w-[1000px] text-sm">', '<table dir="rtl" className="w-full min-w-[900px] text-sm">')

# 4) basket grid: slightly tighter min-width
s = s.replace('<div className="min-w-[980px]">', '<div className="min-w-[900px]">')

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
print('layout ok')
