'use client'

/** آواتار کارتونی نسخهٔ ۲ (بیت‌موجی‌سبک) — SVG خالص بدون هیچ فایل خارجی (round-18-D، پوشش سر v3 در 19-b)
 *  - CartoonAvatar: رندر SVG از پیکربندی کامل (پوست، مو، پوشش سر اختیاری، ریش، عینک، نشان علاقه، پس‌زمینهٔ الگودار…)
 *  - AvatarBuilder (default): مودال تمام‌صفحهٔ سازندهٔ آواتار
 *  - AvatarProfileModal: مودال «پروفایل من» سه‌تبی — تصویر / آواتار / دربارهٔ من
 *  سازگاری عقب: parseAvatarStyle پیکربندی‌های قدیمی (round-17) را می‌پذیرد و فیلدهای تازه را با پیش‌فرض پر می‌کند.
 *  همهٔ رنگ‌ها از پالت برند سررسید — بدون آبی/نیلی. پوشش سر کاملاً اختیاری است و پیش‌فرض «بدون پوشش».
 *  کلیدهای پوشش سر: none | scarf | shawl | maghnaeh | semi (شال نیمه‌سر — عقب‌رفته، موی جلو پیدا) | neck (روسری گردن — سر باز).
 *  موی بلند/موجی: یک سیلوئت پیوستهٔ واحد از فرق سر تا پشت شانه (بدون شکستگی بین موی بالا و پشت). */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { Modal } from '@/components/views/Orders'
import { UserAvatar } from '@/components/app/avatar-render'
import { cn } from '@/lib/utils'
import { faNum } from '@/lib/jalali'
import { ROLE_LABELS } from '@/lib/constants'
import { Camera, Dices, Eraser, Heart, Loader2, Save, Sparkles, Trash2, Upload } from 'lucide-react'

/* ── پالت‌ها (نسخهٔ ۲ — ترتیب قدیمی حفظ شده تا پیکربندی‌های قبلی همان رنگ را ببینند) ── */
export const AVATAR_SKINS = ['#ffe3c9', '#f6c79a', '#e2a173', '#bd7f4e', '#8d5a34', '#c98d5e', '#a06a3f', '#6b4226']
export const AVATAR_HAIRS = [
  { k: 'short', label: 'کوتاه' },
  { k: 'long', label: 'بلند' },
  { k: 'curly', label: 'فرفری' },
  { k: 'bun', label: 'گوشه‌باف' },
  { k: 'braid', label: 'دوبافته' },
  { k: 'ponytail', label: 'دم‌اسبی' },
  { k: 'bald', label: 'بی‌مو' },
  { k: 'buzz', label: 'چریکی' },
  { k: 'wavy', label: 'موجی' },
  { k: 'mohawk', label: 'موهاک' },
  { k: 'afro', label: 'آفرو' },
  { k: 'undercut', label: 'آندرکات' },
]
export const AVATAR_HAIR_COLORS = ['#31261f', '#54341c', '#7a4a21', '#b0803f', '#9a9a9a', '#b3372f', '#241c16', '#c96f4a', '#77934a', '#c9a227']
export const AVATAR_EYES = ['نقطه‌ای', 'خندان', 'گرد و براق', 'بادامی', 'نیمه‌باز']
export const AVATAR_MOUTHS = ['لبخند', 'خندهٔ بلند', 'آرام', 'شگفت‌زده', 'پوزخند', 'زبان‌بازی']
export const AVATAR_OUTFITS = ['تی‌شرت', 'هودی', 'پیراهن', 'مانتو', 'فرم هایپر (جلیقه)', 'کت', 'بافت', 'آپرای دکلره']
export const AVATAR_OUTFIT_COLORS = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#8a6d10', '#0b5e39', '#5c7438', '#4a2c3a', '#2e6f6a', '#6b4226', '#3a2b22']
export const AVATAR_ACCESSORIES = [
  { k: 'none', label: 'بدون اکسسوری' },
  { k: 'cap', label: 'کلاه نقاب‌دار' },
  { k: 'earrings', label: 'گوشواره' },
  { k: 'headband', label: 'سربند' },
  { k: 'earbuds', label: 'ایرباد' },
]
/** پس‌زمینه: ۶ رنگ برند + ۴ الگوی ظریف (گریه، بوته، راه‌راه، شطرنجی) */
export const AVATAR_BGS: { c: string; pat?: 'girih' | 'dots' | 'stripes' | 'checkers' }[] = [
  { c: '#e9f0e4' },
  { c: '#fdf6dd' },
  { c: '#f7e8dd' },
  { c: '#e7ead7' },
  { c: '#f3ead0' },
  { c: '#dfe8e0' },
  { c: '#f2e9dd', pat: 'girih' },
  { c: '#faf3e3', pat: 'dots' },
  { c: '#eee7d8', pat: 'stripes' },
  { c: '#f5ede0', pat: 'checkers' },
]
/** پوشش سر — کاملاً اختیاری، پیش‌فرض «بدون پوشش»؛ کلیدهای قدیمی (round-17/18) سر جایشان می‌مانند */
export const AVATAR_HIJABS = [
  { k: 'none', label: 'بدون پوشش' },
  { k: 'scarf', label: 'روسری' },
  { k: 'shawl', label: 'شال' },
  { k: 'maghnaeh', label: 'مقنعه' },
  { k: 'semi', label: 'شال نیمه‌سر' },
  { k: 'neck', label: 'روسری گردن' },
]
export const AVATAR_HIJAB_COLORS = ['#2b2b2e', '#f5f1e6', '#e8d9bd', '#77934a', '#4a2c3a', '#c96f4a', '#2e6f6a', '#b3372f']
export const AVATAR_BEARDS = [
  { k: 'none', label: 'بدون ریش' },
  { k: 'stubble', label: 'ته‌ریش' },
  { k: 'full', label: 'ریش کامل' },
  { k: 'mustache', label: 'سبیل' },
]
export const AVATAR_GLASSES = [
  { k: 'none', label: 'بدون عینک' },
  { k: 'round', label: 'گرد' },
  { k: 'square', label: 'چهارگوش' },
  { k: 'sun', label: 'آفتابی' },
]
export const AVATAR_BROWS = ['طبیعی', 'پرپشت', 'باریک']
export const AVATAR_EMOJIS = ['🌿', '☕', '📚', '⚽', '🧵', '🛒', '✨', '🧿']

export type AvatarStyle = {
  skin: number
  hair: string
  hairColor: number
  eyes: number
  mouth: number
  outfit: number
  outfitColor: number
  accessory: string
  bg: number
  /* نسخهٔ ۲ */
  hijab: string
  hijabColor: number
  beard: string
  brows: number
  blush: boolean
  freckles: boolean
  glasses: string
  emoji: number
}

export const DEFAULT_AVATAR_STYLE: AvatarStyle = {
  skin: 1,
  hair: 'short',
  hairColor: 0,
  eyes: 0,
  mouth: 0,
  outfit: 0,
  outfitColor: 0,
  accessory: 'none',
  bg: 0,
  hijab: 'none',
  hijabColor: 0,
  beard: 'none',
  brows: 0,
  blush: false,
  freckles: false,
  glasses: 'none',
  emoji: -1,
}

