/* E2E tour runner — injected into the LIVE app (:3000). Runs the 11 tours
   (updated definitions from guide.tsx R4) through the FIXED mountTour engine
   and records per-step geometry: dim on, ring found, card visible, card does
   not cover target. Exposes window.__TOUR_RESULTS + window.__tourRun. */
;(function () {
  const tours = {
    welcome: [
      { title: 'به سر رسید خوش آمدید! 🫒', body: 'این یک تور کوتاه است.' },
      { target: '[data-tour="rail"]', title: 'بخش‌های اصلی سامانه', body: 'نوار عمودی' },
      { target: '[data-tour="sidebar"]', title: 'صفحات هر بخش', body: 'نوار کناری' },
      { target: '[data-tour="bell"]', title: 'زنگ اعلان‌ها', body: 'اعلان‌ها' },
      { target: '[data-tour="search"]', title: 'جست‌وجوی سریع', body: 'پالت' },
      { target: '[data-tour="user"]', title: 'حساب کاربری', body: 'پروفایل' },
      { title: 'آماده‌اید! 🎉', body: 'پایان' },
    ],
    orders: [
      { go: 'supply/orders', target: '[data-tour="sidebar"]', title: 'به بخش انبار و سفارش خوش آمدید', body: 'x' },
      { target: 'input[placeholder*="طرف حساب"]', title: 'طرف حساب (تأمین‌کننده)', body: 'x' },
      { target: 'input[placeholder*="نام کالا"]', title: 'جست‌وجوی سریع کالا', body: 'x' },
      { title: 'جدول نتایج و افزودن به سبد', body: 'x' },
      { title: 'سبد و ثبت نهایی', body: 'x' },
    ],
    returns: [
      { go: 'returns/new', target: '[data-tour="sidebar"]', title: 'به بخش مرجوعی خوش آمدید', body: 'x' },
      { target: 'input[placeholder*="09123456789"]', title: 'انتخاب مشتری و اقلام', body: 'x' },
      { target: 'input[placeholder*="6037"]', title: 'تشخیص بانک از روی شماره کارت', body: 'x' },
      { title: 'چاپ رسید حرارتی', body: 'x' },
      { title: 'سابقهٔ مشتری', body: 'x' },
    ],
    profit: [
      { go: 'profit/builder', target: '[data-tour="sidebar"]', title: 'به بخش سودسنج خوش آمدید', body: 'x' },
      { target: 'input[placeholder*="تأمین‌کننده"]', title: 'فاکتور خرید', body: 'x' },
      { title: 'گیج سود و هشدارها', body: 'x' },
      { title: 'ذخیره و تاریخچه', body: 'x' },
    ],
    finance: [
      { go: 'finance/cheques', target: '[data-tour="sidebar"]', title: 'به بخش مالی خوش آمدید', body: 'x' },
      { target: '[role="tablist"]', title: 'لیست چک‌ها', body: 'x' },
      { target: '[role="tab"]:nth-child(2)', title: 'محاسبه‌گر ۴۵ روزه', body: 'x' },
      { target: '[role="tab"]:nth-child(3)', title: 'تقویم پرداخت', body: 'x' },
      { title: 'ثبت چک جدید', body: 'x' },
    ],
    tasks: [
      { go: 'tasks/tasks', target: '[data-tour="sidebar"]', title: 'به بخش وظایف خوش آمدید', body: 'x' },
      { target: '[role="tab"]:nth-child(1)', title: 'وظایف من', body: 'x' },
      { target: '[role="tab"]:nth-child(3)', title: 'ارسال دستور (مدیران)', body: 'x' },
      { title: 'چک‌لیست‌های امروز', body: 'x' },
      { title: 'بررسی تیم', body: 'x' },
    ],
    store: [
      { go: 'store/liveboard', target: '[data-tour="sidebar"]', title: 'به بخش فروشگاه خوش آمدید', body: 'x' },
      { target: 'div[class*="min-w-[640px]"]', title: 'نقشهٔ زنده', body: 'x' },
      { title: 'ارزیابی چیدمان', body: 'x' },
      { title: 'انبارگردانی', body: 'x' },
      { title: 'نقشهٔ فروشگاه', body: 'x' },
    ],
    supply: [
      { go: 'supply/products', target: '[data-tour="sidebar"]', title: 'به بخش انبار خوش آمدید', body: 'x' },
      { target: 'input[placeholder*="نام کالا یا بارکد"]', title: 'کالاها و بانک بارکد', body: 'x' },
      { title: 'سفارش‌گذاری', body: 'x' },
      { title: 'دریافت کالا', body: 'x' },
    ],
    hr: [
      { go: 'hr/performance', target: '[data-tour="sidebar"]', title: 'به بخش کارکنان خوش آمدید', body: 'x' },
      { target: '[role="tablist"]', title: 'کارنامهٔ عملکرد', body: 'x' },
      { title: 'پروندهٔ پرسنل', body: 'x' },
      { title: 'شیفت‌ها و گزارش تحویل', body: 'x' },
      { title: 'حقوق و دستمزد', body: 'x' },
    ],
    reports: [
      { go: 'reports/briefing', target: '[data-tour="sidebar"]', title: 'به بخش گزارش‌ها خوش آمدید', body: 'x' },
      { target: 'main h1', title: 'صبح‌نامه', body: 'x' },
      { title: 'نمای کلی عملکرد', body: 'x' },
      { title: 'خروجی‌ها', body: 'x' },
    ],
    system: [
      { go: 'system/users', target: '[data-tour="sidebar"]', title: 'به بخش سیستم خوش آمدید', body: 'x' },
      { target: 'input[placeholder*="جستجوی نام"]', title: 'کاربران و دسترسی‌ها', body: 'x' },
      { title: 'تنظیمات فروشگاه', body: 'x' },
      { title: 'اتصال هلو', body: 'x' },
      { title: 'فعالیت‌ها', body: 'x' },
    ],
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  function snapshotStep() {
    const d = document.querySelector('body > div[role=dialog]')
    if (!d) return { dialog: false }
    const dims = Array.from(d.querySelectorAll(':scope > div')).slice(0, 4).map((c) => ({ w: c.offsetWidth, h: c.offsetHeight }))
    const ring = d.querySelector('.rounded-xl')
    const ringR = ring.getBoundingClientRect()
    const card = d.querySelector('div.absolute.rounded-2xl')
    const cr = card.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const dimOn = dims.some((x) => x.w > 0 && x.h > 0)
    const ringVis = ring.style.display === 'block' && ringR.width > 0 && ringR.top < vh && ringR.bottom > 0
    const cardVis = cr.top >= 0 && cr.left >= 0 && cr.bottom <= vh && cr.right <= vw
    const cover = !(cr.right < ringR.left || cr.left > ringR.right || cr.bottom < ringR.top || cr.top > ringR.bottom)
    const prev = Array.from(d.querySelectorAll('button')).find((x) => x.textContent.indexOf('قبلی') > -1)
    return {
      dialog: true, dimOn, ringVis, cardVis, cardCoversTarget: cover,
      prevTextOK: prev ? prev.textContent.trim() === 'قبلی' : true,
      zi: d.style.zIndex,
      stepTitle: d.querySelector('h3') ? d.querySelector('h3').textContent : '',
    }
  }

  async function runTour(name, steps) {
    const out = { name, steps: [], pass: true }
    let done = false, closed = false
    const h = window.__mountTour(steps, {
      goFn: (r) => { location.hash = '#/' + r },
      onClose: () => { closed = true },
      onDone: () => { done = true },
    })
    for (let i = 0; i < steps.length; i++) {
      await sleep(1600)
      const snap = snapshotStep()
      const expectTarget = !!steps[i].target
      const ok = snap.dialog && snap.dimOn && snap.cardVis && snap.prevTextOK && (expectTarget ? snap.ringVis : true) && (!expectTarget || !snap.cardCoversTarget)
      out.steps.push({ i, title: steps[i].title, expectTarget, dimOn: snap.dimOn, ringVis: snap.ringVis, cardVis: snap.cardVis, cover: snap.cardCoversTarget, prevOK: snap.prevTextOK, ok })
      if (!ok) out.pass = false
      if (i < steps.length - 1) {
        const d = document.querySelector('body > div[role=dialog]')
        const btn = d && Array.from(d.querySelectorAll('button')).find((x) => x.textContent.indexOf('بعدی') > -1)
        if (!btn) { out.pass = false; out.steps.push({ i, error: 'next button missing' }); break }
        btn.click()
      }
    }
    /* کلیک دکمهٔ پایانی («شروع کار») */
    const d2 = document.querySelector('body > div[role=dialog]')
    const fin = d2 && Array.from(d2.querySelectorAll('button')).find((x) => x.textContent.indexOf('شروع کار') > -1 || x.textContent.indexOf('بعدی') > -1)
    if (fin) fin.click()
    await sleep(400)
    if (!done && !closed) out.pass = false
    out.finished = done || closed
    h.destroy()
    await sleep(150)
    return out
  }

  window.__tourRun = async function (names) {
    const results = []
    for (const n of names) {
      if (!tours[n]) { results.push({ name: n, error: 'unknown tour' }); continue }
      try { results.push(await runTour(n, tours[n])) }
      catch (e) { results.push({ name: n, error: String((e && e.message) || e) }) }
    }
    window.__TOUR_RESULTS = results
    return results
  }
  window.__tourNames = Object.keys(tours)
  console.log('[tour-runner] ready:', window.__tourNames.join(', '))
})()
