/**
 * استودیوی دمو — تولید خودکار داده واقع‌گرایانه برای شرکت‌های نمایشی
 * هر پروفایل = یک کسب‌وکار واقعی فرضی با داده ۹۰ روزه: شعب، پرسنل، تأمین‌کننده،
 * کالا، سفارش، چک، ضایعات، فروش روزانه + KPI و مدل ROI مستند به پژوهش.
 * خروجی یک JSON خودکفاست و هیچ داده واقعی سامانه را آلوده نمی‌کند.
 */

export type DemoProfile = 'gourmet_chain' | 'hypermarket' | 'boutique' | 'neighborhood'

export const DEMO_PROFILES: Record<DemoProfile, { name: string; tag: string; desc: string; icon: string; scale: string }> = {
  gourmet_chain: {
    name: 'زنجیره گورمت «زیتون‌گلد»',
    tag: 'زنجیره لوکس گورمت',
    desc: 'سه شعبه لوکس در فرمانیه تهران، چهارباغ اصفهان و قصردشت شیراز — خوراک ممتاز، وارداتی، قهوه تخصصی و سوغات.',
    icon: '✨',
    scale: '۳ شعبه • ۲۴ پرسنل • ~۳۰۰ سطل فروش روزانه در هر شعبه',
  },
  hypermarket: {
    name: 'هایپر «زیتون بزرگ‌راه»',
    tag: 'هایپرمارکت بزرگ',
    desc: 'هایپرمارکت ۲٫۵ هزار متری کنار جاده با ۱۲ صندوق، بخش پروتئین کامل، پخت‌وپز و بوفه گرم.',
    icon: '🏬',
    scale: '۱ شعبه • ۴۸ پرسنل • ~۹۰۰ سطل فروش روزانه',
  },
  boutique: {
    name: 'بوتیک خوراک «زیتون کهن»',
    tag: 'فروشگاه بوتیک',
    desc: 'بوتیک تخصصی ادویه، روغن، خشکبار ممتاز و سوغات کرمان در قلب شهر — مشتریان وفادار و خریدهای کوچک‌تر اما پرحاشیه.',
    icon: '🫒',
    scale: '۱ شعبه • ۹ پرسنل • ~۱۸۰ سطل فروش روزانه',
  },
  neighborhood: {
    name: 'سوپرمارکت «زیتون محله سعدی»',
    tag: 'سوپرمارکت محله‌ای',
    desc: 'سوپرمارکت ۱۲۰ متری محله‌ای با مشتریان ثابت، سفارش تلفنی و تحویل درگاه — دقیقاً همان کسب‌وکاری که سامانه برایش ساخته شد.',
    icon: '🏪',
    scale: '۱ شعبه • ۵ پرسنل • ~۹۰ سطل فروش روزانه',
  },
}

const FIRST = ['علی', 'محمد', 'زهرا', 'فاطمه', 'رضا', 'حسین', 'مریم', 'سارا', 'امیر', 'مهدی', 'نگار', 'الهام', 'کاوه', 'آرش', 'شیرین', 'پریسا', 'یاسر', 'سعید', 'نازنین', 'بهنام']
const LAST = ['محمدی', 'حسینی', 'رضایی', 'کریمی', 'موسوی', 'صادقی', 'نوری', 'زمانی', 'ابراهیمی', 'شریفی', 'قنبری', 'بهرامی', 'جهانی', 'سلطانی', 'فرهنگ', 'امینی', 'خواجو', 'ویسی']

