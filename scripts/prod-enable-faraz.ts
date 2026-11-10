/* فعال‌سازی پنل فراز روی سرور: بررسی اتصال واقعی (balance) + پیش‌فرض‌سازی + اصلاح نام */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const panel = await p.smsPanel.findFirst({ where: { provider: 'farazsms' } })
  if (!panel) {
    console.log('NO farazsms panel found')
    process.exit(0)
  }
  const settings = JSON.parse(panel.settingsJson || '{}')
  const key = settings.apiKey || ''
  console.log('panel:', panel.name, '| key tail:', key.slice(-6))

  // بررسی اتصال واقعی از خود سرور (شبکهٔ سرور → api.iranpayamak.com)
  try {
    const res = await fetch('https://api.iranpayamak.com/ws/v1/account/balance', {
      headers: { 'Api-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    const j = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: Record<string, unknown> } | null
    console.log('balance check →', JSON.stringify(j))
    if (j?.status === 'success') {
      await p.smsPanel.update({
        where: { id: panel.id },
        data: { name: 'فراز اس‌ام‌اس', isDefault: true, active: true, lastTestAt: new Date(), lastTestOk: true },
      })
      await p.smsPanel.updateMany({ where: { id: { not: panel.id }, isDefault: true }, data: { isDefault: false } })
      console.log('✓ panel renamed, set DEFAULT, lastTestOk=true — OTP now sends via FarazSMS')
    } else {
      console.log('✗ balance failed:', j?.message || res.status, '— panel left unchanged')
    }
  } catch (e) {
    console.log('✗ connection error:', e instanceof Error ? e.message : String(e))
  }
  await p.$disconnect()
}
main()
