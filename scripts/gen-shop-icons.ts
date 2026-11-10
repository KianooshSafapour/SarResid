/* تولید آیکون‌های PWA فروشگاه (زیتون روی پس‌زمینهٔ زیتونی تیره) — اجرا: bun scripts/gen-shop-icons.ts */
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'fs'

const OUT = 'storefront/public/icons'
mkdirSync(OUT, { recursive: true })

const olive = (size: number) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d3a2a"/>
      <stop offset="1" stop-color="#0f2318"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- شاخهٔ زیتون: ساقه -->
  <path d="M150 366 C 220 320, 268 250, 300 150" stroke="#c8a24a" stroke-width="14" fill="none" stroke-linecap="round"/>
  <!-- برگ‌ها -->
  ${[
    [232, 300, -35], [268, 262, -15], [252, 234, -60], [292, 208, -8], [282, 178, -50], [316, 158, -20], [312, 128, -55],
  ].map(([x, y, r]) => `
    <g transform="translate(${x} ${y}) rotate(${r})">
      <ellipse cx="0" cy="0" rx="34" ry="14" fill="#3f7d4e"/>
      <line x1="-28" y1="0" x2="28" y2="0" stroke="#2c5c39" stroke-width="2.5"/>
    </g>`).join('')}
  <!-- دو زیتون -->
  <ellipse cx="180" cy="348" rx="22" ry="28" fill="#7ba05b" transform="rotate(24 180 348)"/>
  <ellipse cx="214" cy="322" rx="19" ry="24" fill="#5d7f42" transform="rotate(24 214 322)"/>
  <!-- هایپر زیتون — نقطهٔ طلایی -->
  <circle cx="150" cy="366" r="9" fill="#c8a24a"/>
</svg>`

async function main() {
  for (const size of [192, 512]) {
    await sharp(Buffer.from(olive(size))).resize(size, size).png({ compressionLevel: 9 }).toFile(`${OUT}/icon-${size}.png`)
  }
  // maskable: همان طرح با safe-zone بزرگ‌تر (پیکسل‌گِرِه بدون شعاع، طرح ۷۰٪ مرکز)
  const maskable = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#1d3a2a"/>
  <g transform="translate(76.8 76.8) scale(0.7)">
    <path d="M150 366 C 220 320, 268 250, 300 150" stroke="#c8a24a" stroke-width="16" fill="none" stroke-linecap="round"/>
    ${[[232, 300, -35], [268, 262, -15], [252, 234, -60], [292, 208, -8], [282, 178, -50], [316, 158, -20], [312, 128, -55]].map(([x, y, r]) => `
      <g transform="translate(${x} ${y}) rotate(${r})"><ellipse cx="0" cy="0" rx="36" ry="15" fill="#3f7d4e"/></g>`).join('')}
    <ellipse cx="180" cy="348" rx="24" ry="30" fill="#7ba05b" transform="rotate(24 180 348)"/>
    <ellipse cx="214" cy="322" rx="20" ry="25" fill="#5d7f42" transform="rotate(24 214 322)"/>
  </g>
</svg>`
  await sharp(Buffer.from(maskable)).resize(512, 512).png({ compressionLevel: 9 }).toFile(`${OUT}/maskable-512.png`)

  // favicon سبک (svg هم می‌گذاریم)
  writeFileSync(`${OUT}/icon.svg`, olive(512).trim())
  console.log('icons ok →', OUT)
}
main()
