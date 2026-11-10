/** دسترسی سمت سرور ویترین به Commerce API سررسید (همان سرور، بدون TLS/DNS) */

export const SHOP_API_BASE = process.env.SHOP_API_BASE || 'http://127.0.0.1:3000'
export const SHOP_SERVICE_TOKEN = process.env.SHOP_SERVICE_TOKEN || ''

export interface ShopApiResult<T> {
  ok: boolean
  data?: T
  error?: string
  status: number
  etag?: string | null
}

export async function apiGet<T>(path: string, opts: { revalidate?: number; etag?: string | null } = {}): Promise<ShopApiResult<T>> {
  try {
    const res = await fetch(`${SHOP_API_BASE}/api/shop${path}`, {
      next: opts.revalidate !== undefined ? { revalidate: opts.revalidate } : { revalidate: 60 },
      headers: {
        ...(SHOP_SERVICE_TOKEN ? { 'x-shop-service': SHOP_SERVICE_TOKEN } : {}),
        ...(opts.etag ? { 'if-none-match': opts.etag } : {}),
      },
    })
    if (res.status === 304) return { ok: true, status: 304, etag: opts.etag ?? null }
    const j = (await res.json().catch(() => ({ ok: false, error: 'پاسخ نامعتبر' }))) as { ok: boolean; data?: T; error?: string }
    return { ok: j.ok && res.ok, data: j.data, error: j.error || (res.ok ? undefined : `خطای سرور (${res.status})`), status: res.status, etag: res.headers.get('etag') }
  } catch {
    return { ok: false, error: 'ارتباط با فروشگاه برقرار نشد', status: 503 }
  }
}

// ---------- انواع عمومی (قرارداد با /api/shop/*) ----------

export interface CatalogItem {
  id: string
  name: string
  unit: string
  group: string | null
  subGroup: string | null
  price: number
  printedPrice: number
  discountPct: number
  stock: number
  available: number
  barcode: string | null
  image: string | null
  sold: number
}

export interface GroupInfo { id?: string; name: string; emoji?: string; count: number }

export interface HomeData {
  open: boolean
  storeName: string
  announcement: string
  hotline: string
  freeDeliveryMin: number
  deliveryFee: number
  groups: GroupInfo[]
  bestsellers: CatalogItem[]
  deals: CatalogItem[]
  reorder: { id: string; name: string; qty: number; price: number; image: string | null; unit: string }[] | null
  etag: string
}

export interface ShopConfig {
  open: boolean
  storeName: string
  announcement: string
  deliveryFee: number
  freeDeliveryMin: number
  minOrder: number
  hotline: string
  gatewayAvailable: boolean
}

export interface ProductDetail {
  id: string
  name: string
  unit: string
  barcode: string | null
  group: string | null
  subGroup: string | null
  price: number
  printedPrice: number
  discountPct: number
  available: number
  stock: number
  image: string | null
  gallery?: { url: string; caption: string }[]
  imported: boolean
  shelfLifeDays: number | null
  related: { id: string; name: string; unit: string; price: number; printedPrice: number; discountPct: number; available: number; image: string | null }[]
}

export interface BasketItem {
  itemId: string
  productId: string
  name: string
  unit: string
  qty: number
  price: number
  printedPrice: number
  discountPct: number
  lineTotal: number
  available: number
  warning: boolean
  image: string | null
}

export interface BasketView {
  items: BasketItem[]
  itemsTotal: number
  count: number
  deliveryFee: number
  freeDeliveryMin: number
  freeDeliveryGap: number
  minOrder: number
  trimmedTo?: number
}

export interface Slot { date: string; from: string; to: string; left: number }

export interface Address {
  id: string
  label: string
  receiver: string
  phone: string | null
  city: string
  address: string
  postalCode: string | null
  note: string | null
  isDefault: boolean
}

export interface MyOrder {
  id: string
  code: string
  status: string
  payMethod: string
  total: number
  itemsTotal: number
  deliveryFee: number
  slotDate: string | null
  slotFrom: string | null
  slotTo: string | null
  createdAt: string
  itemsCount?: number
  items?: { id: string; productId: string; name: string; qty: number; unit: string; unitPrice: number; lineTotal: number }[]
}
