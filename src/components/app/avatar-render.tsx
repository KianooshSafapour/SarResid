'use client'

/** آواتار کاربر با سه لایهٔ جایگزینی (round-17) — ابزار مشترک برای همهٔ نقاط نمایش:
 *  ۱) عکس واقعی (avatarUrl — dataURL یا مسیر)  ۲) آواتار کارتونی SVG (avatarStyle)
 *  ۳) سقوط به حرف اول نام با رنگ کاربر (مثل Avatar قدیمی ui-bits)
 *  مصرف‌کنندگان فعلی: AppShell (سایدبار + نوار بالا). نقاط بعدی برای پذیرش:
 *  Dashboard leaderboard، Tasks صف‌ها، Messages، Notifs، Personnel — در worklog ثبت شده است.
 *  پوشش سر (19-b): none | scarf | shawl | maghnaeh | semi (شال نیمه‌سر) | neck (روسری گردن) —
 *  کلیدهای تازه در AvatarBuilder/CartoonAvatar رندر می‌شوند؛ اینجا فقط پارسِ tolerant انجام می‌شود. */

import { CartoonAvatar, parseAvatarStyle } from '@/components/app/AvatarBuilder'

export function UserAvatar({ name, color, avatarUrl, avatarStyle, size = 40 }: {
  name: string
  color: string
  avatarUrl?: string
  avatarStyle?: string
  size?: number
}) {
  const style = parseAvatarStyle(avatarStyle)
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="shrink-0 rounded-full object-cover shadow-inner"
        style={{ width: size, height: size }}
      />
    )
  }
  if (style) return <CartoonAvatar style={style} size={size} className="shrink-0 rounded-full shadow-inner" />
  const initial = name?.trim()?.[0] || '؟'
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white shadow-inner"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}bb)`, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  )
}
