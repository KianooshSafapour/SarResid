import { getSessionUser } from '@/lib/auth'
import ShopOpsConsole from './console'

export const dynamic = 'force-dynamic'

/** /shop-ops — صف سفارش‌های آنلاین (احراز هویت و نقش در layout) */
export default async function ShopOpsPage() {
  const user = await getSessionUser()
  return <ShopOpsConsole user={{ fullName: user?.fullName || '', honorific: user?.honorific || '', role: user?.role || '' }} />
}
