import {
  useState, useEffect, api, useShell, toast, cn,
  Button, Input, Card, CardContent, CardHeader, CardTitle, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  fa, toEnDigits, toFaDigits, I,
} from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════
   home/account — «حساب و شخصی‌سازی من» (تنظیمات شخصی هر کاربر)
   نمایه + تغییر رمز عبور + تغییر رمز چهاررقمی + شخصی‌سازی میزکار
   ═══════════════════════════════════════════════════════════════ */

const HONORIFICS = ['آقای', 'خانم', 'دکتر', 'مهندس']

const AVATAR_EMOJIS = ['👤', '🫒', '🧑‍💼', '👩‍💼', '🧕', '👨‍🌾', '🛒', '📦', '💰', '👑', '🔧', '📈']
const AVATAR_COLORS = ['#78716c', '#0e7a4a', '#0f766e', '#b45309', '#be185d', '#7c3aed', '#166534', '#9f1239']

interface AvatarData { emoji: string; color: string }

function parseAvatar(json: any): AvatarData {
  try {
    const a = json ? JSON.parse(json) : null
    if (a && a.emoji) return { emoji: String(a.emoji), color: String(a.color || '') }
  } catch { /* بدشکل — پیش‌فرض */ }
  return { emoji: '', color: '' }
}

function AvatarPreview({ avatar, big }: { avatar: AvatarData; big?: boolean }) {
  if (!avatar.emoji) {
    return (
      <div className={cn('flex items-center justify-center rounded-full bg-stone-100', big ? 'size-16' : 'size-12')}>
        <I.user size={big ? 26 : 20} className="text-stone-400" />
      </div>
    )
  }
  return (
    <div className={cn('flex items-center justify-center rounded-full', big ? 'size-16 text-3xl' : 'size-12 text-2xl')}
      style={{ backgroundColor: avatar.color || '#f5f5f4' }}>
      <span>{avatar.emoji}</span>
    </div>
  )
}

