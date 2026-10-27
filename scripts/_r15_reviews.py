# R15 — section reviews: replace expiry metric, add serveScore
import io

# 1) schema: add serveScore
p = 'prisma/schema.prisma'
s = io.open(p, encoding='utf-8').read()
old = """  labelScore   Int      @default(0) // 0-5 برچسب و قیمت در برابر هر ردیف
  note         String?"""
new = """  labelScore   Int      @default(0) // 0-5 برچسب و قیمت در برابر هر ردیف
  /* R15: انقضا به «کنترل انقضای قفسه‌ها» (lane-check) رفت؛ به‌جایش دو شاخص عملکردی:
     dateScore اکنون «شارژ و کامل بودن قفسه» را می‌سنجد (نام ستون حفظ شد) + serveScore جدید */
  serveScore   Int      @default(0) // 0-5 برخورد و پاسخگویی به مشتری (R15)
  note         String?"""
assert old in s
io.open(p, 'w', encoding='utf-8').write(s.replace(old, new))
print('schema ok')

# 2) API
p = 'src/app/api/section-reviews/route.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("      labelScore5: to5(r.labelScore),", "      labelScore5: to5(r.labelScore),\n      serveScore5: to5(r.serveScore),")
s = s.replace("    labelScore?: number", "    labelScore?: number\n    serveScore?: number")
s = s.replace("""  const labelScore = score100(body.labelScore)
  const avg = Math.round((dateScore + layoutScore + cleanScore + labelScore) / 4)""",
"""  const labelScore = score100(body.labelScore)
  const serveScore = score100(body.serveScore)
  const avg = Math.round((dateScore + layoutScore + cleanScore + labelScore + serveScore) / 5)""")
s = s.replace("      labelScore,", "      labelScore,\n      serveScore,")
io.open(p, 'w', encoding='utf-8').write(s)
print('api ok')

# 3) view: PARAMS + form + total + avatars
p = 'hz-ext/src/views/reviews.tsx'
s = io.open(p, encoding='utf-8').read()
old_params = """/* ─────────────────────────────────────────────────────────────
   store/reviews — ارزیابی چیدمان و عملکرد (۴ شاخص علمی)
   ۱) تاریخ تولید/انقضا و FEFO   ۲) نظم چیدمان
   ۳) نظافت                       ۴) برچسب و قیمت
   ───────────────────────────────────────────────────────────── */

const PARAMS = [
  { key: 'dateScore', label: 'تاریخ تولید/انقضا — نزدیک‌انقضا در جلو (FEFO)', hint: 'کالاهای نزدیک‌تر به انقضا جلوی کالاهای جدیدتر قرار گیرند' },
  { key: 'layoutScore', label: 'نظم و ترتیب چیدمان', hint: 'ردیف‌ها مرتب، هم‌جهت و بدون جاافتادگی' },
  { key: 'cleanScore', label: 'نظافت', hint: 'بدون گرد روی کالا، خط و کف پاکیزه' },
  { key: 'labelScore', label: 'برچسب و قیمت', hint: 'جلوی هر ردیف محصول، برچسب قیمت موجود' },
] as const

const AVATARS: Record<string, string> = { dateScore: '📅', layoutScore: '🧱', cleanScore: '🧼', labelScore: '🏷' }"""
new_params = """/* ─────────────────────────────────────────────────────────────
   store/reviews — ارزیابی چیدمان و عملکرد (۵ شاخص علمی · R15)
   پژوهش: مقیاس ۰..۵ با توصیف رفتاری (BARS) — افزایش نقاط مقیاس بی‌فایده است.
   کنترل انقضا به ابزار خودش («کنترل انقضای قفسه‌ها») رفت؛ این‌جا فقط عملکرد.
   ۱) شارژ و کامل بودن قفسه   ۲) نظم چیدمان      ۳) نظافت
   ۴) برچسب و قیمت           ۵) برخورد و پاسخگویی به مشتری
   ───────────────────────────────────────────────────────────── */

const PARAMS = [
  { key: 'dateScore', label: 'شارژ و کامل بودن قفسه', hint: 'قفسه‌ها پر و شارژ؛ جای خالیِ دیده‌شده در دسترس مشتری نیست (ستون قدیمی dateScore — نام حفظ شد)' },
  { key: 'layoutScore', label: 'نظم و ترتیب چیدمان', hint: 'ردیف‌ها مرتب، هم‌جهت و بدون جاافتادگی؛ کالا در جای تعریف‌شدهٔ الگو' },
  { key: 'cleanScore', label: 'نظافت', hint: 'بدون گرد روی کالا، خط و کف پاکیزه' },
  { key: 'labelScore', label: 'برچسب و قیمت', hint: 'جلوی هر ردیف محصول، برچسب قیمت موجود و خوانا' },
  { key: 'serveScore', label: 'برخورد و پاسخگویی به مشتری', hint: 'خوش‌رو در دسترس مشتری؛ راهنمایی پیدا کردن کالا؛ پیگیری درخواست' },
] as const

const AVATARS: Record<string, string> = { dateScore: '📦', layoutScore: '🧱', cleanScore: '🧼', labelScore: '🏷', serveScore: '🤝' }"""
assert old_params in s
s = s.replace(old_params, new_params)

s = s.replace(
    "const [form, setForm] = useState({ staffId: '', staffName: '', dateScore: 3, layoutScore: 3, cleanScore: 3, labelScore: 3, note: '', points: '' })",
    "const [form, setForm] = useState({ staffId: '', staffName: '', dateScore: 3, layoutScore: 3, cleanScore: 3, labelScore: 3, serveScore: 3, note: '', points: '' })")
s = s.replace(
    "const total = form.dateScore + form.layoutScore + form.cleanScore + form.labelScore",
    "const total = form.dateScore + form.layoutScore + form.cleanScore + form.labelScore + form.serveScore")
io.open(p, 'w', encoding='utf-8').write(s)
print('view ok')