/** پارس امن پیکربندی ذخیره‌شده (رشتهٔ JSON یا آبجکت) — سازگار با پیکربندی round-17؛ در خطای کلان null */
export function parseAvatarStyle(raw: string | Record<string, unknown> | null | undefined): AvatarStyle | null {
  if (!raw) return null
  let o: Record<string, unknown> | null = null
  if (typeof raw === 'string') {
    try { o = JSON.parse(raw) as Record<string, unknown> } catch { return null }
  } else if (typeof raw === 'object') o = raw
  if (!o || typeof o !== 'object') return null

  const clamp = (v: unknown, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : -1
  }
  const has = (k: string) => o![k] !== undefined && o![k] !== null && o![k] !== ''
  // فیلدهای اصلی نسخهٔ ۱ باید موجود باشند وگرنه پیکربندی نامعتبر است (سقوط به حرف اول نام)
  if (!has('skin') || !has('hair') || !has('hairColor') || !has('eyes') || !has('mouth') || !has('outfit') || !has('outfitColor') || !has('accessory') || !has('bg')) return null

  const skin = clamp(o.skin, AVATAR_SKINS.length - 1)
  const hairColor = clamp(o.hairColor, AVATAR_HAIR_COLORS.length - 1)
  const eyes = clamp(o.eyes, AVATAR_EYES.length - 1)
  const mouth = clamp(o.mouth, AVATAR_MOUTHS.length - 1)
  const outfit = clamp(o.outfit, AVATAR_OUTFITS.length - 1)
  const outfitColor = clamp(o.outfitColor, AVATAR_OUTFIT_COLORS.length - 1)
  const bg = clamp(o.bg, AVATAR_BGS.length - 1)
  if ([skin, hairColor, eyes, mouth, outfit, outfitColor, bg].some((x) => x < 0)) return null

  let hair = AVATAR_HAIRS.some((h) => h.k === o!.hair) ? String(o!.hair) : ''
  // مهاجرت: «روسری» قدیم (اکسسوری round-17) → پوشش سر روسری
  let hijab = AVATAR_HIJABS.some((h) => h.k === o!.hijab) ? String(o!.hijab) : 'none'
  let hijabColor = clamp(o.hijabColor ?? 0, AVATAR_HIJAB_COLORS.length - 1)
  if (hijabColor < 0) hijabColor = 0
  if (!hair && o!.hair === 'scarf') {
    hijab = 'scarf'
    hijabColor = Number(o!.hairColor) === 5 ? 7 : 0 // بورdeaux قدیم → بورdeaux جدید، بقیه → سیاه
    hair = 'short' // زیر روسری پنهان است
  }
  if (!hair) return null

  let accessory = AVATAR_ACCESSORIES.some((a) => a.k === o!.accessory) ? String(o!.accessory) : ''
  let glasses = AVATAR_GLASSES.some((g) => g.k === o!.glasses) ? String(o!.glasses) : 'none'
  // مهاجرت: عینکِ قدیم از اکسسوری جدا شد
  if (!accessory && o!.accessory === 'glasses') {
    glasses = glasses === 'none' ? 'round' : glasses
    accessory = 'none'
  }
  if (!accessory) return null

  const beard = AVATAR_BEARDS.some((b) => b.k === o!.beard) ? String(o!.beard) : 'none'
  const brows = Math.min(2, Math.max(0, clamp(o.brows ?? 0, 2) < 0 ? 0 : clamp(o.brows ?? 0, 2)))
  const bool = (v: unknown) => v === true || v === 'true' || v === 1
  const emojiN = Number(o.emoji)
  const emoji = Number.isFinite(emojiN) ? Math.min(7, Math.max(-1, Math.round(emojiN))) : -1

  return { skin, hair, hairColor, eyes, mouth, outfit, outfitColor, accessory, bg, hijab, hijabColor, beard, brows, blush: bool(o.blush), freckles: bool(o.freckles), glasses, emoji }
}

