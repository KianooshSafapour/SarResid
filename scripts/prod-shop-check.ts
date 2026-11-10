/* بازرسی + آماده‌سازی سرور: پنل‌های SMS، دستهٔ لبنیات، و وضعیت فروشگاه — اجرا روی سرور */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const panels = await p.smsPanel.findMany()
  console.log('SMS panels:')
  for (const x of panels) {
    console.log(` - ${x.name} | ${x.provider} | mode=${x.mode} | default=${x.isDefault} | active=${x.active} | lastTestOk=${x.lastTestOk}`)
  }

  // دستهٔ «لبنیات» با ادغام دو گروه هلو — idempotent
  const groups = ['لبنیات', 'گروه لبنیات']
  const existing = await p.shopCategory.findUnique({ where: { name: 'لبنیات' } })
  if (existing) {
    const merged = [...new Set([...JSON.parse(existing.groupsJson || '[]'), ...groups])]
    await p.shopCategory.update({ where: { id: existing.id }, data: { groupsJson: JSON.stringify(merged), emoji: existing.emoji || '🥛' } })
    console.log('category لبنیات updated:', merged)
  } else {
    await p.shopCategory.create({ data: { name: 'لبنیات', emoji: '🥛', groupsJson: JSON.stringify(groups), sortOrder: 10 } })
    console.log('category لبنیات created with', groups)
  }

  const cats = await p.shopCategory.findMany()
  console.log('shopCategories total:', cats.length)
  const orders = await p.shopOrder.count()
  console.log('shopOrders total:', orders)
  await p.$disconnect()
}
main()