const GOURMET_PRODUCTS: [string, string, string, number, number][] = [
  // name, category, brand, buy, sell (تومان)
  ['روغن زیتون فرابکر رودبار ۵۰۰میل', 'خوراک ممتاز', 'زرین زیتون', 380000, 520000],
  ['زعفران سرگل قائنات ۴٫۶ گرم', 'خوراک ممتاز', 'زر جیرفت', 1150000, 1490000],
  ['پسته اکبری کرمان ۷۰۰گرم', 'خشکبار', 'باغ بهار', 1850000, 2290000],
  ['قهوه اسپرسو ترکیبی ۲۵۰گرم', 'قهوه تخصصی', 'برشته‌کار تهران', 420000, 595000],
  ['شکلات تلخ ۸۵٪ بلژیکی ۱۰۰گرم', 'خوراک ممتاز', 'کاکائو ارک', 145000, 218000],
  ['عسل کنار جنوب ۹۰۰گرم', 'خوراک ممتاز', 'نگین حیدری', 890000, 1240000],
  ['خاویار ممتاز ایران ۳۰گرم', 'خوراک ممتاز', 'دریای کاسپین', 3200000, 3950000],
  ['پنیر بلوچیز محلی ۲۰۰گرم', 'لبنیات ممتاز', 'دامداران آلفا', 380000, 520000],
  ['ماست سنتی دوقلو شیراز ۹۰۰گرم', 'لبنیات ممتاز', 'شیراز‌خانه', 165000, 239000],
  ['قارچ پورتوبلو بسته ۴۰۰گرم', 'تازه‌فروشی', 'کشت گلستان', 185000, 265000],
  ['آووکادو وارداتی عددی', 'تازه‌فروشی', 'گلبرگ واردات', 95000, 149000],
  ['میمون گلاکسی کیلویی', 'تازه‌فروشی', 'گلبرگ واردات', 320000, 455000],
  ['برنج هاشمی درجه یک ۵کیلویی', 'خواروبار', 'شالیزار گیل', 4800000, 5650000],
  ['روغن سرخ‌کردنی ۱۰لیتری', 'خواروبار', 'نبات‌گل', 1980000, 2290000],
  ['قند و شکر بسته ممتاز ۴کیلویی', 'خواروبار', 'شیرین‌دانه', 380000, 465000],
  ['چای سیاه ممتاز لاهیجان ۵۰۰گرم', 'خواروبار', 'باغ لاهیجان', 780000, 985000],
  ['رژیمی بیسکویت جو دوسر ۲۴۰گرم', 'تنقلات', 'تندرست‌غذا', 125000, 185000],
  ['پاپ‌کورن کره‌ای سینمایی ۱۵۰گرم', 'تنقلات', 'تندرست‌غذا', 85000, 128000],
  ['آجیل مخلوط ممتاز ۵۰۰گرم', 'خشکبار', 'باغ بهار', 1650000, 2050000],
  ['توت خشک درشت ۳۰۰گرم', 'خشکبار', 'باغ بهار', 390000, 520000],
  ['سس پستو ایتالیایی ۱۹۰گرم', 'خوراک ممتاز', 'واردات مدیترانه', 320000, 445000],
  ['پاستا دست‌ساز ۵۰۰گرم', 'خوراک ممتاز', 'واردات مدیترانه', 195000, 289000],
  ['سرکه بالزامیک ۲۵۰میل', 'خوراک ممتاز', 'واردات مدیترانه', 285000, 410000],
  ['دسر موس شکلات ۹۰گرمی', 'لبنیات ممتاز', 'کاکائو ارک', 58000, 89000],
  ['شیر کم‌چرب یک لیتری', 'لبنیات ممتاز', 'دامداران آلفا', 85000, 112000],
  ['کره حیوانی ۱۰۰گرمی', 'لبنیات ممتاز', 'دامداران آلفا', 145000, 198000],
  ['مغز گردو تازه ۵۰۰گرم', 'خشکبار', 'باغ بهار', 1150000, 1490000],
  ['زردآلو خشک نیشابور ۴۰۰گرم', 'خشکبار', 'باغ بهار', 420000, 565000],
  ['دمنوش گل گاوزبان ۱۰۰گرم', 'خوراک ممتاز', 'سبزدارو', 145000, 219000],
  ['ادویه پلویی ویژه ۱۲۰گرم', 'خوراک ممتاز', 'زارعطر', 98000, 156000],
  ['برگر دست‌ساز ۴عددی', 'پروتئین', 'یخچال پروتئین پارس', 420000, 565000],
  ['فیله مرغ تازه کیلویی', 'پروتئین', 'یخچال پروتئین پارس', 680000, 829000],
  ['استیک راسته گوسفندی ۵۰۰گرم', 'پروتئین', 'یخچال پروتئین پارس', 1850000, 2290000],
  ['میگو پاک‌شده ۷۰۰گرم', 'پروتئین', 'دریای کاسپین', 1450000, 1850000],
  ['نان تست سنگ‌سنگ ۴۰۰گرم', 'خواروبار', 'نان‌آوران', 98000, 139000],
  ['کلوچه محلی کرمان جعبه', 'تنقلات', 'کلوچه خواجو', 285000, 385000],
  ['گلاب ممتاز کاشان ۳۵۰میل', 'خوراک ممتاز', 'گلستان گلاب', 120000, 178000],
  ['آب معدنی بسته ۶عددی ۱٫۵لتر', 'نوشیدنی', 'چشمه کویر', 145000, 189000],
  ['نوشیدنی انرژی‌زا ۲۵۰میل', 'نوشیدنی', 'پرشین‌بار', 85000, 125000],
  ['آبمیوه طبیعی پرتقال ۱لیتر', 'نوشیدنی', 'باغباران', 165000, 229000],
]