/** مهاجرت پیکربندی‌های قدیمی به نسخهٔ ۲ — نام معادل parseAvatarStyle برای فراخوانندگان */
export function migrateAvatarStyle(raw: string | Record<string, unknown> | null | undefined): AvatarStyle | null {
  return parseAvatarStyle(raw)
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.min(255, Math.max(0, Math.round(v * f)))
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const INK = '#3a2b22'
const LIP = '#7a3b2e'

/* هندسهٔ صورت بر اساس پوشش سر — semi/neck سرِ باز دارند و هندسهٔ کاملِ none را می‌گیرند */
const FACE: Record<string, { rx: number; ry: number; cy: number; eyeY: number; eyeDX: number; mouthY: number; browY: number }> = {
  none: { rx: 21, ry: 23, cy: 52, eyeY: 56, eyeDX: 8, mouthY: 65, browY: 47 },
  scarf: { rx: 15.5, ry: 18, cy: 54, eyeY: 54, eyeDX: 6, mouthY: 62, browY: 46 },
  shawl: { rx: 18, ry: 20, cy: 53, eyeY: 53, eyeDX: 7, mouthY: 62, browY: 45 },
  maghnaeh: { rx: 14.5, ry: 18, cy: 54, eyeY: 54, eyeDX: 5.5, mouthY: 62, browY: 46 },
  semi: { rx: 21, ry: 23, cy: 52, eyeY: 56, eyeDX: 8, mouthY: 65, browY: 47 },
  neck: { rx: 21, ry: 23, cy: 52, eyeY: 56, eyeDX: 8, mouthY: 65, browY: 47 },
}

/** رندر آواتار کارتونی نسخهٔ ۲ — SVG تخت، گرد و دوستانه */
export function CartoonAvatar({ style, size = 120, className }: { style: AvatarStyle; size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = `avc-${uid}`
  const patId = `avp-${uid}`

  const skin = AVATAR_SKINS[style.skin] || AVATAR_SKINS[1]
  const skinDark = shade(skin, 0.86)
  const hairC = AVATAR_HAIR_COLORS[style.hairColor] || AVATAR_HAIR_COLORS[0]
  const outfitC = AVATAR_OUTFIT_COLORS[style.outfitColor] || AVATAR_OUTFIT_COLORS[0]
  const bgEntry = AVATAR_BGS[style.bg] || AVATAR_BGS[0]
  const bgC = bgEntry.c
  const hijabC = AVATAR_HIJAB_COLORS[style.hijabColor] || AVATAR_HIJAB_COLORS[0]
  const hijab = style.hijab && style.hijab !== 'none' && FACE[style.hijab] ? style.hijab : 'none'
  const F = FACE[hijab]
  /** سرِ باز — صورت، گردن، گوش و موی جلو دیده می‌شود (بدون پوشش، روسری گردن، شال نیمه‌سر) */
  const openHead = hijab === 'none' || hijab === 'semi' || hijab === 'neck'
  /** تاج سر آزاد — اکسسوری‌های سر فقط با «بدون پوشش» و «روسری گردن» مجازند */
  const headFree = hijab === 'none' || hijab === 'neck'
  const eyL = 60 - F.eyeDX
  const eyR = 60 + F.eyeDX
  const eyeY = F.eyeY
  const mouthY = F.mouthY
  const browY = F.browY

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role="img" aria-label="آواتار کارتونی">
      <defs>
        <clipPath id={clipId}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
        {bgEntry.pat === 'girih' && (
          <pattern id={patId} width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 Z" fill="none" stroke={shade(bgC, 0.82)} strokeWidth="0.9" />
          </pattern>
        )}
        {bgEntry.pat === 'dots' && (
          <pattern id={patId} width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="2.6" cy="2.6" r="1.4" fill={shade(bgC, 0.8)} opacity="0.55" />
            <path d="M7.4 7.4 q2.6 -0.7 1.7 -3.1" fill="none" stroke={shade(bgC, 0.8)} strokeWidth="0.9" opacity="0.55" strokeLinecap="round" />
          </pattern>
        )}
        {bgEntry.pat === 'stripes' && (
          <pattern id={patId} width="9" height="9" patternUnits="userSpaceOnUse">
            <path d="M-2.2 11.2 L11.2 -2.2" stroke={shade(bgC, 0.86)} strokeWidth="2.6" />
          </pattern>
        )}
        {bgEntry.pat === 'checkers' && (
          <pattern id={patId} width="10" height="10" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="5" height="5" fill={shade(bgC, 0.88)} opacity="0.6" />
            <rect x="5" y="5" width="5" height="5" fill={shade(bgC, 0.88)} opacity="0.6" />
          </pattern>
        )}
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* پس‌زمینه — رنگ برند + الگوی ظریف */}
        <circle cx="60" cy="60" r="60" fill={bgC} />
        {bgEntry.pat && <circle cx="60" cy="60" r="60" fill={`url(#${patId})`} />}

        {/* کاپشن هودی — کلاهِ پشت سر قبل از بدن */}
        {style.outfit === 1 && <ellipse cx="60" cy="70" rx="25" ry="15" fill={shade(outfitC, 0.78)} />}

        {/* موی لایهٔ پشت — سرِ باز؛ در شال نیمه‌سر مو از زیر لبهٔ عقب‌رفته بیرون می‌زند */}
        {openHead && (
          <>
            {style.hair === 'long' && (
              /* سیلوئت یکپارچهٔ موی بلند — یک مسیر واحد از فرق سر تا پشت شانه (بدون گپ بین موی بالا و موی پشت) */
              <path d="M60 21 C42 21 31 33 31 52 C31 67 29 79 33 91 C38 87.5 44 87.5 47 91 C45 75 45 56 47 42 C48 34.5 53 31 60 31 C67 31 72 34.5 73 42 C75 56 75 75 73 91 C76 87.5 82 87.5 87 91 C91 79 89 67 89 52 C89 33 78 21 60 21 Z" fill={hairC} />
            )}
            {style.hair === 'wavy' && (
              /* سیلوئت یکپارچهٔ موی موجی — همان پیوستگی با موج ملایم در لبهٔ بیرونی */
              <path d="M60 21 C42 21 31 33 31 52 C31 61 33 66 31 72 C29 79 30 86 35 91 C40 87 44 88 47 91 C44 75 45 56 47 42 C48 34.5 53 31 60 31 C67 31 72 34.5 73 42 C75 56 76 75 73 91 C76 88 80 87 85 91 C90 86 91 79 89 72 C87 66 89 61 89 52 C89 33 78 21 60 21 Z" fill={hairC} />
            )}
            {style.hair === 'ponytail' && (
              <>
                <ellipse cx="85" cy="47" rx="5.5" ry="13" fill={hairC} transform="rotate(-14 85 47)" />
                <circle cx="82" cy="35" r="2.2" fill={shade(hairC, 0.7)} />
              </>
            )}
            {style.hair === 'braid' && (
              <>
                {[[36, 60], [36, 68], [36, 76], [84, 60], [84, 68], [84, 76]].map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r={i % 3 === 2 ? 3.4 : 4.4} fill={hairC} />
                ))}
              </>
            )}
            {style.hair === 'afro' && (
              <>
                <circle cx="45" cy="35" r="11.5" fill={hairC} />
                <circle cx="60" cy="28" r="12.5" fill={hairC} />
                <circle cx="75" cy="35" r="11.5" fill={hairC} />
                <circle cx="37" cy="46" r="8.5" fill={hairC} />
                <circle cx="83" cy="46" r="8.5" fill={hairC} />
              </>
            )}
          </>
        )}

        {/* بدن و لباس */}
        {style.outfit === 4 ? (
          /* فرم هایپر: پیراهن سفید + جلیقهٔ زیتون */
          <>
            <path d="M26 122 C26 94 42 86 60 86 C78 86 94 94 94 122 Z" fill="#fffdf6" />
            <path d="M27 122 C27 98 41 87.5 54 86 L60 98 L66 86 C79 87.5 93 98 93 122 Z" fill={outfitC} />
            <rect x="42" y="102" width="11" height="6.5" rx="1.2" fill="#c9a227" />
            <rect x="68" y="100" width="2.8" height="10" rx="1.2" fill="#3a2b22" />
          </>
        ) : (
          <path d="M26 122 C26 94 42 86 60 86 C78 86 94 94 94 122 Z" fill={outfitC} />
        )}
        {style.outfit === 0 && (
          <path d="M52 88 Q60 94 68 88" stroke="rgba(0,0,0,0.18)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
        {style.outfit === 1 && (
          <>
            <path d="M50 87 Q60 96 70 87" stroke={shade(outfitC, 0.8)} strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M55 93 L54 103" stroke="#fffdf6" strokeWidth="2" strokeLinecap="round" />
            <path d="M65 93 L66 103" stroke="#fffdf6" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {style.outfit === 2 && (
          <>
            <path d="M52 86 L60 96 L53 101 L46 91 Z" fill="#fffdf6" />
            <path d="M68 86 L60 96 L67 101 L74 91 Z" fill="#fffdf6" />
            <path d="M60 97 L60 120" stroke="rgba(0,0,0,0.15)" strokeWidth="2" />
          </>
        )}
        {style.outfit === 3 && (
          <>
            <path d="M60 97 L60 120" stroke={shade(outfitC, 0.75)} strokeWidth="1.6" />
            <path d="M53 87 L60 95 L67 87" stroke={shade(outfitC, 0.75)} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <circle cx="60" cy="101" r="1.2" fill="#c9a227" />
            <circle cx="60" cy="107" r="1.2" fill="#c9a227" />
            <circle cx="60" cy="113" r="1.2" fill="#c9a227" />
          </>
        )}
        {style.outfit === 5 && (
          <>
            <path d="M56 86 L60 95 L64 86 Z" fill="#fffdf6" />
            <path d="M55 86 L60 99 L47 108 L41 94 Z" fill={shade(outfitC, 0.78)} />
            <path d="M65 86 L60 99 L73 108 L79 94 Z" fill={shade(outfitC, 0.78)} />
            <circle cx="60" cy="104" r="1.3" fill="#c9a227" />
            <circle cx="60" cy="110" r="1.3" fill="#c9a227" />
          </>
        )}
        {style.outfit === 6 && (
          <>
            <rect x="50" y="79" width="20" height="9" rx="4.5" fill={shade(outfitC, 0.82)} />
            <path d="M32 106 l5.7 -4 5.7 4 5.7 -4 5.7 4 5.7 -4 5.7 4 5.7 -4 5.7 4" stroke="rgba(255,253,246,0.4)" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M36 114 l5.7 -4 5.7 4 5.7 -4 5.7 4 5.7 -4 5.7 4 5.7 -4" stroke="rgba(255,253,246,0.3)" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        )}
        {style.outfit === 7 && (
          <>
            <path d="M48 88 Q60 97 72 88" stroke={shade(outfitC, 0.72)} strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="60" cy="97" r="2.6" fill="#c9a227" />
            <circle cx="60" cy="96.4" r="0.9" fill="#fffdf6" />
            {[[46, 108], [54, 112], [66, 112], [74, 108], [60, 105]].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="1.5" fill="#fffdf6" opacity="0.35" />
            ))}
          </>
        )}

        {/* گردن — سرِ باز */}
        {openHead && <path d="M53 70 L67 70 L67 83 L53 83 Z" fill={skinDark} />}

        {/* ── پوشش سر (اختیاری) — پس از بدن و پیش از صورت ── */}
        {hijab === 'scarf' && (
          <>
            <path d="M60 18 C40 18 30 32 31 54 C31 70 36 82 44 88 L76 88 C84 82 89 70 89 54 C90 32 80 18 60 18 Z" fill={hijabC} />
            <path d="M44 88 C46 82 52 79 60 79 C68 79 74 82 76 88 L82 106 L38 106 Z" fill={shade(hijabC, 0.88)} />
            <ellipse cx="60" cy={F.cy} rx={F.rx} ry={F.ry} fill={skin} />
            <path d="M44.5 54 C44.5 38 51 30 60 30 C69 30 75.5 38 75.5 54" stroke={shade(hijabC, 0.72)} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          </>
        )}
        {hijab === 'shawl' && (
          <>
            <path d="M60 20 C42 20 33 33 33 52 C33 68 38 80 46 87 L74 87 C82 80 87 68 87 52 C87 33 78 20 60 20 Z" fill={hijabC} />
            <path d="M46 87 L36 105 L54 104 L57 86 Z" fill={shade(hijabC, 0.9)} />
            <path d="M74 87 L84 105 L66 104 L63 86 Z" fill={shade(hijabC, 0.9)} />
            <ellipse cx="60" cy={F.cy} rx={F.rx} ry={F.ry} fill={skin} />
            <path d="M42 53 C42 37 50 29 60 29 C70 29 78 37 78 53" stroke={shade(hijabC, 0.78)} strokeWidth="3.5" fill="none" strokeLinecap="round" />
            {/* چتری کوچک مجاز برای شال */}
            <path d="M50 37.5 Q60 31.5 70 37.5 L68.5 41 Q60 35.8 51.5 41 Z" fill={hairC} />
          </>
        )}
        {hijab === 'maghnaeh' && (
          <>
            <path d="M60 15 C44 15 34 30 34 52 C34 70 40 84 48 90 L72 90 C80 84 86 70 86 52 C86 30 76 15 60 15 Z" fill={hijabC} />
            <path d="M48 90 C52 84 68 84 72 90 L70 94 L50 94 Z" fill={shade(hijabC, 0.85)} />
            <ellipse cx="60" cy={F.cy} rx={F.rx} ry={F.ry} fill={skin} />
            <path d="M45.5 54 C45.5 38 51.5 30 60 30 C68.5 30 74.5 38 74.5 54" stroke={shade(hijabC, 0.75)} strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* روسری گردن — سر کاملاً باز؛ روسری به‌صورت اکسسوری دور گردن گره خورده */}
        {hijab === 'neck' && (
          <>
            {/* دو لبهٔ آویز از زیر گره روی لباس */}
            <path d="M51 90 C48 99 49 107 53 113 L59.5 113 C56.5 106 56.5 97 58.5 91 Z" fill={shade(hijabC, 0.9)} />
            <path d="M69 90 C72 99 71 107 67 113 L60.5 113 C63.5 106 63.5 97 61.5 91 Z" fill={shade(hijabC, 0.9)} />
            {/* حلقهٔ دور گردن — لبهٔ بالا زیر چانه */}
            <path d="M46 79 C52 84 68 84 74 79 C76 85 74 93 68 96.5 C62 99.5 58 99.5 52 96.5 C46 93 44 85 46 79 Z" fill={hijabC} />
            {/* گره جلو */}
            <path d="M55 91 C57 95.5 63 95.5 65 91 C66.5 95 63.5 98.5 60 98.5 C56.5 98.5 53.5 95 55 91 Z" fill={hijabC} />
            {/* دو چین ظریف پارچه */}
            <path d="M49 85 Q60 90.5 71 85" stroke={shade(hijabC, 0.75)} strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <path d="M52 94.5 Q60 98.5 68 94.5" stroke={shade(hijabC, 0.82)} strokeWidth="1.1" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* شال نیمه‌سر — عقب‌رفته روی سر؛ چیدگی آزادِ پارچه پشت شانه‌ها (کاسه و لبه بعد از مو رسم می‌شود) */}
        {hijab === 'semi' && (
          <>
            <path d="M37 44 C30 56 28 72 33 90 C36 83 38 66 40 52 C40.5 48 41 46 41 44 Z" fill={hijabC} />
            <path d="M83 44 C90 56 92 72 87 90 C84 83 82 66 80 52 C79.5 48 79 46 79 44 Z" fill={shade(hijabC, 0.93)} />
          </>
        )}

        {/* گوش‌ها — سرِ باز */}
        {openHead && (
          <>
            <circle cx="39" cy="55" r="4" fill={skin} />
            <circle cx="81" cy="55" r="4" fill={skin} />
          </>
        )}
        {/* صورت — سرِ باز (در پوشش کامل، صورت داخل همان بلوک رسم می‌شود) */}
        {openHead && <ellipse cx="60" cy={F.cy} rx={F.rx} ry={F.ry} fill={skin} />}

        {/* بینی */}
        <path d={`M60 ${eyeY + 3} Q62 ${eyeY + 6} 59 ${eyeY + 7}`} stroke={skinDark} strokeWidth="1.8" fill="none" strokeLinecap="round" />

        {/* لپ‌ها — ظریف؛ گل‌گونه اختیاری پررنگ‌تر */}
        <circle cx={eyL - 7} cy={eyeY + 7} r={style.blush ? 4.2 : 3} fill="#e2836b" opacity={style.blush ? 0.5 : 0.35} />
        <circle cx={eyR + 7} cy={eyeY + 7} r={style.blush ? 4.2 : 3} fill="#e2836b" opacity={style.blush ? 0.5 : 0.35} />

        {/* کک‌ومک */}
        {style.freckles && (
          <>
            {[[eyL - 3.5, eyeY + 5.5], [eyL + 0.5, eyeY + 6.5], [eyL + 3, eyeY + 4.5], [eyR - 3, eyeY + 4.5], [eyR - 0.5, eyeY + 6.5], [eyR + 3.5, eyeY + 5.5]].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="0.75" fill={shade(skin, 0.58)} opacity="0.8" />
            ))}
          </>
        )}

        {/* ابروها */}
        {style.brows === 0 && (
          <>
            <path d={`M${eyL - 3.5} ${browY + 1} Q${eyL} ${browY - 1.6} ${eyL + 3.5} ${browY + 1}`} stroke={shade(hairC, 0.9)} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d={`M${eyR - 3.5} ${browY + 1} Q${eyR} ${browY - 1.6} ${eyR + 3.5} ${browY + 1}`} stroke={shade(hairC, 0.9)} strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        )}
        {style.brows === 1 && (
          <>
            <path d={`M${eyL - 4} ${browY + 1.4} Q${eyL} ${browY - 2.4} ${eyL + 4} ${browY + 1.4}`} stroke={shade(hairC, 0.85)} strokeWidth="3.4" fill="none" strokeLinecap="round" />
            <path d={`M${eyR - 4} ${browY + 1.4} Q${eyR} ${browY - 2.4} ${eyR + 4} ${browY + 1.4}`} stroke={shade(hairC, 0.85)} strokeWidth="3.4" fill="none" strokeLinecap="round" />
          </>
        )}
        {style.brows === 2 && (
          <>
            <path d={`M${eyL - 3} ${browY + 0.5} L${eyL + 3} ${browY - 0.3}`} stroke={shade(hairC, 0.9)} strokeWidth="1.2" fill="none" strokeLinecap="round" />
            <path d={`M${eyR - 3} ${browY - 0.3} L${eyR + 3} ${browY + 0.5}`} stroke={shade(hairC, 0.9)} strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </>
        )}

        {/* چشم‌ها */}
        {style.eyes === 0 && (
          <>
            <circle cx={eyL} cy={eyeY} r="2.4" fill={INK} />
            <circle cx={eyR} cy={eyeY} r="2.4" fill={INK} />
          </>
        )}
        {style.eyes === 1 && (
          <>
            <path d={`M${eyL - 3} ${eyeY + 1} Q${eyL} ${eyeY - 3} ${eyL + 3} ${eyeY + 1}`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d={`M${eyR - 3} ${eyeY + 1} Q${eyR} ${eyeY - 3} ${eyR + 3} ${eyeY + 1}`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        )}
        {style.eyes === 2 && (
          <>
            <circle cx={eyL} cy={eyeY} r="3.4" fill="#fffdf6" stroke={INK} strokeWidth="1" />
            <circle cx={eyR} cy={eyeY} r="3.4" fill="#fffdf6" stroke={INK} strokeWidth="1" />
            <circle cx={eyL} cy={eyeY} r="1.8" fill={INK} />
            <circle cx={eyR} cy={eyeY} r="1.8" fill={INK} />
            <circle cx={eyL + 1} cy={eyeY - 1.2} r="0.7" fill="#fffdf6" />
            <circle cx={eyR + 1} cy={eyeY - 1.2} r="0.7" fill="#fffdf6" />
          </>
        )}
        {style.eyes === 3 && (
          <>
            <ellipse cx={eyL} cy={eyeY} rx="3.6" ry="2.2" fill="#fffdf6" stroke={INK} strokeWidth="1" />
            <ellipse cx={eyR} cy={eyeY} rx="3.6" ry="2.2" fill="#fffdf6" stroke={INK} strokeWidth="1" />
            <circle cx={eyL} cy={eyeY + 0.2} r="1.4" fill={INK} />
            <circle cx={eyR} cy={eyeY + 0.2} r="1.4" fill={INK} />
            <path d={`M${eyL - 3.6} ${eyeY - 1.6} Q${eyL} ${eyeY - 3.4} ${eyL + 3.6} ${eyeY - 1.6}`} stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <path d={`M${eyR - 3.6} ${eyeY - 1.6} Q${eyR} ${eyeY - 3.4} ${eyR + 3.6} ${eyeY - 1.6}`} stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </>
        )}
        {style.eyes === 4 && (
          <>
            <path d={`M${eyL - 3} ${eyeY - 0.5} Q${eyL} ${eyeY + 2.6} ${eyL + 3} ${eyeY - 0.5}`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d={`M${eyR - 3} ${eyeY - 0.5} Q${eyR} ${eyeY + 2.6} ${eyR + 3} ${eyeY - 0.5}`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx={eyL} cy={eyeY - 0.2} r="1.5" fill={INK} />
            <circle cx={eyR} cy={eyeY - 0.2} r="1.5" fill={INK} />
          </>
        )}

        {/* ریش — قبل از دهان تا لب‌ها دیده شوند */}
        {style.beard === 'full' && (
          <path d={`M47 ${mouthY - 2} C47 ${mouthY + 15} 73 ${mouthY + 15} 73 ${mouthY - 2} Q66 ${mouthY + 3.5} 60 ${mouthY + 3.5} Q54 ${mouthY + 3.5} 47 ${mouthY - 2} Z`} fill={hairC} />
        )}

        {/* دهان */}
        {style.mouth === 0 && (
          <path d={`M55 ${mouthY} Q60 ${mouthY + 5} 65 ${mouthY}`} stroke={LIP} strokeWidth="2" fill="none" strokeLinecap="round" />
        )}
        {style.mouth === 1 && (
          <>
            <path d={`M54.5 ${mouthY - 1} Q60 ${mouthY + 7} 65.5 ${mouthY - 1} Z`} fill={LIP} />
            <ellipse cx="60" cy={mouthY + 2.5} rx="2.6" ry="1.4" fill="#e2836b" />
          </>
        )}
        {style.mouth === 2 && <path d={`M56 ${mouthY + 1} L64 ${mouthY + 1}`} stroke={LIP} strokeWidth="2" strokeLinecap="round" />}
        {style.mouth === 3 && (
          <>
            <ellipse cx="60" cy={mouthY + 2} rx="2.8" ry="3.4" fill={LIP} />
            <ellipse cx="60" cy={mouthY + 2.8} rx="1.6" ry="1.8" fill="#e2836b" />
          </>
        )}
        {style.mouth === 4 && (
          <path d={`M54.5 ${mouthY + 1.5} Q59 ${mouthY + 4.5} 66 ${mouthY - 1}`} stroke={LIP} strokeWidth="2" fill="none" strokeLinecap="round" />
        )}
        {style.mouth === 5 && (
          <>
            <path d={`M55 ${mouthY - 1} Q60 ${mouthY + 4.5} 65 ${mouthY - 1}`} stroke={LIP} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d={`M56.5 ${mouthY + 2.5} Q60 ${mouthY + 7.5} 63.5 ${mouthY + 2.5} Q60 ${mouthY + 4} 56.5 ${mouthY + 2.5} Z`} fill="#e2836b" />
          </>
        )}

        {/* سبیل / ته‌ریش — پس از دهان */}
        {(style.beard === 'full' || style.beard === 'mustache') && (
          <path
            d={`M52 ${mouthY - 2.5} Q56 ${mouthY - 6} 60 ${mouthY - 3} Q64 ${mouthY - 6} 68 ${mouthY - 2.5} Q64 ${mouthY + 1} 60 ${mouthY - 1} Q56 ${mouthY + 1} 52 ${mouthY - 2.5} Z`}
            fill={hairC}
          />
        )}
        {style.beard === 'stubble' && (
          <>
            {[[50, mouthY + 6], [54, mouthY + 9], [60, mouthY + 10.5], [66, mouthY + 9], [70, mouthY + 6], [48, mouthY + 2], [72, mouthY + 2], [52, mouthY + 3], [68, mouthY + 3]].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="0.9" fill={hairC} opacity="0.5" />
            ))}
            <path
              d={`M52 ${mouthY - 2.5} Q56 ${mouthY - 6} 60 ${mouthY - 3} Q64 ${mouthY - 6} 68 ${mouthY - 2.5} Q64 ${mouthY + 1} 60 ${mouthY - 1} Q56 ${mouthY + 1} 52 ${mouthY - 2.5} Z`}
              fill={hairC}
              opacity="0.3"
            />
          </>
        )}

        {/* موی جلوی سر — سرِ باز (چتری شال بالاتر رسم شد) */}
        {openHead && (
          <>
            {style.hair === 'short' && (
              <path d="M38 54 C38 33 47 25 60 25 C73 25 82 33 82 54 C82 43 75 38 60 38 C45 38 38 43 38 54 Z" fill={hairC} />
            )}
            {style.hair === 'long' && (
              /* چتری/خط رویش — تودهٔ اصلی مو در سیلوئت یکپارچهٔ لایهٔ پشت است */
              <path d="M38 54 C38 33 47 25 60 25 C73 25 82 33 82 54 C82 43 75 38 60 38 C45 38 38 43 38 54 Z" fill={hairC} />
            )}
            {style.hair === 'curly' && (
              <>
                {[[45, 38, 10], [53, 31, 10], [61, 29, 10], [69, 31, 10], [76, 38, 10], [40, 47, 8], [80, 47, 8]].map(([cx, cy, r], i) => (
                  <circle key={i} cx={cx} cy={cy} r={r} fill={hairC} />
                ))}
              </>
            )}
            {style.hair === 'bun' && (
              <>
                <path d="M38 54 C38 33 47 25 60 25 C73 25 82 33 82 54 C82 43 75 38 60 38 C45 38 38 43 38 54 Z" fill={hairC} />
                <circle cx="60" cy="20" r="9" fill={hairC} />
                <rect x="55" y="26" width="10" height="3.4" rx="1.7" fill={shade(hairC, 0.75)} />
              </>
            )}
            {style.hair === 'braid' && (
              <path d="M38 54 C38 33 47 25 60 25 C73 25 82 33 82 54 C82 43 75 38 60 38 C45 38 38 43 38 54 Z" fill={hairC} />
            )}
            {style.hair === 'ponytail' && (
              <>
                <path d="M38 52 C38 32 47 25 60 25 C73 25 82 32 82 52 C80 40 72 35 60 35 C48 35 40 40 38 52 Z" fill={hairC} />
              </>
            )}
            {style.hair === 'bald' && (
              <path d="M46 34 Q52 29.5 59 30" stroke="#fffdf6" strokeWidth="2.2" opacity="0.55" fill="none" strokeLinecap="round" />
            )}
            {style.hair === 'buzz' && (
              <path d="M40 48 C40 32 48 26 60 26 C72 26 80 32 80 48 C80 38.5 72 34.5 60 34.5 C48 34.5 40 38.5 40 48 Z" fill={hairC} opacity="0.85" />
            )}
            {style.hair === 'wavy' && (
              /* چتری/خط رویش — تودهٔ اصلی مو در سیلوئت یکپارچهٔ لایهٔ پشت است */
              <path d="M38 54 C38 33 47 25 60 25 C73 25 82 33 82 54 C82 43 75 38 60 38 C45 38 38 43 38 54 Z" fill={hairC} />
            )}
            {style.hair === 'mohawk' && (
              <>
                <path d="M50 31 L53.5 17 L56.5 27 L60 12 L63.5 27 L66.5 17 L70 31 Q60 25.5 50 31 Z" fill={hairC} />
                <path d="M50 31 Q60 26 70 31 L70 35 Q60 30.5 50 35 Z" fill={hairC} />
                <path d="M44 36 Q46 31 50 28" stroke={shade(skin, 0.88)} strokeWidth="1.4" fill="none" strokeLinecap="round" />
                <path d="M76 36 Q74 31 70 28" stroke={shade(skin, 0.88)} strokeWidth="1.4" fill="none" strokeLinecap="round" />
              </>
            )}
            {style.hair === 'afro' && (
              <>
                <circle cx="46" cy="34" r="8" fill={hairC} />
                <circle cx="60" cy="29" r="9" fill={hairC} />
                <circle cx="74" cy="34" r="8" fill={hairC} />
              </>
            )}
            {style.hair === 'undercut' && (
              <>
                <path d="M40 47 C40 30 50 24 62 25 C74 26.5 80 34 80 47 C78 37 70 33 58 34 C48 35 42 39 40 47 Z" fill={hairC} />
                <path d="M40 50 L40 56" stroke={hairC} strokeWidth="1.6" strokeLinecap="round" />
                <path d="M80 50 L80 56" stroke={hairC} strokeWidth="1.6" strokeLinecap="round" />
              </>
            )}
          </>
        )}

        {/* شال نیمه‌سر — کاسهٔ عقب‌رفته روی تاج سر؛ بعد از مو تا لبه روی مو بنشیند و موی پیشانی از زیرش پیدا بماند */}
        {hijab === 'semi' && (
          <>
            {/* لابه‌لای موی پیشانی که از زیر لبه بیرون می‌زند (برای بی‌مو رسم نمی‌شود) */}
            {style.hair !== 'bald' && (
              <path d="M45 35 C48 30 54 28 60 28 C66 28 72 30 75 35 C71.5 32.5 68 35.5 65.5 39.5 C62.5 35.5 57.5 35.5 54.5 39.5 C52 35.5 48.5 32.5 45 35 Z" fill={hairC} />
            )}
            {/* کاسهٔ شال — لبهٔ جلو نزدیک خط رویش، تاول‌های کناری کنار گوش */}
            <path d="M60 12 C43 12 34 24 36 46 C38 35 48 30 60 30 C72 30 82 35 84 46 C86 24 77 12 60 12 Z" fill={hijabC} />
            {/* لبهٔ پارچه */}
            <path d="M36 46 C38 35 48 30 60 30 C72 30 82 35 84 46" stroke={shade(hijabC, 0.72)} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            {/* دو چین ظریف روی تاج */}
            <path d="M47 17 Q44 25 45.5 32" stroke={shade(hijabC, 0.8)} strokeWidth="1.2" fill="none" strokeLinecap="round" />
            <path d="M73 17 Q76 25 74.5 32" stroke={shade(hijabC, 0.8)} strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </>
        )}

        {/* عینک (مستقل از اکسسوری) */}
        {style.glasses === 'round' && (
          <>
            <circle cx={eyL} cy={eyeY} r="7.4" fill="#fffdf6" fillOpacity="0.14" stroke="#4a3a30" strokeWidth="2" />
            <circle cx={eyR} cy={eyeY} r="7.4" fill="#fffdf6" fillOpacity="0.14" stroke="#4a3a30" strokeWidth="2" />
            <path d={`M${eyL + 7.4} ${eyeY} L${eyR - 7.4} ${eyeY}`} stroke="#4a3a30" strokeWidth="2" />
            {hijab === 'none' && (
              <>
                <path d={`M${eyL - 7.4} ${eyeY} L40 ${eyeY - 1}`} stroke="#4a3a30" strokeWidth="2" strokeLinecap="round" />
                <path d={`M${eyR + 7.4} ${eyeY} L80 ${eyeY - 1}`} stroke="#4a3a30" strokeWidth="2" strokeLinecap="round" />
              </>
            )}
          </>
        )}
        {style.glasses === 'square' && (
          <>
            <rect x={eyL - 6.6} y={eyeY - 5.4} width="13.2" height="10.8" rx="2.6" fill="#fffdf6" fillOpacity="0.12" stroke="#4a3a30" strokeWidth="2" />
            <rect x={eyR - 6.6} y={eyeY - 5.4} width="13.2" height="10.8" rx="2.6" fill="#fffdf6" fillOpacity="0.12" stroke="#4a3a30" strokeWidth="2" />
            <path d={`M${eyL + 6.6} ${eyeY - 1} L${eyR - 6.6} ${eyeY - 1}`} stroke="#4a3a30" strokeWidth="2" />
            {hijab === 'none' && (
              <>
                <path d={`M${eyL - 6.6} ${eyeY} L40 ${eyeY - 1}`} stroke="#4a3a30" strokeWidth="2" strokeLinecap="round" />
                <path d={`M${eyR + 6.6} ${eyeY} L80 ${eyeY - 1}`} stroke="#4a3a30" strokeWidth="2" strokeLinecap="round" />
              </>
            )}
          </>
        )}
        {style.glasses === 'sun' && (
          <>
            <rect x={eyL - 6.8} y={eyeY - 5.6} width="13.6" height="11.2" rx="3" fill="#2b2b2e" fillOpacity="0.82" stroke="#1f1a16" strokeWidth="1.6" />
            <rect x={eyR - 6.8} y={eyeY - 5.6} width="13.6" height="11.2" rx="3" fill="#2b2b2e" fillOpacity="0.82" stroke="#1f1a16" strokeWidth="1.6" />
            <path d={`M${eyL + 6.8} ${eyeY - 1.4} L${eyR - 6.8} ${eyeY - 1.4}`} stroke="#c9a227" strokeWidth="2.2" />
            {hijab === 'none' && (
              <>
                <path d={`M${eyL - 6.8} ${eyeY} L40 ${eyeY - 1}`} stroke="#1f1a16" strokeWidth="2" strokeLinecap="round" />
                <path d={`M${eyR + 6.8} ${eyeY} L80 ${eyeY - 1}`} stroke="#1f1a16" strokeWidth="2" strokeLinecap="round" />
              </>
            )}
            <path d={`M${eyL - 5} ${eyeY - 4} L${eyL - 1.6} ${eyeY - 4}`} stroke="#fffdf6" strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
            <path d={`M${eyR - 5} ${eyeY - 4} L${eyR - 1.6} ${eyeY - 4}`} stroke="#fffdf6" strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
          </>
        )}

        {/* اکسسوری‌ها — کلاه/سربند/گوشواره/ایرباد فقط وقتی تاج سر آزاد است (بدون پوشش یا روسری گردن) */}
        {headFree && style.accessory === 'cap' && (
          <>
            <path d="M37 45 C37 26 83 26 83 45 L83 47 L37 47 Z" fill={outfitC} />
            <path d="M33 47 Q60 40.5 87 47 Q60 53.5 33 47 Z" fill={shade(outfitC, 0.78)} />
            <circle cx="60" cy="29" r="2.6" fill={shade(outfitC, 0.78)} />
          </>
        )}
        {headFree && style.accessory === 'headband' && (
          <>
            <path d="M40 46 Q60 36 80 46 L80 50.5 Q60 40.5 40 50.5 Z" fill="#c9a227" />
            <circle cx="79" cy="47.5" r="2.4" fill={shade('#c9a227', 0.8)} />
          </>
        )}
        {headFree && style.accessory === 'earrings' && (
          <>
            <circle cx="39" cy="61.5" r="2.4" fill="#c9a227" />
            <circle cx="81" cy="61.5" r="2.4" fill="#c9a227" />
            <circle cx="38.4" cy="60.9" r="0.8" fill="#fffdf6" />
            <circle cx="80.4" cy="60.9" r="0.8" fill="#fffdf6" />
          </>
        )}
        {headFree && style.accessory === 'earbuds' && (
          <>
            <circle cx="39" cy="56" r="2.6" fill="#3a2b22" />
            <circle cx="81" cy="56" r="2.6" fill="#3a2b22" />
            <path d="M39 58.5 L39 65" stroke="#3a2b22" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M81 58.5 L81 65" stroke="#3a2b22" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="38.4" cy="55.4" r="0.8" fill="#fffdf6" />
            <circle cx="80.4" cy="55.4" r="0.8" fill="#fffdf6" />
          </>
        )}

        {/* نشان علاقه (سنجاق گوشهٔ آواتار) */}
        {style.emoji >= 0 && (
          <>
            <circle cx="94" cy="94" r="10.5" fill="#fffdf6" stroke="#c9a227" strokeWidth="2" />
            <text x="94" y="98.4" textAnchor="middle" fontSize="11" dominantBaseline="middle">{AVATAR_EMOJIS[Math.min(style.emoji, AVATAR_EMOJIS.length - 1)]}</text>
          </>
        )}
      </g>
    </svg>
  )
}

/* ── ابزار فشرده‌سازی تصویر سمت کلاینت (برش مربع + تغییر اندازه + JPEG زیر ۳۰۰KB) ── */
export function downscaleImageToDataUrl(file: File, max = 256, square = true): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('فایل تصویر معتبر نیست'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = square ? max : w
        canvas.height = square ? max : h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('پردازش تصویر پشتیبانی نمی‌شود'))
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        if (square) {
          const side = Math.min(img.width, img.height)
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, max, max)
        } else {
          ctx.drawImage(img, 0, 0, w, h)
        }
        // فشرده‌سازی تطبیقی تا زیر ۳۰۰KB
        for (const q of [0.85, 0.72, 0.6, 0.5]) {
          const out = canvas.toDataURL('image/jpeg', q)
          if (out.length <= 300 * 1024) return resolve(out)
        }
        resolve(canvas.toDataURL('image/jpeg', 0.42))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function randomStyle(): AvatarStyle {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
  const biased = <T,>(items: readonly T[], noneVal: T, noneChance: number): T => (Math.random() < noneChance ? noneVal : pick(items))
  return {
    skin: Math.floor(Math.random() * AVATAR_SKINS.length),
    hair: pick(AVATAR_HAIRS.filter((h) => h.k !== 'bald')).k,
    hairColor: Math.floor(Math.random() * AVATAR_HAIR_COLORS.length),
    eyes: Math.floor(Math.random() * AVATAR_EYES.length),
    mouth: Math.floor(Math.random() * AVATAR_MOUTHS.length),
    outfit: Math.floor(Math.random() * AVATAR_OUTFITS.length),
    outfitColor: Math.floor(Math.random() * AVATAR_OUTFIT_COLORS.length),
    accessory: biased(AVATAR_ACCESSORIES.filter((a) => a.k !== 'none'), AVATAR_ACCESSORIES[0], 0.55).k,
    bg: Math.floor(Math.random() * AVATAR_BGS.length),
    hijab: biased(AVATAR_HIJABS.filter((h) => h.k !== 'none'), AVATAR_HIJABS[0], 0.7).k,
    hijabColor: Math.floor(Math.random() * AVATAR_HIJAB_COLORS.length),
    beard: biased(AVATAR_BEARDS.filter((b) => b.k !== 'none'), AVATAR_BEARDS[0], 0.6).k,
    brows: Math.floor(Math.random() * AVATAR_BROWS.length),
    blush: Math.random() < 0.3,
    freckles: Math.random() < 0.2,
    glasses: biased(AVATAR_GLASSES.filter((g) => g.k !== 'none'), AVATAR_GLASSES[0], 0.7).k,
    emoji: Math.random() < 0.35 ? -1 : Math.floor(Math.random() * AVATAR_EMOJIS.length),
  }
}

/* ── ردیف گزینه (چیپ) ── */
function OptionChip({ active, label, onClick, disabled }: { active: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-h-[32px] rounded-full border px-3 py-1.5 text-[11px] font-bold transition',
        active ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white shadow-sm' : 'border-border bg-white/80 text-foreground/70 hover:border-[#0e7a4a]/50',
        disabled && 'cursor-not-allowed opacity-40'
      )}
    >
      {label}
    </button>
  )
}

function ColorSwatch({ color, active, onClick, title, pat }: { color: string; active: boolean; onClick: () => void; title?: string; pat?: 'girih' | 'dots' | 'stripes' | 'checkers' }) {
  const patCss: Record<string, string> = {
    girih: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,0.09) 4px 5px), repeating-linear-gradient(-45deg, transparent 0 4px, rgba(0,0,0,0.09) 4px 5px)',
    dots: 'radial-gradient(circle at 3px 3px, rgba(0,0,0,0.14) 1.5px, transparent 2.2px)',
    stripes: 'repeating-linear-gradient(45deg, transparent 0 5px, rgba(0,0,0,0.1) 5px 8px)',
    checkers: 'conic-gradient(rgba(0,0,0,0.1) 25%, transparent 0 50%, rgba(0,0,0,0.1) 0 75%, transparent 0)',
  }
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn('h-8 w-8 rounded-full border-2 transition', active ? 'scale-110 border-[#3a2b22] shadow-md' : 'border-white/70 hover:scale-105')}
      style={{ background: pat ? `${patCss[pat]}, ${color}` : color, backgroundSize: pat === 'dots' ? '8px 8px' : pat === 'checkers' ? '10px 10px' : undefined }}
    />
  )
}