export default function AccountView() {
  const { user, go, refreshBadges } = useShell()

  /* نمایه */
  const [prof, setProf] = useState({ fullName: '', honorific: '', title: '', phone: '', mobile: '', address: '', postalCode: '' })
  const [avatar, setAvatar] = useState<AvatarData>({ emoji: '', color: '' })
  const [avatarTouched, setAvatarTouched] = useState(false)
  const [savingProf, setSavingProf] = useState(false)

  /* رمز عبور */
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)

  /* رمز چهاررقمی */
  const [pin, setPin] = useState({ current: '', next: '' })
  const [savingPin, setSavingPin] = useState(false)

  const [initedFor, setInitedFor] = useState('')

  useEffect(() => {
    // فقط با تغییر کاربر (نه هر رفرش کانتکست پوسته) فرم از نو مقدار می‌گیرد
    if (!user || initedFor === user.id) return
    setInitedFor(user.id)
    setProf({
      fullName: String(user.fullName || ''),
      honorific: String(user.honorific || ''),
      title: String(user.title || ''),
      phone: String(user.phone || ''),
      mobile: String(user.mobile || ''),
      address: String(user.address || ''),
      postalCode: String(user.postalCode || ''),
    })
    setAvatar(parseAvatar(user.avatarJson))
    setAvatarTouched(false)
  }, [user, initedFor])

  /* ── ذخیرهٔ نمایه ── */
  async function saveProfile() {
    if (prof.fullName.trim().length < 2) return toast.error('نام کامل را وارد کنید')
    const mob = toEnDigits(prof.mobile).replace(/\D/g, '')
    if (mob && !/^09\d{9}$/.test(mob)) return toast.error('موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد (مثلاً ۰۹۱۲۳۴۵۶۷۸۹)')
    const pc = toEnDigits(prof.postalCode).replace(/\D/g, '')
    if (pc && !(/^\d{10}$/.test(pc) && !pc.startsWith('0') && !/^(\d)\1{9}$/.test(pc))) {
      return toast.error('کد پستی معتبر نیست — ۱۰ رقم، شروع با رقم غیر صفر، بدون تکرار کامل')
    }
    const body: any = {
      fullName: prof.fullName.trim(),
      honorific: prof.honorific,
      title: prof.title,
      phone: prof.phone,
      mobile: prof.mobile,
      address: prof.address,
      postalCode: prof.postalCode,
    }
    if (avatarTouched) body.avatarJson = avatar.emoji ? JSON.stringify({ emoji: avatar.emoji, color: avatar.color || '#78716c' }) : ''
    setSavingProf(true)
    const r = await api('/api/me/profile', { method: 'PATCH', body })
    setSavingProf(false)
    if (!r.ok) return toast.error(r.error || 'خطا در ذخیرهٔ نمایه')
    setAvatarTouched(false)
    toast.success('نمایهٔ شما ذخیره شد')
    refreshBadges?.()
  }

  /* ── تغییر رمز عبور ── */
  async function changePassword() {
    if (!pw.current) return toast.error('رمز فعلی را وارد کنید')
    if (pw.next.length < 6) return toast.error('رمز جدید باید حداقل ۶ نویسه باشد')
    if (pw.next !== pw.confirm) return toast.error('تکرار رمز جدید یکسان نیست')
    setSavingPw(true)
    const r = await api('/api/me/password', { method: 'POST', body: { current: pw.current, next: pw.next } })
    setSavingPw(false)
    if (!r.ok) return toast.error(r.error || 'خطا در تغییر رمز عبور')
    setPw({ current: '', next: '', confirm: '' })
    toast.success('رمز عبور شما تغییر کرد')
  }

  /* ── تغییر رمز چهاررقمی ── */
  async function changePin() {
    if (!pin.current) return toast.error('رمز فعلی را وارد کنید')
    const next = toEnDigits(pin.next).replace(/\D/g, '')
    if (!/^\d{4}$/.test(next)) return toast.error('رمز چهاررقمی جدید باید دقیقاً ۴ رقم باشد')
    setSavingPin(true)
    const r = await api('/api/me/pin', { method: 'POST', body: { current: pin.current, next } })
    setSavingPin(false)
    if (!r.ok) return toast.error(r.error || 'خطا در تغییر رمز چهاررقمی')
    setPin({ current: '', next: '' })
    toast.success('رمز چهاررقمی شما تغییر کرد')
  }

  const pinDigits = toEnDigits(pin.next).replace(/\D/g, '').slice(0, 4).split('')

  return (
    <div className="space-y-4">

      {/* ═══ سرآیند ═══ */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <AvatarPreview avatar={avatar} big />
          <div>
            <div className="text-base font-extrabold">
              {user?.honorific ? `${user.honorific} ` : ''}{user?.fullName || 'کاربر مهمان'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span dir="ltr" className="rounded-full bg-stone-100 px-2.5 py-0.5 font-mono text-[11px] text-stone-600">{user?.username || '—'}</span>
              {user?.roleLabel && <Badge className="text-[11px]">{user.roleLabel}</Badge>}
              {typeof user?.points === 'number' && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] text-emerald-700">{fa(user.points)} امتیاز</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* ═══ نمایهٔ من ═══ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><I.penLine size={17} /> نمایهٔ من</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <AvatarPreview avatar={avatar} />
              <div className="min-w-0 grow">
                <div className="mb-1.5 text-[11px] font-medium text-stone-600">تصویر نمایه (اختیاری)</div>
                <div className="flex flex-wrap items-center gap-1">
                  {AVATAR_EMOJIS.map((e) => (
                    <button key={e} type="button" title="انتخاب تصویر"
                      onClick={() => { setAvatar({ ...avatar, emoji: e }); setAvatarTouched(true) }}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-lg border text-sm transition-colors',
                        avatar.emoji === e ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-white hover:bg-stone-100',
                      )}>
                      {e}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {AVATAR_COLORS.map((c) => (
                    <button key={c} type="button" title="رنگ پس‌زمینه"
                      onClick={() => { setAvatar({ ...avatar, color: c }); setAvatarTouched(true) }}
                      className={cn('size-5 rounded-full border-2', avatar.color === c ? 'border-emerald-600' : 'border-white')}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">نام کامل</label>
                <Input value={prof.fullName} onChange={(e: any) => setProf({ ...prof, fullName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">عنوان احترامی</label>
                <Select value={prof.honorific || 'none'} onValueChange={(v: string) => setProf({ ...prof, honorific: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HONORIFICS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    <SelectItem value="none">بدون عنوان</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">عنوان شغلی</label>
                <Input value={prof.title} onChange={(e: any) => setProf({ ...prof, title: e.target.value })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">شماره تماس</label>
                <Input dir="ltr" inputMode="tel" value={prof.phone} onChange={(e: any) => setProf({ ...prof, phone: e.target.value })}
                  placeholder="۰۲۱… یا ۰۹۱۲…" />
              </div>
              <div className="space-y-1 sm:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <label className="text-xs font-bold text-emerald-800">موبایل دریافت پیامک‌های کاری (ترجیحی)</label>
                <Input dir="ltr" inputMode="numeric" className="bg-white" value={prof.mobile} onChange={(e: any) => setProf({ ...prof, mobile: e.target.value })}
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹" />
                <p className="text-[10px] leading-4 text-emerald-700">باید با ۰۹ شروع شود و ۱۱ رقم باشد — هشدارهای کم‌موجودی، تأیید پرداخت و اطلاع‌رسانی‌های کاری به این شماره ارسال می‌شود.</p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">نشانی</label>
                <Input value={prof.address} onChange={(e: any) => setProf({ ...prof, address: e.target.value })}
                  placeholder="نشانی محل سکونت" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">کد پستی</label>
                <Input dir="ltr" inputMode="numeric" value={prof.postalCode} onChange={(e: any) => setProf({ ...prof, postalCode: e.target.value })}
                  placeholder="۱۰ رقم، مثلاً ۵۱۷۳۶۶۴۴۵۱" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void saveProfile()} disabled={savingProf}>
                {savingProf ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیرهٔ نمایه
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ═══ تغییر رمز عبور ═══ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><I.keyRound size={17} /> تغییر رمز عبور</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
              <I.info size={15} className="mt-0.5 shrink-0 text-stone-500" />
              <p className="text-[11px] leading-5 text-stone-600">
                رمز فعلی می‌تواند رمز عبور یا PIN شما باشد (برای مدیران فقط رمز عبور).
                رمز جدید باید حداقل ۶ نویسه باشد.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">رمز فعلی</label>
              <Input dir="ltr" type="password" value={pw.current} onChange={(e: any) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">رمز جدید</label>
                <Input dir="ltr" type="password" value={pw.next} onChange={(e: any) => setPw({ ...pw, next: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">تکرار رمز جدید</label>
                <Input dir="ltr" type="password" value={pw.confirm} onChange={(e: any) => setPw({ ...pw, confirm: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void changePassword()} disabled={savingPw || !pw.current || !pw.next || !pw.confirm}>
                {savingPw ? <I.loader size={15} className="animate-spin" /> : <I.lock size={15} />} تغییر رمز عبور
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ═══ تغییر رمز چهاررقمی ═══ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><I.keyboard size={17} /> تغییر رمز چهاررقمی (PIN)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
              <I.info size={15} className="mt-0.5 shrink-0 text-stone-500" />
              <p className="text-[11px] leading-5 text-stone-600">
                رمز چهاررقمی برای ورود سریع صندوق است. رمز فعلی می‌تواند PIN یا رمز عبور شما باشد؛
                PIN جدید دقیقاً ۴ رقم است.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2" dir="ltr">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}
                  className={cn(
                    'flex size-12 items-center justify-center rounded-xl border text-2xl font-extrabold',
                    pinDigits[i] ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-white text-stone-400',
                  )}>
                  {pinDigits[i] ? toFaDigits(pinDigits[i]) : '·'}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">رمز فعلی (PIN یا رمز عبور)</label>
                <Input dir="ltr" type="password" value={pin.current} onChange={(e: any) => setPin({ ...pin, current: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">PIN جدید (۴ رقم)</label>
                <Input dir="ltr" inputMode="numeric" maxLength={4} value={pin.next}
                  onChange={(e: any) => setPin({ ...pin, next: toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 4) })}
                  placeholder="۱۲۳۴" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void changePin()} disabled={savingPin || !pin.current || pinDigits.length < 4}>
                {savingPin ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} تغییر PIN
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ═══ شخصی‌سازی میزکار ═══ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><I.layoutGrid size={17} /> شخصی‌سازی میزکار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-6 text-stone-600">
              چیدمان ویجت‌های «میزکار من» — نمایش یا پنهان‌کردن هر کارت و ترتیب آن‌ها — در صفحهٔ میزکار
              و با دکمهٔ «شخصی‌سازی» تنظیم می‌شود؛ تنظیم‌ها فقط برای حساب شما ذخیره می‌شود.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => go('home/home')} className="gap-1.5">
                <I.settings size={15} /> شخصی‌سازی میزکار
              </Button>
              <Button variant="outline" onClick={() => go('home/guide')} className="gap-1.5">
                <I.bookOpen size={15} /> راهنمای تعاملی
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
              <I.info size={15} className="mt-0.5 shrink-0 text-stone-500" />
              <p className="text-[11px] leading-5 text-stone-600">
                ظاهر کلی سامانه (تم، رنگ‌ها و فونت) به‌صورت سراسری توسط مدیریت تنظیم می‌شود و
                از این صفحه قابل تغییر نیست.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