const NEIGHBORHOOD_PRODUCTS: [string, string, string, number, number][] = [
  ['شیر پرچرب یک لیتری', 'لبنیات', 'لبنیات پگاه سبز', 92000, 118000],
  ['ماست دبه‌ای ۲ کیلویی', 'لبنیات', 'لبنیات پگاه سبز', 285000, 359000],
  ['پنیر لیقوان ۴۰۰گرم', 'لبنیات', 'لبنیات پگاه سبز', 320000, 415000],
  ['تخم‌مرغ شانه‌ای ۲۰عددی', 'پروتئین', 'مرغداران کویر', 385000, 468000],
  ['ران مرغ کیلویی', 'پروتئین', 'مرغداران کویر', 520000, 645000],
  ['سوسیس کوکتل ۵۰۰گرم', 'پروتئین', 'پروتئین پارس', 285000, 356000],
  ['برنج ایرانی ۱۰کیلویی', 'خواروبار', 'شالیزار گیل', 9200000, 10500000],
  ['روغن سرخ‌کردنی ۱۰لیتری', 'خواروبار', 'نبات‌گل', 1980000, 2290000],
  ['روغن آفتابگردان ۱٫۶لیتر', 'خواروبار', 'نبات‌گل', 385000, 458000],
  ['رب گوجه ۸۰۰گرمی', 'خواروبار', 'گوجه‌کاران خراسان', 220000, 285000],
  ['ماکارونی رشته‌ای ۷۰۰گرم', 'خواروبار', 'خوراک گستر', 95000, 129000],
  ['چای کیسه‌ای ۱۰۰عددی', 'خواروبار', 'باغ لاهیجان', 320000, 398000],
  ['شکر بسته ۴کیلویی', 'خواروبار', 'شیرین‌دانه', 365000, 429000],
  ['پیاز کیلویی', 'تازه‌فروشی', 'مزرعه سبز', 28000, 39000],
  ['سیب‌زمینی کیلویی', 'تازه‌فروشی', 'مزرعه سبز', 35000, 49000],
  ['گوجه کیلویی', 'تازه‌فروشی', 'مزرعه سبز', 42000, 59000],
  ['خیار کیلویی', 'تازه‌فروشی', 'مزرعه سبز', 38000, 52000],
  ['موز کیلویی', 'تازه‌فروشی', 'گلبرگ واردات', 185000, 239000],
  ['سیب قرمز کیلویی', 'تازه‌فروشی', 'باغ‌داران شمیران', 95000, 135000],
  ['پفک پنیری بزرگ', 'تنقلات', 'چیپس ماهان', 85000, 112000],
  ['چیپس نمکی خانواده', 'تنقلات', 'چیپس ماهان', 78000, 105000],
  ['بستنی لیوانی ۱۰۰میل', 'لبنیات', 'یخ کمان', 45000, 65000],
  ['دوغ محلی ۱٫۵لیتر', 'نوشیدنی', 'لبنیات پگاه سبز', 128000, 168000],
  ['نوشابه خانواده ۱٫۵لیتر', 'نوشیدنی', 'زرشکی‌نوش', 98000, 125000],
  ['آب معدنی ۱٫۵لیتر', 'نوشیدنی', 'چشمه کویر', 32000, 45000],
  ['شامپو بدن ۴۰۰میل', 'بهداشتی', 'پاک‌آسا', 185000, 239000],
  ['مایع ظرفشویی ۳٫۸لیتر', 'بهداشتی', 'پاک‌آسا', 320000, 389000],
  ['دستمال کاغذی ۳۰۰برگ', 'بهداشتی', 'نازگل', 98000, 128000],
  ['خمیردندان ۱۰۰میل', 'بهداشتی', 'بهارستان', 168000, 215000],
  ['صابون بسته ۴عددی', 'بهداشتی', 'پاک‌آسا', 145000, 185000],
  ['گوشت چرخ‌کرده کیلویی', 'پروتئین', 'یخچال پروتئین پارس', 1150000, 1380000],
  ['مرغ کامل کیلویی', 'پروتئین', 'مرغداران کویر', 495000, 615000],
  ['کشک ۴۰۰گرمی', 'خواروبار', 'لبنیات پگاه سبز', 145000, 189000],
  ['عسل طبیعی ۹۰۰گرم', 'خواروبار', 'نگین حیدری', 780000, 985000],
  ['کلوچه محلی کرمان جعبه', 'تنقلات', 'کلوچه خواجو', 285000, 385000],
  ['حبه قند ۹۰۰گرمی', 'خواروبار', 'شیرین‌دانه', 98000, 129000],
  ['برساقه و قطاب کرمان ۵۰۰گرم', 'تنقلات', 'شیرینی خواجو', 320000, 415000],
  ['تن ماهی ۱۸۰گرمی', 'خواروبار', 'دریای کاسپین', 185000, 239000],
  ['رب انار ۴۰۰گرمی', 'خواروبار', 'باغباران', 185000, 245000],
  ['عدس کیلویی', 'خواروبار', 'حبوبات طوس', 185000, 235000],
]