function OptionRow({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-black text-foreground/80">
        {label}
        {note && <span className="ms-1.5 font-normal text-[10px] text-muted-foreground">{note}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition',
        active ? 'border-[#c9a227] bg-[#c9a227]/20 text-[#8a6d10]' : 'border-border bg-white/80 text-foreground/60 hover:border-[#c9a227]/60'
      )}
    >
      <span className={cn('inline-block h-3.5 w-3.5 rounded-[4px] border-2', active ? 'border-[#8a6d10] bg-[#c9a227]' : 'border-border bg-white')} />
      {label}
    </button>
  )
}

/* ── بدنهٔ سازندهٔ آواتار — در مودال مستقل و تب «آواتار» مشترک ── */
function AvatarEditorBody({ initial, onSaved }: { initial?: AvatarStyle | null; onSaved: (r: { avatarUrl: string; avatarStyle: string }) => void }) {
  const [style, setStyle] = useState<AvatarStyle>(() => initial || DEFAULT_AVATAR_STYLE)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<AvatarStyle>) => setStyle((s) => ({ ...s, ...patch }))
  /** هر پوششی انتخاب شده باشد (حتی روسری گردن — رنگش لازم است) */
  const hasWrap = style.hijab !== 'none'
  /** پوششی که تاج سر را می‌گیرد — اکسسوری سر فقط برای این‌ها غیرفعال می‌شود */
  const headCovered = style.hijab === 'scarf' || style.hijab === 'shawl' || style.hijab === 'maghnaeh' || style.hijab === 'semi'
  /** پوشش کامل سر (مو زیر پوشش پنهان می‌شود) — شال نیمه‌سر و روسری گردن مو را نشان می‌دهند */
  const fullCover = style.hijab === 'scarf' || style.hijab === 'shawl' || style.hijab === 'maghnaeh'

  const save = async () => {
    setBusy(true)
    try {
      const res = await api<{ avatarUrl: string; avatarStyle: string }>('/api/me/avatar', { method: 'POST', body: { avatarStyle: JSON.stringify(style) } })
      toast.success('آواتار کارتونی ذخیره شد 🎨')
      onSaved(res)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'ذخیرهٔ آواتار ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* پیش‌نمایش زنده */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="rounded-full ring-4 ring-[#c9a227]/40" style={{ width: 124, height: 124 }}>
            <CartoonAvatar style={style} size={124} className="rounded-full" />
          </div>
          <button
            onClick={() => setStyle(randomStyle())}
            className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd] px-3 py-2 text-[11px] font-extrabold text-[#8a6d10] transition hover:bg-[#f5ecd0]"
          >
            <Dices size={14} /> شانس آورده 🎲
          </button>
          <p className="max-w-[140px] text-center text-[10px] leading-4 text-muted-foreground">پیش‌نمایش زنده — همهٔ ۱۶ ویژگی را با هم ببینید</p>
        </div>

        {/* گزینه‌ها */}
        <div className="scroll-gold grid min-w-0 flex-1 gap-3 sm:grid-cols-2 sm:max-h-[46vh] sm:overflow-y-auto sm:pe-1">
          <OptionRow label="پوست و چهره">
            {AVATAR_SKINS.map((c, i) => (
              <ColorSwatch key={c} color={c} active={style.skin === i} onClick={() => set({ skin: i })} title={`پوست ${i + 1}`} />
            ))}
          </OptionRow>
          <OptionRow label="مدل مو">
            {AVATAR_HAIRS.map((h) => (
              <OptionChip key={h.k} label={h.label} active={style.hair === h.k} onClick={() => set({ hair: h.k })} />
            ))}
          </OptionRow>
          <OptionRow label="رنگ مو">
            {AVATAR_HAIR_COLORS.map((c, i) => (
              <ColorSwatch key={c} color={c} active={style.hairColor === i} onClick={() => set({ hairColor: i })} title={`رنگ مو ${i + 1}`} />
            ))}
          </OptionRow>
          <OptionRow label="پوشش سر (اختیاری)" note="روسری، شال، مقنعه، شال نیمه‌سر یا روسری گردن — برای همه پیش‌فرض نیست">
            {AVATAR_HIJABS.map((h) => (
              <OptionChip key={h.k} label={h.label} active={style.hijab === h.k} onClick={() => set({ hijab: h.k })} />
            ))}
          </OptionRow>
          {hasWrap && (
            <OptionRow label="رنگ پوشش">
              {AVATAR_HIJAB_COLORS.map((c, i) => (
                <ColorSwatch key={c} color={c} active={style.hijabColor === i} onClick={() => set({ hijabColor: i })} title={`رنگ پوشش ${i + 1}`} />
              ))}
            </OptionRow>
          )}
          {fullCover && (
            <OptionRow label="چتری زیر پوشش">
              {AVATAR_HAIR_COLORS.map((c, i) => (
                <ColorSwatch key={c} color={c} active={style.hairColor === i} onClick={() => set({ hairColor: i })} title={`چتری ${i + 1}`} />
              ))}
            </OptionRow>
          )}
          <OptionRow label="ریش و سبیل">
            {AVATAR_BEARDS.map((b) => (
              <OptionChip key={b.k} label={b.label} active={style.beard === b.k} onClick={() => set({ beard: b.k })} />
            ))}
          </OptionRow>
          <OptionRow label="ابروها">
            {AVATAR_BROWS.map((l, i) => (
              <OptionChip key={l} label={l} active={style.brows === i} onClick={() => set({ brows: i })} />
            ))}
          </OptionRow>
          <OptionRow label="چشم‌ها">
            {AVATAR_EYES.map((l, i) => (
              <OptionChip key={l} label={l} active={style.eyes === i} onClick={() => set({ eyes: i })} />
            ))}
          </OptionRow>
          <OptionRow label="دهان">
            {AVATAR_MOUTHS.map((l, i) => (
              <OptionChip key={l} label={l} active={style.mouth === i} onClick={() => set({ mouth: i })} />
            ))}
          </OptionRow>
          <OptionRow label="گل‌گونه و کک‌ومک">
            <ToggleChip active={style.blush} label="گل‌گونه" onClick={() => set({ blush: !style.blush })} />
            <ToggleChip active={style.freckles} label="کک‌ومک" onClick={() => set({ freckles: !style.freckles })} />
          </OptionRow>
          <OptionRow label="استایل لباس">
            {AVATAR_OUTFITS.map((l, i) => (
              <OptionChip key={l} label={l} active={style.outfit === i} onClick={() => set({ outfit: i })} />
            ))}
          </OptionRow>
          <OptionRow label="رنگ لباس">
            {AVATAR_OUTFIT_COLORS.map((c, i) => (
              <ColorSwatch key={c} color={c} active={style.outfitColor === i} onClick={() => set({ outfitColor: i })} title={`رنگ لباس ${i + 1}`} />
            ))}
          </OptionRow>
          <OptionRow label="عینک">
            {AVATAR_GLASSES.map((g) => (
              <OptionChip key={g.k} label={g.label} active={style.glasses === g.k} onClick={() => set({ glasses: g.k })} />
            ))}
          </OptionRow>
          <OptionRow label="اکسسوری" note={headCovered ? 'کلاه/سربند/گوشواره همراه پوشش سر نمایش داده نمی‌شود' : undefined}>
            {AVATAR_ACCESSORIES.map((a) => (
              <OptionChip
                key={a.k}
                label={a.label}
                active={style.accessory === a.k}
                disabled={headCovered && a.k !== 'none'}
                onClick={() => set({ accessory: a.k })}
              />
            ))}
          </OptionRow>
          <OptionRow label="نشان علاقه (سنجاق)">
            <OptionChip label="بدون" active={style.emoji === -1} onClick={() => set({ emoji: -1 })} />
            {AVATAR_EMOJIS.map((em, i) => (
              <button
                key={em}
                onClick={() => set({ emoji: i })}
                aria-label={`نشان ${em}`}
                className={cn(
                  'h-8 w-8 rounded-full border-2 text-base leading-none transition',
                  style.emoji === i ? 'scale-110 border-[#3a2b22] bg-[#fdf6dd] shadow-md' : 'border-white/70 bg-white/80 hover:scale-105'
                )}
              >
                {em}
              </button>
            ))}
          </OptionRow>
          <OptionRow label="پس‌زمینه (پالت برند + الگو)">
            {AVATAR_BGS.map((b, i) => (
              <ColorSwatch key={b.c + (b.pat || '')} color={b.c} pat={b.pat} active={style.bg === i} onClick={() => set({ bg: i })} title={`پس‌زمینه ${i + 1}`} />
            ))}
          </OptionRow>
        </div>
      </div>

      <button onClick={save} disabled={busy} className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        <Save size={16} /> {busy ? 'در حال ذخیره…' : 'ذخیرهٔ آواتار'}
      </button>
    </div>
  )
}

