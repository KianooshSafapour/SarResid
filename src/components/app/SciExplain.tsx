'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * توضیح هوشمند — دسترسی سریع به مبانی علمی هر دکمه/محاسبه (Compact Accessible Explanation).
 * الگو: «قانون تفسیرپذیری» در طراحی سامانه‌های تصمیم‌یار — هر خروجی محاسباتی باید
 * قابل ردیابی به مدل علمی پشت آن باشد (explainability principle).
 */

export type SciEntry = { title: string; body: string; source?: string }

const LIB: Record<string, SciEntry> = {
  blindcount: {
    title: 'چرا عدد موجودی سیستم را نمی‌بینید؟',
    body: 'در «شمارش کور» (Blind Count)، شمارنده بدون دیدن عدد سیستم می‌شمارد. پژوهش‌ها نشان می‌دهد دیدن عدد مورد انتظار، شمارش را به سمت همان عدد سوگیر می‌کند (Anchoring Bias) و خطای شمارش پنهان می‌ماند. سامانه فقط پس از ثبت، تطابق شمارش شما را با موجودی هلو می‌سنجد و در صورت مغایرت به مدیر اطلاع می‌دهد.',
    source: 'IRA cycle-counting research; Kang & Gershick — anchoring studies',
  },
  splh: {
    title: 'SPLH چیست؟',
    body: 'فروش به‌ازای هر ساعت کار (Sales Per Labor Hour) = فروش ÷ جمع ساعت‌های کار. شاخص استاندارد بهره‌وری نیروی انسانی در خرده‌فروشی است: برای برنامه‌ریزی شیفت، سنجش اثر چیدمان و کمپین‌ها، و تنظیم صندوق پاداش بهره‌وری. یادآوری اخلاقی: این شاخص ابزار بهبود فرآیند است، نه کنترل فردی.',
    source: 'Retail labor management literature (e.g., Fisher et al., Harvard Business Review)',
  },
  flexdays: {
    title: 'منطق «انعطاف روزها» چیست؟',
    body: 'در مدیریت خزانه، هر تاریخ تسویه یک پنجرهٔ تحمل دارد. قانون دقیق‌تر (روز ← هفته ← ماه ← فصل ← سال ← سراسری) همیشه بر قانون کلی‌تر مقدم است؛ سررسید چک نباید روی روز تعطیل بنشیند و سامانه نزدیک‌ترین روزهای کاری مجاز را پیشنهاد می‌دهد.',
    source: 'Corporate treasury management practice',
  },
  margincolors: {
    title: 'رنگ حاشیه سود چه می‌گوید؟',
    body: 'حاشیه سود = سود ناخالص ÷ قیمت فروش. زیر ۱۰٪ قرمز (بحرانی — با تورم روزانه جواب نمی‌دهد)، زیر ۲۵٪ زنگ هشدار (نیازمند مذاکره خرید)، ۲۵٪ و بالاتر سبز (سالم برای خرده‌فروشی مواد غذایی).',
    source: 'Retail gross-margin benchmarks',
  },
  archiveiso: {
    title: 'مبانی علمی آرشیو ترکیبی',
    body: 'ISO 15489 (مدیریت اسناد): هر سند شناسهٔ ماندگار می‌گیرد که هرگز تغییر نمی‌کند و «نشانگر موقعیت فیزیکی» جدا نگهداری می‌شود؛ طبقه‌بندی موضوعی (گروه تأمین‌کننده) بازیابی را چند برابر سریع‌تر می‌کند و زنجیرهٔ امانت، خروج و بازگشت سند را قابل پیگیری می‌سازد.',
    source: 'ISO 15489-1:2016 Records Management',
  },
  hijrical: {
    title: 'چرا تقویم دوگانه است؟',
    body: 'سال شمسی (هجری خورشیدی) و سال قمری (هجری اسلامی) طول متفاوتی دارند — سال قمری حدود ۱۱ روز کوتاه‌تر است. به همین دلیل «۱۳ رجب» هر سال در روز شمسیِ متفاوتی می‌افتد. سامانه با تبدیل واقعی هجری↔میلادی (جدول‌های ام‌القورا) تاریخ هر مناسبت را دقیق محاسبه و برچسب هجری روز را کنار تاریخ شمسی نشان می‌دهد.',
    source: 'Umm al-Qura calendar tables (1318–1500 ه‍.ق)',
  },
  fcfleave: {
    title: 'چرا رزرو روز مرخصی «اولویت با اولین نفر» است؟',
    body: 'قاعدهٔ FCFS (اولین در خدمت، اولین) در نظریه صف و زمان‌بندی، منصفانه‌ترین و کم‌تنش‌ترین قاعدهٔ تخصیص منابع مشترک است: رزروها به ترتیب زمان ثبت پردازش می‌شوند و شفافیت تقویم تیم به همه امکان می‌دهد قبل از رزرو، پوشش نیروی روز را ببینند. تصمیم نهایی با تأییدکننده است.',
    source: 'Scheduling theory (Ernst et al. 2004; Van den Bergh et al. 2013)',
  },
  holootime: {
    title: 'خط زمانی همگام‌سازی چطور از داده محافظت می‌کند؟',
    body: 'قبل از هر همگام‌سازی، یک «نقطهٔ بازیابی» (Snapshot) از وضعیت فعلی کالاها گرفته می‌شود. ثبت‌ها فقط الحاقی هستند (Append-only Ledger) — مثل کامیت‌های گیت، هیچ رکوردی پاک نمی‌شود؛ بنابراین هر تغییر قابل بازگردانی است و خرابی شبکه/برق یا دادهٔ ناقص، هرگز دادهٔ قبلی را از بین نمی‌برد.',
    source: 'Append-only ledger & snapshot rollback (version-control pattern)',
  },
  eoq: {
    title: 'EOQ — مقدار اقتصادی سفارش',
    body: 'EOQ = √(2DS÷H): با D تقاضای سالانه، S هزینهٔ هر بار سفارش و H هزینهٔ نگهداری. نقطه‌ای که جمع هزینهٔ سفارش و نگهداری کمینه می‌شود؛ سفارش‌های بزرگ‌تر یا کوچک‌تر از آن فقط هزینه اضافه می‌کنند.',
    source: 'Harris (1913) — classic inventory model',
  },
  abc: {
    title: 'تحلیل ABC چیست؟',
    body: 'کالاها بر پایهٔ ارزش مصرف سالانه به سه گروه تقسیم می‌شوند: A (حدود ۲۰٪ اقلام، ~۸۰٪ ارزش — کنترل دقیق)، B (میانه)، C (اقلام فراوان کم‌ارزش — کنترل ساده). تمرکز انرژی مدیریت جایی است که پول جریان دارد.',
    source: 'Pareto-based inventory classification',
  },
  schedscore: {
    title: 'نمرهٔ اعتبار (CredibilityScore) چگونه ساخته می‌شود؟',
    body: 'از ۱۰۰ شروع می‌شود و جریمه‌ها کم می‌کنند: نقض سقف روزانه ‎−۳۰‎، سقف هفتگی ‎−۲۰‎، سقف ماهانه ‎−۱۵‎، پس‌روی پرداخت‌ها (تمرکز بدهی در نیمهٔ دوم پنجره) حداکثر ‎−۱۵‎، بیش از ۳ فقره چک ‎−۱۰‎، جابه‌جایی به‌خاطر تعطیل/جمعه ‎−۱۰‎ و ناهمواری فاصلهٔ چک‌ها حداکثر ‎−۵‎. گزینه‌ای که تاریخ‌ها را روی روزهای کاری می‌نشاند و بار روزانه را یکنواخت می‌کند، بالاترین اعتبار بازار را می‌گیرد.',
    source: 'مادهٔ ۳۱۵ قانون تجارت + bond-laddering در مدیریت خزانه',
  },
  paylimits: {
    title: 'چرا سقف هزینه‌کرد دوره‌ای؟',
    body: 'در تأمین مالی با چک، اعتبار یک دارایی نامشهود است: تجاوز از آستانهٔ پرداخت روزانه/هفتگی/ماهانه نزد تأمین‌کنندگان سیگنال فشار نقدی می‌فرستد و شرایط اعتباری را سخت می‌کند. سقف دوره‌ای مانند نرخ سوخت‌سوز (burn-rate cap) در مدیریت نقدینگی عمل می‌کند و مشاور پرداخت همین سقف‌ها را در رتبه‌بندی گزینه‌ها لحاظ می‌کند.',
    source: 'Working-capital & treasury management literature',
  },
}

export function sciEntry(key: string): SciEntry | undefined {
  return LIB[key]
}

/** دکمهٔ کوچک «؟» کنار هر محاسبه/دکمه — کلیک = توضیح علمی */
export function SciExplain({ k, className, side = 'top' }: { k: string; className?: string; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const e = LIB[k]
  if (!e) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`توضیح علمی: ${e.title}`}
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#c9a227]/50 bg-[#fdf6dd] text-[10px] font-black text-[#8a6d10] transition hover:bg-[#c9a227]/20',
            className
          )}
        >
          ؟
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} className="w-80 rounded-2xl border-[#c9a227]/40 bg-card p-4 shadow-xl">
        <p className="text-xs font-black text-[#0e7a4a]">🔬 {e.title}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{e.body}</p>
        {e.source && <p className="mt-2 border-t border-dashed border-border pt-2 text-[9px] font-bold text-[#8a6d10]" dir="ltr">📚 {e.source}</p>}
      </PopoverContent>
    </Popover>
  )
}