const PROVIDER_POOL = [
  ['پخش سراسری لبنیات پگاه سبز', 'لبنیات پگاه سبز', 'DISTRIBUTOR'],
  ['شرکت بازرگانی نبات‌گل', 'روغن نباتی نبات‌گل', 'DISTRIBUTOR'],
  ['بازرگانی شالیزار گیل', 'شالیزار گیل', 'DIRECT'],
  ['پخش بهداشتی پاک‌آسا', 'پاک‌آسا، نازگل', 'DISTRIBUTOR'],
  ['تازه‌فروشی مزرعه سبز', 'مزرعه سبز', 'VISITOR'],
  ['واردات گلبرگ', 'گلبرگ واردات', 'DIRECT'],
  ['پروتئین پارس', 'یخچال پروتئین پارس', 'DISTRIBUTOR'],
  ['خشکبار باغ بهار', 'باغ بهار', 'VISITOR'],
  ['قهوه برشته‌کار تهران', 'برشته‌کار تهران', 'DIRECT'],
  ['کلوچه و شیرینی خواجو کرمان', 'کلوچه خواجو', 'VISITOR'],
]

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function personName(rng: () => number): string {
  return `${pick(FIRST, rng)} ${pick(LAST, rng)}`
}

const BRANCH_PRESETS: Record<DemoProfile, { name: string; city: string; area: string; sizeM2: number }[]> = {
  gourmet_chain: [
    { name: 'شعبه فرمانیه', city: 'تهران', area: 'فرمانیه', sizeM2: 850 },
    { name: 'شعبه چهارباغ', city: 'اصفهان', area: 'چهارباغ بالا', sizeM2: 620 },
    { name: 'شعبه قصردشت', city: 'شیراز', area: 'قصردشت', sizeM2: 540 },
  ],
  hypermarket: [{ name: 'شعبه بزرگ‌راه', city: 'کرمان', area: 'بلوار امام خمینی', sizeM2: 2500 }],
  boutique: [{ name: 'شعبه مرکزی', city: 'کرمان', area: 'خیابان فردوسی', sizeM2: 140 }],
  neighborhood: [{ name: 'شعبه محله سعدی', city: 'کرمان', area: 'محله سعدی', sizeM2: 120 }],
}