/* ── مودال سازندهٔ آواتار (مستقل) ── */
export default function AvatarBuilder({ initial, onClose, onSaved }: { initial?: AvatarStyle | null; onClose: () => void; onSaved: (r: { avatarUrl: string; avatarStyle: string }) => void }) {
  return (
    <Modal title="🎨 سازندهٔ آواتار کارتونی" onClose={onClose} wide>
      <AvatarEditorBody
        initial={initial}
        onSaved={(r) => {
          onSaved(r)
          onClose()
        }}
      />
    </Modal>
  )
}

/* ── مودال «پروفایل من» سه‌تبی — تصویر / آواتار / دربارهٔ من ── */
export type AvatarInfo = { url: string; style: string }

type ProfileData = { name: string; nickname: string; bio: string; phone: string; role: string; points: number }

function PhotoTab({ current, busy, onUpload, onRemovePhoto }: {
  current: AvatarInfo
  busy: boolean
  onUpload: (file: File) => void
  onRemovePhoto: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  const pickFile = (f: File | undefined | null) => {
    if (!f) return
    onUpload(f)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-full ring-4 ring-[#c9a227]/40">
        <UserAvatar name=" " color="#0e7a4a" avatarUrl={current.url} avatarStyle={current.style} size={112} />
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          pickFile(e.dataTransfer.files?.[0])
        }}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
        }}
        className={cn(
          'flex w-full cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition',
          drag ? 'border-[#c9a227] bg-[#fdf6dd]' : 'border-[#c9a227]/40 bg-[#faf7ee] hover:bg-[#f5ecd0]'
        )}
      >
        <Upload size={22} className="text-[#8a6d10]" />
        <p className="text-xs font-black text-foreground">عکس را اینجا رها کنید یا کلیک کنید</p>
        <p className="text-[10px] text-muted-foreground">خودکار به ۲۵۶ پیکسل فشرده و زیر ۳۰۰ کیلوبایت ذخیره می‌شود (JPG/PNG/WebP)</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickFile(f) }} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#0e7a4a]/40 bg-[#e9f0e4] py-3 text-xs font-extrabold text-[#0e7a4a] transition hover:bg-[#dfead6] disabled:opacity-50"
      >
        <Camera size={15} /> انتخاب عکس از دستگاه
      </button>
      {current.url && (
        <button
          onClick={onRemovePhoto}
          disabled={busy}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-xs font-extrabold text-muted-foreground transition hover:border-[#b3372f]/40 hover:text-[#b3372f] disabled:opacity-50"
        >
          <Trash2 size={14} /> حذف عکس پروفایل
        </button>
      )}
    </div>
  )
}

