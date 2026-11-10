/* seed تنظیمات فروشگاه آنلاین — idempotent: فقط کلیدهای غایب را می‌نویسند (هیچ مقدار موجودی بازنویسی نمی‌شود).
   روی سرور: SHOP_DEV_OTP=false bun scripts/seed-shop-settings.ts (کد پشتیبان dev خاموش می‌ماند) */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const DEV_OTP = process.env.SHOP_DEV_OTP === 'false' ? 'false' : 'true'

const DEFAULTS: Record<string, string> = {
  'shop:open': 'true',
  'shop:devOtp': DEV_OTP, // روی سرور باید false باشد (deploy-r18 خودش SHOP_DEV_OTP=false می‌فرستد)
  'shop:storeName': JSON.stringify('هایپر زیتون'),
  'shop:announcement': '', // بنر بالای سایت — خالی = خاموش
  'shop:deliveryFee': JSON.stringify('60000'), // ریال — ارسال درون‌شهری رفسنجان
  'shop:freeDeliveryMin': JSON.stringify('50000000'), // ارسال رایگان از ۵۰ میلیون ریال = ۵ میلیون تومان (تصمیم مالک؛ از پنل قابل تغییر)
  'shop:shelfFloor': JSON.stringify('2'),
  'shop:minOrder': JSON.stringify('0'),
  'shop:hotline': JSON.stringify('034-34220000'),
  'shop:gateway': 'mock', // تا تصمیم مالک؛ zarinpal + merchant → فعال
  'shop:slots': JSON.stringify({ days: 3, lead: 90, cap: 6, ranges: [[9, 12], [14, 18], [18, 22]], closed: [] }),
  'shop:notifyRoles': JSON.stringify(['SK', 'HC', 'GM', 'EXEC']),
  // هلو — فقط برای dev محلی (روی سرور مقادیر واقعی از قبل هست و دست نمی‌خورد)
  'holoo:enabled': 'true',
  'holoo:useMock': 'true',
  'holoo:username': 'admin',
  'holoo:userpass': 'YWRtaW4=',
  'holoo:dbname': 'Holoo1',
}

async function main() {
  let created = 0
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const exists = await p.setting.findUnique({ where: { key } })
    if (!exists) {
      await p.setting.create({ data: { key, value } })
      created++
    }
  }
  console.log(`shop settings seed: ${created} rows created, ${Object.keys(DEFAULTS).length - created} already present`)
  await p.$disconnect()
}
main()