const ROLES = ['مدیر شعبه', 'سرصندوقدار', 'صندوقدار', 'انباردار', 'مسئول چیدمان', 'فروشنده', 'تحویل‌دهنده']

export function generateDemoCompany(profile: DemoProfile, createdByName = 'سامانه') {
  const seed = profile.length * 7919 + Date.now() % 100000
  const rng = mulberry32(seed)
  const preset = DEMO_PROFILES[profile]
  const branches = BRANCH_PRESETS[profile]

  const catalog = profile === 'neighborhood' ? NEIGHBORHOOD_PRODUCTS : GOURMET_PRODUCTS
  const catalogScale = profile === 'hypermarket' ? 3 : profile === 'gourmet_chain' ? 2 : 1
  // هایپرمارکت: کاتالوگ را ۳ برابر کن (تنوع رنگ/وزن) تا واقعی‌تر شود
  const products: { id: string; name: string; category: string; brand: string; unit: string; buyPrice: number; sellPrice: number; stock: number }[] = []
  for (let rep = 0; rep < catalogScale; rep++) {
    for (const [name, category, brand, buy, sell] of catalog) {
      const suffix = rep === 0 ? '' : rep === 1 ? ' — بسته دوم' : ' — سایز فامیلی'
      products.push({
        id: `p${rep}_${products.length}`,
        name: `${name}${suffix}`,
        category,
        brand,
        unit: rep === 2 ? 'بسته' : 'عدد',
        buyPrice: Math.round(buy * (rep === 2 ? 1.7 : 1)),
        sellPrice: Math.round(sell * (rep === 2 ? 1.7 : 1)),
        stock: 8 + Math.floor(rng() * 60),
      })
    }
  }

  const providers = PROVIDER_POOL.slice(0, profile === 'neighborhood' ? 7 : PROVIDER_POOL.length).map((p, i) => ({
    id: `prov${i}`,
    name: p[0],
    company: p[1],
    type: p[2],
    personName: personName(rng),
    phone: `0913${1000000 + Math.floor(rng() * 8999999)}`,
  }))

  const staffPerBranch = profile === 'hypermarket' ? 16 : profile === 'gourmet_chain' ? 8 : profile === 'boutique' ? 9 : 5
  const staff: { id: string; name: string; role: string; branch: string; color: string }[] = []
  const COLORS = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#8a6d10', '#5c7a99', '#94502c']
  branches.forEach((b, bi) => {
    for (let i = 0; i < staffPerBranch; i++) {
      staff.push({
        id: `st${bi}_${i}`,
        name: personName(rng),
        role: ROLES[i % ROLES.length],
        branch: b.name,
        color: COLORS[(bi * 5 + i) % COLORS.length],
      })
    }
  })

  // ── ۹۰ روز سفارش، چک، ضایعات و فروش
  const orders: any[] = []
  const cheques: any[] = []
  const waste: any[] = []
  const salesSeries: { date: string; value: number }[] = []
  const ORDER_FLOW = ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED', 'ACCOUNTED', 'DONE']
  const baseDailySales = profile === 'hypermarket' ? 620000000 : profile === 'gourmet_chain' ? 190000000 : profile === 'boutique' ? 55000000 : 28000000
  const ordersPerDay = profile === 'hypermarket' ? 5 : profile === 'gourmet_chain' ? 2.2 : 1.2

  let orderNo = 1400
  for (let d = 90; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000)
    const iso = date.toISOString().slice(0, 10)
    // فروش روزانه با نوسان + رشد ملایم تورمی
    const dayFactor = 1 + 0.18 * Math.sin((90 - d) / 9) + (90 - d) * 0.0016 + (rng() - 0.5) * 0.24
    const weekly = [4, 5].includes(date.getDay()) ? 1.22 : 1 // پنجشنبه/جمعه
    salesSeries.push({ date: iso, value: Math.round(baseDailySales * dayFactor * weekly * branches.length) })

    // سفارش‌های روز
    let n = Math.floor(ordersPerDay)
    if (rng() < ordersPerDay - n) n++
    for (let k = 0; k < n; k++) {
      const branch = pick(branches, rng)
      const provider = pick(providers, rng)
      const status = d > 2 ? pick(ORDER_FLOW, rng) : pick(['SUBMITTED', 'APPROVED', 'RECEIVING'], rng)
      const itemCount = 6 + Math.floor(rng() * (profile === 'hypermarket' ? 26 : 14))
      const chosen = new Set<string>()
      const items: any[] = []
      let total = 0
      for (let j = 0; j < itemCount; j++) {
        const p = pick(products, rng)
        if (chosen.has(p.id)) continue
        chosen.add(p.id)
        const qty = 2 + Math.floor(rng() * (profile === 'hypermarket' ? 24 : 10))
        total += qty * p.buyPrice
        items.push({
          productId: p.id, productName: p.name, qty, unitBuyPrice: p.buyPrice, printedPrice: p.sellPrice,
          receivedQty: rng() < 0.9 ? qty : qty - 1, status: 'RECEIVED', expiryDate: rng() < 0.3 ? new Date(Date.now() + (7 + rng() * 60) * 86400000).toISOString().slice(0, 10) : '',
        })
      }
      const order = {
        code: `DMO-${1400 + orderNo}`,
        branch: branch.name,
        providerName: provider.name,
        status,
        date: iso,
        payMethod: rng() < 0.55 ? 'CHEQUE' : 'CASH',
        totalAmount: total,
        items,
        marginPct: +(18 + rng() * 14).toFixed(1),
      }
      orderNo++
      orders.push(order)
      if (order.payMethod === 'CHEQUE' && ['DONE', 'ACCOUNTED', 'VERIFIED'].includes(order.status)) {
        const due = new Date(date.getTime() + (30 + Math.floor(rng() * 30)) * 86400000)
        cheques.push({
          number: String(900000 + Math.floor(rng() * 99999)),
          orderCode: order.code,
          amount: Math.round(total),
          recipientName: provider.name,
          writtenAt: iso,
          dueDate: due.toISOString().slice(0, 10),
          status: due.getTime() < Date.now() ? 'CLEARED' : pick(['PENDING_OWNER', 'SIGNED', 'DELIVERED'], rng),
        })
      }
    }

    // ضایعات روز (نرخ واقعی: ۴٪ گوشت تا ۱۱٪ لبنیات از فروش)
    if (rng() < 0.5) {
      const p = pick(products, rng)
      waste.push({
        productName: p.name,
        category: p.category,
        qty: 1 + Math.floor(rng() * 4),
        unit: p.unit,
        reason: pick(['EXPIRED', 'DAMAGED', 'SPOILED', 'THEFT'], rng),
        estValue: Math.round(p.buyPrice * (1 + rng() * 3)),
        forDate: iso,
      })
    }
  }

  // ── KPI و ROI (پایه علمی از پژوهش‌نامه: shrinkage 1.36-1.48%، OOS 8.3%، خطای ورود دستی ۱-۴٪)
  // CAPTURE = سهم واقع‌بینانه‌ای از صرفه‌جویی نظری که نرم‌افزار به تنهایی جذب می‌کند (بقیه نیازمند فرایند و مردم)
  const CAPTURE = 0.12
  const revenue90 = salesSeries.reduce((a, s) => a + s.value, 0)
  const hoursPerDayManual = profile === 'hypermarket' ? 9 : profile === 'gourmet_chain' ? 7 : 5.5 // سه نفر در طول روز
  const hoursPerDayDigital = 1.2
  const wagePerHour = 85000
  const shrinkBefore = 0.0148
  const shrinkAfter = 0.0089
  const wasteBefore = 0.065
  const wasteAfter = 0.045
  const oosBefore = 8.3
  const oosAfter = 3.1

  const monthly = {
    hoursSaved: +(hoursPerDayManual - hoursPerDayDigital) * 30,
    laborValueSaved: Math.round((hoursPerDayManual - hoursPerDayDigital) * 30 * wagePerHour),
    shrinkSaved: Math.round((revenue90 * (shrinkBefore - shrinkAfter)) / 3 * CAPTURE),
    wasteSaved: Math.round((revenue90 * (wasteBefore - wasteAfter)) / 3 * CAPTURE),
    stockoutRecovered: Math.round((revenue90 * ((oosBefore - oosAfter) / 100) * 0.35) / 3 * CAPTURE), // ۳۵٪ کمبود = فروش ازدست‌رفته
  }
  // هزینه ماهانه متناسب با مقیاس (زنجیره‌ای/هایپرمارکت = پلن سازمانی)
  const platformFee = profile === 'gourmet_chain' ? 45000000 : profile === 'hypermarket' ? 25000000 : profile === 'boutique' ? 4500000 : 2200000 // ماهانه تومان
  const monthlyBenefit = monthly.laborValueSaved + monthly.shrinkSaved + monthly.wasteSaved + monthly.stockoutRecovered
  const roi = {
    platformFee,
    monthly,
    monthlyBenefit,
    roiPct: +(((monthlyBenefit - platformFee) / platformFee) * 100).toFixed(0),
    paybackDays: Math.max(1, Math.round((platformFee / monthlyBenefit) * 30)),
    assumptions: [
      'مدل با ضریب جذب واقع‌بینانه ۱۲٪ محاسبه شده است — فقط بخشی از صرفه‌جویی نظری به نرم‌افزار نسبت داده می‌شود، باقی به فرایند و مردم',
      'صرفه‌جویی نیروی انسانی مبتنی بر مطالعات زمان‌سنجی: ثبت دستی سفارش ۲۰ مرسوله ≈ ۳ نفر در طول روز (تایم‌موشن)',
      'کسری موجودی: GRTB 1.36–1.48٪ فروش؛ سامانه با شمارش چرخه‌ای و FEFO بخش قابل‌پیشگیری ۷۳٪ را هدف می‌گیرد',
      'ضایعات: Buzby 2014 (۴٪ گوشت تا ۱۱٪ لبنیات)؛ FEFO تا ۳۵٪ کاهش (RELEX)',
      'کمبود قفسه: ۸٫۳٪ جهانی (Gruen & Corsten 2002)؛ ۷۲–۹۱٪ علل = فرایند سفارش/مکمل‌سازی فروشگاه',
      'خطای ورود داده دستی ۱–۴٪ فیلدها در برابر بارکد ~۱ خطا در ۷۰ میلیون نویسه',
    ],
  }

  // ── روایت «یک روز با سامانه»
  const story = [
    { time: '۰۶:۳۰', title: 'صبح‌نامه خودکار', detail: 'مدیر شعبه صبح‌نامه امروز را می‌بیند: موجودی بحرانی، چک‌های امروز، وظایف — بدون یک تماس تلفنی.', feature: 'صبح‌نامه امروز' },
    { time: '۰۸:۰۰', title: 'ثبت سفارش با بارکد', detail: 'مسئول خرید با اسکن بارکد سفارش می‌زند؛ خطای ورود دستی از ۱–۴٪ فیلد به نزدیک صفر می‌رسد.', feature: 'سفارش‌ها' },
    { time: '۱۰:۳۰', title: 'دریافت مرسوله', detail: 'مرسوله تأمین‌کننده با اسکن کنترل می‌شود؛ تاریخ انقضا هر قلم ثبت و هشدار FEFO فعال می‌شود.', feature: 'دریافت مرسوله' },
    { time: '۱۲:۰۰', title: 'نگهبان حاشیه سود', detail: 'قیمت چاپی با قیمت سفارش سنجیده می‌شود؛ در محیط تورمی ایران هر اختلاف فوری قرمز می‌شود.', feature: 'کنترل قیمت روزانه' },
    { time: '۱۵:۰۰', title: 'شمارش چرخه‌ای دسته A', detail: 'بر اساس تحلیل ABC، فقط اقلام گران‌بها شمارش می‌شوند؛ دقت سوابق بالای ۹۵٪ حفظ می‌ماند.', feature: 'جعبه‌ابزار علمی' },
    { time: '۱۷:۳۰', title: 'چک‌های فردا + نگهبان تعطیلات', detail: 'چک‌های نزدیک به سررسید خودکار به مالک اطلاع داده می‌شود؛ اگر سررسید روی تعطیلی بیفتد، به آخرین روز کاری منتقل می‌شود.', feature: 'چک‌ها و پرداخت‌ها' },
  ]

  // وظایف نمونه
  const tasks = [
    { title: 'چیدمان پلانوگرام قفسه قهوه تخصصی', assignedTo: pick(staff, rng).name, status: 'OPEN', priority: 'HIGH', points: 25 },
    { title: 'شمارش چرخه‌ای دسته خشکبار', assignedTo: pick(staff, rng).name, status: 'IN_PROGRESS', priority: 'NORMAL', points: 15 },
    { title: 'حذف اقلام تاریخ‌گذشته طبق لیست FEFO', assignedTo: pick(staff, rng).name, status: 'OPEN', priority: 'URGENT', points: 20 },
    { title: 'جمع‌آوری سبد پیشنهادی پایان هفته', assignedTo: pick(staff, rng).name, status: 'DONE', priority: 'NORMAL', points: 10 },
    { title: 'آموزش صندوقدار جدید — SOP پذیرش', assignedTo: pick(staff, rng).name, status: 'IN_PROGRESS', priority: 'NORMAL', points: 15 },
  ]

  const categories = [...new Set(products.map((p) => p.category))]
  const topProducts = [...products]
    .map((p) => ({ name: p.name, sold: Math.round(rng() * 90 + 10), revenue: Math.round(p.sellPrice * (rng() * 90 + 10)) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const branchStats = branches.map((b) => ({
    ...b,
    staff: staff.filter((s) => s.branch === b.name).length,
    revenue: Math.round(revenue90 / branches.length * (0.85 + rng() * 0.3)),
    orders: Math.round(orders.length / branches.length * (0.8 + rng() * 0.4)),
    margin: +(19 + rng() * 12).toFixed(1),
    shrink: +(0.7 + rng() * 1.1).toFixed(2),
  }))

  return {
    profile,
    profileName: preset.name,
    tag: preset.tag,
    desc: preset.desc,
    icon: preset.icon,
    scale: preset.scale,
    branches: branchStats,
    staff,
    providers,
    productsCount: products.length,
    categories,
    orders,
    cheques,
    waste,
    salesSeries,
    tasks,
    topProducts,
    kpis: {
      revenue90,
      ordersCount: orders.length,
      avgMargin: +(orders.reduce((a, o) => a + o.marginPct, 0) / Math.max(1, orders.length)).toFixed(1),
      chequeCount: cheques.length,
      chequeValue: cheques.reduce((a, c) => a + c.amount, 0),
      wasteCount: waste.length,
      wasteValue: waste.reduce((a, w) => a + w.estValue, 0),
      shrinkPct: +((waste.reduce((a, w) => a + w.estValue, 0) / Math.max(1, revenue90)) * 100).toFixed(2),
      staffCount: staff.length,
    },
    roi,
    story,
    generatedAt: new Date().toISOString(),
    generatedBy: createdByName,
  }
}