function AboutTab() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [form, setForm] = useState({ nickname: '', phone: '', bio: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api<ProfileData>('/api/me/profile')
      .then((p) => {
        if (!alive) return
        setData(p)
        setForm({ nickname: p.nickname || '', phone: p.phone || '', bio: p.bio || '' })
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'بارگذاری پروفایل ناموفق بود'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const save = async () => {
    if (form.nickname.length > 24) return toast.error('نام مستعار حداکثر ۲۴ نویسه است')
    if (form.bio.length > 160) return toast.error('دربارهٔ من حداکثر ۱۶۰ نویسه است')
    if (form.phone.length > 20) return toast.error('شماره تماس حداکثر ۲۰ نویسه است')
    setBusy(true)
    try {
      const p = await api<ProfileData>('/api/me/profile', { method: 'PATCH', body: { nickname: form.nickname, phone: form.phone, bio: form.bio } })
      setData(p)
      toast.success('پروفایل ذخیره شد ✨')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'ذخیرهٔ پروفایل ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <Loader2 size={26} className="animate-spin text-[#0e7a4a]" />
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {/* بخش فقط‌خواندنی — نام واقعی توسط مدیر نگهداری می‌شود */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#c9a227]/30 bg-[#fdf6dd] p-3 text-center">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground">نام</p>
          <p className="truncate text-xs font-black text-foreground">{data?.name || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground">نقش</p>
          <p className="truncate text-xs font-black text-[#0e7a4a]">{ROLE_LABELS[data?.role || ''] || data?.role || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground">امتیاز</p>
          <p className="text-xs font-black text-[#8a6d10]">⭐ {faNum(data?.points ?? 0)}</p>
        </div>
      </div>

      <div>
        <label htmlFor="pf-nickname" className="mb-1 block text-[11px] font-black text-foreground/80">نام مستعار</label>
        <input
          id="pf-nickname"
          value={form.nickname}
          onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value.slice(0, 24) }))}
          placeholder="مثلاً: کیانوشِ انبار"
          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-bold outline-none transition focus:border-[#0e7a4a]"
        />
        <p className="mt-0.5 text-left text-[10px] text-muted-foreground">{faNum(form.nickname.length)}/{faNum(24)}</p>
      </div>

      <div>
        <label htmlFor="pf-phone" className="mb-1 block text-[11px] font-black text-foreground/80">شماره تماس</label>
        <input
          id="pf-phone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.slice(0, 20) }))}
          placeholder="۰۹۱۲…"
          dir="ltr"
          inputMode="tel"
          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-right text-xs font-bold outline-none transition focus:border-[#0e7a4a]"
        />
      </div>

      <div>
        <label htmlFor="pf-bio" className="mb-1 block text-[11px] font-black text-foreground/80">دربارهٔ من</label>
        <textarea
          id="pf-bio"
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value.slice(0, 160) }))}
          rows={3}
          placeholder="چند جمله‌ای از خودتان بگویید — علایق، تخصص، شعار محبوب…"
          className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-bold leading-5 outline-none transition focus:border-[#0e7a4a]"
        />
        <p className="mt-0.5 text-left text-[10px] text-muted-foreground">{faNum(form.bio.length)}/{faNum(160)}</p>
      </div>

      <button onClick={save} disabled={busy} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        <Save size={15} /> {busy ? 'در حال ذخیره…' : 'ذخیرهٔ اطلاعات'}
      </button>
    </div>
  )
}

export function AvatarProfileModal({ name, color, current, onClose, onChanged }: {
  name: string
  color: string
  current: AvatarInfo
  onClose: () => void
  onChanged: (info: AvatarInfo) => void
}) {
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'photo' | 'avatar' | 'about'>('avatar')
  const initialStyle = useMemo(() => parseAvatarStyle(current.style), [current.style])

  const post = useCallback(async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true)
    try {
      const res = await api<{ avatarUrl: string; avatarStyle: string }>('/api/me/avatar', { method: 'POST', body })
      toast.success(okMsg)
      onChanged({ url: res.avatarUrl || '', style: res.avatarStyle || '' })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'عملیات ناموفق بود')
    } finally {
      setBusy(false)
    }
  }, [onChanged])

  const onUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('فقط فایل تصویری انتخاب کنید')
    try {
      const dataUrl = await downscaleImageToDataUrl(file, 256, true)
      await post({ avatarUrl: dataUrl }, 'تصویر پروفایل ذخیره شد 📸')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'پردازش تصویر ناموفق بود')
    }
  }

  const TABS = [
    { k: 'photo' as const, label: 'تصویر', icon: Camera },
    { k: 'avatar' as const, label: 'آواتار', icon: Sparkles },
    { k: 'about' as const, label: 'دربارهٔ من', icon: Heart },
  ]

  return (
    <Modal title="پروفایل من" onClose={onClose} wide>
      {/* سربرگ هویت */}
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-[#0e7a4a]/20 bg-[#e9f0e4]/60 p-3">
        <div className="rounded-full ring-2 ring-[#c9a227]/50">
          <UserAvatar name={name} color={color} avatarUrl={current.url} avatarStyle={current.style} size={52} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-foreground">{name}</p>
          <p className="text-[10px] text-muted-foreground">عکس واقعی، آواتار کارتونی و معرفی خودتان — هرچه دوست دارید</p>
        </div>
      </div>

      {/* تب‌ها */}
      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-[#faf7ee] p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              aria-pressed={tab === t.k}
              className={cn(
                'flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-extrabold transition',
                tab === t.k ? 'bg-primary text-white shadow-sm' : 'text-foreground/60 hover:bg-white hover:text-foreground'
              )}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'photo' && <PhotoTab current={current} busy={busy} onUpload={onUpload} onRemovePhoto={() => post({ clear: 'photo' }, 'عکس پروفایل حذف شد')} />}

      {tab === 'avatar' && (
        <div>
          <AvatarEditorBody
            initial={initialStyle}
            onSaved={(r) => onChanged({ url: r.avatarUrl || '', style: r.avatarStyle || '' })}
          />
          {current.style && (
            <button
              onClick={() => post({ avatarStyle: '' }, 'آواتار کارتونی حذف شد')}
              disabled={busy}
              className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-[11px] font-extrabold text-muted-foreground transition hover:border-[#b3372f]/40 hover:text-[#b3372f] disabled:opacity-50"
            >
              <Eraser size={13} /> حذف آواتار کارتونی (بازگشت به حرف اول نام)
            </button>
          )}
        </div>
      )}

      {tab === 'about' && <AboutTab />}
    </Modal>
  )
}
